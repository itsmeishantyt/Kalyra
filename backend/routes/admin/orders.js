const express = require('express');
const { body, query } = require('express-validator');
const { getDb, txn } = require('../../db/init');
const { requireAdmin, audit } = require('../../middleware/adminAuth');
const { validate } = require('../../middleware/validate');
const { razorpay } = require('../../utils/razorpay');
const { sendOrderStatusUpdate, sendOrderCancellation } = require('../../utils/mailer');
const R = require('../../utils/response');

const router = express.Router();

// GET /api/v1/admin/orders
router.get('/', requireAdmin(), [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('status').optional().isIn(['pending','confirmed','processing','shipped','delivered','cancelled','refunded']),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
  query('user_id').optional().isInt().toInt(),
  query('search').optional().trim(),
], validate, (req, res, next) => {
  try {
    const db = getDb();
    const { page = 1, limit = 20, status, from, to, user_id, search } = req.query;
    const offset = (page - 1) * limit;

    let where = ['1=1']; const params = [];
    if (status)  { where.push('o.status = ?'); params.push(status); }
    if (from)    { where.push('o.created_at >= ?'); params.push(from); }
    if (to)      { where.push('o.created_at <= ?'); params.push(to); }
    if (user_id) { where.push('o.user_id = ?'); params.push(user_id); }
    if (search)  { where.push('(o.order_ref LIKE ? OR u.name LIKE ? OR u.email LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

    const whereStr = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) as n FROM orders o JOIN users u ON u.id = o.user_id WHERE ${whereStr}`).get(...params).n;
    const orders = db.prepare(`
      SELECT o.id, o.order_ref, o.subtotal, o.discount_amount, o.tax_amount, o.total_amount,
             o.status, o.created_at, o.updated_at,
             u.id as user_id, u.name as user_name, u.email as user_email,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count
      FROM orders o
      JOIN users u ON u.id = o.user_id
      WHERE ${whereStr}
      ORDER BY o.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return R.paginate(res, orders, { page, limit, total });
  } catch (err) { next(err); }
});

// GET /api/v1/admin/orders/:id
router.get('/:id', requireAdmin(), (req, res, next) => {
  try {
    const db = getDb();
    const order = db.prepare(`
      SELECT o.*, u.name as user_name, u.email as user_email, u.phone as user_phone,
             a.line1, a.line2, a.city, a.state, a.postal_code, a.country,
             pc.code as promo_code
      FROM orders o
      JOIN users u ON u.id = o.user_id
      LEFT JOIN addresses a ON a.id = o.address_id
      LEFT JOIN promocodes pc ON pc.id = o.promocode_id
      WHERE o.id = ?
    `).get(req.params.id);
    if (!order) return R.notFound(res, 'Order not found');

    const items    = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    const payments = db.prepare('SELECT * FROM payment_history WHERE order_id = ?').all(order.id);

    return R.success(res, { order, items, payments });
  } catch (err) { next(err); }
});

// PATCH /api/v1/admin/orders/:id/status
router.patch('/:id/status', requireAdmin(['superadmin', 'manager']), [
  body('status').isIn(['pending','confirmed','processing','shipped','delivered','cancelled','refunded']),
  body('notes').optional().trim(),
], validate, (req, res, next) => {
  try {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return R.notFound(res, 'Order not found');

    const { status, notes } = req.body;
    db.prepare(`
      UPDATE orders SET status = ?, notes = COALESCE(?, notes), updated_at = datetime('now') WHERE id = ?
    `).run(status, notes || null, order.id);

    audit(db, req.admin.id, 'UPDATE_ORDER_STATUS', 'order', order.id, {
      order_ref: order.order_ref, old_status: order.status, new_status: status,
    }, req.ip);

    // Send order update email (non-blocking)
    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(order.user_id);
    if (user) {
      if (status === 'cancelled') {
        sendOrderCancellation(user, order)
          .catch(err => console.error('[mailer] Order cancellation email failed:', err.message));
      } else {
        sendOrderStatusUpdate(user, { ...order, status }, status)
          .catch(err => console.error('[mailer] Order status update email failed:', err.message));
      }
    }

    return R.success(res, { id: order.id, status }, 'Order status updated');
  } catch (err) { next(err); }
});

// POST /api/v1/admin/orders/:id/refund
router.post('/:id/refund', requireAdmin(['superadmin']), [
  body('reason').optional().trim().isLength({ max: 500 }),
], validate, async (req, res, next) => {
  try {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return R.notFound(res, 'Order not found');
    if (order.status === 'refunded') return R.badRequest(res, 'Order already refunded');

    const payment = db.prepare('SELECT * FROM payment_history WHERE order_id = ? AND status = \'success\'').get(order.id);

    // Issue Razorpay refund (mock)
    if (payment?.razorpay_payment_id) {
      await razorpay.refunds.create(payment.razorpay_payment_id, {
        amount: Math.round(payment.amount * 100),
        notes: { reason: req.body.reason || 'Admin initiated refund' },
      });
    }

    txn(db, () => {
      db.prepare('UPDATE orders SET status = \'refunded\', updated_at = datetime(\'now\') WHERE id = ?').run(order.id);
      if (payment) {
        db.prepare('UPDATE payment_history SET status = \'refunded\' WHERE id = ?').run(payment.id);
      }
      // Restore stock
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
      items.forEach(i => {
        if (i.product_id) db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(i.quantity, i.product_id);
      });
    });

    audit(db, req.admin.id, 'REFUND_ORDER', 'order', order.id, {
      order_ref: order.order_ref, amount: order.total_amount, reason: req.body.reason,
    }, req.ip);

    // Send refund confirmation email (non-blocking)
    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(order.user_id);
    if (user) {
      sendOrderStatusUpdate(user, { ...order, status: 'refunded' }, 'refunded')
        .catch(err => console.error('[mailer] Order refund email failed:', err.message));
    }

    return R.success(res, null, 'Order refunded successfully');
  } catch (err) { next(err); }
});

module.exports = router;
