const express = require('express');
const { body } = require('express-validator');
const { getDb } = require('../db/init');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { razorpay, verifySignature, KEY_ID } = require('../utils/razorpay');
const R = require('../utils/response');

const router = express.Router();

// GET /api/v1/payments
router.get('/', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const payments = db.prepare(`
      SELECT ph.id, ph.order_id, ph.payment_method_type, ph.amount, ph.currency,
             ph.status, ph.razorpay_payment_id, ph.paid_at, ph.created_at,
             o.order_ref
      FROM payment_history ph
      JOIN orders o ON o.id = ph.order_id
      WHERE ph.user_id = ?
      ORDER BY ph.created_at DESC
    `).all(req.user.id);
    return R.success(res, payments);
  } catch (err) { next(err); }
});

// GET /api/v1/payments/:id
router.get('/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const payment = db.prepare('SELECT * FROM payment_history WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!payment) return R.notFound(res, 'Payment not found');
    return R.success(res, payment);
  } catch (err) { next(err); }
});

// POST /api/v1/payments/initiate
// Creates a Razorpay order and returns keys for frontend Razorpay checkout
router.post('/initiate', requireAuth, [
  body('order_id').isInt({ min: 1 }).withMessage('Order ID required'),
], validate, async (req, res, next) => {
  try {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.body.order_id, req.user.id);
    if (!order) return R.notFound(res, 'Order not found');
    if (!['pending', 'confirmed'].includes(order.status)) {
      return R.badRequest(res, 'This order cannot be paid');
    }

    // Create Razorpay order (mock or real)
    const rzpOrder = await razorpay.orders.create({
      amount:   Math.round(order.total_amount * 100), // paise
      currency: 'INR',
      receipt:  order.order_ref,
      notes: {
        kalyra_order_id: order.id,
        user_id:         req.user.id,
      },
    });

    // Record payment attempt
    db.prepare(`
      INSERT INTO payment_history (order_id, user_id, payment_method_type, razorpay_order_id, amount, status)
      VALUES (?, ?, 'razorpay', ?, ?, 'pending')
    `).run(order.id, req.user.id, rzpOrder.id, order.total_amount);

    // Update order with rzp order id
    db.prepare('UPDATE orders SET razorpay_order_id = ? WHERE id = ?').run(rzpOrder.id, order.id);

    return R.success(res, {
      key_id:          KEY_ID,
      razorpay_order_id: rzpOrder.id,
      amount:          rzpOrder.amount,
      currency:        rzpOrder.currency,
      order_ref:       order.order_ref,
      prefill: {
        name:  req.user.name,
        email: req.user.email,
      },
    }, 'Payment initiated');
  } catch (err) { next(err); }
});

// POST /api/v1/payments/webhook
// Called by Razorpay OR the frontend after successful payment
router.post('/webhook', requireAuth, [
  body('razorpay_order_id').notEmpty(),
  body('razorpay_payment_id').notEmpty(),
  body('razorpay_signature').notEmpty(),
], validate, (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const db = getDb();

    const isValid = verifySignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature });
    if (!isValid) {
      db.prepare('UPDATE payment_history SET status = ?, failure_reason = ? WHERE razorpay_order_id = ?')
        .run('failed', 'Signature mismatch', razorpay_order_id);
      return R.badRequest(res, 'Payment verification failed');
    }

    // Mark payment successful
    db.prepare(`
      UPDATE payment_history SET
        status              = 'success',
        razorpay_payment_id = ?,
        razorpay_signature  = ?,
        paid_at             = datetime('now')
      WHERE razorpay_order_id = ?
    `).run(razorpay_payment_id, razorpay_signature, razorpay_order_id);

    // Confirm order
    db.prepare('UPDATE orders SET status = \'confirmed\', updated_at = datetime(\'now\') WHERE razorpay_order_id = ?')
      .run(razorpay_order_id);

    // Clear cart for the user who made the order
    const payment = db.prepare('SELECT user_id FROM payment_history WHERE razorpay_order_id = ?').get(razorpay_order_id);
    const userId = payment ? payment.user_id : req.user.id;
    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);

    return R.success(res, { verified: true }, 'Payment verified successfully');
  } catch (err) { next(err); }
});

module.exports = router;
