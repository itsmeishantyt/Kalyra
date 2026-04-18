const express = require('express');
const { body, query } = require('express-validator');
const path = require('path');
const fs   = require('fs');
const multer = require('multer');

const { getDb } = require('../../db/init');
const { requireAdmin, audit } = require('../../middleware/adminAuth');
const { validate } = require('../../middleware/validate');
const R = require('../../utils/response');

const router = express.Router();

// ── Product image upload ─────────────────────────────────────
const prodUploadDir = path.join(__dirname, '..', '..', 'uploads', 'products');
if (!fs.existsSync(prodUploadDir)) fs.mkdirSync(prodUploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, prodUploadDir),
  filename:    (req, file, cb) => { const ext = path.extname(file.originalname).toLowerCase(); cb(null, `prod_${Date.now()}${ext}`); },
});
const upload = multer({
  storage,
  limits: { fileSize: (Number(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, WebP images are allowed'));
  },
});

// ─────────────────────────────────────────────────────────────
//  GET /api/v1/admin/products
// ─────────────────────────────────────────────────────────────
router.get('/', requireAdmin(), [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().trim(),
  query('category').optional().trim(),
  query('active').optional().isBoolean().toBoolean(),
  query('low_stock').optional().isInt({ min: 0 }).toInt(),
], validate, (req, res, next) => {
  try {
    const db = getDb();
    const { page = 1, limit = 20, search, category, active, low_stock } = req.query;
    const offset = (page - 1) * limit;

    let where = ['1=1']; const params = [];
    if (search)    { where.push('(name LIKE ? OR sku LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
    if (category)  { where.push('category = ?'); params.push(category); }
    if (active !== undefined) { where.push('is_active = ?'); params.push(active ? 1 : 0); }
    if (low_stock !== undefined) { where.push('stock <= ?'); params.push(low_stock); }

    const whereStr = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) as n FROM products WHERE ${whereStr}`).get(...params).n;
    const products = db.prepare(`
      SELECT *, ROUND(price * (1 - discount_pct / 100), 2) as discounted_price
      FROM products WHERE ${whereStr}
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return R.paginate(res, products, { page, limit, total });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/v1/admin/products
// ─────────────────────────────────────────────────────────────
router.post('/', requireAdmin(['superadmin', 'manager']), (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) return next(err);
    try {
      const { name, description, sku, category, tags, price, discount_pct, stock, sizes, colors } = req.body;
      if (!name) return R.badRequest(res, 'Product name required');
      if (!price || isNaN(Number(price))) return R.badRequest(res, 'Valid price required');

      const db = getDb();
      const imageUrl = req.file ? `/uploads/products/${req.file.filename}` : null;

      const result = db.prepare(`
        INSERT INTO products (name, description, sku, category, tags, price, discount_pct, stock, image_url, sizes, colors)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(name, description || null, sku || null, category || null, tags || '[]', Number(price), Number(discount_pct) || 0, Number(stock) || 0, imageUrl, sizes || '[]', colors || '[]');

      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
      audit(db, req.admin.id, 'CREATE_PRODUCT', 'product', result.lastInsertRowid, { name, price }, req.ip);
      return R.created(res, product, 'Product created');
    } catch (err2) { next(err2); }
  });
});

// ─────────────────────────────────────────────────────────────
//  PUT /api/v1/admin/products/:id
// ─────────────────────────────────────────────────────────────
router.put('/:id', requireAdmin(['superadmin', 'manager']), (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) return next(err);
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      if (!existing) return R.notFound(res, 'Product not found');

      const { name, description, sku, category, tags, price, discount_pct, stock, sizes, colors } = req.body;
      const imageUrl = req.file ? `/uploads/products/${req.file.filename}` : existing.image_url;

      db.prepare(`
        UPDATE products SET
          name = COALESCE(?, name), description = COALESCE(?, description),
          sku = COALESCE(?, sku), category = COALESCE(?, category),
          tags = COALESCE(?, tags), price = COALESCE(?, price),
          discount_pct = COALESCE(?, discount_pct), stock = COALESCE(?, stock),
          image_url = ?, sizes = COALESCE(?, sizes), colors = COALESCE(?, colors),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(name || null, description || null, sku || null, category || null, tags || null, price ? Number(price) : null, discount_pct !== undefined ? Number(discount_pct) : null, stock !== undefined ? Number(stock) : null, imageUrl, sizes || null, colors || null, req.params.id);

      const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      audit(db, req.admin.id, 'UPDATE_PRODUCT', 'product', Number(req.params.id), { name: updated.name }, req.ip);
      return R.success(res, updated, 'Product updated');
    } catch (err2) { next(err2); }
  });
});

// PATCH /api/v1/admin/products/:id/price
router.patch('/:id/price', requireAdmin(['superadmin', 'manager']), [
  body('price').isFloat({ min: 0 }).withMessage('Valid price required'),
], validate, (req, res, next) => {
  try {
    const db = getDb();
    const product = db.prepare('SELECT id, name, price FROM products WHERE id = ?').get(req.params.id);
    if (!product) return R.notFound(res, 'Product not found');

    db.prepare('UPDATE products SET price = ?, updated_at = datetime(\'now\') WHERE id = ?').run(req.body.price, req.params.id);
    audit(db, req.admin.id, 'UPDATE_PRICE', 'product', Number(req.params.id), { old_price: product.price, new_price: req.body.price }, req.ip);
    return R.success(res, { id: product.id, price: req.body.price }, 'Price updated');
  } catch (err) { next(err); }
});

// PATCH /api/v1/admin/products/:id/discount
router.patch('/:id/discount', requireAdmin(['superadmin', 'manager']), [
  body('discount_pct').isFloat({ min: 0, max: 100 }).withMessage('Discount must be 0–100'),
], validate, (req, res, next) => {
  try {
    const db = getDb();
    const product = db.prepare('SELECT id, name, discount_pct FROM products WHERE id = ?').get(req.params.id);
    if (!product) return R.notFound(res, 'Product not found');

    db.prepare('UPDATE products SET discount_pct = ?, updated_at = datetime(\'now\') WHERE id = ?').run(req.body.discount_pct, req.params.id);
    audit(db, req.admin.id, 'UPDATE_DISCOUNT', 'product', Number(req.params.id), { old_discount: product.discount_pct, new_discount: req.body.discount_pct }, req.ip);
    return R.success(res, { id: product.id, discount_pct: req.body.discount_pct }, 'Discount updated');
  } catch (err) { next(err); }
});

// PATCH /api/v1/admin/products/:id/toggle
router.patch('/:id/toggle', requireAdmin(['superadmin', 'manager']), (req, res, next) => {
  try {
    const db = getDb();
    const product = db.prepare('SELECT id, name, is_active FROM products WHERE id = ?').get(req.params.id);
    if (!product) return R.notFound(res, 'Product not found');

    const newStatus = product.is_active ? 0 : 1;
    db.prepare('UPDATE products SET is_active = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newStatus, req.params.id);
    audit(db, req.admin.id, newStatus ? 'ACTIVATE_PRODUCT' : 'DEACTIVATE_PRODUCT', 'product', Number(req.params.id), { name: product.name }, req.ip);
    return R.success(res, { is_active: newStatus }, `Product ${newStatus ? 'activated' : 'deactivated'}`);
  } catch (err) { next(err); }
});

// DELETE /api/v1/admin/products/:id
router.delete('/:id', requireAdmin(['superadmin']), (req, res, next) => {
  try {
    const db = getDb();
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return R.notFound(res, 'Product not found');

    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    // Delete image file
    if (product.image_url) {
      const imgPath = path.join(__dirname, '..', '..', product.image_url);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }
    audit(db, req.admin.id, 'DELETE_PRODUCT', 'product', Number(req.params.id), { name: product.name }, req.ip);
    return R.success(res, null, 'Product deleted');
  } catch (err) { next(err); }
});

module.exports = router;
