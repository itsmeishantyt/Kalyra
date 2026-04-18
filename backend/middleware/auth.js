const { verifyAccess } = require('../utils/jwt');
const { getDb } = require('../db/init');
const R = require('../utils/response');

/**
 * requireAuth — verifies Bearer access token and attaches req.user
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return R.unauthorized(res, 'No token provided');
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAccess(token);
    // Ensure user exists and is active
    const db   = getDb();
    const user = db.prepare('SELECT id, name, email, status FROM users WHERE id = ?').get(payload.userId);
    if (!user) return R.unauthorized(res, 'User not found');
    if (user.status === 'suspended') return R.forbidden(res, 'Your account has been suspended. Contact support.');

    req.user = { id: user.id, name: user.name, email: user.email };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return R.unauthorized(res, 'Token expired');
    return R.unauthorized(res, 'Invalid token');
  }
}

module.exports = { requireAuth };
