"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import styles from "./lifestyle.module.css"

const PRAYERS = [
  { id: 'soboh', name: 'صبح', nameEn: 'Soboh' },
  { id: 'dohor', name: 'ظهر', nameEn: 'Dohor' },
  { id: 'aaser', name: 'عصر', nameEn: 'Aaser' },
  { id: 'maghreb', name: 'مغرب', nameEn: 'Maghreb' },
  { id: 'ishaa', name: 'عشاء', nameEn: 'Ishaa' },
  { id: 'ayaat', name: 'آيات', nameEn: 'Ayaat' },
]

export default function Lifestyle() {
  const [activeTab, setActiveTab] = useState('gym')
  const [prayers, setPrayers] = useState({
    soboh: 0, dohor: 0, aaser: 0, maghreb: 0, ishaa: 0, ayaat: 0, fasting: 0
  })
  const [gymPayments, setGymPayments] = useState([])
  const [gymSessions, setGymSessions] = useState([])
  const [remainingSessions, setRemainingSessions] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [showAddSession, setShowAddSession] = useState(false)
  const [paymentForm, setPaymentForm] = useState({ date: '', sessions: '', notes: '' })
  const [sessionForm, setSessionForm] = useState({ date: '', notes: '' })
  const router = useRouter()

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch("/api/lifestyle")
      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login")
          return
        }
        throw new Error("Failed to fetch")
      }
      const result = await response.json()
      if (result.prayers) {
        setPrayers(result.prayers)
      }
      setGymPayments(result.gymPayments || [])
      setGymSessions(result.gymSessions || [])
      setRemainingSessions(result.remainingSessions || 0)
    } catch (error) {
      console.error("Error:", error)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handlePrayerChange = async (prayer, delta) => {
    // Optimistic update
    setPrayers(prev => ({
      ...prev,
      [prayer]: Math.max(0, prev[prayer] + delta)
    }))

    try {
      const response = await fetch("/api/lifestyle", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "prayer", prayer, delta }),
      })
      if (!response.ok) {
        // Revert on failure
        fetchData()
      }
    } catch (error) {
      console.error("Error:", error)
      fetchData()
    }
  }

  const handleAddPayment = async () => {
    if (!paymentForm.date || !paymentForm.sessions) return

    try {
      const response = await fetch("/api/lifestyle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "gymPayment",
          date: paymentForm.date,
          sessions: parseInt(paymentForm.sessions),
          notes: paymentForm.notes,
        }),
      })
      if (response.ok) {
        setPaymentForm({ date: '', sessions: '', notes: '' })
        setShowAddPayment(false)
        fetchData()
      }
    } catch (error) {
      console.error("Error:", error)
    }
  }

  const handleAddSession = async () => {
    if (!sessionForm.date) return

    try {
      const response = await fetch("/api/lifestyle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "gymSession",
          date: sessionForm.date,
          notes: sessionForm.notes,
        }),
      })
      if (response.ok) {
        setSessionForm({ date: '', notes: '' })
        setShowAddSession(false)
        fetchData()
      }
    } catch (error) {
      console.error("Error:", error)
    }
  }

  const handleQuickWorkout = async () => {
    try {
      const response = await fetch("/api/lifestyle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "gymSession",
          date: new Date().toISOString().split('T')[0],
          notes: "",
        }),
      })
      if (response.ok) {
        fetchData()
      }
    } catch (error) {
      console.error("Error:", error)
    }
  }

  const handleDeletePayment = async (id) => {
    try {
      const response = await fetch(`/api/lifestyle?type=gymPayment&id=${id}`, {
        method: "DELETE",
      })
      if (response.ok) {
        fetchData()
      }
    } catch (error) {
      console.error("Error:", error)
    }
  }

  const handleDeleteSession = async (id) => {
    try {
      const response = await fetch(`/api/lifestyle?type=gymSession&id=${id}`, {
        method: "DELETE",
      })
      if (response.ok) {
        fetchData()
      }
    } catch (error) {
      console.error("Error:", error)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr + 'T12:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }


  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.logo}>أُلفة</h1>
          <button className={styles.menuBtn} onClick={() => router.push('/analytics')}>
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'prayers' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('prayers')}
        >
          🕌 Prayers
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'gym' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('gym')}
        >
          💪 Exercise
        </button>
      </div>

      {/* Prayer Section */}
      {activeTab === 'prayers' && (
        <section className={styles.prayerSection}>
          {/* Inspirational Header */}
          <div className={styles.inspirationCard}>
            <div className={styles.dhikr}>
              <span className={styles.dhikrItem}>الله أكبر ×34</span>
              <span className={styles.dhikrDivider}>•</span>
              <span className={styles.dhikrItem}>الحمد لله ×33</span>
              <span className={styles.dhikrDivider}>•</span>
              <span className={styles.dhikrItem}>سبحان الله ×33</span>
            </div>
            <div className={styles.dailyReminders}>
              <div className={styles.reminder}>📖 صفحة قرآن يومياً، فقط</div>
              <div className={styles.reminder}>💝 صدقة كل يوم جمعة</div>
            </div>
          </div>

          {/* Missed Prayers Counter */}
          <div className={styles.missedHeader}>
            <span className={styles.missedLabel}>Missed Prayers</span>
            <span className={styles.missedNote}>10 years +</span>
          </div>

          <div className={styles.prayerGrid}>
            {PRAYERS.map(prayer => (
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
                  <span className={styles.prayerCount}>
                    {prayers[prayer.id]}
                  </span>
                  <button
                    className={styles.prayerBtn}
                    onClick={() => handlePrayerChange(prayer.id, 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Fasting Section */}
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
                  onClick={() => handlePrayerChange('fasting', -1)}
                  disabled={prayers.fasting === 0}
                >
                  −
                </button>
                <span className={styles.prayerCount}>
                  {prayers.fasting}
                </span>
                <button
                  className={styles.prayerBtn}
                  onClick={() => handlePrayerChange('fasting', 1)}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Gym Section */}
      {activeTab === 'gym' && (
        <section className={styles.gymSection}>
          {/* Sessions Summary */}
          <div className={styles.sessionsSummary}>
            <div className={styles.sessionsRemaining}>
              <span className={styles.sessionsNumber}>{remainingSessions}</span>
              <span className={styles.sessionsLabel}>Sessions Remaining</span>
            </div>
            <button 
              className={styles.quickWorkoutBtn}
              onClick={handleQuickWorkout}
            >
              💪 I Worked Out Today
            </button>
          </div>

          {/* Payments */}
          <div className={styles.gymCard}>
            <div className={styles.gymCardHeader}>
              <h3>💳 Payments</h3>
              <button 
                className={styles.addBtn}
                onClick={() => {
                  setShowAddPayment(true)
                  setPaymentForm({ 
                    date: new Date().toISOString().split('T')[0], 
                    sessions: '', 
                    notes: '' 
                  })
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
                  <button onClick={handleAddPayment} className={styles.saveBtn}>✓</button>
                  <button onClick={() => setShowAddPayment(false)} className={styles.cancelBtn}>×</button>
                </div>
              </div>
            )}

            <div className={styles.paymentsList}>
              {gymPayments.map(payment => (
                <div key={payment.id} className={styles.paymentItem}>
                  <span className={styles.paymentDate}>{formatDate(payment.date)}</span>
                  <span className={styles.paymentSessions}>×{payment.sessions}</span>
                  {payment.notes && <span className={styles.paymentNotes}>{payment.notes}</span>}
                  <button 
                    className={styles.deleteBtn}
                    onClick={() => handleDeletePayment(payment.id)}
                  >
                    🗑️
                  </button>
                </div>
              ))}
              {gymPayments.length === 0 && (
                <div className={styles.emptyState}>No payments yet</div>
              )}
            </div>
          </div>

          {/* Sessions */}
          <div className={styles.gymCard}>
            <div className={styles.gymCardHeader}>
              <h3>🏋️ Sessions</h3>
              <button 
                className={styles.addBtn}
                onClick={() => {
                  setShowAddSession(true)
                  setSessionForm({ 
                    date: new Date().toISOString().split('T')[0], 
                    notes: '' 
                  })
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
                  <button onClick={handleAddSession} className={styles.saveBtn}>✓</button>
                  <button onClick={() => setShowAddSession(false)} className={styles.cancelBtn}>×</button>
                </div>
              </div>
            )}

            <div className={styles.sessionsList}>
              {gymSessions.map(session => (
                <div key={session.id} className={styles.sessionItem}>
                  <span className={styles.sessionDate}>{formatDate(session.date)}</span>
                  {session.notes && <span className={styles.sessionNotes}>{session.notes}</span>}
                  <button 
                    className={styles.deleteBtn}
                    onClick={() => handleDeleteSession(session.id)}
                  >
                    🗑️
                  </button>
                </div>
              ))}
              {gymSessions.length === 0 && (
                <div className={styles.emptyState}>No sessions yet</div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Bottom Navigation */}
      <nav className={styles.bottomNav}>
        <button className={styles.navItem} onClick={() => router.push('/dashboard')}>
          <span className={styles.navIcon}>🏠</span>
          <span>Home</span>
        </button>
        <button className={styles.navItem} onClick={() => router.push('/accounts')}>
          <span className={styles.navIcon}>💰</span>
          <span>Accounts</span>
        </button>
        <button className={`${styles.navItem} ${styles.active}`}>
          <span className={styles.navIcon}>🌙</span>
          <span>Lifestyle</span>
        </button>
        <button className={styles.navItem} onClick={() => router.push('/analytics')}>
          <span className={styles.navIcon}>📊</span>
          <span>Analytics</span>
        </button>
        <button className={styles.navItem} onClick={() => router.push('/settings')}>
          <span className={styles.navIcon}>⚙️</span>
          <span>Settings</span>
        </button>
      </nav>
    </div>
  )
}

