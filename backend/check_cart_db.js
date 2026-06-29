const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(__dirname, 'db', 'kalyra.db');
const db = new DatabaseSync(dbPath);

try {
  console.log('--- CART ITEMS ---');
  const cartItems = db.prepare('SELECT * FROM cart_items').all();
  console.log(cartItems);

  console.log('--- USERS ---');
  const users = db.prepare('SELECT id, name, email FROM users').all();
  console.log(users);
} catch (err) {
  console.error('Failed to query cart database:', err);
}
