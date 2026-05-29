require('dotenv').config();
const http = require('http');
const app = require('./app');
const { initDatabase } = require('./db/init');

const PORT = process.env.PORT || 3000;

// ── Boot sequence ───────────────────────────────────────────
(async () => {
  try {
    // 1. Ensure SQLite schema is up-to-date
    initDatabase();
    console.log('✅  Database initialised');

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
