import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

import {
  createDatabaseSnapshot,
  getDatabasePath,
  getDb,
  normalizeScope,
  runWithoutAudit,
} from './db.js';

function getSheetData(workbook, sheetName) {
  if (!workbook.SheetNames.includes(sheetName)) {
    return [];
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  if (rows.length <= 1) {
    return [];
  }

  const headers = rows[0];
  return rows
    .slice(1)
    .map((row) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = row[index];
      });
      return record;
    })
    .filter((row) => Object.values(row).some((value) => value !== undefined && value !== ''));
}

function getBackupPath() {
  const databasePath = getDatabasePath();
  const backupDir = path.join(path.dirname(databasePath), 'backups');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(backupDir, `belowyourmeans-import-backup-${timestamp}.db`);
}

function resetImportTarget(db) {
  db.exec(`
    DELETE FROM audit_log;
    DELETE FROM categories;
    DELETE FROM current_money;
    DELETE FROM expected_money;
    DELETE FROM payables;
    DELETE FROM recurring;
    DELETE FROM held_money;
    DELETE FROM gym_payments;
    DELETE FROM gym_sessions;
    DELETE FROM transactions;
    DELETE FROM metals;
    DELETE FROM prayers;

    INSERT OR REPLACE INTO metals (
      id,
      gold_24k_grams,
      gold_21k_grams,
      silver_kg,
      gold_24k_price_per_gram,
      gold_21k_price_per_gram,
      silver_price_per_kg,
      prices_fetched_at,
      updated_at
    )
    VALUES (1, 0, 0, 0, 85, 74.4, 950, NULL, CURRENT_TIMESTAMP);

    INSERT OR REPLACE INTO prayers (
      id,
      soboh,
      dohor,
      aaser,
      maghreb,
      ishaa,
      ayaat,
      fasting,
      updated_at
    )
    VALUES (1, 0, 0, 0, 0, 0, 0, 0, CURRENT_TIMESTAMP);

    DELETE FROM sqlite_sequence
    WHERE name IN (
      'transactions',
      'categories',
      'current_money',
      'expected_money',
      'payables',
      'recurring',
      'held_money',
      'gym_payments',
      'gym_sessions',
      'audit_log'
    );
  `);
}

