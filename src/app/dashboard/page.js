"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import BottomNav from "@/components/BottomNav";
import AppHeader from "@/components/AppHeader";
import { getTodayBeirut } from "@/lib/date";

import styles from "./dashboard.module.css";

function getDefaultCategory(type, scope) {
  if (type === "income") return "Income";
  return scope === "business" ? "Business" : "Other";
}

function formatDisplayDate(date) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "Asia/Beirut",
    month: "short",
    day: "numeric",
  });
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function getClientTimestamp() {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

export default function Dashboard() {
  const router = useRouter();
  const [transactions, setTransactions] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => getTodayBeirut());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [notificationPermission, setNotificationPermission] = useState("default");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("expense");
  const [scope, setScope] = useState("personal");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [expandedTransactionIds, setExpandedTransactionIds] = useState([]);
  const notifiedReminderIds = useRef(new Set());

  const fetchTransactions = useCallback(async () => {
    setError("");
    try {
      const [transactionsRes, remindersRes] = await Promise.all([
        fetch("/api/transactions"),
        fetch("/api/reminders"),
      ]);

      if (!transactionsRes.ok || !remindersRes.ok) {
        const status = !transactionsRes.ok ? transactionsRes.status : remindersRes.status;
        if (status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to fetch transactions");
      }

      const data = await transactionsRes.json();
      const remindersData = await remindersRes.json();
      setTransactions(data);
      setReminders(remindersData || []);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      setError("Could not load your entries. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    setSelectedIds([]);
    setSelectionMode(false);
    setExpandedTransactionIds([]);
  }, [selectedDate]);

  const selectedDateValue = selectedDate;
  const todayDate = getTodayBeirut();
  const monthlySummary = useMemo(() => transactions.reduce((summary, transaction) => {
    if (transaction.date <= todayDate && transaction.date.slice(0, 7) === selectedDate.slice(0, 7) &&
        (transaction.type === "income" || transaction.type === "expense")) {
      summary[transaction.type] += Number(transaction.amount) || 0;
    }
    return summary;
  }, { income: 0, expense: 0 }), [selectedDate, todayDate, transactions]);

  const dailyTransactions = useMemo(
    () =>
      transactions
        .filter((transaction) => transaction.date === selectedDateValue)
        .sort((left, right) => {
          if (left.created_at && right.created_at && left.created_at !== right.created_at) {
            return right.created_at.localeCompare(left.created_at);
          }
          return right.id - left.id;
        }),
    [selectedDateValue, transactions]
  );

  const dueReminders = useMemo(
    () =>
      reminders.filter(
        (reminder) => reminder.is_active && new Date(reminder.next_due_at).getTime() <= Date.now()
      ),
    [reminders]
  );

  const toggleSelected = (id) => {
    setSelectedIds((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]
    );
  };

  const toggleExpandedTransaction = (id) => {
    setExpandedTransactionIds((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const transactionAmount = Number(amount);
    if (!Number.isFinite(transactionAmount) || transactionAmount <= 0) return;

    setIsSubmitting(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: transactionAmount,
          category: getDefaultCategory(type, scope),
          type,
          scope,
          notes: description.trim(),
          date: selectedDateValue,
          created_at: getClientTimestamp(),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save transaction");
      }

      setAmount("");
      setDescription("");
      setType("expense");
      setScope("personal");
      await fetchTransactions();
      setNotice("Entry added.");
    } catch (error) {
      console.error("Error saving transaction:", error);
      setError("Could not save this entry. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    setIsBulkDeleting(true);

    try {
      const response = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulkDelete",
          ids: selectedIds,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete selected transactions");
      }

      setSelectedIds([]);
      setSelectionMode(false);
      await fetchTransactions();
    } catch (error) {
      console.error("Error deleting selected transactions:", error);
      setError("Could not delete the selected entries. Please try again.");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const requestNotificationPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  };

  const handleReminderAction = async (id, action) => {
    try {
      const response = await fetch("/api/reminders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });

      if (!response.ok) {
        throw new Error("Failed to update reminder");
      }

      await fetchTransactions();
    } catch (error) {
      console.error("Reminder action error:", error);
      setError("Could not update the reminder. Please try again.");
    }
  };

  useEffect(() => {
    if (notificationPermission !== "granted" || dueReminders.length === 0) return;

    dueReminders.forEach((reminder) => {
      if (notifiedReminderIds.current.has(reminder.id)) return;
      new Notification("Reminder Due", { body: reminder.title });
      notifiedReminderIds.current.add(reminder.id);
    });
  }, [dueReminders, notificationPermission]);

  useEffect(() => {
    const dueSet = new Set(dueReminders.map((reminder) => reminder.id));
    notifiedReminderIds.current.forEach((id) => {
      if (!dueSet.has(id)) {
        notifiedReminderIds.current.delete(id);
      }
    });
  }, [dueReminders]);

  if (loading) return <div className={styles.loading} role="status">Loading entries…</div>;

  return (
    <main className={styles.container}>
      <AppHeader title="Today" />
      {error && <div className={styles.error} role="alert">{error}<button type="button" onClick={fetchTransactions}>Retry</button></div>}
      <form className={styles.entryCard} onSubmit={handleSubmit}>
        <div className={styles.segmented} aria-label="Entry type">
          {["expense", "income"].map((value) => (
            <button key={value} type="button" aria-pressed={type === value}
              className={`${styles.segment} ${type === value ? styles.segmentActive : ""}`}
              onClick={() => setType(value)}>{value === "expense" ? "Expense" : "Income"}</button>
          ))}
        </div>
        <label className={styles.amountInputWrap}>
          <span className={styles.currency}>$</span>
          <input aria-label="Amount in US dollars" type="number" inputMode="decimal" step="0.01" min="0.01" required
            className={styles.amountInput} placeholder="0.00" value={amount}
            onChange={(event) => setAmount(event.target.value)} onFocus={(event) => event.target.select()} />
        </label>
        <input aria-label="Description" type="text" className={styles.textInput}
          placeholder={type === "income" ? "Who paid you?" : "What was it for?"}
          value={description} onChange={(event) => setDescription(event.target.value)} />
        <div className={styles.entryOptions}>
          <select aria-label="Entry scope" className={styles.scopeInput} value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="personal">Personal</option><option value="business">Business</option>
          </select>
          <label className={styles.dateInputWrap}>
            <span>{formatDisplayDate(selectedDate)}</span>
            <input aria-label="Entry date" type="date" className={styles.dateInput} value={selectedDate}
              max={getTodayBeirut()} required
              onInput={(event) => { if (event.target.value) setSelectedDate(event.target.value); }}
              onChange={(event) => { if (event.target.value) setSelectedDate(event.target.value); }} />
          </label>
        </div>
        <button type="submit" className={styles.saveButton} disabled={isSubmitting || !amount || Number(amount) <= 0}>
          {isSubmitting ? "Adding…" : "Add entry"}
        </button>
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        <div className={styles.summaryStrip}>
          <div><span className={styles.summaryLabel}>Month out</span><strong className={styles.summaryValue}>${formatMoney(monthlySummary.expense)}</strong></div>
          <div><span className={styles.summaryLabel}>Month in</span><strong className={styles.summaryValue}>${formatMoney(monthlySummary.income)}</strong></div>
        </div>
      </form>
      {dueReminders.length > 0 && (
        <details className={styles.reminderPanel}>
          <summary>{dueReminders.length} {dueReminders.length === 1 ? "reminder due" : "reminders due"}</summary>
          {notificationPermission === "default" && <button type="button" className={styles.secondaryButton} onClick={requestNotificationPermission}>Enable alerts</button>}
          {dueReminders.map((reminder) => (
            <div key={reminder.id} className={styles.reminderItem}>
              <span>{reminder.title}</span><div className={styles.reminderActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => handleReminderAction(reminder.id, "done")}>Done</button>
                <button type="button" className={styles.secondaryButton} onClick={() => handleReminderAction(reminder.id, "pause")}>Pause</button>
              </div>
            </div>
          ))}
        </details>
      )}
      <section className={styles.daySection} aria-label="Entries for selected date">
        <div className={styles.dayHeader}>
          <h2>{formatDisplayDate(selectedDate)}</h2>
          {dailyTransactions.length > 0 && <button type="button" className={styles.selectionToggle} onClick={() => { setSelectionMode((previous) => !previous); setSelectedIds([]); }}>
            {selectionMode ? "Cancel" : "Select"}
          </button>}
        </div>
        {selectionMode && selectedIds.length > 0 && <div className={styles.bulkBar}>
          <span>{selectedIds.length} selected</span><button type="button" className={styles.bulkDeleteButton} onClick={handleBulkDelete} disabled={isBulkDeleting}>
            {isBulkDeleting ? "Deleting…" : "Delete selected"}
          </button>
        </div>}
        <div className={styles.transactionList}>
          {dailyTransactions.length === 0 ? <p className={styles.emptyState}>No entries for this day.</p> : dailyTransactions.map((transaction) => (
            <article key={transaction.id} className={`${styles.transactionCard} ${selectionMode ? styles.selecting : ""}`}>
              {selectionMode && <button type="button" className={styles.selectCircle} aria-label={`Select ${transaction.notes || transaction.category}`}
                aria-pressed={selectedIds.includes(transaction.id)} onClick={() => toggleSelected(transaction.id)}>{selectedIds.includes(transaction.id) ? "✓" : ""}</button>}
              <button type="button" className={styles.transactionToggle} aria-expanded={expandedTransactionIds.includes(transaction.id)}
                onClick={() => toggleExpandedTransaction(transaction.id)} disabled={selectionMode}>
                <span className={styles.transactionTitle}>{transaction.notes || transaction.category}</span>
                {transaction.scope === "business" && <span className={styles.transactionMeta}>Business</span>}
              </button>
              <strong className={`${styles.transactionAmount} ${transaction.type === "income" ? styles.amountIncome : ""}`}>
                {transaction.type === "income" ? "+" : "−"}${Number(transaction.amount).toFixed(2)}
              </strong>
              {expandedTransactionIds.includes(transaction.id) && <div className={styles.transactionDetail}>
                {transaction.category} · {formatDisplayDate(transaction.date)}
              </div>}
            </article>
          ))}
        </div>
      </section>
      <BottomNav active="dashboard" />
    </main>
  );
}
