require('dotenv').config();
const http = require('http');
const app = require('./app');
const { initDatabase, getDb } = require('./db/init');

const PORT = process.env.PORT || 3000; // Load port from env (restart)

// ── Boot sequence ───────────────────────────────────────────
(async () => {
  try {
    // 1. Ensure SQLite schema is up-to-date
    initDatabase();
    console.log('✅  Database initialised');

    // Auto-seed if database is empty
    const db = getDb();
    let count = 0;
    try {
      count = db.prepare('SELECT COUNT(*) as n FROM products').get().n;
    } catch (dbErr) {
      console.warn('⚠️  Could not count products, skipping auto-seed check:', dbErr.message);
    }
    if (count === 0) {
      console.log('🌱  Products table is empty. Running auto-seed...');
      try {
        const { seed } = require('./db/seed');
        await seed();
        console.log('🌱  Auto-seed completed successfully.');
      } catch (seedErr) {
        console.error('❌  Auto-seed failed:', seedErr);
      }
    }

    // 2. Start HTTP server
    const server = http.createServer(app);

    server.listen(PORT, () => {
      console.log(`🚀  Kalyra API running on http://localhost:${PORT}`);
      console.log(`📖  Health: http://localhost:${PORT}/api/v1/health`);
      console.log(`🌍  Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Graceful shutdown
    const shutdown = () => {
      console.log('\n🛑  Shutting down gracefully...');
      server.close(() => {
        console.log('✅  Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err) {
    console.error('❌  Failed to start server:', err);
    process.exit(1);
  }
})();

// Heartbeat change to trigger nodemon schema sync reload

