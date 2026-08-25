#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const sourcePath =
  process.argv[2] || process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'belowyourmeans.db');
const outputPath = process.argv[3] || path.join(process.cwd(), 'data', 'd1-import.sql');

const orderedTables = [
  'transactions',
  'categories',
  'budgets',
  'current_money',
  'projects',
  'expected_money',
  'payables',
  'recurring',
  'metals',
  'long_term_savings',
  'savings_plan',
  'prayers',
  'gym_payments',
  'gym_sessions',
  'reminders',
  'audit_log',
];

const resetTables = [
  'audit_log',
  'budgets',
  'categories',
  'current_money',
  'projects',
  'expected_money',
  'payables',
  'recurring',
  'gym_payments',
  'gym_sessions',
  'reminders',
  'transactions',
  'metals',
  'long_term_savings',
  'savings_plan',
  'prayers',
];

function sqlIdentifier(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function tableExists(db, tableName) {
  return Boolean(
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName)
  );
}

function getRows(db, tableName) {
  if (!tableExists(db, tableName)) return [];
  return db.prepare(`SELECT * FROM ${sqlIdentifier(tableName)} ORDER BY id ASC`).all();
}

function buildInsert(tableName, row) {
  const columns = Object.keys(row);
  const values = columns.map((column) => sqlValue(row[column]));
  return `INSERT INTO ${sqlIdentifier(tableName)} (${columns.map(sqlIdentifier).join(', ')}) VALUES (${values.join(', ')});`;
}

if (!fs.existsSync(sourcePath)) {
  console.error(`Source database not found: ${sourcePath}`);
  process.exit(1);
}

const db = new Database(sourcePath, { readonly: true, fileMustExist: true });
const lines = [
  '-- BelowYourMeans D1 import',
  `-- Source: ${sourcePath}`,
  `-- Created: ${new Date().toISOString()}`,
  'PRAGMA defer_foreign_keys = true;',
  '',
];

for (const tableName of resetTables) {
  lines.push(`DELETE FROM ${sqlIdentifier(tableName)};`);
}

lines.push(
  "DELETE FROM sqlite_sequence WHERE name IN ('transactions','budgets','categories','current_money','projects','expected_money','payables','recurring','gym_payments','gym_sessions','reminders','audit_log');",
  ''
);

for (const tableName of orderedTables) {
  const rows = getRows(db, tableName);
  if (rows.length === 0) continue;

  lines.push(`-- ${tableName}`);
  for (const row of rows) {
    lines.push(buildInsert(tableName, row));
  }
  lines.push('');
}

db.close();

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);

console.log(`Wrote D1 import SQL to ${outputPath}`);
console.log('Apply locally:  npx wrangler d1 execute below-your-means --local --file ' + outputPath);
console.log('Apply remote:   npx wrangler d1 execute below-your-means --remote --file ' + outputPath);
