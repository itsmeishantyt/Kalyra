const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const { getDb } = require('../../db/init');
const { requireAdmin, audit } = require('../../middleware/adminAuth');
const R = require('../../utils/response');

const router = express.Router();

// Ensure upload directory exists
const settingsUploadDir = path.join(__dirname, '..', '..', 'uploads', 'settings');
if (!fs.existsSync(settingsUploadDir)) {
  fs.mkdirSync(settingsUploadDir, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, settingsUploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${file.fieldname}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: (Number(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, WebP images are allowed'));
    }
  }
});

// Configure multiple image fields
const uploadFields = upload.fields([
  { name: 'hero_image', maxCount: 1 },
  { name: 'cta_image_1', maxCount: 1 },
  { name: 'cta_image_2', maxCount: 1 },
  { name: 'cta_image_3', maxCount: 1 }
]);

// PUT /api/v1/admin/settings
router.put('/', requireAdmin(['superadmin', 'manager']), (req, res, next) => {
  uploadFields(req, res, (err) => {
    if (err) return next(err);
    try {
      const db = getDb();
      const updates = { ...req.body };

      // Helper function to update setting in db
      const updateSetting = (key, value) => {
        db.prepare(`
          INSERT INTO settings (key, value)
          VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run(key, value);
      };

      // Process uploaded files and save their URL paths
      if (req.files) {
        if (req.files.hero_image) {
          const file = req.files.hero_image[0];
          const old = db.prepare('SELECT value FROM settings WHERE key = ?').get('hero_image_url');
          updates.hero_image_url = `/uploads/settings/${file.filename}`;
          updateSetting('hero_image_url', updates.hero_image_url);
          // Delete old file
          if (old && old.value && old.value.startsWith('/uploads/settings/')) {
            const oldPath = path.join(__dirname, '..', '..', old.value);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
        }
        if (req.files.cta_image_1) {
          const file = req.files.cta_image_1[0];
          const old = db.prepare('SELECT value FROM settings WHERE key = ?').get('cta_image_1');
          updates.cta_image_1 = `/uploads/settings/${file.filename}`;
          updateSetting('cta_image_1', updates.cta_image_1);
          if (old && old.value && old.value.startsWith('/uploads/settings/')) {
            const oldPath = path.join(__dirname, '..', '..', old.value);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
        }
        if (req.files.cta_image_2) {
          const file = req.files.cta_image_2[0];
          const old = db.prepare('SELECT value FROM settings WHERE key = ?').get('cta_image_2');
          updates.cta_image_2 = `/uploads/settings/${file.filename}`;
          updateSetting('cta_image_2', updates.cta_image_2);
          if (old && old.value && old.value.startsWith('/uploads/settings/')) {
            const oldPath = path.join(__dirname, '..', '..', old.value);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
        }
        if (req.files.cta_image_3) {
          const file = req.files.cta_image_3[0];
          const old = db.prepare('SELECT value FROM settings WHERE key = ?').get('cta_image_3');
          updates.cta_image_3 = `/uploads/settings/${file.filename}`;
          updateSetting('cta_image_3', updates.cta_image_3);
          if (old && old.value && old.value.startsWith('/uploads/settings/')) {
            const oldPath = path.join(__dirname, '..', '..', old.value);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
        }
      }

      // Process text settings
      if (req.body.hero_title !== undefined) updateSetting('hero_title', req.body.hero_title);
      if (req.body.hero_sub !== undefined) updateSetting('hero_sub', req.body.hero_sub);
      if (req.body.cta_title !== undefined) updateSetting('cta_title', req.body.cta_title);

      audit(db, req.admin.id, 'UPDATE_SETTINGS', 'settings', null, { keysUpdated: Object.keys(updates) }, req.ip);

      // Fetch all updated settings to return
      const rows = db.prepare('SELECT key, value FROM settings').all();
      const settings = {};
      rows.forEach(row => {
        settings[row.key] = row.value;
      });

      return R.success(res, settings, 'Website settings updated successfully');
    } catch (err2) {
      next(err2);
    }
  });
});

module.exports = router;
