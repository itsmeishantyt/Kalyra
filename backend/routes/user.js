const express = require('express');
const { body } = require('express-validator');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs   = require('fs');
const multer = require('multer');

const { getDb } = require('../db/init');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const R = require('../utils/response');

const router = express.Router();

// ── Multer: profile photo ────────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'uploads', 'profiles');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `user_${req.user.id}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: (Number(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, WebP images are allowed'));
  },
});

// ─────────────────────────────────────────────────────────────
//  GET /api/v1/user/profile
// ─────────────────────────────────────────────────────────────
router.get('/profile', requireAuth, (req, res, next) => {
  try {
    const db   = getDb();
    const user = db.prepare(`
      SELECT id, name, email, phone, profile_photo, status, created_at, updated_at
      FROM users WHERE id = ?
    `).get(req.user.id);
    return R.success(res, user);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  PUT /api/v1/user/profile
// ─────────────────────────────────────────────────────────────
router.put('/profile', requireAuth, [
  body('name').optional().trim().notEmpty().isLength({ max: 100 }),
  body('phone').optional().isMobilePhone('any').withMessage('Invalid phone'),
  body('email').optional().trim().isEmail().normalizeEmail(),
], validate, (req, res, next) => {
  try {
    const { name, phone, email } = req.body;
    const db = getDb();

    if (email) {
      const conflict = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, req.user.id);
      if (conflict) return R.error(res, 'Email already in use', 409);
    }

    db.prepare(`
      UPDATE users SET
        name       = COALESCE(?, name),
        phone      = COALESCE(?, phone),
        email      = COALESCE(?, email),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(name || null, phone || null, email || null, req.user.id);

    const updated = db.prepare('SELECT id, name, email, phone, profile_photo, status, updated_at FROM users WHERE id = ?').get(req.user.id);
    return R.success(res, updated, 'Profile updated');
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/v1/user/profile/photo
// ─────────────────────────────────────────────────────────────
router.post('/profile/photo', requireAuth, (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) return R.badRequest(res, 'No file uploaded. Field name: photo');

    const db       = getDb();
    const photoUrl = `/uploads/profiles/${req.file.filename}`;

    // Delete old photo file if it exists
    const current = db.prepare('SELECT profile_photo FROM users WHERE id = ?').get(req.user.id);
    if (current?.profile_photo) {
      const oldPath = path.join(__dirname, '..', current.profile_photo);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    db.prepare('UPDATE users SET profile_photo = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(photoUrl, req.user.id);

    return R.success(res, { profile_photo: photoUrl }, 'Profile photo updated');
  });
});

// ─────────────────────────────────────────────────────────────
//  GET /api/v1/user/sessions
// ─────────────────────────────────────────────────────────────
router.get('/sessions', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const sessions = db.prepare(`
      SELECT id, ip_address, user_agent, is_valid, created_at, expires_at
      FROM sessions WHERE user_id = ? AND is_valid = 1
      ORDER BY created_at DESC
    `).all(req.user.id);
    return R.success(res, sessions);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  DELETE /api/v1/user/sessions/:id
// ─────────────────────────────────────────────────────────────
router.delete('/sessions/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const session = db.prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!session) return R.notFound(res, 'Session not found');

    db.prepare('UPDATE sessions SET is_valid = 0 WHERE id = ?').run(req.params.id);
    return R.success(res, null, 'Session revoked');
  } catch (err) { next(err); }
});

module.exports = router;
