require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const { initDatabase, getDb, txn } = require('./init');

async function seed() {
  initDatabase();
  const db = getDb();

  console.log('🌱  Seeding Kalyra database...');

  // ── Admins ─────────────────────────────────────────────
  const adminPwd = await bcrypt.hash('Admin@1234', 12);
  db.prepare(`
    INSERT OR IGNORE INTO admins (name, email, password_hash, role)
    VALUES (?, ?, ?, ?)
  `).run('Super Admin', 'admin@kalyra.com', adminPwd, 'superadmin');

  db.prepare(`
    INSERT OR IGNORE INTO admins (name, email, password_hash, role)
    VALUES (?, ?, ?, ?)
  `).run('Manager One', 'manager@kalyra.com', adminPwd, 'manager');

  console.log('   ✅  Admins seeded  (admin@kalyra.com / Admin@1234)');

  // ── Sample User ────────────────────────────────────────
  const userPwd = await bcrypt.hash('User@1234', 12);
  db.prepare(`
    INSERT OR IGNORE INTO users (name, email, password_hash, phone)
    VALUES (?, ?, ?, ?)
  `).run('Priya Sharma', 'priya@example.com', userPwd, '9876543210');
  console.log('   ✅  Demo user  (priya@example.com / User@1234)');

  // ── Products ───────────────────────────────────────────
  const products = [
    {
      name: 'Floral Wrap Dress',
      description: 'Elegant wrap dress with vibrant floral print. Perfect for summer outings.',
      sku: 'KLY-D001',
      category: 'Dresses',
      tags: JSON.stringify(['floral', 'wrap', 'summer']),
      price: 2499,
      discount_pct: 10,
      stock: 45,
      image_url: '/uploads/products/floral-wrap-dress.jpg',
      sizes: JSON.stringify(['XS', 'S', 'M', 'L', 'XL']),
      colors: JSON.stringify(['Blue Floral', 'Pink Floral', 'Green Floral']),
    },
    {
      name: 'Linen Wide-Leg Trousers',
      description: 'Breathable linen trousers with a relaxed wide-leg silhouette.',
      sku: 'KLY-T001',
      category: 'Bottomwear',
      tags: JSON.stringify(['linen', 'trousers', 'casual']),
      price: 1899,
      discount_pct: 0,
      stock: 30,
      image_url: '/uploads/products/linen-trousers.jpg',
      sizes: JSON.stringify(['XS', 'S', 'M', 'L', 'XL', 'XXL']),
      colors: JSON.stringify(['Ivory', 'Sage Green', 'Dusty Rose']),
    },
    {
      name: 'Embroidered Kurta',
      description: 'Hand-embroidered cotton kurta with intricate thread work.',
      sku: 'KLY-K001',
      category: 'Kurtas',
      tags: JSON.stringify(['kurta', 'ethnic', 'cotton', 'embroidered']),
      price: 3299,
      discount_pct: 15,
      stock: 20,
      image_url: '/uploads/products/embroidered-kurta.jpg',
      sizes: JSON.stringify(['S', 'M', 'L', 'XL']),
      colors: JSON.stringify(['Off White', 'Sky Blue', 'Mustard']),
    },
    {
      name: 'Denim Jacket',
      description: 'Classic denim jacket with modern cuts. Versatile everyday staple.',
      sku: 'KLY-J001',
      category: 'Outerwear',
      tags: JSON.stringify(['denim', 'jacket', 'casual', 'classic']),
      price: 3999,
      discount_pct: 5,
      stock: 15,
      image_url: '/uploads/products/denim-jacket.jpg',
      sizes: JSON.stringify(['S', 'M', 'L', 'XL', 'XXL']),
      colors: JSON.stringify(['Classic Blue', 'Black']),
    },
    {
      name: 'Silk Blouse',
      description: 'Premium silk blouse with a relaxed fit. Transitions from day to evening effortlessly.',
      sku: 'KLY-B001',
      category: 'Topwear',
      tags: JSON.stringify(['silk', 'blouse', 'premium', 'evening']),
      price: 2199,
      discount_pct: 0,
      stock: 25,
      image_url: '/uploads/products/silk-blouse.jpg',
      sizes: JSON.stringify(['XS', 'S', 'M', 'L']),
      colors: JSON.stringify(['Champagne', 'Dusty Lilac', 'Blush Pink']),
    },
    {
      name: 'Stripe Cotton Tee',
      description: 'Casual stripe print cotton tee. Lightweight, breathable all-day comfort.',
      sku: 'KLY-T002',
      category: 'Topwear',
      tags: JSON.stringify(['tee', 'casual', 'cotton', 'stripe']),
      price: 899,
      discount_pct: 0,
      stock: 60,
      image_url: '/uploads/products/stripe-tee.jpg',
      sizes: JSON.stringify(['XS', 'S', 'M', 'L', 'XL', 'XXL']),
      colors: JSON.stringify(['Black/White', 'Navy/White', 'Red/White']),
    },
    {
      name: 'Maxi Skirt',
      description: 'Flowing maxi skirt with elasticated waist and side slit.',
      sku: 'KLY-S001',
      category: 'Bottomwear',
      tags: JSON.stringify(['skirt', 'maxi', 'casual', 'flowy']),
      price: 1599,
      discount_pct: 20,
      stock: 35,
      image_url: '/uploads/products/maxi-skirt.jpg',
      sizes: JSON.stringify(['XS', 'S', 'M', 'L', 'XL']),
      colors: JSON.stringify(['Terracotta', 'Ocean Blue', 'Olive']),
    },
    {
      name: 'Pleated Midi Dress',
      description: 'Elegant pleated midi dress with puff sleeves and a flattering silhouette.',
      sku: 'KLY-D002',
      category: 'Dresses',
      tags: JSON.stringify(['dress', 'pleated', 'midi', 'elegant']),
      price: 2899,
      discount_pct: 0,
      stock: 18,
      image_url: '/uploads/products/pleated-midi-dress.jpg',
      sizes: JSON.stringify(['XS', 'S', 'M', 'L']),
      colors: JSON.stringify(['Blush', 'Black', 'Cobalt Blue']),
    },
  ];

  const insertProduct = db.prepare(`
    INSERT OR IGNORE INTO products
      (name, description, sku, category, tags, price, discount_pct, stock, image_url, sizes, colors)
    VALUES
      (@name, @description, @sku, @category, @tags, @price, @discount_pct, @stock, @image_url, @sizes, @colors)
  `);
  txn(db, () => products.forEach(p => insertProduct.run(p)));
  console.log(`   ✅  ${products.length} products seeded`);

  // ── Promo Codes ────────────────────────────────────────
  const superAdmin = db.prepare('SELECT id FROM admins WHERE email = ?').get('admin@kalyra.com');
  const promos = [
    {
      code: 'WELCOME10',
      description: '10% off on first order',
      discount_type: 'percent',
      discount_value: 10,
      min_order_value: 500,
      max_discount: 500,
      max_uses: null,
      valid_from: '2024-01-01T00:00:00',
      valid_until: '2027-12-31T23:59:59',
      created_by: superAdmin.id,
    },
    {
      code: 'FLAT200',
      description: 'Flat ₹200 off on orders above ₹1500',
      discount_type: 'flat',
      discount_value: 200,
      min_order_value: 1500,
      max_discount: null,
      max_uses: 1000,
      valid_from: '2024-01-01T00:00:00',
      valid_until: '2027-12-31T23:59:59',
      created_by: superAdmin.id,
    },
    {
      code: 'SUMMER25',
      description: '25% off summer collection',
      discount_type: 'percent',
      discount_value: 25,
      min_order_value: 999,
      max_discount: 1000,
      max_uses: 500,
      valid_from: '2024-04-01T00:00:00',
      valid_until: '2027-09-30T23:59:59',
      created_by: superAdmin.id,
    },
  ];

  const insertPromo = db.prepare(`
    INSERT OR IGNORE INTO promocodes
      (code, description, discount_type, discount_value, min_order_value, max_discount, max_uses, valid_from, valid_until, created_by)
    VALUES
      (@code, @description, @discount_type, @discount_value, @min_order_value, @max_discount, @max_uses, @valid_from, @valid_until, @created_by)
  `);
  promos.forEach(p => insertPromo.run(p));
  console.log(`   ✅  ${promos.length} promo codes seeded  (WELCOME10 · FLAT200 · SUMMER25)`);

  console.log('\n✨  Seeding complete!');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌  Seeding failed:', err);
  process.exit(1);
});
