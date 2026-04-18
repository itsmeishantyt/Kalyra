const { verifyAccess } = require('../utils/jwt');
const { getDb } = require('../db/init');
const R = require('../utils/response');

/**
 * requireAdmin — verifies admin Bearer token.
 * Optionally accepts a roles array for role-gating:
 *   requireAdmin(['superadmin'])
 */
function requireAdmin(allowedRoles = null) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return R.unauthorized(res, 'No token provided');
    }

    const token = authHeader.slice(7);
    try {
      const payload = verifyAccess(token);
      if (!payload.isAdmin) return R.forbidden(res, 'Admin access required');

      const db    = getDb();
      const admin = db.prepare('SELECT id, name, email, role, is_active FROM admins WHERE id = ?').get(payload.adminId);
      if (!admin)         return R.unauthorized(res, 'Admin not found');
      if (!admin.is_active) return R.forbidden(res, 'Admin account deactivated');

      if (allowedRoles && !allowedRoles.includes(admin.role)) {
        return R.forbidden(res, `Requires role: ${allowedRoles.join(' or ')}`);
      }

      req.admin = { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') return R.unauthorized(res, 'Token expired');
      return R.unauthorized(res, 'Invalid token');
    }
  };
}

/** Write an audit log entry — call from any admin route */
function audit(db, adminId, action, targetType, targetId, details, ipAddress) {
  db.prepare(`
    INSERT INTO audit_log (admin_id, action, target_type, target_id, details, ip_address)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(adminId, action, targetType || null, targetId || null, details ? JSON.stringify(details) : null, ipAddress || null);
}

module.exports = { requireAdmin, audit };
