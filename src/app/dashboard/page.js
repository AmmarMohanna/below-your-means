"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import BottomNav from "@/components/BottomNav";
import { formatDateBeirut, getNowBeirut, getTodayBeirut } from "@/lib/date";

import styles from "./dashboard.module.css";

function getDefaultCategory(type, scope) {
  if (type === "income") return "Income";
  return scope === "business" ? "Business" : "Other";
}

function formatDisplayDate(date) {
  return date.toLocaleDateString("en-US", {
    timeZone: "Asia/Beirut",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
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
  const [selectedDate, setSelectedDate] = useState(() => getNowBeirut());
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("expense");
  const [scope, setScope] = useState("personal");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const fetchTransactions = useCallback(async () => {
    try {
      const response = await fetch("/api/transactions");
      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to fetch transactions");
      }

      const data = await response.json();
      setTransactions(data);
    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    setSelectedIds([]);
    setSelectionMode(false);
  }, [selectedDate]);

  const selectedDateValue = formatDateBeirut(selectedDate);

  const monthlySummary = useMemo(() => {
    const month = selectedDate.getMonth();
    const year = selectedDate.getFullYear();

    return transactions.reduce(
      (summary, transaction) => {
        const transactionDate = new Date(`${transaction.date}T12:00:00`);
        if (transactionDate.getMonth() !== month || transactionDate.getFullYear() !== year) {
          return summary;
        }

        summary[transaction.type] += transaction.amount;
        return summary;
      },
      { income: 0, expense: 0 }
    );
  }, [selectedDate, transactions]);

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

  const dailySummary = useMemo(
    () =>
      dailyTransactions.reduce(
        (summary, transaction) => {
          summary[transaction.type] += transaction.amount;
          return summary;
        },
        { income: 0, expense: 0 }
      ),
    [dailyTransactions]
  );

  const toggleSelected = (id) => {
    setSelectedIds((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]
    );
  };

  const changeDay = (days) => {
    const nextDate = new Date(selectedDate);
    nextDate.setDate(nextDate.getDate() + days);
    setSelectedDate(nextDate);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(amount),
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
    } catch (error) {
      console.error("Error saving transaction:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      const response = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      if (response.ok) {
        setSelectedIds((previous) => previous.filter((item) => item !== id));
        await fetchTransactions();
      }
    } catch (error) {
      console.error("Error deleting transaction:", error);
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
    } finally {
      setIsBulkDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Home</h1>
        <div className={styles.summaryStrip}>
          <div className={styles.summaryChip}>
            <span className={styles.summaryLabel}>Month out</span>
            <span className={styles.summaryValue}>${formatMoney(monthlySummary.expense)}</span>
          </div>
          <div className={styles.summaryChip}>
            <span className={styles.summaryLabel}>Month in</span>
            <span className={styles.summaryValue}>${formatMoney(monthlySummary.income)}</span>
          </div>
        </div>
      </header>

      <form className={styles.entryCard} onSubmit={handleSubmit}>
        <div className={styles.toggleBlock}>
          <span className={styles.toggleLabel}>Type</span>
          <div className={styles.segmented}>
            <button
              type="button"
              className={`${styles.segment} ${type === "expense" ? styles.segmentActive : ""}`}
              onClick={() => setType("expense")}
            >
              Expense
            </button>
            <button
              type="button"
              className={`${styles.segment} ${type === "income" ? styles.segmentActive : ""}`}
              onClick={() => setType("income")}
            >
              Income
            </button>
          </div>
        </div>

        <div className={styles.toggleBlock}>
          <span className={styles.toggleLabel}>Scope</span>
          <div className={styles.segmented}>
            <button
              type="button"
              className={`${styles.segment} ${scope === "personal" ? styles.segmentActive : ""}`}
              onClick={() => setScope("personal")}
            >
              Personal
            </button>
            <button
              type="button"
              className={`${styles.segment} ${scope === "business" ? styles.segmentActive : ""}`}
              onClick={() => setScope("business")}
            >
              Business
            </button>
          </div>
        </div>

        <label className={styles.fieldLabel} htmlFor="description">
          Note
        </label>
        <input
          id="description"
          type="text"
          className={styles.textInput}
          placeholder={
            type === "income" ? "Who paid you or what was it?" : "What did you spend on?"
          }
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />

        <div className={styles.amountRow}>
          <div className={styles.dateField}>
            <span className={styles.dateLabel}>Date</span>
            <input
              type="date"
              className={styles.dateInput}
              value={selectedDateValue}
              max={getTodayBeirut()}
              onChange={(event) => {
                if (event.target.value) {
                  setSelectedDate(new Date(`${event.target.value}T12:00:00`));
                }
              }}
            />
          </div>

          <div className={styles.amountField}>
            <span className={styles.dateLabel}>Amount</span>
            <label className={styles.amountInputWrap} htmlFor="amount">
              <span className={styles.currency}>USD</span>
              <input
                id="amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                className={styles.amountInput}
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                onFocus={(event) => event.target.select()}
              />
            </label>
          </div>

          <button
            type="submit"
            className={styles.saveButton}
            disabled={isSubmitting || !amount}
          >
            {isSubmitting ? "Saving..." : "Save"}
          </button>
        </div>

      </form>

      <section className={styles.daySection}>
        <div className={styles.dayHeader}>
          <h2 className={styles.dayTitle}>{formatDisplayDate(selectedDate)}</h2>

          <div className={styles.dayActions}>
            <button type="button" className={styles.navButton} onClick={() => changeDay(-1)}>
              ←
            </button>
            <button type="button" className={styles.navButton} onClick={() => changeDay(1)}>
              →
            </button>
          </div>
        </div>

        <div className={styles.daySummary}>
          <div className={styles.dayMetric}>
            <span className={styles.metricLabel}>Spent</span>
            <strong>${formatMoney(dailySummary.expense)}</strong>
          </div>
          <div className={`${styles.dayMetric} ${styles.incomeMetric}`}>
            <span className={styles.metricLabel}>Received</span>
            <strong>${formatMoney(dailySummary.income)}</strong>
          </div>
          <button
            type="button"
            className={styles.selectionToggle}
            onClick={() => {
              setSelectionMode((previous) => !previous);
              setSelectedIds([]);
            }}
          >
            {selectionMode ? "Cancel select" : "Select"}
          </button>
        </div>

        {selectionMode && selectedIds.length > 0 && (
          <div className={styles.bulkBar}>
            <span>{selectedIds.length} selected</span>
            <button
              type="button"
              className={styles.bulkDeleteButton}
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
            >
              {isBulkDeleting ? "Deleting..." : "Delete selected"}
            </button>
          </div>
        )}

        <div className={styles.transactionList}>
          {dailyTransactions.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No entries.</p>
            </div>
          ) : (
            dailyTransactions.map((transaction) => (
              <article key={transaction.id} className={styles.transactionCard}>
                <div className={styles.transactionLeading}>
                  {selectionMode ? (
                    <button
                      type="button"
                      className={`${styles.selectCircle} ${
                        selectedIds.includes(transaction.id) ? styles.selectCircleActive : ""
                      }`}
                      onClick={() => toggleSelected(transaction.id)}
                    >
                      {selectedIds.includes(transaction.id) ? "✓" : ""}
                    </button>
                  ) : (
                    <div className={styles.transactionIcon}>
                      {transaction.type === "income" ? "+" : "-"}
                    </div>
                  )}
                </div>

                <div className={styles.transactionBody}>
                  <strong className={styles.transactionTitle}>
                    {transaction.notes || transaction.category}
                  </strong>
                </div>

                <span
                  className={`${styles.transactionAmount} ${
                    transaction.type === "income" ? styles.amountIncome : styles.amountExpense
                  }`}
                >
                  {transaction.type === "income" ? "+" : "-"}${transaction.amount.toFixed(2)}
                </span>

                {!selectionMode && (
                  <button
                    type="button"
                    className={styles.deleteButton}
                    onClick={() => handleDelete(transaction.id)}
                    aria-label="Delete transaction"
                  >
                    ×
                  </button>
                )}
              </article>
            ))
          )}
        </div>
      </section>

      <BottomNav active="dashboard" />
    </div>
  );
}
