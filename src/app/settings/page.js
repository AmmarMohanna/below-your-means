"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import * as XLSX from "xlsx"
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
      // Fetch all data
      const [transactionsRes, accountsRes, metalsRes, lifestyleRes] = await Promise.all([
        fetch("/api/transactions"),
        fetch("/api/accounts"),
        fetch("/api/metals"),
        fetch("/api/lifestyle")
      ])
      
      if (!transactionsRes.ok) throw new Error("Failed to fetch transactions")
      
      const transactions = await transactionsRes.json()
      const accounts = accountsRes.ok ? await accountsRes.json() : {}
      const metals = metalsRes.ok ? await metalsRes.json() : {}
      const lifestyle = lifestyleRes.ok ? await lifestyleRes.json() : {}
      
      // Create workbook
      const wb = XLSX.utils.book_new()
      
      // Sheet 1: Transactions (Expenses & Income)
      const transactionsData = [
        ["Date", "Category", "Type", "Amount", "Notes"],
        ...transactions.map(t => [t.date, t.category, t.type, t.amount, t.notes || ""])
      ]
      const wsTransactions = XLSX.utils.aoa_to_sheet(transactionsData)
      XLSX.utils.book_append_sheet(wb, wsTransactions, "Transactions")
      
      // Sheet 2: Current Money
      if (accounts.currentMoney?.length > 0) {
        const currentMoneyData = [
          ["Location", "Amount", "Notes"],
          ...accounts.currentMoney.map(m => [m.location, m.amount, m.notes || ""])
        ]
        const wsCurrent = XLSX.utils.aoa_to_sheet(currentMoneyData)
        XLSX.utils.book_append_sheet(wb, wsCurrent, "Current Money")
      }
      
      // Sheet 3: Expected Money
      if (accounts.expectedMoney?.length > 0) {
        const expectedData = [
          ["Source", "Expected Date", "Amount", "Notes"],
          ...accounts.expectedMoney.map(m => [m.source, m.expected_date, m.amount, m.notes || ""])
        ]
        const wsExpected = XLSX.utils.aoa_to_sheet(expectedData)
        XLSX.utils.book_append_sheet(wb, wsExpected, "Expected Money")
      }
      
      // Sheet 4: Payables
      if (accounts.payables?.length > 0) {
        const payablesData = [
          ["Pay To", "Due Date", "Amount", "Notes"],
          ...accounts.payables.map(p => [p.source, p.pay_date, p.amount, p.notes || ""])
        ]
        const wsPayables = XLSX.utils.aoa_to_sheet(payablesData)
        XLSX.utils.book_append_sheet(wb, wsPayables, "Payables")
      }
      
      // Sheet 5: Recurring
      if (accounts.recurring?.length > 0) {
        const recurringData = [
          ["Target", "Type", "Amount"],
          ...accounts.recurring.map(r => [r.target, r.type, r.amount])
        ]
        const wsRecurring = XLSX.utils.aoa_to_sheet(recurringData)
        XLSX.utils.book_append_sheet(wb, wsRecurring, "Recurring Monthly")
      }
      
      // Sheet 6: Held Money
      if (accounts.heldMoney?.length > 0) {
        const heldData = [
          ["For Person", "Amount", "Notes"],
          ...accounts.heldMoney.map(h => [h.person, h.amount, h.notes || ""])
        ]
        const wsHeld = XLSX.utils.aoa_to_sheet(heldData)
        XLSX.utils.book_append_sheet(wb, wsHeld, "Held Money")
      }
      
      // Sheet 7: Metals
      if (metals.holdings) {
        const metalsData = [
          ["Metal", "Quantity", "Unit", "Price Per Unit", "Total Value"],
          ["Gold 24K", metals.holdings.gold_24k_grams, "grams", `$${metals.prices?.gold_24k_per_gram?.toFixed(2) || 0}`, `$${metals.values?.gold_24k?.toFixed(2) || 0}`],
          ["Gold 21K", metals.holdings.gold_21k_grams, "grams", `$${metals.prices?.gold_21k_per_gram?.toFixed(2) || 0}`, `$${metals.values?.gold_21k?.toFixed(2) || 0}`],
          ["Silver", metals.holdings.silver_kg, "kg", `$${metals.prices?.silver_per_kg?.toFixed(2) || 0}`, `$${metals.values?.silver?.toFixed(2) || 0}`],
          [],
          ["Total Metal Value", "", "", "", `$${metals.values?.total?.toFixed(2) || 0}`]
        ]
        const wsMetals = XLSX.utils.aoa_to_sheet(metalsData)
        XLSX.utils.book_append_sheet(wb, wsMetals, "Metals")
      }
      
      // Sheet 8: Prayers
      if (lifestyle.prayers) {
        const prayersData = [
          ["Prayer", "Missed Count"],
          ["Soboh (صبح)", lifestyle.prayers.soboh || 0],
          ["Dohor (ظهر)", lifestyle.prayers.dohor || 0],
          ["Aaser (عصر)", lifestyle.prayers.aaser || 0],
          ["Maghreb (مغرب)", lifestyle.prayers.maghreb || 0],
          ["Ishaa (عشاء)", lifestyle.prayers.ishaa || 0],
          ["Ayaat (آيات)", lifestyle.prayers.ayaat || 0],
          [],
          ["Fasting (صيام)", lifestyle.prayers.fasting || 0]
        ]
        const wsPrayers = XLSX.utils.aoa_to_sheet(prayersData)
        XLSX.utils.book_append_sheet(wb, wsPrayers, "Prayers")
      }
      
      // Sheet 9: Gym Payments
      if (lifestyle.gymPayments?.length > 0) {
        const gymPaymentsData = [
          ["Date", "Sessions", "Notes"],
          ...lifestyle.gymPayments.map(p => [p.date, p.sessions, p.notes || ""])
        ]
        const wsGymPayments = XLSX.utils.aoa_to_sheet(gymPaymentsData)
        XLSX.utils.book_append_sheet(wb, wsGymPayments, "Gym Payments")
      }
      
      // Sheet 10: Gym Sessions
      if (lifestyle.gymSessions?.length > 0) {
        const gymSessionsData = [
          ["Date", "Notes"],
          ...lifestyle.gymSessions.map(s => [s.date, s.notes || ""])
        ]
        const wsGymSessions = XLSX.utils.aoa_to_sheet(gymSessionsData)
        XLSX.utils.book_append_sheet(wb, wsGymSessions, "Gym Sessions")
      }
      
      // Download the file
      XLSX.writeFile(wb, `belowyourmeans-export-${new Date().toISOString().split('T')[0]}.xlsx`)
      
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
              <span className={styles.menuSubtitle}>Download as Excel</span>
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
        <button className={styles.navItem} onClick={() => router.push('/lifestyle')}>
          <span className={styles.navIcon}>🌙</span>
          <span>Lifestyle</span>
        </button>
        <button className={styles.navItem} onClick={() => router.push('/analytics')}>
          <span className={styles.navIcon}>📊</span>
          <span>Analytics</span>
        </button>
      </nav>
    </div>
  )
}

