const express = require('express');
const { body, query } = require('express-validator');
const { getDb } = require('../../db/init');
const { requireAdmin, audit } = require('../../middleware/adminAuth');
const { validate } = require('../../middleware/validate');
const R = require('../../utils/response');

const router = express.Router();

// GET /api/v1/admin/promocodes
router.get('/', requireAdmin(), [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('active').optional().isBoolean().toBoolean(),
], validate, (req, res, next) => {
  try {
    const db = getDb();
    const { page = 1, limit = 20, active } = req.query;
    const offset = (page - 1) * limit;

    let where = ['1=1']; const params = [];
    if (active !== undefined) { where.push('pc.is_active = ?'); params.push(active ? 1 : 0); }

    const whereStr = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) as n FROM promocodes pc WHERE ${whereStr}`).get(...params).n;
    const promos = db.prepare(`
      SELECT pc.*, a.name as created_by_name
      FROM promocodes pc
      LEFT JOIN admins a ON a.id = pc.created_by
      WHERE ${whereStr}
      ORDER BY pc.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return R.paginate(res, promos, { page, limit, total });
  } catch (err) { next(err); }
});

// POST /api/v1/admin/promocodes
router.post('/', requireAdmin(['superadmin', 'manager']), [
  body('code').trim().notEmpty().toUpperCase().withMessage('Code required').isLength({ max: 20 }),
  body('discount_type').isIn(['flat', 'percent']),
  body('discount_value').isFloat({ min: 0.01 }),
  body('min_order_value').optional().isFloat({ min: 0 }),
  body('max_discount').optional().isFloat({ min: 0 }),
  body('max_uses').optional().isInt({ min: 1 }),
  body('valid_from').isISO8601().withMessage('valid_from must be ISO date'),
  body('valid_until').isISO8601().withMessage('valid_until must be ISO date'),
  body('description').optional().trim().isLength({ max: 255 }),
], validate, (req, res, next) => {
  try {
    const db = getDb();
    const { code, description, discount_type, discount_value, min_order_value = 0,
            max_discount, max_uses, valid_from, valid_until } = req.body;

    if (new Date(valid_until) <= new Date(valid_from)) {
      return R.badRequest(res, 'valid_until must be after valid_from');
    }

    const result = db.prepare(`
      INSERT INTO promocodes (code, description, discount_type, discount_value, min_order_value, max_discount, max_uses, valid_from, valid_until, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(code.toUpperCase(), description || null, discount_type, discount_value, min_order_value, max_discount || null, max_uses || null, valid_from, valid_until, req.admin.id);

    const promo = db.prepare('SELECT * FROM promocodes WHERE id = ?').get(result.lastInsertRowid);
    audit(db, req.admin.id, 'CREATE_PROMOCODE', 'promocode', result.lastInsertRowid, { code }, req.ip);
    return R.created(res, promo, 'Promo code created');
  } catch (err) { next(err); }
});

// PUT /api/v1/admin/promocodes/:id
router.put('/:id', requireAdmin(['superadmin', 'manager']), [
  body('discount_value').optional().isFloat({ min: 0.01 }),
  body('min_order_value').optional().isFloat({ min: 0 }),
  body('max_uses').optional().isInt({ min: 1 }),
  body('valid_until').optional().isISO8601(),
], validate, (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM promocodes WHERE id = ?').get(req.params.id);
    if (!existing) return R.notFound(res, 'Promo code not found');

    const { description, discount_value, min_order_value, max_discount, max_uses, valid_until } = req.body;
    db.prepare(`
      UPDATE promocodes SET
        description     = COALESCE(?, description),
        discount_value  = COALESCE(?, discount_value),
        min_order_value = COALESCE(?, min_order_value),
        max_discount    = COALESCE(?, max_discount),
        max_uses        = COALESCE(?, max_uses),
        valid_until     = COALESCE(?, valid_until)
      WHERE id = ?
    `).run(description || null, discount_value || null, min_order_value ?? null, max_discount ?? null, max_uses || null, valid_until || null, req.params.id);

    const updated = db.prepare('SELECT * FROM promocodes WHERE id = ?').get(req.params.id);
    audit(db, req.admin.id, 'UPDATE_PROMOCODE', 'promocode', Number(req.params.id), { code: existing.code }, req.ip);
    return R.success(res, updated, 'Promo code updated');
  } catch (err) { next(err); }
});

// PATCH /api/v1/admin/promocodes/:id/toggle
router.patch('/:id/toggle', requireAdmin(['superadmin', 'manager']), (req, res, next) => {
  try {
    const db = getDb();
    const promo = db.prepare('SELECT id, code, is_active FROM promocodes WHERE id = ?').get(req.params.id);
    if (!promo) return R.notFound(res, 'Promo code not found');

    const newStatus = promo.is_active ? 0 : 1;
    db.prepare('UPDATE promocodes SET is_active = ? WHERE id = ?').run(newStatus, req.params.id);
    audit(db, req.admin.id, newStatus ? 'ACTIVATE_PROMO' : 'DEACTIVATE_PROMO', 'promocode', Number(req.params.id), { code: promo.code }, req.ip);
    return R.success(res, { is_active: newStatus }, `Promo code ${newStatus ? 'activated' : 'deactivated'}`);
  } catch (err) { next(err); }
});

// DELETE /api/v1/admin/promocodes/:id
router.delete('/:id', requireAdmin(['superadmin']), (req, res, next) => {
  try {
    const db = getDb();
    const promo = db.prepare('SELECT id, code FROM promocodes WHERE id = ?').get(req.params.id);
    if (!promo) return R.notFound(res, 'Promo code not found');
    db.prepare('DELETE FROM promocodes WHERE id = ?').run(req.params.id);
    audit(db, req.admin.id, 'DELETE_PROMOCODE', 'promocode', Number(req.params.id), { code: promo.code }, req.ip);
    return R.success(res, null, 'Promo code deleted');
  } catch (err) { next(err); }
});

module.exports = router;
