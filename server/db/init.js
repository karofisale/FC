const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'fc_app.db');
const db = new Database(dbPath);

// Enable Foreign Keys
db.pragma('foreign_keys = ON');

function initDb() {
  db.exec(`
    -- 1. Master Data
    CREATE TABLE IF NOT EXISTS business_units (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS regions (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS product_groups (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      sku_code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      short_name TEXT,
      product_group_code TEXT REFERENCES product_groups(code),
      technology TEXT,
      default_channel TEXT REFERENCES business_units(code),
      partner_id INTEGER REFERENCES partners(id),
      avg_price REAL,
      is_finished_good INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('bu_editor','bu_approver','central_admin','viewer')),
      business_unit_code TEXT REFERENCES business_units(code),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 2. Forecast Cycles & Versions
    CREATE TABLE IF NOT EXISTS forecast_cycles (
      id TEXT PRIMARY KEY,
      business_unit_code TEXT NOT NULL REFERENCES business_units(code),
      base_month TEXT NOT NULL,
      horizon_months INTEGER NOT NULL DEFAULT 4,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected','locked')),
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (business_unit_code, base_month)
    );

    CREATE TABLE IF NOT EXISTS forecast_versions (
      id TEXT PRIMARY KEY,
      cycle_id TEXT NOT NULL REFERENCES forecast_cycles(id) ON DELETE CASCADE,
      update_week INTEGER NOT NULL CHECK (update_week >= 0),
      update_date TEXT NOT NULL,
      iso_week_label TEXT,
      submitted_by TEXT REFERENCES users(id),
      submitted_at TEXT,
      is_final INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (cycle_id, update_week)
    );

    -- 3. Monthly Lines & Weekly Splits
    CREATE TABLE IF NOT EXISTS monthly_forecast_lines (
      id TEXT PRIMARY KEY,
      version_id TEXT NOT NULL REFERENCES forecast_versions(id) ON DELETE CASCADE,
      sku_code TEXT NOT NULL REFERENCES products(sku_code),
      forecast_month TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      note TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (version_id, sku_code, forecast_month)
    );

    CREATE TABLE IF NOT EXISTS weekly_region_splits (
      id TEXT PRIMARY KEY,
      version_id TEXT NOT NULL REFERENCES forecast_versions(id) ON DELETE CASCADE,
      sku_code TEXT NOT NULL REFERENCES products(sku_code),
      week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 6),
      region_code TEXT NOT NULL REFERENCES regions(code),
      quantity REAL NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (version_id, sku_code, week_number, region_code)
    );

    -- 4. Actual Sales
    CREATE TABLE IF NOT EXISTS actual_sales_results (
      id TEXT PRIMARY KEY,
      business_unit_code TEXT NOT NULL REFERENCES business_units(code),
      sku_code TEXT NOT NULL REFERENCES products(sku_code),
      actual_month TEXT NOT NULL,
      region_code TEXT REFERENCES regions(code),
      quantity REAL NOT NULL DEFAULT 0,
      revenue REAL,
      source_system TEXT NOT NULL DEFAULT 'SAP',
      imported_by TEXT REFERENCES users(id),
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (business_unit_code, sku_code, actual_month, region_code)
    );

    -- 5. Approvals
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      cycle_id TEXT NOT NULL REFERENCES forecast_cycles(id) ON DELETE CASCADE,
      version_id TEXT NOT NULL REFERENCES forecast_versions(id),
      approver_id TEXT REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','revision_requested')),
      comment TEXT,
      requested_at TEXT NOT NULL DEFAULT (datetime('now')),
      decided_at TEXT
    );
  `);

  console.log('Database tables initialized successfully.');
}

module.exports = { db, initDb };
