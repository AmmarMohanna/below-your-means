"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import styles from "./dashboard.module.css"

const CATEGORIES = [
  { id: 'food', name: 'Food & Coffee', icon: '☕' },
  { id: 'livelihood', name: 'Livelihood Monthly', icon: '🏠' },
  { id: 'family', name: 'Family', icon: '👨‍👩‍👧‍👦' },
  { id: 'shopping', name: 'Shopping', icon: '🛍️' },
  { id: 'utilities', name: 'Utilities', icon: '💡' },
  { id: 'healthcare', name: 'Healthcare', icon: '🏥' },
  { id: 'charity', name: 'Charity', icon: '❤️' },
  { id: 'unexpected', name: 'Unexpected', icon: '⚡' },
  { id: 'income', name: 'Income', icon: '💰' },
  { id: 'other', name: 'Other', icon: '📝' },
]

export default function Dashboard() {
  const [transactions, setTransactions] = useState([])
  const [monthTotal, setMonthTotal] = useState(0)
  const [todayTotal, setTodayTotal] = useState(0)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  // Form state
  const [category, setCategory] = useState('food')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchTransactions = useCallback(async () => {
    try {
      const response = await fetch("/api/transactions")
      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login")
          return
        }
        throw new Error("Failed to fetch")
      }
      const data = await response.json()
      setTransactions(data)
      calculateTotals(data, selectedDate)
    } catch (error) {
      console.error("Error:", error)
    } finally {
      setLoading(false)
    }
  }, [router, selectedDate])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  useEffect(() => {
    calculateTotals(transactions, selectedDate)
  }, [selectedDate, transactions])

  const calculateTotals = (data, date) => {
    const month = date.getMonth()
    const year = date.getFullYear()
    const dateStr = formatDate(date)

    const monthExpenses = data
      .filter(t => {
        const tDate = new Date(t.date)
        return tDate.getMonth() === month && tDate.getFullYear() === year && t.type === 'expense'
      })
      .reduce((sum, t) => sum + t.amount, 0)

    const todayExpenses = data
      .filter(t => t.date === dateStr && t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0)

    setMonthTotal(monthExpenses)
    setTodayTotal(todayExpenses)
  }

  const formatDate = (date) => {
    return date.toISOString().split('T')[0]
  }

  const formatDisplayDate = (date) => {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  }

  const formatMonth = (date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const isToday = (date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  const changeDay = (delta) => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + delta)
    setSelectedDate(newDate)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!amount || parseFloat(amount) <= 0) return

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(amount),
          category: CATEGORIES.find(c => c.id === category)?.name || category,
          type: category === 'income' ? 'income' : 'expense',
          notes: description,
          date: formatDate(selectedDate),
        }),
      })

      if (response.ok) {
        setAmount('')
        setDescription('')
        fetchTransactions()
      }
    } catch (error) {
      console.error("Error adding transaction:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      const response = await fetch(`/api/transactions/${id}`, { method: "DELETE" })
      if (response.ok) {
        fetchTransactions()
      }
    } catch (error) {
      console.error("Error deleting:", error)
    }
  }

  const todayTransactions = transactions.filter(t => t.date === formatDate(selectedDate))

  const getCategoryIcon = (categoryName) => {
    const cat = CATEGORIES.find(c => c.name === categoryName)
    return cat?.icon || '📝'
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
          <h1 className={styles.logo}>BelowYourMeans</h1>
          <button className={styles.menuBtn} onClick={() => router.push('/accounts')}>
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
        <div className={styles.monthInfo}>
          <span className={styles.monthTotal}>${monthTotal.toFixed(0)}</span>
          <span className={styles.monthName}>{formatMonth(selectedDate)}</span>
        </div>
      </header>

      {/* Quick Add Form */}
      <form onSubmit={handleSubmit} className={styles.addForm}>
        <div className={styles.categorySelect}>
          <select 
            value={category} 
            onChange={(e) => setCategory(e.target.value)}
            className={styles.select}
          >
            {CATEGORIES.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.icon} {cat.name}
              </option>
            ))}
          </select>
        </div>

        <input
          type="text"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={styles.descInput}
        />

        <div className={styles.amountRow}>
          <div className={styles.dateBtn}>
            <span className={styles.dateBtnLabel}>Date</span>
            <input
              type="date"
              value={formatDate(selectedDate)}
              max={formatDate(new Date())}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedDate(new Date(e.target.value + 'T12:00:00'))
                }
              }}
              className={styles.dateInput}
            />
          </div>

          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={styles.amountInput}
            step="0.01"
            min="0"
          />

          <span className={styles.currency}>USD</span>

          <button 
            type="submit" 
            className={styles.addBtn}
            disabled={isSubmitting || !amount}
          >
            +
          </button>
        </div>
      </form>

      {/* Today's Transactions */}
      <section className={styles.todaySection}>
        <div className={styles.todayHeader}>
          <div>
            <span className={styles.todayTotal}>${todayTotal.toFixed(0)}</span>
            <h2 className={styles.todayTitle}>
              {isToday(selectedDate) ? "Today's Expenses" : "Expenses"}
            </h2>
            <span className={styles.todayDate}>{formatDisplayDate(selectedDate)}</span>
          </div>
          <div className={styles.dayNav}>
            <button onClick={() => changeDay(-1)} className={styles.navBtn}>◀</button>
            <button onClick={() => changeDay(1)} className={styles.navBtn}>▶</button>
          </div>
        </div>

        <div className={styles.transactionList}>
          {todayTransactions.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>📋</span>
              <p>No transactions for this day</p>
              <span className={styles.emptyHint}>Add your first expense above</span>
            </div>
          ) : (
            todayTransactions.map(t => (
              <div key={t.id} className={styles.transaction}>
                <span className={styles.transactionIcon}>{getCategoryIcon(t.category)}</span>
                <div className={styles.transactionInfo}>
                  <span className={styles.transactionNote}>{t.notes || t.category}</span>
                  <span className={styles.transactionCategory}>{t.category}</span>
                </div>
                <span className={`${styles.transactionAmount} ${t.type === 'income' ? styles.income : styles.expense}`}>
                  {t.type === 'income' ? '+' : '-'}${t.amount.toFixed(2)}
                </span>
                <button 
                  onClick={() => handleDelete(t.id)} 
                  className={styles.deleteBtn}
                  title="Delete"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Bottom Navigation */}
      <nav className={styles.bottomNav}>
        <button className={`${styles.navItem} ${styles.active}`}>
          <span className={styles.navIcon}>🏠</span>
          <span>Home</span>
        </button>
        <button className={styles.navItem} onClick={() => router.push('/accounts')}>
          <span className={styles.navIcon}>💰</span>
          <span>Accounts</span>
        </button>
        <button className={styles.navItem} onClick={() => router.push('/lifestyle')}>
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
