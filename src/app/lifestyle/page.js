"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import BottomNav from "@/components/BottomNav";
import { getTodayBeirut } from "@/lib/date";

import styles from "./lifestyle.module.css";

const PRAYERS = [
  { id: "soboh", name: "صبح", nameEn: "Soboh" },
  { id: "dohor", name: "ظهر", nameEn: "Dohor" },
  { id: "aaser", name: "عصر", nameEn: "Aaser" },
  { id: "maghreb", name: "مغرب", nameEn: "Maghreb" },
  { id: "ishaa", name: "عشاء", nameEn: "Ishaa" },
  { id: "ayaat", name: "آيات", nameEn: "Ayaat" },
];

export default function Lifestyle() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("gym");
  const [prayers, setPrayers] = useState({
    soboh: 0,
    dohor: 0,
    aaser: 0,
    maghreb: 0,
    ishaa: 0,
    ayaat: 0,
    fasting: 0,
  });
  const [gymPayments, setGymPayments] = useState([]);
  const [gymSessions, setGymSessions] = useState([]);
  const [remainingSessions, setRemainingSessions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showAddSession, setShowAddSession] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ date: "", sessions: "", notes: "" });
  const [sessionForm, setSessionForm] = useState({ date: "", notes: "" });

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch("/api/lifestyle");
      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to fetch");
      }

      const result = await response.json();
      if (result.prayers) {
        setPrayers(result.prayers);
      }
      setGymPayments(result.gymPayments || []);
      setGymSessions(result.gymSessions || []);
      setRemainingSessions(result.remainingSessions || 0);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePrayerChange = async (prayer, delta) => {
    setPrayers((previous) => ({
      ...previous,
      [prayer]: Math.max(0, previous[prayer] + delta),
    }));

    try {
      const response = await fetch("/api/lifestyle", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "prayer", prayer, delta }),
      });

      if (!response.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Error:", error);
      fetchData();
    }
  };

  const handleAddPayment = async () => {
    if (!paymentForm.date || !paymentForm.sessions) return;

    try {
      const response = await fetch("/api/lifestyle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "gymPayment",
          date: paymentForm.date,
          sessions: parseInt(paymentForm.sessions, 10),
          notes: paymentForm.notes,
        }),
      });

      if (response.ok) {
        setPaymentForm({ date: "", sessions: "", notes: "" });
        setShowAddPayment(false);
        fetchData();
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleAddSession = async () => {
    if (!sessionForm.date) return;

    try {
      const response = await fetch("/api/lifestyle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "gymSession",
          date: sessionForm.date,
          notes: sessionForm.notes,
        }),
      });

      if (response.ok) {
        setSessionForm({ date: "", notes: "" });
        setShowAddSession(false);
        fetchData();
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleQuickWorkout = async () => {
    try {
      const response = await fetch("/api/lifestyle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "gymSession",
          date: getTodayBeirut(),
          notes: "",
        }),
      });

      if (response.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleDeletePayment = async (id) => {
    try {
      const response = await fetch(`/api/lifestyle?type=gymPayment&id=${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleDeleteSession = async (id) => {
    try {
      const response = await fetch(`/api/lifestyle?type=gymSession&id=${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const formatDate = (dateText) => {
    if (!dateText) return "";
    const date = new Date(`${dateText}T12:00:00`);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
        <h1 className={styles.title}>Lifestyle</h1>
      </header>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "prayers" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("prayers")}
        >
          Prayers
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "gym" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("gym")}
        >
          Gym
        </button>
      </div>

      {activeTab === "prayers" && (
        <section className={styles.section}>
          <div className={styles.prayerGrid}>
            {PRAYERS.map((prayer) => (
              <div key={prayer.id} className={styles.prayerCard}>
                <div className={styles.prayerInfo}>
                  <span className={styles.prayerNameAr}>{prayer.name}</span>
                  <span className={styles.prayerNameEn}>{prayer.nameEn}</span>
                </div>
                <div className={styles.counterControls}>
                  <button
                    type="button"
                    className={styles.counterButton}
                    onClick={() => handlePrayerChange(prayer.id, -1)}
                    disabled={prayers[prayer.id] === 0}
                  >
                    -
                  </button>
                  <span className={styles.counterValue}>{prayers[prayer.id]}</span>
                  <button
                    type="button"
                    className={styles.counterButton}
                    onClick={() => handlePrayerChange(prayer.id, 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.singleCard}>
            <div className={styles.singleRow}>
              <div className={styles.prayerInfo}>
                <span className={styles.prayerNameAr}>صيام</span>
                <span className={styles.prayerNameEn}>Fasting</span>
              </div>
              <div className={styles.counterControls}>
                <button
                  type="button"
                  className={styles.counterButton}
                  onClick={() => handlePrayerChange("fasting", -1)}
                  disabled={prayers.fasting === 0}
                >
                  -
                </button>
                <span className={styles.counterValue}>{prayers.fasting}</span>
                <button
                  type="button"
                  className={styles.counterButton}
                  onClick={() => handlePrayerChange("fasting", 1)}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeTab === "gym" && (
        <section className={styles.section}>
          <div className={styles.summaryCard}>
            <div>
              <span className={styles.summaryLabel}>Remaining</span>
              <strong className={styles.summaryValue}>{remainingSessions}</strong>
            </div>
            <button type="button" className={styles.primaryButton} onClick={handleQuickWorkout}>
              Add today
            </button>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Payments</h2>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setShowAddPayment(true);
                  setPaymentForm({ date: getTodayBeirut(), sessions: "", notes: "" });
                }}
              >
                Add
              </button>
            </div>

            {showAddPayment && (
              <div className={styles.formGrid}>
                <input
                  type="date"
                  className={styles.formInput}
                  value={paymentForm.date}
                  onChange={(event) => setPaymentForm({ ...paymentForm, date: event.target.value })}
                />
                <input
                  type="number"
                  className={styles.formInput}
                  placeholder="Sessions"
                  value={paymentForm.sessions}
                  onChange={(event) =>
                    setPaymentForm({ ...paymentForm, sessions: event.target.value })
                  }
                />
                <input
                  type="text"
                  className={styles.formInput}
                  placeholder="Notes"
                  value={paymentForm.notes}
                  onChange={(event) => setPaymentForm({ ...paymentForm, notes: event.target.value })}
                />
                <div className={styles.formActions}>
                  <button type="button" className={styles.primaryButton} onClick={handleAddPayment}>
                    Save
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setShowAddPayment(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className={styles.list}>
              {gymPayments.length === 0 ? (
                <div className={styles.emptyState}>No payments.</div>
              ) : (
                gymPayments.map((payment) => (
                  <div key={payment.id} className={styles.listRow}>
                    <div className={styles.rowText}>
                      <strong>{formatDate(payment.date)}</strong>
                      <span>
                        {payment.sessions} sessions{payment.notes ? ` • ${payment.notes}` : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => handleDeletePayment(payment.id)}
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Sessions</h2>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setShowAddSession(true);
                  setSessionForm({ date: getTodayBeirut(), notes: "" });
                }}
              >
                Add
              </button>
            </div>

            {showAddSession && (
              <div className={styles.formGrid}>
                <input
                  type="date"
                  className={styles.formInput}
                  value={sessionForm.date}
                  onChange={(event) => setSessionForm({ ...sessionForm, date: event.target.value })}
                />
                <input
                  type="text"
                  className={styles.formInput}
                  placeholder="Notes"
                  value={sessionForm.notes}
                  onChange={(event) => setSessionForm({ ...sessionForm, notes: event.target.value })}
                />
                <div className={styles.formActions}>
                  <button type="button" className={styles.primaryButton} onClick={handleAddSession}>
                    Save
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setShowAddSession(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className={styles.list}>
              {gymSessions.length === 0 ? (
                <div className={styles.emptyState}>No sessions.</div>
              ) : (
                gymSessions.map((session) => (
                  <div key={session.id} className={styles.listRow}>
                    <div className={styles.rowText}>
                      <strong>{formatDate(session.date)}</strong>
                      <span>{session.notes || "No note"}</span>
                    </div>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => handleDeleteSession(session.id)}
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      <BottomNav active="lifestyle" />
    </div>
  );
}
