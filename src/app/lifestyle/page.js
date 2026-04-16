"use client";

import { useEffect, useState, useCallback } from "react";
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
  const [activeTab, setActiveTab] = useState("prayers");
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
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showAddSession, setShowAddSession] = useState(false);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [editingReminderId, setEditingReminderId] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ date: "", sessions: "", notes: "" });
  const [sessionForm, setSessionForm] = useState({ date: "", notes: "" });
  const [reminderForm, setReminderForm] = useState({
    title: "",
    intervalValue: "1",
    intervalUnit: "days",
  });
  const router = useRouter();

  const fetchData = useCallback(async () => {
    try {
      const [lifestyleRes, remindersRes] = await Promise.all([
        fetch("/api/lifestyle"),
        fetch("/api/reminders"),
      ]);

      if (!lifestyleRes.ok || !remindersRes.ok) {
        const status = !lifestyleRes.ok ? lifestyleRes.status : remindersRes.status;
        if (status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to fetch");
      }

      const result = await lifestyleRes.json();
      const remindersData = await remindersRes.json();

      if (result.prayers) {
        setPrayers(result.prayers);
      }
      setGymPayments(result.gymPayments || []);
      setGymSessions(result.gymSessions || []);
      setRemainingSessions(result.remainingSessions || 0);
      setReminders(remindersData || []);
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
    setPrayers((prev) => ({
      ...prev,
      [prayer]: Math.max(0, prev[prayer] + delta),
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

  const parseIntervalHours = () => {
    const value = parseInt(reminderForm.intervalValue, 10);
    if (!Number.isInteger(value) || value <= 0) return null;
    return reminderForm.intervalUnit === "days" ? value * 24 : value;
  };

  const resetReminderForm = () => {
    setReminderForm({ title: "", intervalValue: "1", intervalUnit: "days" });
    setEditingReminderId(null);
    setShowReminderForm(false);
  };

  const handleSaveReminder = async () => {
    const title = reminderForm.title.trim();
    const intervalHours = parseIntervalHours();
    if (!title || !intervalHours) return;

    try {
      if (editingReminderId) {
        const response = await fetch("/api/reminders", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingReminderId,
            action: "update",
            title,
            interval_hours: intervalHours,
            recalculate_from_now: true,
          }),
        });
        if (!response.ok) throw new Error("Failed to update reminder");
      } else {
        const response = await fetch("/api/reminders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, interval_hours: intervalHours }),
        });
        if (!response.ok) throw new Error("Failed to create reminder");
      }

      resetReminderForm();
      fetchData();
    } catch (error) {
      console.error("Reminder save error:", error);
    }
  };

  const startEditReminder = (reminder) => {
    const useDays = reminder.interval_hours % 24 === 0;
    setEditingReminderId(reminder.id);
    setReminderForm({
      title: reminder.title,
      intervalValue: String(useDays ? reminder.interval_hours / 24 : reminder.interval_hours),
      intervalUnit: useDays ? "days" : "hours",
    });
    setShowReminderForm(true);
  };

  const handleReminderAction = async (id, action) => {
    try {
      if (action === "delete") {
        const response = await fetch(`/api/reminders?id=${id}`, { method: "DELETE" });
        if (!response.ok) throw new Error("Failed to delete reminder");
      } else {
        const response = await fetch("/api/reminders", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action }),
        });
        if (!response.ok) throw new Error("Failed to update reminder");
      }
      fetchData();
    } catch (error) {
      console.error("Reminder action error:", error);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(`${dateStr}T12:00:00`);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatReminderTime = (reminder) => {
    if (!reminder.is_active) return "Paused";

    const dueDate = new Date(reminder.next_due_at);
    const diffMs = dueDate.getTime() - Date.now();

    if (diffMs <= 0) return "Due now";

    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return `Next in ${days}d ${hours}h`;
    if (hours > 0) return `Next in ${hours}h ${minutes}m`;
    return `Next in ${minutes}m`;
  };

  const reminderIsDue = (reminder) => {
    return reminder.is_active && new Date(reminder.next_due_at).getTime() <= Date.now();
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
        <p className={styles.eyebrow}>Lifestyle</p>
        <div className={styles.headerContent}>
          <h1 className={styles.logo}>أُلفة</h1>
          <p className={styles.subtitle}>Prayers, fasting, and gym tracking without clutter.</p>
        </div>
      </header>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "prayers" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("prayers")}
        >
          🕌 Prayers
        </button>
        <button
          className={`${styles.tab} ${activeTab === "gym" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("gym")}
        >
          💪 Exercise
        </button>
      </div>

      {activeTab === "prayers" && (
        <section className={styles.prayerSection}>
          <div className={styles.inspirationCard}>
            <div className={styles.dhikr}>
              <span className={styles.dhikrItem}>الله أكبر ×34</span>
              <span className={styles.dhikrDivider}>•</span>
              <span className={styles.dhikrItem}>الحمد لله ×33</span>
              <span className={styles.dhikrDivider}>•</span>
              <span className={styles.dhikrItem}>سبحان الله ×33</span>
            </div>
            <div className={styles.dailyReminders}>
              <div className={styles.reminder}>📌 Keep your important items visible</div>
              <div className={styles.reminder}>✅ Press Done to restart each timer</div>
            </div>
          </div>

          <div className={styles.missedHeader}>
            <span className={styles.missedLabel}>Missed Prayers</span>
            <span className={styles.missedNote}>10 years +</span>
          </div>

          <div className={styles.prayerGrid}>
            {PRAYERS.map((prayer) => (
              <div key={prayer.id} className={styles.prayerCard}>
                <div className={styles.prayerInfo}>
                  <span className={styles.prayerNameAr}>{prayer.name}</span>
                  <span className={styles.prayerNameEn}>{prayer.nameEn}</span>
                </div>
                <div className={styles.prayerControls}>
                  <button
                    className={styles.prayerBtn}
                    onClick={() => handlePrayerChange(prayer.id, -1)}
                    disabled={prayers[prayer.id] === 0}
                  >
                    −
                  </button>
                  <span className={styles.prayerCount}>{prayers[prayer.id]}</span>
                  <button className={styles.prayerBtn} onClick={() => handlePrayerChange(prayer.id, 1)}>
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.fastingSection}>
            <div className={styles.fastingHeader}>
              <span className={styles.fastingLabel}>Missed Fasting</span>
              <span className={styles.fastingNote}>60 days +</span>
            </div>
            <div className={styles.fastingCard}>
              <div className={styles.fastingInfo}>
                <span className={styles.fastingIcon}>🌙</span>
                <span className={styles.fastingName}>صيام</span>
              </div>
              <div className={styles.prayerControls}>
                <button
                  className={styles.prayerBtn}
                  onClick={() => handlePrayerChange("fasting", -1)}
                  disabled={prayers.fasting === 0}
                >
                  −
                </button>
                <span className={styles.prayerCount}>{prayers.fasting}</span>
                <button className={styles.prayerBtn} onClick={() => handlePrayerChange("fasting", 1)}>
                  +
                </button>
              </div>
            </div>
          </div>

          <div className={styles.remindersSection}>
            <div className={styles.remindersHeader}>
              <h3 className={styles.remindersTitle}>Important Reminders</h3>
              <button
                className={styles.addBtn}
                onClick={() => {
                  if (showReminderForm && !editingReminderId) {
                    resetReminderForm();
                  } else {
                    setEditingReminderId(null);
                    setReminderForm({ title: "", intervalValue: "1", intervalUnit: "days" });
                    setShowReminderForm(true);
                  }
                }}
              >
                {showReminderForm && !editingReminderId ? "Cancel" : "+ Add"}
              </button>
            </div>

            {showReminderForm && (
              <div className={styles.reminderForm}>
                <input
                  type="text"
                  value={reminderForm.title}
                  onChange={(e) => setReminderForm({ ...reminderForm, title: e.target.value })}
                  placeholder="Reminder title"
                  className={styles.formInput}
                />
                <div className={styles.intervalRow}>
                  <input
                    type="number"
                    min="1"
                    value={reminderForm.intervalValue}
                    onChange={(e) =>
                      setReminderForm({ ...reminderForm, intervalValue: e.target.value })
                    }
                    className={styles.formInput}
                  />
                  <select
                    value={reminderForm.intervalUnit}
                    onChange={(e) => setReminderForm({ ...reminderForm, intervalUnit: e.target.value })}
                    className={styles.formInput}
                  >
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                </div>
                <div className={styles.formActions}>
                  <button onClick={handleSaveReminder} className={styles.saveBtn}>
                    ✓
                  </button>
                  <button onClick={resetReminderForm} className={styles.cancelBtn}>
                    ×
                  </button>
                </div>
              </div>
            )}

            <div className={styles.remindersList}>
              {reminders.map((reminder) => (
                <div
                  key={reminder.id}
                  className={`${styles.reminderItem} ${
                    reminderIsDue(reminder) ? styles.reminderItemDue : ""
                  }`}
                >
                  <div className={styles.reminderTopRow}>
                    <div className={styles.reminderTextGroup}>
                      <span className={styles.reminderTitleText}>{reminder.title}</span>
                      <span className={styles.reminderSubText}>{formatReminderTime(reminder)}</span>
                    </div>
                    <span className={styles.reminderIntervalLabel}>
                      Every{" "}
                      {reminder.interval_hours % 24 === 0
                        ? `${reminder.interval_hours / 24} day(s)`
                        : `${reminder.interval_hours} hour(s)`}
                    </span>
                  </div>

                  <div className={styles.reminderActionRow}>
                    <button
                      className={styles.reminderActionBtn}
                      onClick={() => handleReminderAction(reminder.id, "done")}
                    >
                      Done
                    </button>
                    <button className={styles.reminderActionBtn} onClick={() => startEditReminder(reminder)}>
                      Edit
                    </button>
                    <button
                      className={styles.reminderActionBtn}
                      onClick={() =>
                        handleReminderAction(reminder.id, reminder.is_active ? "pause" : "resume")
                      }
                    >
                      {reminder.is_active ? "Pause" : "Resume"}
                    </button>
                    <button
                      className={`${styles.reminderActionBtn} ${styles.reminderDeleteBtn}`}
                      onClick={() => handleReminderAction(reminder.id, "delete")}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}

              {reminders.length === 0 && (
                <div className={styles.emptyState}>No reminders yet. Add your first one above.</div>
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === "gym" && (
        <section className={styles.gymSection}>
          <div className={styles.sessionsSummary}>
            <div className={styles.sessionsRemaining}>
              <span className={styles.sessionsNumber}>{remainingSessions}</span>
              <span className={styles.sessionsLabel}>Sessions Remaining</span>
            </div>
            <button className={styles.quickWorkoutBtn} onClick={handleQuickWorkout}>
              💪 I Worked Out Today
            </button>
          </div>

          <div className={styles.gymCard}>
            <div className={styles.gymCardHeader}>
              <h3>💳 Payments</h3>
              <button
                className={styles.addBtn}
                onClick={() => {
                  setShowAddPayment(true);
                  setPaymentForm({
                    date: getTodayBeirut(),
                    sessions: "",
                    notes: "",
                  });
                }}
              >
                + Add
              </button>
            </div>

            {showAddPayment && (
              <div className={styles.addForm}>
                <input
                  type="date"
                  value={paymentForm.date}
                  onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                  className={styles.formInput}
                />
                <input
                  type="number"
                  value={paymentForm.sessions}
                  onChange={(e) => setPaymentForm({ ...paymentForm, sessions: e.target.value })}
                  placeholder="Sessions"
                  className={styles.formInput}
                />
                <input
                  type="text"
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  placeholder="Notes"
                  className={styles.formInput}
                />
                <div className={styles.formActions}>
                  <button onClick={handleAddPayment} className={styles.saveBtn}>
                    ✓
                  </button>
                  <button onClick={() => setShowAddPayment(false)} className={styles.cancelBtn}>
                    ×
                  </button>
                </div>
              </div>
            )}

            <div className={styles.paymentsList}>
              {gymPayments.map((payment) => (
                <div key={payment.id} className={styles.paymentItem}>
                  <span className={styles.paymentDate}>{formatDate(payment.date)}</span>
                  <span className={styles.paymentSessions}>×{payment.sessions}</span>
                  {payment.notes && <span className={styles.paymentNotes}>{payment.notes}</span>}
                  <button className={styles.deleteBtn} onClick={() => handleDeletePayment(payment.id)}>
                    🗑️
                  </button>
                </div>
              ))}
              {gymPayments.length === 0 && <div className={styles.emptyState}>No payments yet</div>}
            </div>
          </div>

          <div className={styles.gymCard}>
            <div className={styles.gymCardHeader}>
              <h3>🏋️ Sessions</h3>
              <button
                className={styles.addBtn}
                onClick={() => {
                  setShowAddSession(true);
                  setSessionForm({
                    date: getTodayBeirut(),
                    notes: "",
                  });
                }}
              >
                + Session
              </button>
            </div>

            {showAddSession && (
              <div className={styles.addForm}>
                <input
                  type="date"
                  value={sessionForm.date}
                  onChange={(e) => setSessionForm({ ...sessionForm, date: e.target.value })}
                  className={styles.formInput}
                />
                <input
                  type="text"
                  value={sessionForm.notes}
                  onChange={(e) => setSessionForm({ ...sessionForm, notes: e.target.value })}
                  placeholder="Notes (optional)"
                  className={styles.formInput}
                />
                <div className={styles.formActions}>
                  <button onClick={handleAddSession} className={styles.saveBtn}>
                    ✓
                  </button>
                  <button onClick={() => setShowAddSession(false)} className={styles.cancelBtn}>
                    ×
                  </button>
                </div>
              </div>
            )}

            <div className={styles.sessionsList}>
              {gymSessions.map((session) => (
                <div key={session.id} className={styles.sessionItem}>
                  <span className={styles.sessionDate}>{formatDate(session.date)}</span>
                  {session.notes && <span className={styles.sessionNotes}>{session.notes}</span>}
                  <button className={styles.deleteBtn} onClick={() => handleDeleteSession(session.id)}>
                    🗑️
                  </button>
                </div>
              ))}
              {gymSessions.length === 0 && <div className={styles.emptyState}>No sessions yet</div>}
            </div>
          </div>
        </section>
      )}

      <BottomNav active="lifestyle" />
    </div>
  );
}
