const { validationResult } = require('express-validator');
const R = require('../utils/response');

/**
 * validate — runs after express-validator chains.
 * If errors exist, returns 400 with field-level error array.
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formatted = errors.array().map(e => ({ field: e.path, message: e.msg }));
    return R.badRequest(res, 'Validation failed', formatted);
  }
  next();
}

module.exports = { validate };
