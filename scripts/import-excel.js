#!/usr/bin/env node
/**
 * Import Excel data into BelowYourMeans SQLite database
 * 
 * Usage: 
 *   node scripts/import-excel.js /path/to/export.xlsx
 * 
 * This script reads the Excel file exported from BelowYourMeans
 * and imports all data into a fresh SQLite database.
 * 
 * Run this LOCALLY on your machine, then copy the database to the server.
 */

const XLSX = require('xlsx');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Get Excel file path from command line
const excelPath = process.argv[2];
if (!excelPath) {
  console.error('Usage: node scripts/import-excel.js /path/to/export.xlsx');
  process.exit(1);
}

if (!fs.existsSync(excelPath)) {
  console.error(`Error: File not found: ${excelPath}`);
  process.exit(1);
}

// Database path
const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'belowyourmeans.db');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Create fresh database
if (fs.existsSync(dbPath)) {
  console.log(`⚠️  Database exists at ${dbPath}`);
  console.log('   Backing up to belowyourmeans.db.bak');
  fs.renameSync(dbPath, dbPath + '.bak');
}

console.log(`📂 Creating database at: ${dbPath}`);
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Initialize schema
console.log('📋 Creating tables...');
db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
    scope TEXT NOT NULL DEFAULT 'personal' CHECK(scope IN ('personal', 'business')),
    notes TEXT,
    date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS current_money (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location TEXT NOT NULL,
    amount REAL NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS expected_money (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    expected_date TEXT NOT NULL,
    amount REAL NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS payables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    pay_date TEXT NOT NULL,
    amount REAL NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS recurring (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('Family', 'Home', 'Personal')),
    amount REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS held_money (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person TEXT NOT NULL,
    amount REAL NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS metals (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    gold_24k_grams REAL DEFAULT 0,
    gold_21k_grams REAL DEFAULT 0,
    silver_kg REAL DEFAULT 0,
    gold_24k_price_per_gram REAL DEFAULT 85,
    gold_21k_price_per_gram REAL DEFAULT 74.4,
    silver_price_per_kg REAL DEFAULT 950,
    prices_fetched_at DATETIME DEFAULT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  INSERT OR IGNORE INTO metals (id) VALUES (1);

  CREATE TABLE IF NOT EXISTS prayers (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    soboh INTEGER DEFAULT 0,
    dohor INTEGER DEFAULT 0,
    aaser INTEGER DEFAULT 0,
    maghreb INTEGER DEFAULT 0,
    ishaa INTEGER DEFAULT 0,
    ayaat INTEGER DEFAULT 0,
    fasting INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  INSERT OR IGNORE INTO prayers (id) VALUES (1);

  CREATE TABLE IF NOT EXISTS gym_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    sessions INTEGER NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS gym_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
  CREATE INDEX IF NOT EXISTS idx_transactions_scope ON transactions(scope);
`);

// Read Excel file
console.log(`📖 Reading Excel file: ${excelPath}`);
const workbook = XLSX.readFile(excelPath);

// Helper to get sheet data as array of objects
function getSheetData(sheetName) {
  if (!workbook.SheetNames.includes(sheetName)) {
    console.log(`   ⏭️  Sheet "${sheetName}" not found, skipping`);
    return [];
  }
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  if (data.length <= 1) return []; // Only header or empty
  
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i];
    });
    return obj;
  }).filter(row => Object.values(row).some(v => v !== undefined && v !== ''));
}

// Import Transactions
const transactions = getSheetData('Transactions');
if (transactions.length > 0) {
  console.log(`💳 Importing ${transactions.length} transactions...`);
  const insertTx = db.prepare(`
    INSERT INTO transactions (date, category, type, scope, amount, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const t of transactions) {
    try {
      insertTx.run(
        t['Date'] || new Date().toISOString().split('T')[0],
        t['Category'] || 'Other',
        t['Type'] || 'expense',
        t['Scope'] === 'business' ? 'business' : 'personal',
        parseFloat(t['Amount']) || 0,
        t['Notes'] || null
      );
    } catch (e) {
      console.log(`   ⚠️  Skipped invalid transaction: ${e.message}`);
    }
  }
}

// Import Current Money
const currentMoney = getSheetData('Current Money');
if (currentMoney.length > 0) {
  console.log(`💵 Importing ${currentMoney.length} current money entries...`);
  const insertCM = db.prepare(`
    INSERT INTO current_money (location, amount, notes) VALUES (?, ?, ?)
  `);
  for (const m of currentMoney) {
    insertCM.run(
      m['Location'] || 'Unknown',
      parseFloat(m['Amount']) || 0,
      m['Notes'] || null
    );
  }
}

// Import Expected Money
const expectedMoney = getSheetData('Expected Money');
if (expectedMoney.length > 0) {
  console.log(`📈 Importing ${expectedMoney.length} expected money entries...`);
  const insertEM = db.prepare(`
    INSERT INTO expected_money (source, expected_date, amount, notes) VALUES (?, ?, ?, ?)
  `);
  for (const m of expectedMoney) {
    insertEM.run(
      m['Source'] || 'Unknown',
      m['Expected Date'] || new Date().toISOString().split('T')[0],
      parseFloat(m['Amount']) || 0,
      m['Notes'] || null
    );
  }
}

// Import Payables
const payables = getSheetData('Payables');
if (payables.length > 0) {
  console.log(`📉 Importing ${payables.length} payables...`);
  const insertPay = db.prepare(`
    INSERT INTO payables (source, pay_date, amount, notes) VALUES (?, ?, ?, ?)
  `);
  for (const p of payables) {
    insertPay.run(
      p['Pay To'] || 'Unknown',
      p['Due Date'] || new Date().toISOString().split('T')[0],
      parseFloat(p['Amount']) || 0,
      p['Notes'] || null
    );
  }
}

// Import Recurring
const recurring = getSheetData('Recurring Monthly');
if (recurring.length > 0) {
  console.log(`🔄 Importing ${recurring.length} recurring payments...`);
  const insertRec = db.prepare(`
    INSERT INTO recurring (target, type, amount) VALUES (?, ?, ?)
  `);
  for (const r of recurring) {
    const type = r['Type'];
    if (!['Family', 'Home', 'Personal'].includes(type)) {
      console.log(`   ⚠️  Skipped recurring with invalid type: ${type}`);
      continue;
    }
    insertRec.run(
      r['Target'] || 'Unknown',
      type,
      parseFloat(r['Amount']) || 0
    );
  }
}

// Import Held Money
const heldMoney = getSheetData('Held Money');
if (heldMoney.length > 0) {
  console.log(`🤝 Importing ${heldMoney.length} held money entries...`);
  const insertHeld = db.prepare(`
    INSERT INTO held_money (person, amount, notes) VALUES (?, ?, ?)
  `);
  for (const h of heldMoney) {
    insertHeld.run(
      h['For Person'] || 'Unknown',
      parseFloat(h['Amount']) || 0,
      h['Notes'] || null
    );
  }
}

// Import Metals (single row)
const metalsSheet = getSheetData('Metals');
if (metalsSheet.length > 0) {
  console.log(`🥇 Importing metals data...`);
  let gold24k = 0, gold21k = 0, silver = 0;
  let gold24kPrice = 85, gold21kPrice = 74.4, silverPrice = 950;
  
  for (const row of metalsSheet) {
    const metal = row['Metal'];
    const qty = parseFloat(row['Quantity']) || 0;
    const priceStr = row['Price Per Unit']?.toString().replace('$', '') || '0';
    const price = parseFloat(priceStr) || 0;
    
    if (metal === 'Gold 24K') {
      gold24k = qty;
      gold24kPrice = price || 85;
    } else if (metal === 'Gold 21K') {
      gold21k = qty;
      gold21kPrice = price || 74.4;
    } else if (metal === 'Silver') {
      silver = qty;
      silverPrice = price || 950;
    }
  }
  
  db.prepare(`
    UPDATE metals SET 
      gold_24k_grams = ?, 
      gold_21k_grams = ?, 
      silver_kg = ?,
      gold_24k_price_per_gram = ?,
      gold_21k_price_per_gram = ?,
      silver_price_per_kg = ?
    WHERE id = 1
  `).run(gold24k, gold21k, silver, gold24kPrice, gold21kPrice, silverPrice);
}

// Import Prayers (single row)
const prayersSheet = getSheetData('Prayers');
if (prayersSheet.length > 0) {
  console.log(`🕌 Importing prayers data...`);
  let soboh = 0, dohor = 0, aaser = 0, maghreb = 0, ishaa = 0, ayaat = 0, fasting = 0;
  
  for (const row of prayersSheet) {
    const prayer = row['Prayer'];
    const count = parseInt(row['Missed Count']) || 0;
    
    if (prayer?.includes('Soboh')) soboh = count;
    else if (prayer?.includes('Dohor')) dohor = count;
    else if (prayer?.includes('Aaser')) aaser = count;
    else if (prayer?.includes('Maghreb')) maghreb = count;
    else if (prayer?.includes('Ishaa')) ishaa = count;
    else if (prayer?.includes('Ayaat')) ayaat = count;
    else if (prayer?.includes('Fasting')) fasting = count;
  }
  
  db.prepare(`
    UPDATE prayers SET soboh = ?, dohor = ?, aaser = ?, maghreb = ?, ishaa = ?, ayaat = ?, fasting = ?
    WHERE id = 1
  `).run(soboh, dohor, aaser, maghreb, ishaa, ayaat, fasting);
}

// Import Gym Payments
const gymPayments = getSheetData('Gym Payments');
if (gymPayments.length > 0) {
  console.log(`💪 Importing ${gymPayments.length} gym payments...`);
  const insertGP = db.prepare(`
    INSERT INTO gym_payments (date, sessions, notes) VALUES (?, ?, ?)
  `);
  for (const p of gymPayments) {
    insertGP.run(
      p['Date'] || new Date().toISOString().split('T')[0],
      parseInt(p['Sessions']) || 0,
      p['Notes'] || null
    );
  }
}

// Import Gym Sessions
const gymSessions = getSheetData('Gym Sessions');
if (gymSessions.length > 0) {
  console.log(`🏋️ Importing ${gymSessions.length} gym sessions...`);
  const insertGS = db.prepare(`
    INSERT INTO gym_sessions (date, notes) VALUES (?, ?)
  `);
  for (const s of gymSessions) {
    insertGS.run(
      s['Date'] || new Date().toISOString().split('T')[0],
      s['Notes'] || null
    );
  }
}

db.close();

console.log('');
console.log('✅ Import complete!');
console.log(`📁 Database created at: ${dbPath}`);
console.log('');
console.log('Next steps:');
console.log('1. Generate D1-compatible SQL:');
console.log('   npm run d1:export-sql');
console.log('');
console.log('2. Import into local D1 for testing:');
console.log('   npm run d1:import:local');
console.log('');
console.log('3. Import into remote D1 only when intentionally replacing remote data:');
console.log('   npm run d1:import:remote');
