"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import styles from "./analytics.module.css"

export default function Analytics() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('month')
  const router = useRouter()

  const [dateRange, setDateRange] = useState(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { start, end }
  })

  useEffect(() => {
    fetchTransactions()
  }, [])

  const fetchTransactions = async () => {
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
    } catch (error) {
      console.error("Error:", error)
    } finally {
      setLoading(false)
    }
  }

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod)
    if (newPeriod === 'custom') return // Don't change dates for custom
    
    const now = new Date()
    let start, end

    switch (newPeriod) {
      case 'week':
        start = new Date(now)
        start.setDate(now.getDate() - now.getDay())
        end = new Date(start)
        end.setDate(start.getDate() + 6)
        break
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1)
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        break
      case 'year':
        start = new Date(now.getFullYear(), 0, 1)
        end = new Date(now.getFullYear(), 11, 31)
        break
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1)
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    }
    setDateRange({ start, end })
  }

  const handleStartDateChange = (e) => {
    const newStart = new Date(e.target.value + 'T00:00:00')
    setDateRange(prev => ({ ...prev, start: newStart }))
    setPeriod('custom')
  }

  const handleEndDateChange = (e) => {
    const newEnd = new Date(e.target.value + 'T23:59:59')
    setDateRange(prev => ({ ...prev, end: newEnd }))
    setPeriod('custom')
  }

  const formatDate = (date) => date.toISOString().split('T')[0]
  
  const formatDisplayDate = (date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const filteredTransactions = transactions.filter(t => {
    const tDate = new Date(t.date)
    return tDate >= dateRange.start && tDate <= dateRange.end
  })

  const totalIncome = filteredTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)

  const totalExpenses = filteredTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)

  const netTotal = totalIncome - totalExpenses

  const daysInPeriod = Math.ceil((dateRange.end - dateRange.start) / (1000 * 60 * 60 * 24)) + 1
  const avgDailyExpense = totalExpenses / daysInPeriod
  const avgDailyIncome = totalIncome / daysInPeriod

  // Category breakdown
  const categoryTotals = filteredTransactions
    .filter(t => t.type === 'expense')
    .reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount
      return acc
    }, {})

  const sortedCategories = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])

  // Largest expenses
  const largestExpenses = filteredTransactions
    .filter(t => t.type === 'expense')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)

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
        <h1 className={styles.title}>Analytics</h1>
        <button className={styles.menuBtn} onClick={() => router.push('/settings')}>
          <span></span>
          <span></span>
          <span></span>
        </button>
      </header>

      {/* Period Selector */}
      <div className={styles.periodSelector}>
        <select 
          value={period} 
          onChange={(e) => handlePeriodChange(e.target.value)}
          className={styles.periodSelect}
        >
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
          <option value="custom">Custom Range</option>
        </select>
      </div>

      {/* Date Range Picker */}
      <div className={styles.dateRange}>
        <div className={styles.datePickerGroup}>
          <label className={styles.dateLabel}>From</label>
          <input
            type="date"
            value={formatDate(dateRange.start)}
            onChange={handleStartDateChange}
            className={styles.datePicker}
          />
        </div>
        <span className={styles.dateArrow}>→</span>
        <div className={styles.datePickerGroup}>
          <label className={styles.dateLabel}>To</label>
          <input
            type="date"
            value={formatDate(dateRange.end)}
            onChange={handleEndDateChange}
            className={styles.datePicker}
          />
        </div>
      </div>

      {/* Summary Cards */}
      <section className={styles.summary}>
        <h2 className={styles.sectionTitle}>Summary</h2>
        <div className={styles.summaryCards}>
          <div className={`${styles.summaryCard} ${styles.incomeCard}`}>
            <span className={styles.cardIcon}>📈</span>
            <span className={styles.cardLabel}>Total Income</span>
            <span className={styles.cardValue}>${totalIncome.toFixed(2)}</span>
          </div>
          <div className={`${styles.summaryCard} ${styles.expenseCard}`}>
            <span className={styles.cardIcon}>📉</span>
            <span className={styles.cardLabel}>Total Expenses</span>
            <span className={styles.cardValue}>${totalExpenses.toFixed(2)}</span>
          </div>
        </div>

        <div className={styles.netSection}>
          <div className={styles.netRow}>
            <span>Net Total</span>
            <span className={netTotal >= 0 ? styles.positive : styles.negative}>
              {netTotal >= 0 ? '+' : ''}${netTotal.toFixed(2)}
            </span>
          </div>
          <div className={styles.netRow}>
            <span>Avg. Daily Expense</span>
            <span>${avgDailyExpense.toFixed(2)}</span>
          </div>
          <div className={styles.netRow}>
            <span>Avg. Daily Income</span>
            <span>${avgDailyIncome.toFixed(2)}</span>
          </div>
        </div>
      </section>

      {/* Spending by Category */}
      <section className={styles.categorySection}>
        <h2 className={styles.sectionTitle}>Spending by Category</h2>
        <div className={styles.categoryList}>
          {sortedCategories.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>📊</span>
              <p>No expenses in this period</p>
            </div>
          ) : (
            sortedCategories.map(([category, amount]) => (
              <div key={category} className={styles.categoryItem}>
                <div className={styles.categoryInfo}>
                  <span className={styles.categoryName}>{category}</span>
                  <div className={styles.categoryBar}>
                    <div 
                      className={styles.categoryFill}
                      style={{ width: `${(amount / totalExpenses) * 100}%` }}
                    ></div>
                  </div>
                </div>
                <span className={styles.categoryAmount}>${amount.toFixed(2)}</span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Largest Expenses */}
      <section className={styles.largestSection}>
        <h2 className={styles.sectionTitle}>Largest Expenses</h2>
        <div className={styles.largestList}>
          {largestExpenses.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>💸</span>
              <p>No expenses in this period</p>
            </div>
          ) : (
            largestExpenses.map(t => (
              <div key={t.id} className={styles.largestItem}>
                <div className={styles.largestInfo}>
                  <span className={styles.largestCategory}>{t.category}</span>
                  <span className={styles.largestDate}>{t.date}</span>
                </div>
                <span className={styles.largestAmount}>${t.amount.toFixed(2)}</span>
              </div>
            ))
          )}
        </div>
      </section>

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
        <button className={styles.navItem} onClick={() => router.push('/lifestyle')}>
          <span className={styles.navIcon}>🌙</span>
          <span>Lifestyle</span>
        </button>
        <button className={`${styles.navItem} ${styles.active}`}>
          <span className={styles.navIcon}>📊</span>
          <span>Analytics</span>
        </button>
      </nav>
    </div>
  )
}

