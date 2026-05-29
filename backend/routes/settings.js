const express = require('express');
const { getDb } = require('../db/init');
const R = require('../utils/response');

const router = express.Router();

// GET /api/v1/settings
router.get('/', (req, res, next) => {
  try {
    const db = dbInstance || getDb();
    const rows = db.prepare('SELECT key, value FROM settings').all();
    
    // Convert array of key-value rows to single object
    const settings = {};
    rows.forEach(row => {
      settings[row.key] = row.value;
    });

    return R.success(res, settings);
  } catch (err) {
    next(err);
  }
});

let dbInstance;
// For testing / dependency injection
router.setDb = (db) => { dbInstance = db; };

module.exports = router;
