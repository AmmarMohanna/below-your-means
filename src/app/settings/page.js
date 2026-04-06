"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

import BottomNav from "@/components/BottomNav";

import styles from "./settings.module.css";

export default function Settings() {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [importMessage, setImportMessage] = useState("");

  const handleExportData = async () => {
    setExporting(true);

    try {
      const [transactionsRes, accountsRes, metalsRes, lifestyleRes] = await Promise.all([
        fetch("/api/transactions"),
        fetch("/api/accounts"),
        fetch("/api/metals"),
        fetch("/api/lifestyle"),
      ]);

      if (!transactionsRes.ok) throw new Error("Failed to fetch transactions");

      const transactions = await transactionsRes.json();
      const accounts = accountsRes.ok ? await accountsRes.json() : {};
      const metals = metalsRes.ok ? await metalsRes.json() : {};
      const lifestyle = lifestyleRes.ok ? await lifestyleRes.json() : {};

      const workbook = XLSX.utils.book_new();

      const transactionsData = [
        ["Date", "Category", "Type", "Scope", "Amount", "Notes"],
        ...transactions.map((transaction) => [
          transaction.date,
          transaction.category,
          transaction.type,
          transaction.scope || "personal",
          transaction.amount,
          transaction.notes || "",
        ]),
      ];
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet(transactionsData),
        "Transactions"
      );

      if (accounts.currentMoney?.length > 0) {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.aoa_to_sheet([
            ["Location", "Amount", "Notes"],
            ...accounts.currentMoney.map((item) => [item.location, item.amount, item.notes || ""]),
          ]),
          "Current Money"
        );
      }

      if (accounts.expectedMoney?.length > 0) {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.aoa_to_sheet([
            ["Source", "Expected Date", "Amount", "Notes"],
            ...accounts.expectedMoney.map((item) => [
              item.source,
              item.expected_date,
              item.amount,
              item.notes || "",
            ]),
          ]),
          "Expected Money"
        );
      }

      if (accounts.payables?.length > 0) {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.aoa_to_sheet([
            ["Pay To", "Due Date", "Amount", "Notes"],
            ...accounts.payables.map((item) => [item.source, item.pay_date, item.amount, item.notes || ""]),
          ]),
          "Payables"
        );
      }

      if (accounts.recurring?.length > 0) {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.aoa_to_sheet([
            ["Target", "Type", "Amount"],
            ...accounts.recurring.map((item) => [item.target, item.type, item.amount]),
          ]),
          "Recurring Monthly"
        );
      }

      if (accounts.heldMoney?.length > 0) {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.aoa_to_sheet([
            ["For Person", "Amount", "Notes"],
            ...accounts.heldMoney.map((item) => [item.person, item.amount, item.notes || ""]),
          ]),
          "Held Money"
        );
      }

      if (metals.holdings) {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.aoa_to_sheet([
            ["Metal", "Quantity", "Unit", "Price Per Unit", "Total Value"],
            [
              "Gold 24K",
              metals.holdings.gold_24k_grams,
              "grams",
              `$${metals.prices?.gold_24k_per_gram?.toFixed(2) || 0}`,
              `$${metals.values?.gold_24k?.toFixed(2) || 0}`,
            ],
            [
              "Gold 21K",
              metals.holdings.gold_21k_grams,
              "grams",
              `$${metals.prices?.gold_21k_per_gram?.toFixed(2) || 0}`,
              `$${metals.values?.gold_21k?.toFixed(2) || 0}`,
            ],
            [
              "Silver",
              metals.holdings.silver_kg,
              "kg",
              `$${metals.prices?.silver_per_kg?.toFixed(2) || 0}`,
              `$${metals.values?.silver?.toFixed(2) || 0}`,
            ],
            [],
            ["Total Metal Value", "", "", "", `$${metals.values?.total?.toFixed(2) || 0}`],
          ]),
          "Metals"
        );
      }

      if (lifestyle.prayers) {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.aoa_to_sheet([
            ["Prayer", "Missed Count"],
            ["Soboh (صبح)", lifestyle.prayers.soboh || 0],
            ["Dohor (ظهر)", lifestyle.prayers.dohor || 0],
            ["Aaser (عصر)", lifestyle.prayers.aaser || 0],
            ["Maghreb (مغرب)", lifestyle.prayers.maghreb || 0],
            ["Ishaa (عشاء)", lifestyle.prayers.ishaa || 0],
            ["Ayaat (آيات)", lifestyle.prayers.ayaat || 0],
            [],
            ["Fasting (صيام)", lifestyle.prayers.fasting || 0],
          ]),
          "Prayers"
        );
      }

      if (lifestyle.gymPayments?.length > 0) {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.aoa_to_sheet([
            ["Date", "Sessions", "Notes"],
            ...lifestyle.gymPayments.map((item) => [item.date, item.sessions, item.notes || ""]),
          ]),
          "Gym Payments"
        );
      }

      if (lifestyle.gymSessions?.length > 0) {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.aoa_to_sheet([
            ["Date", "Notes"],
            ...lifestyle.gymSessions.map((item) => [item.date, item.notes || ""]),
          ]),
          "Gym Sessions"
        );
      }

      XLSX.writeFile(
        workbook,
        `belowyourmeans-export-${new Date().toISOString().split("T")[0]}.xlsx`
      );
    } catch (error) {
      console.error("Export error:", error);
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadBackup = async () => {
    setDownloadingBackup(true);

    try {
      const response = await fetch("/api/backup");
      if (!response.ok) {
        throw new Error("Failed to download backup");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `belowyourmeans-backup-${new Date().toISOString().slice(0, 10)}.db`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Backup download error:", error);
    } finally {
      setDownloadingBackup(false);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    const confirmed = window.confirm(
      "This will replace the current app data with the selected Excel export. A database backup will be created first. Continue?"
    );

    if (!confirmed) return;

    setImporting(true);
    setImportMessage("");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Import failed");
      }

      const result = await response.json();
      setImportMessage(
        `Restore complete. Safety backup created at ${result.backupPath.split("/").slice(-2).join("/")}.`
      );
      setSelectedFile(null);
      router.refresh();
    } catch (error) {
      console.error("Import error:", error);
      setImportMessage("Restore failed. Your existing data should still be recoverable from the automatic backup.");
    } finally {
      setImporting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Safety & control</p>
        <h1 className={styles.title}>Backups and recovery should not require SSH.</h1>
        <p className={styles.subtitle}>
          Export your workbook, pull a raw SQLite backup, or restore from an Excel export without
          leaving the app.
        </p>
      </header>

      <section className={styles.section}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.cardEyebrow}>Export</p>
              <h2 className={styles.cardTitle}>Workbook export</h2>
            </div>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleExportData}
              disabled={exporting}
            >
              {exporting ? "Preparing..." : "Export Excel"}
            </button>
          </div>
          <p className={styles.cardText}>
            Downloads the full app state in the same multi-sheet format you already use, now with
            transaction scope included.
          </p>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.cardEyebrow}>Backup</p>
              <h2 className={styles.cardTitle}>Raw database snapshot</h2>
            </div>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleDownloadBackup}
              disabled={downloadingBackup}
            >
              {downloadingBackup ? "Creating..." : "Download DB"}
            </button>
          </div>
          <p className={styles.cardText}>
            Creates a clean SQLite snapshot from the running app so you can keep an off-device copy.
          </p>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.cardEyebrow}>Restore</p>
              <h2 className={styles.cardTitle}>Restore from Excel export</h2>
            </div>
          </div>
          <p className={styles.cardText}>
            Choose one of your exported `.xlsx` files. The app will create a database backup first,
            then replace the current data with the workbook contents.
          </p>

          <label className={styles.uploadField}>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
            />
            <span>{selectedFile ? selectedFile.name : "Choose Excel file"}</span>
          </label>

          <div className={styles.cardActions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleImport}
              disabled={!selectedFile || importing}
            >
              {importing ? "Restoring..." : "Restore workbook"}
            </button>
          </div>

          {importMessage ? <p className={styles.importMessage}>{importMessage}</p> : null}
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.cardEyebrow}>Account</p>
              <h2 className={styles.cardTitle}>Session</h2>
            </div>
            <button type="button" className={styles.dangerButton} onClick={handleLogout}>
              Log out
            </button>
          </div>
          <p className={styles.cardText}>
            If you ever rotate the password on the server, all existing sessions are invalidated
            automatically.
          </p>
        </div>
      </section>

      <BottomNav active="settings" />
    </div>
  );
}
