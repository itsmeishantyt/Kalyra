const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

function migrateDb(dbPath) {
  if (!fs.existsSync(dbPath)) {
    console.log(`⚠️  Database file does not exist at: ${dbPath}`);
    return;
  }

  console.log(`🎬  Starting migration for database: ${dbPath}`);
  
  try {
    const db = new DatabaseSync(dbPath);
    
    // 1. Update product image URLs
    const productRes = db.prepare(`
      UPDATE products 
      SET image_url = '/uploads/products/diy/' || SUBSTR(image_url, 8) 
      WHERE image_url LIKE 'assets/%'
    `).run();
    
    console.log(`   ✅  Updated products table. Changes: ${productRes.changes}`);

    // 2. Update settings image URLs
    const settingsRes = db.prepare(`
      UPDATE settings 
      SET value = '/uploads/products/diy/' || SUBSTR(value, 9) 
      WHERE value LIKE '/assets/%'
    `).run();

    console.log(`   ✅  Updated settings table. Changes: ${settingsRes.changes}`);
    
    console.log(`🎉  Finished migration for: ${dbPath}\n`);
  } catch (err) {
    console.error(`❌  Failed to migrate database: ${dbPath}`, err);
  }
}

// Migrate both databases
const db1 = path.join(__dirname, 'kalyra.db');
const db2 = path.join(__dirname, '../../../backend/db/kalyra.db');

migrateDb(db1);
migrateDb(db2);
