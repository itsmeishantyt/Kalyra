const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');

const { requireAdmin } = require('../../middleware/adminAuth');
const R = require('../../utils/response');

const router = express.Router();

// ── Paths ────────────────────────────────────────────────────
const SETTINGS_FILE  = path.join(__dirname, '..', '..', 'db', 'settings.json');
const BANNER_DIR     = path.join(__dirname, '..', '..', 'uploads', 'banner');

if (!fs.existsSync(BANNER_DIR)) fs.mkdirSync(BANNER_DIR, { recursive: true });
if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ bannerImage: null }));

// ── Helpers ──────────────────────────────────────────────────
function readSettings()          { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); }
function writeSettings(data)     { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2)); }

// ── Multer ───────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, BANNER_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `banner${ext}`);   // always overwrite with "banner.<ext>"
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

// ── GET /api/v1/admin/settings ───────────────────────────────
router.get('/', requireAdmin(), (req, res) => {
  const settings = readSettings();
  res.json(R.ok(settings));
});

// ── POST /api/v1/admin/settings/banner ──────────────────────
router.post('/banner', requireAdmin(), upload.single('banner'), (req, res) => {
  if (!req.file) return res.status(400).json(R.fail('No image file provided'));

  // Delete old banner files with different extensions
  try {
    fs.readdirSync(BANNER_DIR).forEach(f => {
      if (f.startsWith('banner') && f !== req.file.filename) {
        fs.unlinkSync(path.join(BANNER_DIR, f));
      }
    });
  } catch (_) {}

  const imageUrl = `/uploads/banner/${req.file.filename}`;
  const settings = readSettings();
  settings.bannerImage = imageUrl;
  writeSettings(settings);

  res.json(R.ok({ bannerImage: imageUrl }, 'Banner image updated'));
});

// ── DELETE /api/v1/admin/settings/banner ────────────────────
router.delete('/banner', requireAdmin(), (req, res) => {
  try {
    fs.readdirSync(BANNER_DIR).forEach(f => {
      if (f.startsWith('banner')) fs.unlinkSync(path.join(BANNER_DIR, f));
    });
  } catch (_) {}

  const settings = readSettings();
  settings.bannerImage = null;
  writeSettings(settings);

  res.json(R.ok(null, 'Banner image removed'));
});

module.exports = router;
