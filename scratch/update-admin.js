const bcrypt = require('bcryptjs');
const { getDb } = require('../backend/db/init');

async function update() {
  const db = getDb();
  const hash = await bcrypt.hash('Admin@1234', 12);
  db.prepare('UPDATE admins SET password_hash = ?, is_active = 1 WHERE email = ?').run(hash, 'admin@kalyra.com');
  console.log('Updated admin@kalyra.com password to Admin@1234');
}
update();
