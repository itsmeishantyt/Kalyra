const express = require('express');
const { body } = require('express-validator');
const { getDb } = require('../db/init');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const R = require('../utils/response');

const router = express.Router();

// GET /api/v1/user/payment-methods
router.get('/', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const methods = db.prepare(`
      SELECT id, type, display_name, provider, is_default, created_at
      FROM payment_methods WHERE user_id = ? ORDER BY is_default DESC, id DESC
    `).all(req.user.id);
    return R.success(res, methods);
  } catch (err) { next(err); }
});

// POST /api/v1/user/payment-methods
router.post('/', requireAuth, [
  body('type').isIn(['card', 'upi', 'netbanking', 'wallet', 'cod']).withMessage('Invalid payment type'),
  body('display_name').trim().notEmpty().withMessage('Display name required'),
  body('provider').optional().trim(),
  body('token').optional().trim(),
  body('is_default').optional().isBoolean(),
], validate, (req, res, next) => {
  try {
    const { type, display_name, provider, token, is_default } = req.body;
    const db = getDb();

    if (is_default) {
      db.prepare('UPDATE payment_methods SET is_default = 0 WHERE user_id = ?').run(req.user.id);
    }
    const count = db.prepare('SELECT COUNT(*) as n FROM payment_methods WHERE user_id = ?').get(req.user.id);
    const setDefault = is_default || count.n === 0 ? 1 : 0;

    const result = db.prepare(`
      INSERT INTO payment_methods (user_id, type, display_name, provider, token, is_default)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, type, display_name, provider || null, token || null, setDefault);

    const method = db.prepare('SELECT id, type, display_name, provider, is_default FROM payment_methods WHERE id = ?').get(result.lastInsertRowid);
    return R.created(res, method, 'Payment method added');
  } catch (err) { next(err); }
});

// DELETE /api/v1/user/payment-methods/:id
router.delete('/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM payment_methods WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) return R.notFound(res, 'Payment method not found');
    db.prepare('DELETE FROM payment_methods WHERE id = ?').run(req.params.id);
    return R.success(res, null, 'Payment method removed');
  } catch (err) { next(err); }
});

// PATCH /api/v1/user/payment-methods/:id/default
router.patch('/:id/default', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM payment_methods WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) return R.notFound(res, 'Payment method not found');
    db.prepare('UPDATE payment_methods SET is_default = 0 WHERE user_id = ?').run(req.user.id);
    db.prepare('UPDATE payment_methods SET is_default = 1 WHERE id = ?').run(req.params.id);
    return R.success(res, null, 'Default payment method updated');
  } catch (err) { next(err); }
});

module.exports = router;
