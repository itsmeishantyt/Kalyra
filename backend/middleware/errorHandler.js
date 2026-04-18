/**
 * Global error handler — last middleware in express chain.
 * Normalises all thrown errors into a consistent JSON shape.
 */
function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message || err);

  // SQLite constraint errors
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ success: false, message: 'A record with that value already exists.' });
  }
  if (err.code?.startsWith('SQLITE_')) {
    return res.status(500).json({ success: false, message: 'Database error.' });
  }

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: `File too large. Max ${process.env.MAX_FILE_SIZE_MB || 5}MB allowed.` });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ success: false, message: 'Unexpected file field.' });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token expired.' });
  }

  // HTTP errors with explicit status
  if (err.status) {
    return res.status(err.status).json({ success: false, message: err.message });
  }

  // Fallback 500
  const isDev = process.env.NODE_ENV === 'development';
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(isDev && { detail: err.message, stack: err.stack }),
  });
}

module.exports = errorHandler;
