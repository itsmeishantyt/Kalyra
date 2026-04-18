const express = require('express');
const { body } = require('express-validator');
const { getDb } = require('../db/init');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const R = require('../utils/response');

const router = express.Router();

// GET /api/v1/cart
router.get('/', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const items = db.prepare(`
      SELECT ci.id, ci.quantity, ci.size, ci.color, ci.added_at,
             p.id as product_id, p.name, p.price, p.discount_pct, p.image_url, p.stock,
             ROUND(p.price * (1 - p.discount_pct / 100), 2) as discounted_price
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.user_id = ? AND p.is_active = 1
      ORDER BY ci.added_at DESC
    `).all(req.user.id);

    const subtotal = items.reduce((s, i) => s + i.discounted_price * i.quantity, 0);
    return R.success(res, { items, subtotal: Math.round(subtotal * 100) / 100, count: items.length });
  } catch (err) { next(err); }
});

// POST /api/v1/cart
router.post('/', requireAuth, [
  body('product_id').isInt({ min: 1 }),
  body('quantity').optional().isInt({ min: 1, max: 20 }).withMessage('Quantity must be 1–20'),
  body('size').optional().trim(),
  body('color').optional().trim(),
], validate, (req, res, next) => {
  try {
    const { product_id, quantity = 1, size, color } = req.body;
    const db = getDb();

    const product = db.prepare('SELECT id, stock, is_active FROM products WHERE id = ?').get(product_id);
    if (!product || !product.is_active) return R.notFound(res, 'Product not found');
    if (product.stock < quantity) return R.badRequest(res, `Only ${product.stock} units available`);

    // Upsert: increment if exists
    const existing = db.prepare(`
      SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ? AND size IS ? AND color IS ?
    `).get(req.user.id, product_id, size || null, color || null);

    if (existing) {
      const newQty = existing.quantity + quantity;
      if (newQty > product.stock) return R.badRequest(res, `Only ${product.stock} units available`);
      db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(newQty, existing.id);
    } else {
      db.prepare(`
        INSERT INTO cart_items (user_id, product_id, quantity, size, color)
        VALUES (?, ?, ?, ?, ?)
      `).run(req.user.id, product_id, quantity, size || null, color || null);
    }

    return R.success(res, null, 'Item added to cart');
  } catch (err) { next(err); }
});

// PUT /api/v1/cart/:id
router.put('/:id', requireAuth, [
  body('quantity').isInt({ min: 1, max: 20 }),
], validate, (req, res, next) => {
  try {
    const db = getDb();
    const item = db.prepare('SELECT ci.*, p.stock FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.id = ? AND ci.user_id = ?').get(req.params.id, req.user.id);
    if (!item) return R.notFound(res, 'Cart item not found');
    if (req.body.quantity > item.stock) return R.badRequest(res, `Only ${item.stock} units available`);

    db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(req.body.quantity, req.params.id);
    return R.success(res, null, 'Cart updated');
  } catch (err) { next(err); }
});

// DELETE /api/v1/cart/:id
router.delete('/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const item = db.prepare('SELECT id FROM cart_items WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!item) return R.notFound(res, 'Cart item not found');
    db.prepare('DELETE FROM cart_items WHERE id = ?').run(req.params.id);
    return R.success(res, null, 'Item removed from cart');
  } catch (err) { next(err); }
});

// DELETE /api/v1/cart  (clear all)
router.delete('/', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.id);
    return R.success(res, null, 'Cart cleared');
  } catch (err) { next(err); }
});

module.exports = router;
