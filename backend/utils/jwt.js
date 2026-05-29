const jwt = require('jsonwebtoken');

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET  || 'kalyra_access_secret_dev';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'kalyra_refresh_secret_dev';
const ACCESS_EXPIRES  = process.env.JWT_ACCESS_EXPIRES  || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '7d';

function signAccess(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
}

function signRefresh(payload) {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES });
}

function verifyAccess(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

function verifyRefresh(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

/** Returns Date object representing the refresh token's expiry */
function refreshExpiresAt() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString();
}

module.exports = { signAccess, signRefresh, verifyAccess, verifyRefresh, refreshExpiresAt };
