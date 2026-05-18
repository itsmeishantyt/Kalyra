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
      name: 'Floral Gem Art',
      description: 'Hand-painted floral gem artwork. Perfect for living spaces.',
      sku: 'KLY-A001',
      category: 'artistry',
      tags: JSON.stringify(['floral', 'gem', 'art']),
      price: 2499,
      discount_pct: 10,
      stock: 45,
      image_url: 'assets/floral-gem-art.jpg',
      sizes: JSON.stringify(['Standard']),
      colors: JSON.stringify(['Multicolor']),
    },
    {
      name: 'Anklet Embroidery Tote',
      description: 'Hand-embroidered tote bag with intricate anklet design.',
      sku: 'KLY-T001',
      category: 'wearable',
      tags: JSON.stringify(['tote', 'embroidery', 'wearable']),
      price: 1899,
      discount_pct: 0,
      stock: 30,
      image_url: 'assets/anklet-embroidery-tote.jpg',
      sizes: JSON.stringify(['Standard']),
      colors: JSON.stringify(['Beige']),
    },
    {
      name: 'Mirror Butterfly Art',
      description: 'Elegant butterfly art piece with mirror embellishments.',
      sku: 'KLY-A002',
      category: 'artistry',
      tags: JSON.stringify(['mirror', 'butterfly', 'art']),
      price: 3299,
      discount_pct: 15,
      stock: 20,
      image_url: 'assets/mirror-butterfly-art.jpg',
      sizes: JSON.stringify(['Standard', 'Large']),
      colors: JSON.stringify(['Silver']),
    },
    {
      name: 'Mandala Art Sketchbook',
      description: 'Premium sketchbook featuring spiritual mandala art cover.',
      sku: 'KLY-M001',
      category: 'mandala',
      tags: JSON.stringify(['mandala', 'sketchbook', 'spiritual']),
      price: 999,
      discount_pct: 5,
      stock: 15,
      image_url: 'assets/mandala-art-sketchbook.jpg',
      sizes: JSON.stringify(['A5']),
      colors: JSON.stringify(['Black/Gold']),
    },
    {
      name: 'Floral Resin Coasters',
      description: 'Beautiful resin coasters with embedded dried flowers.',
      sku: 'KLY-L001',
      category: 'living',
      tags: JSON.stringify(['resin', 'coasters', 'floral', 'living']),
      price: 1199,
      discount_pct: 0,
      stock: 25,
      image_url: 'assets/floral-resin-coasters.jpg',
      sizes: JSON.stringify(['Set of 4']),
      colors: JSON.stringify(['Clear/Pink']),
    },
    {
      name: 'Gold Resin Coasters',
      description: 'Luxurious resin coasters with gold flakes.',
      sku: 'KLY-L002',
      category: 'living',
      tags: JSON.stringify(['resin', 'coasters', 'gold', 'living']),
      price: 1499,
      discount_pct: 0,
      stock: 60,
      image_url: 'assets/resin-coasters-gold.jpg',
      sizes: JSON.stringify(['Set of 4']),
      colors: JSON.stringify(['Clear/Gold']),
    },
    {
      name: 'CEO Resin Name Plate',
      description: 'Professional resin name plate for executive desks.',
      sku: 'KLY-B001',
      category: 'bespoke',
      tags: JSON.stringify(['resin', 'nameplate', 'professional', 'bespoke']),
      price: 2599,
      discount_pct: 20,
      stock: 35,
      image_url: 'assets/ceo-resin-name-plate.jpg',
      sizes: JSON.stringify(['Standard']),
      colors: JSON.stringify(['Black/Gold']),
    },
    {
      name: 'Wedding Resin Plate',
      description: 'Bespoke resin plate perfect for wedding gifts.',
      sku: 'KLY-B002',
      category: 'bespoke',
      tags: JSON.stringify(['resin', 'plate', 'wedding', 'bespoke']),
      price: 3899,
      discount_pct: 0,
      stock: 18,
      image_url: 'assets/wedding-resin-plate.jpg',
      sizes: JSON.stringify(['Standard']),
      colors: JSON.stringify(['Clear/Gold']),
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
