const express = require('express');
const { getDb } = require('../db/init');
const { requireAuth } = require('../middleware/auth');
const R = require('../utils/response');

const router = express.Router();

// GET /api/v1/wishlist
router.get('/', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const items = db.prepare(`
      SELECT lp.id, lp.liked_at,
             p.id as product_id, p.name, p.price, p.discount_pct, p.image_url, p.category, p.is_active,
             ROUND(p.price * (1 - p.discount_pct / 100), 2) as discounted_price
      FROM liked_products lp
      JOIN products p ON p.id = lp.product_id
      WHERE lp.user_id = ?
      ORDER BY lp.liked_at DESC
    `).all(req.user.id);
    return R.success(res, items);
  } catch (err) { next(err); }
});

// POST /api/v1/wishlist/:productId  (toggle like)
router.post('/:productId', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const product = db.prepare('SELECT id FROM products WHERE id = ? AND is_active = 1').get(req.params.productId);
    if (!product) return R.notFound(res, 'Product not found');

    const existing = db.prepare('SELECT id FROM liked_products WHERE user_id = ? AND product_id = ?')
      .get(req.user.id, req.params.productId);

    if (existing) {
      db.prepare('DELETE FROM liked_products WHERE user_id = ? AND product_id = ?')
        .run(req.user.id, req.params.productId);
      return R.success(res, { liked: false }, 'Removed from wishlist');
    }

    db.prepare('INSERT INTO liked_products (user_id, product_id) VALUES (?, ?)').run(req.user.id, req.params.productId);
    return R.success(res, { liked: true }, 'Added to wishlist');
  } catch (err) { next(err); }
});

// DELETE /api/v1/wishlist/:productId
router.delete('/:productId', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM liked_products WHERE user_id = ? AND product_id = ?').run(req.user.id, req.params.productId);
    return R.success(res, { liked: false }, 'Removed from wishlist');
  } catch (err) { next(err); }
});

module.exports = router;
