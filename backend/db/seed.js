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
      image_url: '/uploads/products/diy/floral-gem-art.jpg',
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
      image_url: '/uploads/products/diy/anklet-embroidery-tote.jpg',
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
      image_url: '/uploads/products/diy/mirror-butterfly-art.jpg',
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
      image_url: '/uploads/products/diy/mandala-art-sketchbook.jpg',
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
      image_url: '/uploads/products/diy/floral-resin-coasters.jpg',
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
      image_url: '/uploads/products/diy/resin-coasters-gold.jpg',
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
      image_url: '/uploads/products/diy/ceo-resin-name-plate.jpg',
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
      image_url: '/uploads/products/diy/wedding-resin-plate.jpg',
      sizes: JSON.stringify(['Standard']),
      colors: JSON.stringify(['Clear/Gold']),
    },
    {
      name: 'Midnight Resin Nameplate',
      description: 'Sophisticated black resin nameplate with golden accents. Hand-casted to perfection for a premium entrance.',
      sku: 'KLY-B003',
      category: 'bespoke',
      tags: JSON.stringify(['resin', 'nameplate', 'midnight', 'bespoke']),
      price: 2499,
      discount_pct: 0,
      stock: 25,
      image_url: '/uploads/products/diy/black-resin-name-plate.jpg',
      sizes: JSON.stringify(['Standard']),
      colors: JSON.stringify(['Black/Gold']),
    },
    {
      name: 'Medical Professional Nameplate',
      description: 'Specially designed for medical practitioners. Clean, hygienic look with thematic resin art.',
      sku: 'KLY-B004',
      category: 'bespoke',
      tags: JSON.stringify(['resin', 'nameplate', 'doctor', 'bespoke']),
      price: 2799,
      discount_pct: 10,
      stock: 12,
      image_url: '/uploads/products/diy/doctor-resin-name-plate.jpg',
      sizes: JSON.stringify(['Standard']),
      colors: JSON.stringify(['White/Teal']),
    },
    {
      name: 'Botanical Petal Coasters',
      description: 'Flower-shaped coasters that capture the ephemeral beauty of nature in durable resin.',
      sku: 'KLY-L003',
      category: 'living',
      tags: JSON.stringify(['resin', 'coasters', 'flower', 'living']),
      price: 999,
      discount_pct: 0,
      stock: 40,
      image_url: '/uploads/products/diy/flower-shaped-resin-coasters.jpg',
      sizes: JSON.stringify(['Set of 4']),
      colors: JSON.stringify(['Multicolor']),
    },
    {
      name: 'Majestic Horse Portrait',
      description: 'A powerful statement piece. Mirror-worked horse portrait that reflects strength and elegance.',
      sku: 'KLY-A003',
      category: 'artistry',
      tags: JSON.stringify(['mirror', 'horse', 'art']),
      price: 5999,
      discount_pct: 5,
      stock: 6,
      image_url: '/uploads/products/diy/mirror-horse-portrait.jpg',
      sizes: JSON.stringify(['Large']),
      colors: JSON.stringify(['Silver/Black']),
    },
    {
      name: 'Azure Ocean Keychain',
      description: 'Carry a piece of the ocean with you. Hand-poured resin keychain with realistic wave effects.',
      sku: 'KLY-K001',
      category: 'wearable',
      tags: JSON.stringify(['resin', 'keychain', 'ocean']),
      price: 499,
      discount_pct: 0,
      stock: 100,
      image_url: '/uploads/products/diy/ocean-keychain-sakshi.jpg',
      sizes: JSON.stringify(['Standard']),
      colors: JSON.stringify(['Blue/White']),
    },
    {
      name: 'Lady in Pearls Portrait',
      description: 'Graceful portraiture enhanced with real pearl-like embellishments. A timeless piece for sophisticated walls.',
      sku: 'KLY-A004',
      category: 'artistry',
      tags: JSON.stringify(['pearl', 'portrait', 'art']),
      price: 4899,
      discount_pct: 0,
      stock: 10,
      image_url: '/uploads/products/diy/pearl-hat-portrait.jpg',
      sizes: JSON.stringify(['Medium', 'Large']),
      colors: JSON.stringify(['White/Gold']),
    },
    {
      name: 'Elegant Family Nameplate',
      description: 'Traditional family nameplates reimagined in modern resin. Durable and weather-resistant.',
      sku: 'KLY-B005',
      category: 'bespoke',
      tags: JSON.stringify(['resin', 'nameplate', 'family', 'bespoke']),
      price: 2699,
      discount_pct: 12,
      stock: 15,
      image_url: '/uploads/products/diy/resin-name-plate-shah.jpg',
      sizes: JSON.stringify(['Standard']),
      colors: JSON.stringify(['Clear/Gold']),
    },
    {
      name: 'Sun-Kissed Sunflower Tote',
      description: 'Vibrant sunflower embroidery on an eco-friendly canvas tote. Brightens up your outfit instantly.',
      sku: 'KLY-T002',
      category: 'wearable',
      tags: JSON.stringify(['tote', 'sunflower', 'wearable']),
      price: 1399,
      discount_pct: 0,
      stock: 28,
      image_url: '/uploads/products/diy/sunflower-tote.jpg',
      sizes: JSON.stringify(['Standard']),
      colors: JSON.stringify(['Yellow/Beige']),
    },
    {
      name: 'Embroidered Floral Kurta Set',
      description: 'An elegant hand-embroidered floral kurta set, blending traditional patterns with a modern silhouette.',
      sku: 'KLY-AP001',
      category: 'Kurtas',
      tags: JSON.stringify(['kurta', 'embroidery', 'floral', 'ethnic', 'apparel']),
      price: 3899,
      discount_pct: 10,
      stock: 15,
      image_url: 'https://placehold.co/600x800/F5F0E8/8C7E72?text=Floral+Kurta+Set',
      sizes: JSON.stringify(['S', 'M', 'L', 'XL']),
      colors: JSON.stringify(['Cream', 'Indigo']),
    },
    {
      name: 'Indigo Block-Print Maxi Dress',
      description: 'Breathable cotton maxi dress featuring premium hand-block prints and delicate mirror work on the neckline.',
      sku: 'KLY-AP002',
      category: 'Dresses',
      tags: JSON.stringify(['dress', 'indigo', 'block-print', 'maxi', 'apparel']),
      price: 4299,
      discount_pct: 0,
      stock: 20,
      image_url: 'https://placehold.co/600x800/F5F0E8/8C7E72?text=Maxi+Dress',
      sizes: JSON.stringify(['S', 'M', 'L']),
      colors: JSON.stringify(['Indigo']),
    },
    {
      name: 'Handmade Khadi Crop Top',
      description: 'Hand-spun Khadi crop top with minimalistic back detailing. Perfect styling piece for Indo-Western casuals.',
      sku: 'KLY-AP003',
      category: 'Topwear',
      tags: JSON.stringify(['topwear', 'crop-top', 'khadi', 'handmade', 'apparel']),
      price: 1899,
      discount_pct: 5,
      stock: 35,
      image_url: 'https://placehold.co/600x800/F5F0E8/8C7E72?text=Khadi+Crop+Top',
      sizes: JSON.stringify(['XS', 'S', 'M', 'L']),
      colors: JSON.stringify(['Beige', 'Teal']),
    },
    {
      name: 'Artisanal Linen Trousers',
      description: 'Relaxed fit linen trousers featuring a comfortable elasticated waistband and hand-stitched hem detailing.',
      sku: 'KLY-AP004',
      category: 'Bottomwear',
      tags: JSON.stringify(['bottomwear', 'trousers', 'linen', 'relaxed', 'apparel']),
      price: 2499,
      discount_pct: 0,
      stock: 22,
      image_url: 'https://placehold.co/600x800/F5F0E8/8C7E72?text=Linen+Trousers',
      sizes: JSON.stringify(['S', 'M', 'L', 'XL']),
      colors: JSON.stringify(['Off-White', 'Olive']),
    },
    {
      name: 'Kutch Embroidered Jacket',
      description: 'Statement outerwear piece with colorful Kutch mirror-embroidery work. Perfect to layer over any neutral outfit.',
      sku: 'KLY-AP005',
      category: 'Outerwear',
      tags: JSON.stringify(['outerwear', 'jacket', 'kutch', 'embroidery', 'apparel']),
      price: 5499,
      discount_pct: 15,
      stock: 8,
      image_url: 'https://placehold.co/600x800/F5F0E8/8C7E72?text=Embroidered+Jacket',
      sizes: JSON.stringify(['Free Size']),
      colors: JSON.stringify(['Multicolor']),
    },
    {
      name: 'Chanderi Silk Printed Kurta',
      description: 'A luxurious Chanderi silk kurta with delicate foil print and beautiful hand-stitched neck detailing.',
      sku: 'KLY-AP006',
      category: 'Kurtas',
      tags: JSON.stringify(['kurta', 'silk', 'chanderi', 'ethnic', 'apparel']),
      price: 3499,
      discount_pct: 0,
      stock: 12,
      image_url: 'https://placehold.co/600x800/F5F0E8/8C7E72?text=Chanderi+Silk+Kurta',
      sizes: JSON.stringify(['S', 'M', 'L', 'XL']),
      colors: JSON.stringify(['Peach', 'Mint']),
    },
    {
      name: 'Earthy Linen A-Line Dress',
      description: 'Sophisticated yet breathable linen dress featuring an elegant A-line silhouette and subtle front pleats.',
      sku: 'KLY-AP007',
      category: 'Dresses',
      tags: JSON.stringify(['dress', 'linen', 'a-line', 'casual', 'apparel']),
      price: 2999,
      discount_pct: 5,
      stock: 18,
      image_url: 'https://placehold.co/600x800/F5F0E8/8C7E72?text=Linen+A-Line+Dress',
      sizes: JSON.stringify(['XS', 'S', 'M', 'L']),
      colors: JSON.stringify(['Mustard', 'Terracotta']),
    },
    {
      name: 'Handwoven Cotton Khadi Palazzo',
      description: 'Premium handwoven cotton-khadi palazzo pants with wide-leg comfort and an adjustable elastic drawcord.',
      sku: 'KLY-AP008',
      category: 'Bottomwear',
      tags: JSON.stringify(['bottomwear', 'palazzo', 'khadi', 'cotton', 'apparel']),
      price: 1699,
      discount_pct: 0,
      stock: 25,
      image_url: 'https://placehold.co/600x800/F5F0E8/8C7E72?text=Khadi+Palazzo',
      sizes: JSON.stringify(['S', 'M', 'L', 'XL']),
      colors: JSON.stringify(['Beige', 'Indigo']),
    },
  ];

  const insertProduct = db.prepare(`
    INSERT OR IGNORE INTO products
      (name, description, sku, category, product_type, tags, price, discount_pct, stock, image_url, sizes, colors)
    VALUES
      (@name, @description, @sku, @category, @product_type, @tags, @price, @discount_pct, @stock, @image_url, @sizes, @colors)
  `);
  txn(db, () => products.forEach(p => {
    p.product_type = (p.sku && p.sku.startsWith('KLY-AP')) ? 'apparel' : 'shop';
    insertProduct.run(p);
  }));
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
