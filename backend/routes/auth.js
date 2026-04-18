const express = require('express');
const { body } = require('express-validator');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');

const { getDb } = require('../db/init');
const { signAccess, signRefresh, verifyRefresh, refreshExpiresAt } = require('../utils/jwt');
const { validate } = require('../middleware/validate');
const { sendPasswordReset } = require('../utils/mailer');
const R = require('../utils/response');

const router = express.Router();

// ── Auth rate limit: 10 attempts / 15 minutes ───────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─────────────────────────────────────────────────────────────
//  POST /api/v1/auth/register
// ─────────────────────────────────────────────────────────────
router.post('/register', authLimiter, [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('email').trim().isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isMobilePhone('any').withMessage('Invalid phone number'),
], validate, async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;
    const db = getDb();

    // Check duplicate email
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return R.error(res, 'Email is already registered', 409);

    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, phone)
      VALUES (?, ?, ?, ?)
    `).run(name, email, hash, phone || null);

    const userId = result.lastInsertRowid;
    const user   = db.prepare('SELECT id, name, email, phone, status, created_at FROM users WHERE id = ?').get(userId);

    // Create session
    const refreshToken = uuidv4();
    db.prepare(`
      INSERT INTO sessions (user_id, refresh_token, ip_address, user_agent, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, refreshToken, req.ip, req.headers['user-agent'] || null, refreshExpiresAt());

    const accessToken = signAccess({ userId, email });
    const rfToken     = signRefresh({ userId, email });

    // Update stored refresh token with signed JWT
    db.prepare('UPDATE sessions SET refresh_token = ? WHERE refresh_token = ?').run(rfToken, refreshToken);

    return R.created(res, { user, accessToken, refreshToken: rfToken }, 'Account created successfully');
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/v1/auth/login
// ─────────────────────────────────────────────────────────────
router.post('/login', authLimiter, [
  body('email').trim().isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password required'),
], validate, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const db = getDb();

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return R.unauthorized(res, 'Invalid email or password');

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return R.unauthorized(res, 'Invalid email or password');

    if (user.status === 'suspended') {
      return R.forbidden(res, 'Your account has been suspended. Contact support@kalyra.com');
    }

    const refreshToken = signRefresh({ userId: user.id, email: user.email });
    const accessToken  = signAccess({ userId: user.id, email: user.email });

    db.prepare(`
      INSERT INTO sessions (user_id, refresh_token, ip_address, user_agent, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(user.id, refreshToken, req.ip, req.headers['user-agent'] || null, refreshExpiresAt());

    const safeUser = { id: user.id, name: user.name, email: user.email,
                       phone: user.phone, profile_photo: user.profile_photo,
                       status: user.status, created_at: user.created_at };

    return R.success(res, { user: safeUser, accessToken, refreshToken }, 'Login successful');
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/v1/auth/logout
// ─────────────────────────────────────────────────────────────
router.post('/logout', [
  body('refreshToken').notEmpty().withMessage('Refresh token required'),
], validate, (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const db = getDb();
    db.prepare('UPDATE sessions SET is_valid = 0 WHERE refresh_token = ?').run(refreshToken);
    return R.success(res, null, 'Logged out successfully');
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/v1/auth/refresh
// ─────────────────────────────────────────────────────────────
router.post('/refresh', [
  body('refreshToken').notEmpty(),
], validate, (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const db = getDb();

    // Verify JWT
    let payload;
    try { payload = verifyRefresh(refreshToken); }
    catch { return R.unauthorized(res, 'Invalid or expired refresh token'); }

    // Check session is still valid
    const session = db.prepare('SELECT * FROM sessions WHERE refresh_token = ? AND is_valid = 1').get(refreshToken);
    if (!session) return R.unauthorized(res, 'Session not found or revoked. Please log in again.');

    // Rotate: invalidate old, issue new
    const newRefresh = signRefresh({ userId: payload.userId, email: payload.email });
    const newAccess  = signAccess({ userId: payload.userId, email: payload.email });

    db.prepare('UPDATE sessions SET is_valid = 0 WHERE refresh_token = ?').run(refreshToken);
    db.prepare(`
      INSERT INTO sessions (user_id, refresh_token, ip_address, user_agent, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(payload.userId, newRefresh, req.ip, req.headers['user-agent'] || null, refreshExpiresAt());

    return R.success(res, { accessToken: newAccess, refreshToken: newRefresh }, 'Tokens refreshed');
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/v1/auth/forgot-password
// ─────────────────────────────────────────────────────────────
router.post('/forgot-password', authLimiter, [
  body('email').trim().isEmail().normalizeEmail(),
], validate, async (req, res, next) => {
  try {
    const { email } = req.body;
    const db   = getDb();
    const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);

    // Always return 200 to prevent email enumeration
    if (!user) {
      return R.success(res, null, 'If this email exists, a reset link has been sent.');
    }

    const token     = uuidv4();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

    // Invalidate old tokens
    db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE user_id = ?').run(user.id);
    db.prepare(`
      INSERT INTO password_reset_tokens (user_id, token, expires_at)
      VALUES (?, ?, ?)
    `).run(user.id, token, expiresAt);

    const result = await sendPasswordReset(user, token);

    // Local dev: return token in response
    const responseData = process.env.RESET_MODE === 'local'
      ? { message: '[DEV] Token returned for local testing.', ...result }
      : null;

    return R.success(res, responseData, 'If this email exists, a reset link has been sent.');
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/v1/auth/reset-password
// ─────────────────────────────────────────────────────────────
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Reset token required'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
], validate, async (req, res, next) => {
  try {
    const { token, password } = req.body;
    const db = getDb();

    const resetRecord = db.prepare(`
      SELECT * FROM password_reset_tokens
      WHERE token = ? AND used = 0 AND expires_at > datetime('now')
    `).get(token);

    if (!resetRecord) return R.badRequest(res, 'Reset token is invalid or has expired');

    const hash = await bcrypt.hash(password, 12);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(hash, resetRecord.user_id);

    // Mark token used + invalidate all sessions
    db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token = ?').run(token);
    db.prepare('UPDATE sessions SET is_valid = 0 WHERE user_id = ?').run(resetRecord.user_id);

    return R.success(res, null, 'Password reset successfully. Please login again.');
  } catch (err) { next(err); }
});

module.exports = router;
