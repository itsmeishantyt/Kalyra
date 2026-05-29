const express = require('express');
const { query } = require('express-validator');
const { getDb } = require('../db/init');
const { validate } = require('../middleware/validate');
const R = require('../utils/response');

const router = express.Router();

// GET /api/v1/products
router.get('/', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('category').optional().trim(),
  query('search').optional().trim(),
  query('min_price').optional().isFloat({ min: 0 }).toFloat(),
  query('max_price').optional().isFloat({ min: 0 }).toFloat(),
  query('sort').optional().isIn(['price_asc', 'price_desc', 'newest', 'discount']),
  query('in_stock').optional().isBoolean().toBoolean(),
], validate, (req, res, next) => {
  try {
    const db = getDb();
    const { page = 1, limit = 20, category, search, min_price, max_price, sort, in_stock } = req.query;
    const offset = (page - 1) * limit;

    let where = ['p.is_active = 1'];
    const params = [];

    if (category)  { where.push('p.category = ?');  params.push(category); }
    if (search)    { where.push('(p.name LIKE ? OR p.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
    if (min_price != null) { where.push('p.price >= ?'); params.push(min_price); }
    if (max_price != null) { where.push('p.price <= ?'); params.push(max_price); }
    if (in_stock)  { where.push('p.stock > 0'); }

    const whereClause = where.join(' AND ');

    const orderMap = {
      price_asc:  'p.price ASC',
      price_desc: 'p.price DESC',
      newest:     'p.created_at DESC',
      discount:   'p.discount_pct DESC',
    };
    const orderClause = orderMap[sort] || 'p.created_at DESC';

    const total = db.prepare(`SELECT COUNT(*) as n FROM products p WHERE ${whereClause}`).get(...params).n;
    const products = db.prepare(`
      SELECT p.id, p.name, p.description, p.sku, p.category, p.tags,
             p.price, p.discount_pct,
             ROUND(p.price * (1 - p.discount_pct / 100), 2) as discounted_price,
             p.stock, p.image_url, p.sizes, p.colors, p.created_at
      FROM products p
      WHERE ${whereClause}
      ORDER BY ${orderClause}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return R.paginate(res, products, { page, limit, total });
  } catch (err) { next(err); }
});

// GET /api/v1/products/categories
router.get('/categories', (req, res, next) => {
  try {
    const db = getDb();
    const cats = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM products WHERE is_active = 1 AND category IS NOT NULL
      GROUP BY category ORDER BY count DESC
    `).all();
    return R.success(res, cats);
  } catch (err) { next(err); }
});

// GET /api/v1/products/:id
router.get('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const product = db.prepare(`
      SELECT id, name, description, sku, category, tags, price, discount_pct,
             ROUND(price * (1 - discount_pct / 100), 2) as discounted_price,
             stock, image_url, sizes, colors, created_at
      FROM products WHERE id = ? AND is_active = 1
    `).get(req.params.id);
    if (!product) return R.notFound(res, 'Product not found');
    return R.success(res, product);
  } catch (err) { next(err); }
});

module.exports = router;
