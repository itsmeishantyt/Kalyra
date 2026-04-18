const express = require('express');
const { body, param } = require('express-validator');
const { getDb } = require('../db/init');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const R = require('../utils/response');

const router = express.Router();

// ─────────────────────────────────────────────────────────────
//  GET /api/v1/user/addresses
// ─────────────────────────────────────────────────────────────
router.get('/', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const addresses = db.prepare(`
      SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC
    `).all(req.user.id);
    return R.success(res, addresses);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/v1/user/addresses
// ─────────────────────────────────────────────────────────────
router.post('/', requireAuth, [
  body('label').optional().trim().isIn(['Home', 'Work', 'Other']),
  body('line1').trim().notEmpty().withMessage('Address line 1 required'),
  body('line2').optional().trim(),
  body('city').trim().notEmpty().withMessage('City required'),
  body('state').trim().notEmpty().withMessage('State required'),
  body('postal_code').trim().notEmpty().isPostalCode('IN').withMessage('Valid postal code required'),
  body('country').optional().trim().isLength({ min: 2, max: 2 }),
  body('is_default').optional().isBoolean(),
], validate, (req, res, next) => {
  try {
    const { label, line1, line2, city, state, postal_code, country, is_default } = req.body;
    const db = getDb();

    const setDefault = is_default ? 1 : 0;
    if (setDefault) {
      db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(req.user.id);
    }

    // If this is first address, auto-set as default
    const count = db.prepare('SELECT COUNT(*) as n FROM addresses WHERE user_id = ?').get(req.user.id);
    const shouldBeDefault = setDefault || count.n === 0 ? 1 : 0;

    const result = db.prepare(`
      INSERT INTO addresses (user_id, label, line1, line2, city, state, postal_code, country, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, label || 'Home', line1, line2 || null, city, state, postal_code, country || 'IN', shouldBeDefault);

    const address = db.prepare('SELECT * FROM addresses WHERE id = ?').get(result.lastInsertRowid);
    return R.created(res, address, 'Address added');
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  PUT /api/v1/user/addresses/:id
// ─────────────────────────────────────────────────────────────
router.put('/:id', requireAuth, [
  body('label').optional().isIn(['Home', 'Work', 'Other']),
  body('line1').optional().trim().notEmpty(),
  body('city').optional().trim().notEmpty(),
  body('state').optional().trim().notEmpty(),
  body('postal_code').optional().isPostalCode('IN'),
], validate, (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) return R.notFound(res, 'Address not found');

    const { label, line1, line2, city, state, postal_code, country } = req.body;
    db.prepare(`
      UPDATE addresses SET
        label       = COALESCE(?, label),
        line1       = COALESCE(?, line1),
        line2       = COALESCE(?, line2),
        city        = COALESCE(?, city),
        state       = COALESCE(?, state),
        postal_code = COALESCE(?, postal_code),
        country     = COALESCE(?, country)
      WHERE id = ?
    `).run(label || null, line1 || null, line2 ?? null, city || null, state || null, postal_code || null, country || null, req.params.id);

    const updated = db.prepare('SELECT * FROM addresses WHERE id = ?').get(req.params.id);
    return R.success(res, updated, 'Address updated');
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  DELETE /api/v1/user/addresses/:id
// ─────────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) return R.notFound(res, 'Address not found');

    db.prepare('DELETE FROM addresses WHERE id = ?').run(req.params.id);

    // Auto-set another address as default
    if (existing.is_default) {
      const next = db.prepare('SELECT id FROM addresses WHERE user_id = ? LIMIT 1').get(req.user.id);
      if (next) db.prepare('UPDATE addresses SET is_default = 1 WHERE id = ?').run(next.id);
    }

    return R.success(res, null, 'Address deleted');
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  PATCH /api/v1/user/addresses/:id/default
// ─────────────────────────────────────────────────────────────
router.patch('/:id/default', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM addresses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) return R.notFound(res, 'Address not found');

    db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(req.user.id);
    db.prepare('UPDATE addresses SET is_default = 1 WHERE id = ?').run(req.params.id);

    return R.success(res, null, 'Default address updated');
  } catch (err) { next(err); }
});

module.exports = router;
