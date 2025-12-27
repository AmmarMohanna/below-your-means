"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import styles from "./settings.module.css"

const DEFAULT_CATEGORIES = [
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

export default function Settings() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleExportData = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/transactions")
      if (!response.ok) throw new Error("Failed to fetch")
      
      const transactions = await response.json()
      
      const csv = [
        ["Date", "Category", "Type", "Amount", "Notes"],
        ...transactions.map(t => [t.date, t.category, t.type, t.amount, t.notes || ""])
      ].map(row => row.join(",")).join("\n")
      
      const blob = new Blob([csv], { type: "text/csv" })
      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = `belowyourmeans-export-${new Date().toISOString().split('T')[0]}.csv`
      link.click()
    } catch (error) {
      console.error("Export error:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/login')
      router.refresh()
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
        <button className={styles.menuBtn} onClick={() => router.push('/dashboard')}>
          <span></span>
          <span></span>
          <span></span>
        </button>
      </header>

      {/* Categories Section */}
      <section className={styles.section}>
        <span className={styles.sectionLabel}>CATEGORIES</span>
        
        <div className={styles.card}>
          {DEFAULT_CATEGORIES.map(cat => (
            <div key={cat.id} className={styles.categoryItem}>
              <span className={styles.categoryIcon}>{cat.icon}</span>
              <span className={styles.categoryName}>{cat.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Data Section */}
      <section className={styles.section}>
        <span className={styles.sectionLabel}>DATA</span>
        
        <div className={styles.card}>
          <button className={styles.menuItem} onClick={handleExportData} disabled={loading}>
            <span className={styles.menuIcon}>📥</span>
            <div className={styles.menuInfo}>
              <span className={styles.menuTitle}>Export Data</span>
              <span className={styles.menuSubtitle}>Download as CSV</span>
            </div>
            <span className={styles.menuArrow}>›</span>
          </button>
        </div>
      </section>

      {/* Account Section */}
      <section className={styles.section}>
        <span className={styles.sectionLabel}>ACCOUNT</span>
        
        <div className={styles.card}>
          <button className={styles.menuItem} onClick={handleLogout}>
            <span className={styles.menuIconDanger}>🚪</span>
            <div className={styles.menuInfo}>
              <span className={styles.menuTitleDanger}>Log Out</span>
            </div>
            <span className={styles.menuArrow}>›</span>
          </button>
        </div>
      </section>

      {/* App Info */}
      <div className={styles.appInfo}>
        <span className={styles.appName}>BelowYourMeans v1.0</span>
        <span className={styles.appTagline}>Made by Ammar</span>
      </div>

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
        <button className={styles.navItem} onClick={() => router.push('/analytics')}>
          <span className={styles.navIcon}>📊</span>
          <span>Analytics</span>
        </button>
        <button className={`${styles.navItem} ${styles.active}`}>
          <span className={styles.navIcon}>⚙️</span>
          <span>Settings</span>
        </button>
      </nav>
    </div>
  )
}

