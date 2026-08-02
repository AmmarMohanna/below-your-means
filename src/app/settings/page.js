"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

import BottomNav from "@/components/BottomNav";

import styles from "./settings.module.css";

function formatHistoryTitle(entry) {
  const record = entry.after || entry.before || {};

  if (entry.table_name === "transactions") {
    return record.notes || record.category || "Transaction";
  }

  if (entry.table_name === "current_money") {
    return record.location || "Current money";
  }

  if (entry.table_name === "expected_money" || entry.table_name === "payables") {
    return record.source || "Scheduled item";
  }

  if (entry.table_name === "recurring") {
    return record.target || "Recurring";
  }

  if (entry.table_name === "held_money") {
    return record.person || "Held money";
  }

  if (entry.table_name === "long_term_savings") {
    return "AUB Pension";
  }

  if (entry.table_name === "gym_payments" || entry.table_name === "gym_sessions") {
    return record.notes || record.date || "Gym";
  }

  return entry.table_name.replaceAll("_", " ");
}

function formatHistoryMeta(entry) {
  return `${entry.action} • ${entry.table_name.replaceAll("_", " ")}`;
}

export default function Settings() {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [importMessage, setImportMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [undoingId, setUndoingId] = useState(null);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState([]);

  const fetchHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/history?limit=8");
      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to fetch history");
      }

      setHistory(await response.json());
    } catch (error) {
      console.error("History error:", error);
    } finally {
      setLoadingHistory(false);
    }
  }, [router]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const toggleExpandedHistory = (id) => {
    setExpandedHistoryIds((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]
    );
  };

  const handleExportData = async () => {
    setExporting(true);

    try {
      const [transactionsRes, accountsRes, metalsRes, lifestyleRes, remindersRes] =
        await Promise.all([
        fetch("/api/transactions"),
        fetch("/api/accounts"),
        fetch("/api/metals"),
        fetch("/api/lifestyle"),
        fetch("/api/reminders"),
      ]);

      if (!transactionsRes.ok) throw new Error("Failed to fetch transactions");

      const transactions = await transactionsRes.json();
      const accounts = accountsRes.ok ? await accountsRes.json() : {};
      const metals = metalsRes.ok ? await metalsRes.json() : {};
      const lifestyle = lifestyleRes.ok ? await lifestyleRes.json() : {};
      const reminders = remindersRes.ok ? await remindersRes.json() : [];

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

      if (metals.longTermSavings) {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.aoa_to_sheet([
            ["Account", "Amount"],
            ["AUB Pension", metals.longTermSavings.aub_pension_amount || 0],
            ["Metals", metals.values?.total || 0],
            ["Total", metals.longTermSavings.total || 0],
          ]),
          "Long-term Savings"
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

      if (reminders.length > 0) {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.aoa_to_sheet([
            ["Title", "Interval (hours)", "Next Due At", "Last Done At", "Active"],
            ...reminders.map((item) => [
              item.title || "",
              item.interval_hours || 0,
              item.next_due_at || "",
              item.last_done_at || "",
              item.is_active ? "Yes" : "No",
            ]),
          ]),
          "Reminders"
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
      link.download = `belowyourmeans-d1-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
      "This will replace the current app data with the selected Excel export. Export Excel or download a backup first if you want an extra rollback point. Continue?"
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
      setImportMessage(result.backupLabel || "Restore complete.");
      setSelectedFile(null);
      await fetchHistory();
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

  const handleUndo = async (auditId) => {
    setUndoingId(auditId);

    try {
      const response = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditId }),
      });

      if (!response.ok) {
        throw new Error("Failed to undo change");
      }

      await fetchHistory();
    } catch (error) {
      console.error("Undo error:", error);
    } finally {
      setUndoingId(null);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
      </header>

      <section className={styles.section}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Export Excel</h2>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleExportData}
              disabled={exporting}
            >
              {exporting ? "Preparing..." : "Export Excel"}
            </button>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Download Backup</h2>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleDownloadBackup}
              disabled={downloadingBackup}
            >
              {downloadingBackup ? "Creating..." : "Download JSON"}
            </button>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Restore from Excel</h2>
          </div>

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
            <h2 className={styles.cardTitle}>Recent changes</h2>
          </div>

          <div className={styles.historyList}>
            {loadingHistory ? (
              <div className={styles.emptyState}>Loading...</div>
            ) : history.length === 0 ? (
              <div className={styles.emptyState}>No recent changes.</div>
            ) : (
              history.map((entry) => (
                <div
                  key={entry.id}
                  className={`${styles.historyRow} ${
                    expandedHistoryIds.includes(entry.id) ? styles.historyRowExpanded : ""
                  }`}
                >
                  <button
                    type="button"
                    className={styles.historyToggle}
                    onClick={() => toggleExpandedHistory(entry.id)}
                    aria-expanded={expandedHistoryIds.includes(entry.id)}
                  >
                    <div className={styles.historyText}>
                      <strong>{formatHistoryTitle(entry)}</strong>
                      <span>
                        {formatHistoryMeta(entry)} • {new Date(entry.created_at).toLocaleString()}
                      </span>
                    </div>
                    <span className={styles.historyReveal}>
                      {expandedHistoryIds.includes(entry.id) ? "Hide" : "Details"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => handleUndo(entry.id)}
                    disabled={undoingId === entry.id}
                  >
                    {undoingId === entry.id ? "Undoing..." : "Undo"}
                  </button>
                  {expandedHistoryIds.includes(entry.id) ? (
                    <div className={styles.historyDetail}>
                      <strong>{formatHistoryTitle(entry)}</strong>
                      <span>
                        {formatHistoryMeta(entry)} • {new Date(entry.created_at).toLocaleString()}
                      </span>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Log out</h2>
            <button type="button" className={styles.dangerButton} onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>
      </section>

      <BottomNav active="settings" />
    </div>
  );
}
