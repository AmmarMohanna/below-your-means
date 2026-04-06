"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import BottomNav from "@/components/BottomNav";
import { getNowBeirut } from "@/lib/date";

import styles from "./analytics.module.css";

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value || 0);
}

function parseDate(dateText) {
  return new Date(`${dateText}T12:00:00`);
}

function formatDate(dateText) {
  return parseDate(dateText).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function Analytics() {
  const router = useRouter();
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState({
    expectedMoney: [],
    payables: [],
    currentMoney: [],
    recurring: [],
    heldMoney: [],
  });
  const [metals, setMetals] = useState({ prices: {}, values: {} });
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [undoingId, setUndoingId] = useState(null);

  const fetchReviewData = useCallback(async () => {
    try {
      const [transactionsRes, accountsRes, metalsRes, historyRes] = await Promise.all([
        fetch("/api/transactions"),
        fetch("/api/accounts"),
        fetch("/api/metals"),
        fetch("/api/history?limit=8"),
      ]);

      if (!transactionsRes.ok || !accountsRes.ok || !metalsRes.ok || !historyRes.ok) {
        if (
          transactionsRes.status === 401 ||
          accountsRes.status === 401 ||
          metalsRes.status === 401 ||
          historyRes.status === 401
        ) {
          router.push("/login");
          return;
        }

        throw new Error("Failed to fetch review data");
      }

      setTransactions(await transactionsRes.json());
      setAccounts(await accountsRes.json());
      setMetals(await metalsRes.json());
      setHistory(await historyRes.json());
    } catch (error) {
      console.error("Error fetching review data:", error);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchReviewData();
  }, [fetchReviewData]);

  const now = getNowBeirut();
  const reviewBaseDate = useMemo(
    () => new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12),
    [now]
  );
  const startOfMonth = useMemo(() => new Date(now.getFullYear(), now.getMonth(), 1, 12), [now]);
  const endOfReviewWindow = useMemo(() => {
    const date = new Date(reviewBaseDate);
    date.setDate(date.getDate() + 14);
    return date;
  }, [reviewBaseDate]);

  const monthTransactions = useMemo(
    () =>
      transactions.filter((transaction) => {
        const date = parseDate(transaction.date);
        return (
          date.getMonth() === now.getMonth() &&
          date.getFullYear() === now.getFullYear() &&
          date >= startOfMonth
        );
      }),
    [now, startOfMonth, transactions]
  );

  const monthSummary = useMemo(
    () =>
      monthTransactions.reduce(
        (summary, transaction) => {
          summary[transaction.type] += transaction.amount;
          if ((transaction.scope || "personal") === "business") {
            summary.business += transaction.amount;
          } else {
            summary.personal += transaction.amount;
          }
          return summary;
        },
        { income: 0, expense: 0, business: 0, personal: 0 }
      ),
    [monthTransactions]
  );

  const upcomingExpected = useMemo(
    () =>
      accounts.expectedMoney.filter((item) => {
        const date = parseDate(item.expected_date);
        return date >= reviewBaseDate && date <= endOfReviewWindow;
      }),
    [accounts.expectedMoney, endOfReviewWindow, reviewBaseDate]
  );

  const upcomingPayables = useMemo(
    () =>
      accounts.payables.filter((item) => {
        const date = parseDate(item.pay_date);
        return date >= reviewBaseDate && date <= endOfReviewWindow;
      }),
    [accounts.payables, endOfReviewWindow, reviewBaseDate]
  );

  const overduePayables = useMemo(
    () => accounts.payables.filter((item) => parseDate(item.pay_date) < reviewBaseDate),
    [accounts.payables, reviewBaseDate]
  );

  const staleMetalPrices = useMemo(() => {
    if (!metals.prices?.last_updated) return true;
    const updatedAt = new Date(metals.prices.last_updated);
    const ageMs = reviewBaseDate.getTime() - updatedAt.getTime();
    return ageMs > 1000 * 60 * 60 * 24 * 7;
  }, [metals.prices, reviewBaseDate]);

  const recentLargeMoves = useMemo(
    () =>
      [...transactions]
        .sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount))
        .slice(0, 6),
    [transactions]
  );

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

      await fetchReviewData();
    } catch (error) {
      console.error("Error undoing change:", error);
    } finally {
      setUndoingId(null);
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
        <p className={styles.eyebrow}>Review</p>
        <h1 className={styles.title}>Useful, not decorative.</h1>
        <p className={styles.subtitle}>
          This page focuses on what needs attention now: the month, the next two weeks, stale
          numbers, and recent changes you can undo.
        </p>
      </header>

      <section className={styles.summaryGrid}>
        <article className={styles.summaryCard}>
          <span className={styles.cardLabel}>Month out</span>
          <strong>${formatMoney(monthSummary.expense)}</strong>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.cardLabel}>Month in</span>
          <strong>${formatMoney(monthSummary.income)}</strong>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.cardLabel}>Personal flow</span>
          <strong>${formatMoney(monthSummary.personal)}</strong>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.cardLabel}>Business flow</span>
          <strong>${formatMoney(monthSummary.business)}</strong>
        </article>
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>Next 14 days</p>
              <h2 className={styles.panelTitle}>What is coming in</h2>
            </div>
          </div>
          <div className={styles.list}>
            {upcomingExpected.length === 0 ? (
              <div className={styles.emptyState}>No expected money in the next two weeks.</div>
            ) : (
              upcomingExpected.map((item) => (
                <div key={item.id} className={styles.listRow}>
                  <div>
                    <strong>{item.source}</strong>
                    <span>{formatDate(item.expected_date)}</span>
                  </div>
                  <strong>${formatMoney(item.amount)}</strong>
                </div>
              ))
            )}
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>Next 14 days</p>
              <h2 className={styles.panelTitle}>What you need to pay</h2>
            </div>
          </div>
          <div className={styles.list}>
            {upcomingPayables.length === 0 ? (
              <div className={styles.emptyState}>No payables landing in the next two weeks.</div>
            ) : (
              upcomingPayables.map((item) => (
                <div key={item.id} className={styles.listRow}>
                  <div>
                    <strong>{item.source}</strong>
                    <span>{formatDate(item.pay_date)}</span>
                  </div>
                  <strong>${formatMoney(item.amount)}</strong>
                </div>
              ))
            )}
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>Attention</p>
              <h2 className={styles.panelTitle}>Things to clean up</h2>
            </div>
          </div>
          <div className={styles.alertList}>
            {overduePayables.length > 0 && (
              <div className={styles.alertCard}>
                <strong>{overduePayables.length} overdue payables</strong>
                <span>
                  ${formatMoney(overduePayables.reduce((sum, item) => sum + (item.amount || 0), 0))}
                </span>
              </div>
            )}
            {staleMetalPrices && (
              <div className={styles.alertCard}>
                <strong>Metal prices look stale</strong>
                <span>Refresh them from the Accounts page when you want live numbers.</span>
              </div>
            )}
            {overduePayables.length === 0 && !staleMetalPrices && (
              <div className={styles.emptyState}>No obvious cleanup items right now.</div>
            )}
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>Recent changes</p>
              <h2 className={styles.panelTitle}>Undo if needed</h2>
            </div>
          </div>
          <div className={styles.list}>
            {history.length === 0 ? (
              <div className={styles.emptyState}>No tracked changes yet.</div>
            ) : (
              history.map((entry) => (
                <div key={entry.id} className={styles.historyRow}>
                  <div>
                    <strong>
                      {entry.action} {entry.table_name.replaceAll("_", " ")}
                    </strong>
                    <span>{new Date(entry.created_at).toLocaleString()}</span>
                  </div>
                  <button
                    type="button"
                    className={styles.undoButton}
                    onClick={() => handleUndo(entry.id)}
                    disabled={undoingId === entry.id}
                  >
                    {undoingId === entry.id ? "Undoing..." : "Undo"}
                  </button>
                </div>
              ))
            )}
          </div>
        </article>

        <article className={`${styles.panel} ${styles.fullWidth}`}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>Largest moves</p>
              <h2 className={styles.panelTitle}>Big items worth a second look</h2>
            </div>
          </div>
          <div className={styles.largeMoves}>
            {recentLargeMoves.map((transaction) => (
              <div key={transaction.id} className={styles.moveCard}>
                <strong>{transaction.notes || transaction.category}</strong>
                <span>
                  {formatDate(transaction.date)} • {transaction.scope || "personal"}
                </span>
                <strong
                  className={
                    transaction.type === "income" ? styles.incomeAmount : styles.expenseAmount
                  }
                >
                  {transaction.type === "income" ? "+" : "-"}${transaction.amount.toFixed(2)}
                </strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <BottomNav active="analytics" />
    </div>
  );
}
