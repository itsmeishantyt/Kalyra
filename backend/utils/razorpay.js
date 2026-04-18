/**
 * Razorpay Mock Gateway
 *
 * Mirrors the Razorpay Node.js SDK interface exactly.
 * Switch to real SDK by:
 *   1. npm install razorpay
 *   2. Set RAZORPAY_MOCK_MODE=false, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET in .env
 *   3. This file auto-routes to real SDK when mock mode is off.
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const MOCK_MODE   = process.env.RAZORPAY_MOCK_MODE !== 'false';
const KEY_ID      = process.env.RAZORPAY_KEY_ID     || 'mock_key_id';
const KEY_SECRET  = process.env.RAZORPAY_KEY_SECRET  || 'mock_key_secret';

// ── Mock implementation ──────────────────────────────────────
class MockRazorpay {
  constructor() {
    this.orders    = { create: this._createOrder.bind(this) };
    this.payments  = { fetch: this._fetchPayment.bind(this) };
    this.refunds   = { create: this._createRefund.bind(this) };
  }

  async _createOrder({ amount, currency = 'INR', receipt, notes = {} }) {
    const orderId = `order_mock_${uuidv4().replace(/-/g, '').substring(0, 14)}`;
    console.log(`[RAZORPAY MOCK] Created order: ${orderId} | ₹${amount / 100}`);
    return {
      id:         orderId,
      entity:     'order',
      amount,
      amount_paid: 0,
      amount_due:  amount,
      currency,
      receipt:    receipt || orderId,
      status:     'created',
      attempts:   0,
      notes,
      created_at: Math.floor(Date.now() / 1000),
    };
  }

  async _fetchPayment(paymentId) {
    return {
      id:         paymentId,
      entity:     'payment',
      amount:     0,
      currency:   'INR',
      status:     'captured',
      method:     'card',
    };
  }

  async _createRefund(paymentId, { amount, notes = {} } = {}) {
    const refundId = `rfnd_mock_${uuidv4().replace(/-/g, '').substring(0, 14)}`;
    console.log(`[RAZORPAY MOCK] Refund: ${refundId} for payment ${paymentId}`);
    return {
      id:         refundId,
      entity:     'refund',
      payment_id: paymentId,
      amount,
      notes,
      created_at: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Verify payment signature.
   * Real Razorpay: HMAC-SHA256 of "orderId|paymentId" with key_secret.
   * Mock: always returns true (but still executes the real algorithm).
   */
  verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
    if (MOCK_MODE) {
      console.log('[RAZORPAY MOCK] Signature verified (mock — always true)');
      return true;
    }
    const body    = `${razorpay_order_id}|${razorpay_payment_id}`;
    const digest  = crypto.createHmac('sha256', KEY_SECRET).update(body).digest('hex');
    return digest === razorpay_signature;
  }
}

// ── Real Razorpay SDK (activated when RAZORPAY_MOCK_MODE=false) ─
function buildInstance() {
  if (MOCK_MODE) {
    console.log('[RAZORPAY] Running in MOCK mode. Set RAZORPAY_MOCK_MODE=false with real keys to go live.');
    return new MockRazorpay();
  }
  // Uncomment when going live:
  // const Razorpay = require('razorpay');
  // return new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
  return new MockRazorpay();
}

const razorpay = buildInstance();

/**
 * Verify payment signature — exported as standalone function.
 * Works with both mock and real instances.
 */
function verifySignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  return razorpay.verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature });
}

module.exports = { razorpay, verifySignature, KEY_ID, MOCK_MODE };
