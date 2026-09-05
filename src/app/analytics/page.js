"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import styles from "./analytics.module.css";

const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const compactMoney = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
const dateLabel = (value, options) => new Date(`${value}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", ...options });
const monthLabel = (value) => dateLabel(`${value}-01`, { month: "short", year: "numeric" });

function comparisonLabel(data) {
  const comparison = data.comparison;
  const period = data.period.isPartial
    ? `1–${Number(comparison.end.slice(8, 10))} ${dateLabel(comparison.end, { month: "short" })}`
    : monthLabel(comparison.month);
  if (comparison.percent === null) return `No recorded outflow in ${period} to compare.`;
  if (comparison.difference === 0) return `Unchanged from ${period}.`;
  return `${Math.abs(comparison.percent).toFixed(1)}% ${comparison.difference > 0 ? "higher" : "lower"} than ${period}`;
}

export default function Analytics() {
  const router = useRouter();
  const [month, setMonth] = useState("");
  const [scope, setScope] = useState("all");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({ scope });
        if (month) query.set("month", month);
        const response = await fetch(`/api/analytics?${query}`, { signal: controller.signal, cache: "no-store" });
        if (response.status === 401 || response.redirected) {
          router.push("/login");
          return;
        }
        if (!response.ok) throw new Error("Unable to load the dashboard. Please try again.");
        const result = await response.json();
        if (!controller.signal.aborted) setData(result);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure.message || "Unable to load the dashboard.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [month, scope, retry, router]);

  const maximum = Math.max(0, ...(data?.monthly || []).map((item) => item.total));

  return (
    <main className={styles.container}>
      <AppHeader title="Dashboard">
        {data && (
          <select className={styles.monthSelect} aria-label="Month" value={month || data.month} onChange={(event) => setMonth(event.target.value)}>
            {data.availableMonths.map((value) => <option key={value} value={value}>{monthLabel(value)}</option>)}
          </select>
        )}
      </AppHeader>

      <div className={styles.filters} role="group" aria-label="Expense scope">
        {[['all', 'All'], ['personal', 'Personal'], ['business', 'Business']].map(([value, label]) => (
          <button key={value} type="button" aria-pressed={scope === value} onClick={() => setScope(value)}>{label}</button>
        ))}
      </div>

      {error ? (
        <div className={styles.message} role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button>
        </div>
      ) : loading ? <p className={styles.message} role="status">Loading dashboard…</p> : data && (
        <>
          <section className={styles.outflow} aria-labelledby="outflow-label">
            <h2 id="outflow-label" className={styles.label}>Recorded outflow{data.period.isPartial ? ` · 1–${Number(data.period.end.slice(8, 10))} ${dateLabel(data.period.end, { month: "short" })}` : ""}</h2>
            <p className={styles.total}>{money(data.total)}</p>
            <p className={styles.supporting}>{comparisonLabel(data)}</p>
          </section>

          <section className={`${styles.panel} ${styles.savings}`} aria-labelledby="savings-title">
            <h2 id="savings-title">Expected year-end savings</h2>
            <p className={styles.supporting}>All savings · {dateLabel(data.savings.yearEnd, { day: "numeric", month: "short", year: "numeric" })}</p>
            <p className={styles.savingsTotal}>{money(data.savings.expected)}</p>
            <p className={styles.supporting}>{money(data.savings.current)} saved + {money(data.savings.additions)} planned</p>
            <p className={styles.savingsNote}>Includes pension and metals at stored prices; assumes planned additions are saved.</p>
          </section>

          <section className={styles.panel} aria-labelledby="monthly-title">
            <div className={styles.panelHeader}>
              <div><h2 id="monthly-title">Month by month</h2><p className={styles.supporting}>Recorded expense totals · USD</p></div>
              <span className={styles.year}>{data.year}</span>
            </div>
            <div className={styles.chartScroll}>
              <div className={styles.chart} style={{ "--month-count": data.monthly.length }} role="group" aria-label="Monthly outflow; bars start at zero. Select a month to see its expenses.">
                {data.monthly.map((item) => (
                  <button
                    key={item.month}
                    type="button"
                    className={styles.monthBar}
                    aria-pressed={item.month === data.month}
                    aria-label={`${monthLabel(item.month)}${item.isPartial ? " so far" : ""}: ${money(item.total)} recorded outflow. Select month.`}
                    title={`${monthLabel(item.month)}: ${money(item.total)}`}
                    onClick={() => setMonth(item.month)}
                  >
                    <span className={styles.barArea} aria-hidden="true">
                      <span className={`${styles.barValue} ${item.month === data.month ? styles.visibleValue : ""}`}>{compactMoney(item.total)}</span>
                      <span className={styles.barShape} style={{ height: `${maximum > 0 ? item.total / maximum * 100 : 0}%` }} />
                    </span>
                    <span className={styles.monthLabel} aria-hidden="true">{dateLabel(`${item.month}-01`, { month: "short" })}</span>
                  </button>
                ))}
              </div>
            </div>
            <p className={styles.chartNote}>Tap a month to view it.{data.monthly.some((item) => item.isPartial) ? ` ${dateLabel(data.asOf, { month: "short" })} includes entries through ${dateLabel(data.asOf, { day: "numeric", month: "short" })}.` : ""}</p>
          </section>

          <section className={`${styles.panel} ${styles.largest}`} aria-labelledby="largest-title">
            <h2 id="largest-title">Expenses over $200</h2>
            {data.largest.length ? <ul className={styles.list}>
              {data.largest.map((item) => <li key={item.id} className={styles.listRow}>
                <div className={styles.rowDescription}><p>{item.label}</p><span>{dateLabel(item.date, { day: "numeric", month: "short" })}{item.scope === "business" ? " · Business" : ""}</span></div>
                <strong>{money(item.amount)}</strong>
              </li>)}
            </ul> : <p className={styles.empty}>No expenses over $200 this month.</p>}
          </section>
        </>
      )}
      <BottomNav active="analytics" />
    </main>
  );
}
