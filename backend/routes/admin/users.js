const express = require('express');
const { query, body } = require('express-validator');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const { getDb } = require('../../db/init');
const { requireAdmin, audit } = require('../../middleware/adminAuth');
const { validate } = require('../../middleware/validate');
const R = require('../../utils/response');

const router = express.Router();

// ─────────────────────────────────────────────────────────────
//  GET /api/v1/admin/users
// ─────────────────────────────────────────────────────────────
router.get('/', requireAdmin(), [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().trim(),
  query('status').optional().isIn(['active', 'suspended']),
], validate, (req, res, next) => {
  try {
    const db = getDb();
    const { page = 1, limit = 20, search, status } = req.query;
    const offset = (page - 1) * limit;

    let where = ['1=1'];
    const params = [];
    if (search) { where.push('(name LIKE ? OR email LIKE ? OR phone LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (status) { where.push('status = ?'); params.push(status); }

    const whereStr = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) as n FROM users WHERE ${whereStr}`).get(...params).n;
    const users = db.prepare(`
      SELECT id, name, email, phone, profile_photo, status, created_at,
             (SELECT COUNT(*) FROM orders WHERE user_id = users.id) as order_count,
             (SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE user_id = users.id AND status != 'cancelled') as total_spent
      FROM users WHERE ${whereStr}
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return R.paginate(res, users, { page, limit, total });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/v1/admin/users/wishlists
// ─────────────────────────────────────────────────────────────
router.get('/wishlists', requireAdmin(), [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().trim(),
], validate, (req, res, next) => {
  try {
    const db = getDb();
    const { page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;

    let where = ['1=1'];
    const params = [];
    if (search) {
      where.push('(u.name LIKE ? OR u.email LIKE ? OR p.name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereStr = where.join(' AND ');
    const total = db.prepare(`
      SELECT COUNT(*) as n 
      FROM liked_products lp
      JOIN users u ON u.id = lp.user_id
      JOIN products p ON p.id = lp.product_id
      WHERE ${whereStr}
    `).get(...params).n;

    const wishlists = db.prepare(`
      SELECT lp.id, lp.liked_at,
             u.id as user_id, u.name as user_name, u.email as user_email,
             p.id as product_id, p.name as product_name, p.price as product_price, p.image_url as product_image
      FROM liked_products lp
      JOIN users u ON u.id = lp.user_id
      JOIN products p ON p.id = lp.product_id
      WHERE ${whereStr}
      ORDER BY lp.liked_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return R.paginate(res, wishlists, { page, limit, total });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/v1/admin/users/:id
// ─────────────────────────────────────────────────────────────
router.get('/:id', requireAdmin(), (req, res, next) => {
  try {
    const db = getDb();
    const user = db.prepare(`
      SELECT id, name, email, phone, profile_photo, status, created_at, updated_at
      FROM users WHERE id = ?
    `).get(req.params.id);
    if (!user) return R.notFound(res, 'User not found');

    const orders  = db.prepare('SELECT id, order_ref, total_amount, status, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(user.id);
    const payments = db.prepare('SELECT ph.id, ph.amount, ph.payment_method_type, ph.status, ph.paid_at, o.order_ref FROM payment_history ph JOIN orders o ON o.id = ph.order_id WHERE ph.user_id = ? ORDER BY ph.created_at DESC LIMIT 20').all(user.id);
    const addresses = db.prepare('SELECT * FROM addresses WHERE user_id = ?').all(user.id);
    const stats = db.prepare(`
      SELECT
        COUNT(CASE WHEN status NOT IN ('cancelled','refunded') THEN 1 END) as total_orders,
        COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','refunded') THEN total_amount ELSE 0 END), 0) as total_spent,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders
      FROM orders WHERE user_id = ?
    `).get(user.id);

    return R.success(res, { user, stats, orders, payments, addresses });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  PATCH /api/v1/admin/users/:id/suspend
// ─────────────────────────────────────────────────────────────
router.patch('/:id/suspend', requireAdmin(['superadmin', 'manager']), [
  body('reason').optional().trim().isLength({ max: 500 }),
], validate, (req, res, next) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id, name, status FROM users WHERE id = ?').get(req.params.id);
    if (!user) return R.notFound(res, 'User not found');
    if (user.status === 'suspended') return R.badRequest(res, 'User is already suspended');

    db.prepare('UPDATE users SET status = \'suspended\', updated_at = datetime(\'now\') WHERE id = ?').run(user.id);
    // Invalidate all user sessions
    db.prepare('UPDATE sessions SET is_valid = 0 WHERE user_id = ?').run(user.id);

    audit(db, req.admin.id, 'SUSPEND_USER', 'user', user.id, { name: user.name, reason: req.body.reason || null }, req.ip);

    return R.success(res, null, `User "${user.name}" suspended`);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  PATCH /api/v1/admin/users/:id/reactivate
// ─────────────────────────────────────────────────────────────
router.patch('/:id/reactivate', requireAdmin(['superadmin', 'manager']), (req, res, next) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id, name, status FROM users WHERE id = ?').get(req.params.id);
    if (!user) return R.notFound(res, 'User not found');
    if (user.status === 'active') return R.badRequest(res, 'User is already active');

    db.prepare('UPDATE users SET status = \'active\', updated_at = datetime(\'now\') WHERE id = ?').run(user.id);
    audit(db, req.admin.id, 'REACTIVATE_USER', 'user', user.id, { name: user.name }, req.ip);

    return R.success(res, null, `User "${user.name}" reactivated`);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/v1/admin/users/:id/reset-password
//  Forces a password reset token for the user
// ─────────────────────────────────────────────────────────────
router.post('/:id/reset-password', requireAdmin(['superadmin']), (req, res, next) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(req.params.id);
    if (!user) return R.notFound(res, 'User not found');

    const token     = uuidv4();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE user_id = ?').run(user.id);
    db.prepare(`
      INSERT INTO password_reset_tokens (user_id, token, expires_at)
      VALUES (?, ?, ?)
    `).run(user.id, token, expiresAt);

    audit(db, req.admin.id, 'FORCE_PASSWORD_RESET', 'user', user.id, { email: user.email }, req.ip);

    // Local mode: return token
    const resetUrl = `http://localhost:${process.env.PORT || 3000}/api/v1/auth/reset-password?token=${token}`;
    return R.success(res, {
      user: { id: user.id, email: user.email },
      resetToken: token,
      resetUrl,
      expiresAt,
      note: '[DEV MODE] Share this link with the user securely.',
    }, 'Password reset token generated');
  } catch (err) { next(err); }
});

module.exports = router;