export function importWorkbookBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const backupPath = getBackupPath();
  createDatabaseSnapshot(backupPath);

  const db = getDb();
  const summary = {
    backupPath,
    imported: {
      transactions: 0,
      currentMoney: 0,
      expectedMoney: 0,
      payables: 0,
      recurring: 0,
      heldMoney: 0,
      gymPayments: 0,
      gymSessions: 0,
    },
  };

  runWithoutAudit(() => {
    const transaction = db.transaction(() => {
      resetImportTarget(db);

      const transactions = getSheetData(workbook, 'Transactions');
      if (transactions.length > 0) {
        const insertTransaction = db.prepare(`
          INSERT INTO transactions (date, category, type, scope, amount, notes)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const item of transactions) {
          insertTransaction.run(
            item.Date || new Date().toISOString().slice(0, 10),
            item.Category || (item.Type === 'income' ? 'Income' : 'Other'),
            item.Type || 'expense',
            normalizeScope(item.Scope),
            parseFloat(item.Amount) || 0,
            item.Notes || null
          );
        }

        summary.imported.transactions = transactions.length;
      }

      const currentMoney = getSheetData(workbook, 'Current Money');
      if (currentMoney.length > 0) {
        const insertCurrentMoney = db.prepare(`
          INSERT INTO current_money (location, amount, notes)
          VALUES (?, ?, ?)
        `);

        for (const item of currentMoney) {
          insertCurrentMoney.run(
            item.Location || 'Unknown',
            parseFloat(item.Amount) || 0,
            item.Notes || null
          );
        }

        summary.imported.currentMoney = currentMoney.length;
      }

      const expectedMoney = getSheetData(workbook, 'Expected Money');
      if (expectedMoney.length > 0) {
        const insertExpectedMoney = db.prepare(`
          INSERT INTO expected_money (source, expected_date, amount, notes)
          VALUES (?, ?, ?, ?)
        `);

        for (const item of expectedMoney) {
          insertExpectedMoney.run(
            item.Source || 'Unknown',
            item['Expected Date'] || new Date().toISOString().slice(0, 10),
            parseFloat(item.Amount) || 0,
            item.Notes || null
          );
        }

        summary.imported.expectedMoney = expectedMoney.length;
      }

      const payables = getSheetData(workbook, 'Payables');
      if (payables.length > 0) {
        const insertPayable = db.prepare(`
          INSERT INTO payables (source, pay_date, amount, notes)
          VALUES (?, ?, ?, ?)
        `);

        for (const item of payables) {
          insertPayable.run(
            item['Pay To'] || 'Unknown',
            item['Due Date'] || new Date().toISOString().slice(0, 10),
            parseFloat(item.Amount) || 0,
            item.Notes || null
          );
        }

        summary.imported.payables = payables.length;
      }

      const recurring = getSheetData(workbook, 'Recurring Monthly');
      if (recurring.length > 0) {
        const insertRecurring = db.prepare(`
          INSERT INTO recurring (target, type, amount)
          VALUES (?, ?, ?)
        `);

        for (const item of recurring) {
          const type = item.Type;
          if (!['Family', 'Home', 'Personal'].includes(type)) {
            continue;
          }

          insertRecurring.run(item.Target || 'Unknown', type, parseFloat(item.Amount) || 0);
        }

        summary.imported.recurring = recurring.length;
      }

      const heldMoney = getSheetData(workbook, 'Held Money');
      if (heldMoney.length > 0) {
        const insertHeldMoney = db.prepare(`
          INSERT INTO held_money (person, amount, notes)
          VALUES (?, ?, ?)
        `);

        for (const item of heldMoney) {
          insertHeldMoney.run(
            item['For Person'] || 'Unknown',
            parseFloat(item.Amount) || 0,
            item.Notes || null
          );
        }

        summary.imported.heldMoney = heldMoney.length;
      }

      const metalsRows = getSheetData(workbook, 'Metals');
      if (metalsRows.length > 0) {
        let gold24k = 0;
        let gold21k = 0;
        let silverKg = 0;
        let gold24kPrice = 85;
        let gold21kPrice = 74.4;
        let silverPrice = 950;

        for (const row of metalsRows) {
          const price = parseFloat(String(row['Price Per Unit'] || '').replace('$', '')) || 0;
          const quantity = parseFloat(row.Quantity) || 0;

          if (row.Metal === 'Gold 24K') {
            gold24k = quantity;
            gold24kPrice = price || gold24kPrice;
          } else if (row.Metal === 'Gold 21K') {
            gold21k = quantity;
            gold21kPrice = price || gold21kPrice;
          } else if (row.Metal === 'Silver') {
            silverKg = quantity;
            silverPrice = price || silverPrice;
          }
        }

        db.prepare(`
          UPDATE metals
          SET gold_24k_grams = ?,
              gold_21k_grams = ?,
              silver_kg = ?,
              gold_24k_price_per_gram = ?,
              gold_21k_price_per_gram = ?,
              silver_price_per_kg = ?,
              prices_fetched_at = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = 1
        `).run(gold24k, gold21k, silverKg, gold24kPrice, gold21kPrice, silverPrice);
      }

      const prayersRows = getSheetData(workbook, 'Prayers');
      if (prayersRows.length > 0) {
        const prayers = {
          soboh: 0,
          dohor: 0,
          aaser: 0,
          maghreb: 0,
          ishaa: 0,
          ayaat: 0,
          fasting: 0,
        };

        for (const row of prayersRows) {
          const count = parseInt(row['Missed Count'], 10) || 0;
          const prayer = String(row.Prayer || '');
          if (prayer.includes('Soboh')) prayers.soboh = count;
          else if (prayer.includes('Dohor')) prayers.dohor = count;
          else if (prayer.includes('Aaser')) prayers.aaser = count;
          else if (prayer.includes('Maghreb')) prayers.maghreb = count;
          else if (prayer.includes('Ishaa')) prayers.ishaa = count;
          else if (prayer.includes('Ayaat')) prayers.ayaat = count;
          else if (prayer.includes('Fasting')) prayers.fasting = count;
        }

        db.prepare(`
          UPDATE prayers
          SET soboh = ?,
              dohor = ?,
              aaser = ?,
              maghreb = ?,
              ishaa = ?,
              ayaat = ?,
              fasting = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = 1
        `).run(
          prayers.soboh,
          prayers.dohor,
          prayers.aaser,
          prayers.maghreb,
          prayers.ishaa,
          prayers.ayaat,
          prayers.fasting
        );
      }

      const gymPayments = getSheetData(workbook, 'Gym Payments');
      if (gymPayments.length > 0) {
        const insertGymPayment = db.prepare(`
          INSERT INTO gym_payments (date, sessions, notes)
          VALUES (?, ?, ?)
        `);

        for (const item of gymPayments) {
          insertGymPayment.run(
            item.Date || new Date().toISOString().slice(0, 10),
            parseInt(item.Sessions, 10) || 0,
            item.Notes || null
          );
        }

        summary.imported.gymPayments = gymPayments.length;
      }

      const gymSessions = getSheetData(workbook, 'Gym Sessions');
      if (gymSessions.length > 0) {
        const insertGymSession = db.prepare(`
          INSERT INTO gym_sessions (date, notes)
          VALUES (?, ?)
        `);

        for (const item of gymSessions) {
          insertGymSession.run(
            item.Date || new Date().toISOString().slice(0, 10),
            item.Notes || null
          );
        }

        summary.imported.gymSessions = gymSessions.length;
      }
    });

    transaction();
  });

  return summary;
}

export function ensureBackupDirectory() {
  const backupDir = path.join(path.dirname(getDatabasePath()), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  return backupDir;
}
