"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

import BottomNav from "@/components/BottomNav";
import AppHeader from "@/components/AppHeader";
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
  const [gymSessions, setGymSessions] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddSession, setShowAddSession] = useState(false);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [editingReminderId, setEditingReminderId] = useState(null);
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
      setGymSessions(result.gymSessions || []);
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

  const today = getTodayBeirut();
  const trainingDates = new Set(gymSessions.map((session) => session.date));
  const trainedToday = trainingDates.has(today);
  const [currentYear, currentMonth, currentDay] = today.split("-").map(Number);
  const lastMonthStartDate = new Date(Date.UTC(currentYear, currentMonth - 2, 1));
  const lastMonthEndDate = new Date(Date.UTC(currentYear, currentMonth - 1, 0));
  const lastMonthStart = lastMonthStartDate.toISOString().slice(0, 10);
  const lastMonthEnd = lastMonthEndDate.toISOString().slice(0, 10);
  const lastMonthTrainingDays = [...trainingDates].filter(
    (date) => date >= lastMonthStart && date <= lastMonthEnd
  ).length;
  const lastMonthWeeklyAverage = (lastMonthTrainingDays * 7) / lastMonthEndDate.getUTCDate();
  const yearStart = `${currentYear}-01-01`;
  const thisYearTrainingDays = [...trainingDates].filter(
    (date) => date >= yearStart && date <= today
  ).length;
  const elapsedYearDays = Math.floor(
    (Date.UTC(currentYear, currentMonth - 1, currentDay) - Date.UTC(currentYear, 0, 1)) /
      (1000 * 60 * 60 * 24)
  ) + 1;
  const thisYearWeeklyAverage = (thisYearTrainingDays * 7) / elapsedYearDays;
  const formatWeeklyAverage = (average) => average.toFixed(1);
  const todayDate = new Date(`${today}T12:00:00`);
  const mondayOffset = (todayDate.getDay() + 6) % 7;
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(todayDate);
    date.setDate(todayDate.getDate() - mondayOffset + index);
    const dateKey = date.toLocaleDateString("en-CA");
    return {
      date: dateKey,
      label: date.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2),
      day: date.getDate(),
      trained: trainingDates.has(dateKey),
      isToday: dateKey === today,
    };
  });

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <AppHeader title="Life"><p className={styles.logo} lang="ar">أُلفة</p></AppHeader>

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
            <div className={styles.trainingOverview}>
              <div className={styles.trainingStat}>
                <span className={styles.sessionsNumber}>{formatWeeklyAverage(lastMonthWeeklyAverage)}</span>
                <span className={styles.sessionsLabel}>Days/week last month</span>
              </div>
              <div className={styles.trainingDivider} />
              <div className={styles.trainingStat}>
                <span className={styles.sessionsNumber}>{formatWeeklyAverage(thisYearWeeklyAverage)}</span>
                <span className={styles.sessionsLabel}>Days/week this year</span>
              </div>
            </div>
            <div className={styles.weekStrip} aria-label="Training days this week">
              {weekDays.map((day) => (
                <div
                  key={day.date}
                  className={`${styles.weekDay} ${day.trained ? styles.trainedDay : ""} ${day.isToday ? styles.today : ""}`}
                  title={`${day.date}${day.trained ? " — trained" : ""}`}
                >
                  <span>{day.label}</span>
                  <strong>{day.day}</strong>
                  <i aria-hidden="true">{day.trained ? "✓" : ""}</i>
                </div>
              ))}
            </div>
            <button
              className={styles.quickWorkoutBtn}
              onClick={handleQuickWorkout}
              disabled={trainedToday}
            >
              {trainedToday ? "✓ Training logged today" : "+ Log today’s training"}
            </button>
          </div>

          <div className={styles.gymCard}>
            <div className={styles.gymCardHeader}>
              <h3>Training days</h3>
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
                + Add day
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
              {gymSessions.length === 0 && (
                <div className={styles.emptyState}>No training days yet. Log your first workout above.</div>
              )}
            </div>
          </div>
        </section>
      )}

      <BottomNav active="lifestyle" />
    </div>
  );
}
