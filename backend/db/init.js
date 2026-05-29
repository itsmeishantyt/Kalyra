const { DatabaseSync } = require('node:sqlite');
const fs   = require('fs');
const path = require('path');

const DB_PATH     = process.env.DB_PATH || path.join(__dirname, 'kalyra.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db;

/**
 * Thin compatibility shim so the rest of the code can call
 * db.prepare(sql).get/all/run just like better-sqlite3.
 *
 * node:sqlite uses db.prepare(sql) which returns a StatementSync object
 * with the same .get/.all/.run interface — so this is a near-zero-change drop-in.
 */
function getDb() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
  }
  return db;
}

function initDatabase() {
  const database = getDb();

  // Run schema — CREATE TABLE IF NOT EXISTS, safe to re-run at every boot
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  database.exec(schema);

  return database;
}

/**
 * txn(db, fn) — replaces better-sqlite3's db.transaction(fn)()
 * Wraps synchronous fn in BEGIN/COMMIT/ROLLBACK.
 */
function txn(database, fn) {
  database.exec('BEGIN');
  try {
    const result = fn();
    database.exec('COMMIT');
    return result;
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { getDb, initDatabase, txn };
