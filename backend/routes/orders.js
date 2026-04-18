const express = require('express');
const { body, query } = require('express-validator');
const { getDb, txn } = require('../db/init');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const R = require('../utils/response');

const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────
function generateOrderRef() {
  const d = new Date();
  const ds = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rnd = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `KLY-${ds}-${rnd}`;
}

function applyPromo(promo, subtotal) {
  if (!promo || !promo.is_active) return 0;
  const now = new Date().toISOString();
  if (now < promo.valid_from || now > promo.valid_until) return 0;
  if (promo.max_uses && promo.uses_count >= promo.max_uses) return 0;
  if (subtotal < promo.min_order_value) return 0;

  let discount = promo.discount_type === 'flat'
    ? promo.discount_value
    : (subtotal * promo.discount_value) / 100;

  if (promo.max_discount) discount = Math.min(discount, promo.max_discount);
  return Math.min(discount, subtotal); // can't exceed subtotal
}

// ─────────────────────────────────────────────────────────────
//  GET /api/v1/orders
// ─────────────────────────────────────────────────────────────
router.get('/', requireAuth, [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('status').optional().isIn(['pending','confirmed','processing','shipped','delivered','cancelled','refunded']),
], validate, (req, res, next) => {
  try {
    const db = getDb();
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    let where = ['o.user_id = ?'];
    const params = [req.user.id];
    if (status) { where.push('o.status = ?'); params.push(status); }

    const whereStr = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) as n FROM orders o WHERE ${whereStr}`).get(...params).n;
    const orders = db.prepare(`
      SELECT o.id, o.order_ref, o.subtotal, o.discount_amount, o.tax_amount, o.total_amount,
             o.status, o.created_at, o.updated_at,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count
      FROM orders o
      WHERE ${whereStr}
      ORDER BY o.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return R.paginate(res, orders, { page, limit, total });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/v1/orders/:id
// ─────────────────────────────────────────────────────────────
router.get('/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const order = db.prepare(`
      SELECT o.*, a.line1, a.line2, a.city, a.state, a.postal_code, a.country,
             pc.code as promo_code
      FROM orders o
      LEFT JOIN addresses a ON a.id = o.address_id
      LEFT JOIN promocodes pc ON pc.id = o.promocode_id
      WHERE o.id = ? AND o.user_id = ?
    `).get(req.params.id, req.user.id);
    if (!order) return R.notFound(res, 'Order not found');

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(req.params.id);
    const payments = db.prepare('SELECT id, payment_method_type, amount, status, paid_at FROM payment_history WHERE order_id = ?').all(req.params.id);

    return R.success(res, { order, items, payments });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/v1/orders/validate-promo
// ─────────────────────────────────────────────────────────────
router.post('/validate-promo', requireAuth, [
  body('code').trim().notEmpty().withMessage('Promo code required'),
  body('subtotal').isFloat({ min: 0 }).withMessage('Subtotal required'),
], validate, (req, res, next) => {
  try {
    const { code, subtotal } = req.body;
    const db = getDb();

    const promo = db.prepare('SELECT * FROM promocodes WHERE code = ? COLLATE NOCASE').get(code);
    if (!promo || !promo.is_active) return R.badRequest(res, 'Invalid promo code');

    const now = new Date().toISOString();
    if (now < promo.valid_from || now > promo.valid_until) return R.badRequest(res, 'Promo code has expired');
    if (promo.max_uses && promo.uses_count >= promo.max_uses) return R.badRequest(res, 'Promo code usage limit reached');
    if (subtotal < promo.min_order_value) return R.badRequest(res, `Minimum order value ₹${promo.min_order_value} required`);

    const discount = applyPromo(promo, subtotal);
    return R.success(res, {
      code: promo.code,
      discount_type: promo.discount_type,
      discount_value: promo.discount_value,
      discount_amount: discount,
      final_amount: Math.max(0, subtotal - discount),
    }, 'Promo code applied');
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/v1/orders
// ─────────────────────────────────────────────────────────────
router.post('/', requireAuth, [
  body('address_id').isInt({ min: 1 }).withMessage('Delivery address required'),
  body('payment_method').notEmpty().withMessage('Payment method required'),
  body('promo_code').optional().trim(),
  body('notes').optional().trim().isLength({ max: 500 }),
], validate, (req, res, next) => {
  try {
    const { address_id, payment_method, promo_code, notes } = req.body;
    const db = getDb();

    // Validate address belongs to user
    const address = db.prepare('SELECT id FROM addresses WHERE id = ? AND user_id = ?').get(address_id, req.user.id);
    if (!address) return R.notFound(res, 'Address not found');

    // Get cart items
    const cartItems = db.prepare(`
      SELECT ci.quantity, ci.size, ci.color,
             p.id as product_id, p.name, p.sku, p.price, p.discount_pct, p.stock, p.is_active
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.user_id = ?
    `).all(req.user.id);

    if (cartItems.length === 0) return R.badRequest(res, 'Cart is empty');

    // Validate stock and calculate subtotal
    for (const item of cartItems) {
      if (!item.is_active) return R.badRequest(res, `Product "${item.name}" is no longer available`);
      if (item.stock < item.quantity) return R.badRequest(res, `Insufficient stock for "${item.name}"`);
    }

    const subtotal = cartItems.reduce((s, i) => {
      return s + Math.round(i.price * (1 - i.discount_pct / 100) * 100) / 100 * i.quantity;
    }, 0);

    // Promo code
    let promoId = null, discountAmount = 0;
    if (promo_code) {
      const promo = db.prepare('SELECT * FROM promocodes WHERE code = ? COLLATE NOCASE AND is_active = 1').get(promo_code);
      if (promo) {
        discountAmount = applyPromo(promo, subtotal);
        promoId = promo.id;
      }
    }

    const taxAmount  = Math.round((subtotal - discountAmount) * 0.05 * 100) / 100; // 5% GST
    const total      = Math.round((subtotal - discountAmount + taxAmount) * 100) / 100;
    const orderRef   = generateOrderRef();

    // Transaction: create order + items + deduct stock + clear cart
    const orderId = txn(db, () => {
      const orderResult = db.prepare(`
        INSERT INTO orders (order_ref, user_id, address_id, promocode_id, subtotal, discount_amount, tax_amount, total_amount, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(orderRef, req.user.id, address_id, promoId, subtotal, discountAmount, taxAmount, total, notes || null);

      const orderId = orderResult.lastInsertRowid;

      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, product_name, product_sku, unit_price, discount_pct, quantity, size, color, subtotal)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of cartItems) {
        const itemSubtotal = Math.round(item.price * (1 - item.discount_pct / 100) * item.quantity * 100) / 100;
        insertItem.run(orderId, item.product_id, item.name, item.sku || null, item.price, item.discount_pct, item.quantity, item.size || null, item.color || null, itemSubtotal);
        db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(item.quantity, item.product_id);
      }

      // Increment promo uses
      if (promoId) db.prepare('UPDATE promocodes SET uses_count = uses_count + 1 WHERE id = ?').run(promoId);

      // Clear cart
      db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.id);

      return orderId;
    });
    const order   = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);

    return R.created(res, { order, orderRef }, 'Order placed successfully');
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  PATCH /api/v1/orders/:id/cancel
// ─────────────────────────────────────────────────────────────
router.patch('/:id/cancel', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!order) return R.notFound(res, 'Order not found');
    if (!['pending', 'confirmed'].includes(order.status)) {
      return R.badRequest(res, `Cannot cancel an order with status "${order.status}"`);
    }

    // Restore stock
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    txn(db, () => {
      items.forEach(i => {
        if (i.product_id) db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(i.quantity, i.product_id);
      });
      db.prepare('UPDATE orders SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run('cancelled', order.id);
      // Decrement promo uses
      if (order.promocode_id) db.prepare('UPDATE promocodes SET uses_count = MAX(0, uses_count - 1) WHERE id = ?').run(order.promocode_id);
    });

    return R.success(res, null, 'Order cancelled');
  } catch (err) { next(err); }
});

module.exports = router;
