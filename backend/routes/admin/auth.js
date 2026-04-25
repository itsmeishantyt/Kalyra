const express = require('express');
const { body } = require('express-validator');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');

const { getDb } = require('../../db/init');
const { signAccess, signRefresh, verifyRefresh, refreshExpiresAt } = require('../../utils/jwt');
const { validate } = require('../../middleware/validate');
const { sendPasswordReset } = require('../../utils/mailer');
const { requireAdmin } = require('../../middleware/adminAuth');
const R = require('../../utils/response');

const router = express.Router();

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
});

// POST /api/v1/admin/auth/login
router.post('/login', [
  body('email').trim().isEmail().normalizeEmail(),
  body('password').notEmpty(),
], validate, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const db = getDb();
    const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
    if (!admin) return R.unauthorized(res, 'Invalid credentials');

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) return R.unauthorized(res, 'Invalid credentials');
    if (!admin.is_active) return R.forbidden(res, 'Admin account is deactivated');

    const accessToken  = signAccess({ adminId: admin.id, email: admin.email, role: admin.role, isAdmin: true });
    const refreshToken = signRefresh({ adminId: admin.id, email: admin.email, isAdmin: true });

    db.prepare(`
      INSERT INTO admin_sessions (admin_id, refresh_token, ip_address, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(admin.id, refreshToken, req.ip, refreshExpiresAt());

    db.prepare('UPDATE admins SET last_login = datetime(\'now\') WHERE id = ?').run(admin.id);

    return R.success(res, {
      admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
      accessToken, refreshToken,
    }, 'Admin login successful');
  } catch (err) { next(err); }
});

// POST /api/v1/admin/auth/logout
router.post('/logout', [
  body('refreshToken').notEmpty(),
], validate, (req, res, next) => {
  try {
    const db = getDb();
    db.prepare('UPDATE admin_sessions SET is_valid = 0 WHERE refresh_token = ?').run(req.body.refreshToken);
    return R.success(res, null, 'Logged out');
  } catch (err) { next(err); }
});

// POST /api/v1/admin/auth/refresh
router.post('/refresh', [
  body('refreshToken').notEmpty(),
], validate, (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    let payload;
    try { payload = verifyRefresh(refreshToken); }
    catch { return R.unauthorized(res, 'Invalid or expired refresh token'); }

    const db = getDb();
    const session = db.prepare('SELECT * FROM admin_sessions WHERE refresh_token = ? AND is_valid = 1').get(refreshToken);
    if (!session) return R.unauthorized(res, 'Session revoked. Please login again.');

    const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(payload.adminId);
    if (!admin || !admin.is_active) return R.forbidden(res, 'Admin account deactivated');

    const newAccess  = signAccess({ adminId: admin.id, email: admin.email, role: admin.role, isAdmin: true });
    const newRefresh = signRefresh({ adminId: admin.id, email: admin.email, isAdmin: true });

    db.prepare('UPDATE admin_sessions SET is_valid = 0 WHERE refresh_token = ?').run(refreshToken);
    db.prepare(`
      INSERT INTO admin_sessions (admin_id, refresh_token, ip_address, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(admin.id, newRefresh, req.ip, refreshExpiresAt());

    return R.success(res, { accessToken: newAccess, refreshToken: newRefresh }, 'Tokens refreshed');
  } catch (err) { next(err); }
});

// POST /api/v1/admin/auth/reset-password  (self-service for logged-in admins)
router.post('/reset-password', requireAdmin(), [
  body('current_password').notEmpty(),
  body('new_password').isLength({ min: 8 }).matches(/[A-Z]/).matches(/[0-9]/),
], validate, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    const db = getDb();
    const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);

    const match = await bcrypt.compare(current_password, admin.password_hash);
    if (!match) return R.unauthorized(res, 'Current password is incorrect');

    const hash = await bcrypt.hash(new_password, 12);
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, admin.id);
    db.prepare('UPDATE admin_sessions SET is_valid = 0 WHERE admin_id = ?').run(admin.id);

    return R.success(res, null, 'Password changed. Please login again.');
  } catch (err) { next(err); }
});

module.exports = router;
