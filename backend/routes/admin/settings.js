const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');

const { requireAdmin } = require('../../middleware/adminAuth');
const R = require('../../utils/response');

const router = express.Router();

// ── Paths ────────────────────────────────────────────────────
const SETTINGS_FILE  = path.join(__dirname, '..', '..', 'db', 'settings.json');
const BANNER_DIR     = path.join(__dirname, '..', '..', '..', 'assets', 'imgs');

if (!fs.existsSync(BANNER_DIR)) fs.mkdirSync(BANNER_DIR, { recursive: true });

// Ensure settings file exists with correct structure
if (!fs.existsSync(SETTINGS_FILE)) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ desktopBannerImage: null, mobileBannerImage: null }, null, 2));
} else {
  try {
    const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    if (data.bannerImage !== undefined) {
      // Migrate legacy single banner setting
      data.desktopBannerImage = data.bannerImage;
      data.mobileBannerImage = null;
      delete data.bannerImage;
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
    }
  } catch (_) {}
}

// ── Helpers ──────────────────────────────────────────────────
function readSettings()          { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); }
function writeSettings(data)     { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2)); }

// ── Multer ───────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, BANNER_DIR),
  filename:    (req, file, cb) => {
    const type = req.params.type === 'mobile' ? 'mobile' : 'desktop';
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `banner_${type}_${Date.now()}${ext}`);
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
router.get('/', (req, res) => {
  const settings = readSettings();
  res.json(R.ok(settings));
});

// ── POST /api/v1/admin/settings/banner/:type ────────────────
router.post('/banner/:type', requireAdmin(), (req, res, next) => {
  const type = req.params.type;
  if (type !== 'desktop' && type !== 'mobile') {
    return res.status(400).json(R.fail('Invalid banner type. Must be "desktop" or "mobile"'));
  }
  next();
}, upload.single('banner'), (req, res) => {
  if (!req.file) return res.status(400).json(R.fail('No image file provided'));

  const type = req.params.type;
  const newFilename = req.file.filename;

  // Delete old banner files of the same type
  try {
    fs.readdirSync(BANNER_DIR).forEach(f => {
      if (f.startsWith(`banner_${type}_`) && f !== newFilename) {
        fs.unlinkSync(path.join(BANNER_DIR, f));
      }
    });
  } catch (_) {}

  const imageUrl = `/assets/imgs/${newFilename}`;
  const settings = readSettings();
  if (type === 'mobile') {
    settings.mobileBannerImage = imageUrl;
  } else {
    settings.desktopBannerImage = imageUrl;
  }
  writeSettings(settings);

  res.json(R.ok({ bannerImage: imageUrl }, `Hero ${type} banner image updated`));
});

// ── DELETE /api/v1/admin/settings/banner/:type ──────────────
router.delete('/banner/:type', requireAdmin(), (req, res) => {
  const type = req.params.type;
  if (type !== 'desktop' && type !== 'mobile') {
    return res.status(400).json(R.fail('Invalid banner type. Must be "desktop" or "mobile"'));
  }

  try {
    fs.readdirSync(BANNER_DIR).forEach(f => {
      if (f.startsWith(`banner_${type}_`)) {
        fs.unlinkSync(path.join(BANNER_DIR, f));
      }
    });
  } catch (_) {}

  const settings = readSettings();
  if (type === 'mobile') {
    settings.mobileBannerImage = null;
  } else {
    settings.desktopBannerImage = null;
  }
  writeSettings(settings);

  res.json(R.ok(null, `Hero ${type} banner image removed`));
});

module.exports = router;
