const express = require('express');
const { query } = require('express-validator');
const { getDb } = require('../../db/init');
const { requireAdmin } = require('../../middleware/adminAuth');
const { validate } = require('../../middleware/validate');
const R = require('../../utils/response');

const router = express.Router();

// ── Date helpers ─────────────────────────────────────────────
function dateFilter(req) {
  const from = req.query.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to   = req.query.to   || new Date().toISOString().slice(0, 10);
  return { from: `${from}T00:00:00`, to: `${to}T23:59:59` };
}

const dateValidators = [
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
];

// ─────────────────────────────────────────────────────────────
//  GET /api/v1/admin/analytics/dashboard
//  Dashboard summary
// ─────────────────────────────────────────────────────────────
router.get('/dashboard', requireAdmin(), (req, res, next) => {
  try {
    const db = getDb();
    const summary = db.prepare(`
      SELECT 
        (SELECT ROUND(COALESCE(SUM(total_amount), 0), 2) FROM orders WHERE status NOT IN ('cancelled', 'refunded')) as totalRevenue,
        (SELECT COUNT(*) FROM orders) as totalOrders,
        (SELECT COUNT(*) FROM products WHERE is_active = 1) as activeProducts,
        (SELECT COUNT(*) FROM users) as totalUsers
    `).get();

    return R.success(res, { summary });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/v1/admin/analytics/sales
//  Daily sales — order count + revenue grouped by day
// ─────────────────────────────────────────────────────────────
router.get('/sales', requireAdmin(), dateValidators, validate, (req, res, next) => {
  try {
    const { from, to } = dateFilter(req);
    const db = getDb();

    const daily = db.prepare(`
      SELECT
        strftime('%Y-%m-%d', created_at) as date,
        COUNT(*)                         as order_count,
        ROUND(SUM(total_amount), 2)      as revenue,
        ROUND(SUM(discount_amount), 2)   as discounts_given,
        ROUND(SUM(tax_amount), 2)        as tax_collected
      FROM orders
      WHERE created_at BETWEEN ? AND ?
        AND status NOT IN ('cancelled', 'refunded')
      GROUP BY date
      ORDER BY date ASC
    `).all(from, to);

    // Summary totals
    const totals = db.prepare(`
      SELECT
        COUNT(*)                       as total_orders,
        ROUND(SUM(total_amount), 2)    as total_revenue,
        ROUND(SUM(discount_amount), 2) as total_discounts,
        ROUND(SUM(tax_amount), 2)      as total_tax,
        ROUND(AVG(total_amount), 2)    as avg_order_value
      FROM orders
      WHERE created_at BETWEEN ? AND ?
        AND status NOT IN ('cancelled', 'refunded')
    `).get(from, to);

    const cancelled = db.prepare(`
      SELECT COUNT(*) as count, ROUND(SUM(total_amount), 2) as value
      FROM orders WHERE created_at BETWEEN ? AND ? AND status = 'cancelled'
    `).get(from, to);

    return R.success(res, { period: { from, to }, totals, cancelled, daily });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/v1/admin/analytics/revenue
//  Revenue breakdown
// ─────────────────────────────────────────────────────────────
router.get('/revenue', requireAdmin(), [
  ...dateValidators,
  query('group_by').optional().isIn(['day', 'week', 'month']),
], validate, (req, res, next) => {
  try {
    const { from, to } = dateFilter(req);
    const db = getDb();

    const groupMap = { day: '%Y-%m-%d', week: '%Y-W%W', month: '%Y-%m' };
    const fmt = groupMap[req.query.group_by] || '%Y-%m-%d';

    const series = db.prepare(`
      SELECT
        strftime(?, created_at)              as period,
        ROUND(SUM(subtotal), 2)              as gross_revenue,
        ROUND(SUM(discount_amount), 2)       as discounts,
        ROUND(SUM(tax_amount), 2)            as tax,
        ROUND(SUM(total_amount), 2)          as net_revenue,
        COUNT(*)                             as orders
      FROM orders
      WHERE created_at BETWEEN ? AND ?
        AND status NOT IN ('cancelled','refunded')
      GROUP BY period ORDER BY period ASC
    `).all(fmt, from, to);

    // By payment method
    const byMethod = db.prepare(`
      SELECT
        ph.payment_method_type,
        COUNT(*)                         as transactions,
        ROUND(SUM(ph.amount), 2)         as total
      FROM payment_history ph
      WHERE ph.created_at BETWEEN ? AND ? AND ph.status = 'success'
      GROUP BY ph.payment_method_type
    `).all(from, to);

    return R.success(res, { period: { from, to }, series, by_payment_method: byMethod });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/v1/admin/analytics/top-products
// ─────────────────────────────────────────────────────────────
router.get('/top-products', requireAdmin(), [
  ...dateValidators,
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
], validate, (req, res, next) => {
  try {
    const { from, to } = dateFilter(req);
    const limit = Number(req.query.limit) || 10;
    const db = getDb();

    const products = db.prepare(`
      SELECT
        oi.product_id,
        oi.product_name,
        oi.product_sku,
        SUM(oi.quantity)                    as units_sold,
        ROUND(SUM(oi.subtotal), 2)          as revenue,
        COUNT(DISTINCT oi.order_id)         as orders_count
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.created_at BETWEEN ? AND ?
        AND o.status NOT IN ('cancelled','refunded')
      GROUP BY oi.product_id
      ORDER BY units_sold DESC
      LIMIT ?
    `).all(from, to, limit);

    return R.success(res, { period: { from, to }, products });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/v1/admin/analytics/top-users
// ─────────────────────────────────────────────────────────────
router.get('/top-users', requireAdmin(), [
  ...dateValidators,
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
], validate, (req, res, next) => {
  try {
    const { from, to } = dateFilter(req);
    const limit = Number(req.query.limit) || 10;
    const db = getDb();

    const users = db.prepare(`
      SELECT
        u.id, u.name, u.email, u.phone, u.created_at as member_since,
        COUNT(o.id)                      as total_orders,
        ROUND(SUM(o.total_amount), 2)    as total_spent,
        ROUND(AVG(o.total_amount), 2)    as avg_order_value
      FROM orders o
      JOIN users u ON u.id = o.user_id
      WHERE o.created_at BETWEEN ? AND ?
        AND o.status NOT IN ('cancelled','refunded')
      GROUP BY o.user_id
      ORDER BY total_spent DESC
      LIMIT ?
    `).all(from, to, limit);

    return R.success(res, { period: { from, to }, users });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/v1/admin/analytics/user-stats
// ─────────────────────────────────────────────────────────────
router.get('/user-stats', requireAdmin(), dateValidators, validate, (req, res, next) => {
  try {
    const { from, to } = dateFilter(req);
    const db = getDb();

    const overview = db.prepare(`
      SELECT
        COUNT(*)                                       as total_users,
        COUNT(CASE WHEN status = 'active' THEN 1 END)    as active_users,
        COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended_users,
        COUNT(CASE WHEN created_at BETWEEN ? AND ? THEN 1 END) as new_users_in_period
      FROM users
    `).get(from, to);

    const signupTrend = db.prepare(`
      SELECT
        strftime('%Y-%m-%d', created_at) as date,
        COUNT(*)                         as signups
      FROM users
      WHERE created_at BETWEEN ? AND ?
      GROUP BY date ORDER BY date ASC
    `).all(from, to);

    const retention = db.prepare(`
      SELECT
        COUNT(DISTINCT u.id) as users_with_orders
      FROM users u
      WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.status NOT IN ('cancelled','refunded'))
    `).get();

    return R.success(res, { period: { from, to }, overview, signup_trend: signupTrend, retention });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/v1/admin/analytics/inventory
// ─────────────────────────────────────────────────────────────
router.get('/inventory', requireAdmin(), (req, res, next) => {
  try {
    const db = getDb();
    const threshold = Number(req.query.threshold) || 10;

    const overview = db.prepare(`
      SELECT
        COUNT(*)                                     as total_products,
        COUNT(CASE WHEN is_active = 1 THEN 1 END)   as active_products,
        COUNT(CASE WHEN stock = 0 THEN 1 END)        as out_of_stock,
        COUNT(CASE WHEN stock > 0 AND stock <= ? THEN 1 END) as low_stock,
        COALESCE(SUM(stock), 0)                      as total_units
      FROM products
    `).get(threshold);

    const lowStock = db.prepare(`
      SELECT id, name, sku, category, stock, price, is_active
      FROM products WHERE stock <= ? ORDER BY stock ASC LIMIT 20
    `).all(threshold);

    const byCategory = db.prepare(`
      SELECT category, COUNT(*) as products, SUM(stock) as total_stock
      FROM products WHERE category IS NOT NULL GROUP BY category
    `).all();

    return R.success(res, { threshold, overview, low_stock_items: lowStock, by_category: byCategory });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/v1/admin/analytics/promo-usage
// ─────────────────────────────────────────────────────────────
router.get('/promo-usage', requireAdmin(), dateValidators, validate, (req, res, next) => {
  try {
    const { from, to } = dateFilter(req);
    const db = getDb();

    const usage = db.prepare(`
      SELECT
        pc.code, pc.discount_type, pc.discount_value,
        pc.uses_count as total_uses,
        COUNT(o.id)                        as uses_in_period,
        ROUND(SUM(o.discount_amount), 2)   as total_discount_given,
        ROUND(SUM(o.total_amount), 2)      as revenue_with_promo
      FROM promocodes pc
      LEFT JOIN orders o ON o.promocode_id = pc.id
        AND o.created_at BETWEEN ? AND ?
        AND o.status NOT IN ('cancelled','refunded')
      GROUP BY pc.id
      ORDER BY uses_in_period DESC
    `).all(from, to);

    return R.success(res, { period: { from, to }, promo_usage: usage });
  } catch (err) { next(err); }
});

module.exports = router;
