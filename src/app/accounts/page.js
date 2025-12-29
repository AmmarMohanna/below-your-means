"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import styles from "./accounts.module.css"

const TABS = [
  { id: 'current', name: 'Current Money', icon: '💵', color: '#10b981' },
  { id: 'metals', name: 'Metals', icon: '🪙', color: '#eab308' },
  { id: 'expected', name: 'Expected', icon: '📥', color: '#3b82f6' },
  { id: 'payables', name: 'To Pay', icon: '📤', color: '#ef4444' },
  { id: 'recurring', name: 'Monthly', icon: '🔄', color: '#8b5cf6' },
  { id: 'held', name: 'Held', icon: '🤝', color: '#f59e0b' },
]

const RECURRING_TYPES = ['Family', 'Home', 'Personal']

export default function Accounts() {
  const [activeTab, setActiveTab] = useState('current')
  const [data, setData] = useState({
    currentMoney: [],
    expectedMoney: [],
    payables: [],
    recurring: [],
    heldMoney: [],
  })
  const [metals, setMetals] = useState({
    holdings: { gold_24k_grams: 0, gold_21k_grams: 0, silver_kg: 0 },
    prices: { gold_24k_per_gram: 0, gold_21k_per_gram: 0, silver_per_kg: 0 },
    values: { gold_24k: 0, gold_21k: 0, silver: 0, total: 0 }
  })
  const [metalsEditing, setMetalsEditing] = useState(false)
  const [metalsForm, setMetalsForm] = useState({ gold_24k_grams: 0, gold_21k_grams: 0, silver_kg: 0 })
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const router = useRouter()

  // Form state
  const [formData, setFormData] = useState({})

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch("/api/accounts")
      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login")
          return
        }
        throw new Error("Failed to fetch")
      }
      const result = await response.json()
      setData(result)
    } catch (error) {
      console.error("Error:", error)
    } finally {
      setLoading(false)
    }
  }, [router])

  const fetchMetals = useCallback(async () => {
    try {
      const response = await fetch("/api/metals")
      if (response.ok) {
        const result = await response.json()
        setMetals(result)
        setMetalsForm(result.holdings)
      }
    } catch (error) {
      console.error("Error fetching metals:", error)
    }
  }, [])

  useEffect(() => {
    fetchData()
    fetchMetals()
  }, [fetchData, fetchMetals])

  const getTableName = (tabId) => {
    switch (tabId) {
      case 'current': return 'currentMoney'
      case 'expected': return 'expectedMoney'
      case 'payables': return 'payables'
      case 'recurring': return 'recurring'
      case 'held': return 'heldMoney'
      default: return 'currentMoney'
    }
  }

  const handleAdd = async () => {
    const table = getTableName(activeTab)
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, ...formData }),
      })
      if (response.ok) {
        setFormData({})
        setShowAddForm(false)
        fetchData()
      }
    } catch (error) {
      console.error("Error adding:", error)
    }
  }

  const handleUpdate = async (id) => {
    const table = getTableName(activeTab)
    try {
      const response = await fetch("/api/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, id, ...formData }),
      })
      if (response.ok) {
        setEditingId(null)
        setFormData({})
        fetchData()
      }
    } catch (error) {
      console.error("Error updating:", error)
    }
  }

  const handleDelete = async (id) => {
    const table = getTableName(activeTab)
    try {
      const response = await fetch(`/api/accounts?table=${table}&id=${id}`, {
        method: "DELETE",
      })
      if (response.ok) {
        fetchData()
      }
    } catch (error) {
      console.error("Error deleting:", error)
    }
  }

  const startEdit = (item) => {
    setEditingId(item.id)
    setFormData({ ...item })
    setShowAddForm(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setFormData({})
  }

  const startAdd = () => {
    setShowAddForm(true)
    setEditingId(null)
    // Set default values based on active tab
    if (activeTab === 'recurring') {
      setFormData({ target: '', type: 'Personal', amount: '' })
    } else if (activeTab === 'current') {
      setFormData({ location: '', amount: '', notes: '' })
    } else if (activeTab === 'expected') {
      setFormData({ source: '', expected_date: new Date().toISOString().split('T')[0], amount: '', notes: '' })
    } else if (activeTab === 'payables') {
      setFormData({ source: '', pay_date: new Date().toISOString().split('T')[0], amount: '', notes: '' })
    } else if (activeTab === 'held') {
      setFormData({ person: '', amount: '', notes: '' })
    }
  }

  const cancelAdd = () => {
    setShowAddForm(false)
    setFormData({})
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr + 'T12:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const handleMetalsUpdate = async () => {
    try {
      const response = await fetch("/api/metals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metalsForm),
      })
      if (response.ok) {
        setMetalsEditing(false)
        fetchMetals()
      }
    } catch (error) {
      console.error("Error updating metals:", error)
    }
  }

  const calculateTotal = (items) => {
    return items.reduce((sum, item) => sum + (item.amount || 0), 0)
  }

  const getRecurringByType = (type) => {
    return data.recurring.filter(r => r.type === type)
  }

  const renderCurrentMoneyTable = () => {
    const items = data.currentMoney
    return (
      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <div className={styles.colLocation}>Where</div>
          <div className={styles.colAmount}>Amount</div>
          <div className={styles.colNotes}>Notes</div>
          <div className={styles.colActions}></div>
        </div>
        {items.map(item => (
          editingId === item.id ? (
            <div key={item.id} className={styles.editRow}>
              <input
                type="text"
                value={formData.location || ''}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Location"
                className={styles.editInput}
              />
              <input
                type="number"
                value={formData.amount || ''}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                placeholder="Amount"
                className={styles.editInput}
              />
              <input
                type="text"
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notes"
                className={styles.editInput}
              />
              <div className={styles.editActions}>
                <button onClick={() => handleUpdate(item.id)} className={styles.saveBtn}>✓</button>
                <button onClick={cancelEdit} className={styles.cancelBtn}>×</button>
              </div>
            </div>
          ) : (
            <div key={item.id} className={styles.tableRow}>
              <div className={styles.colLocation}>{item.location}</div>
              <div className={styles.colAmount}>${item.amount?.toLocaleString()}</div>
              <div className={styles.colNotes}>{item.notes || '—'}</div>
              <div className={styles.colActions}>
                <button onClick={() => startEdit(item)} className={styles.editBtn}>✏️</button>
                <button onClick={() => handleDelete(item.id)} className={styles.deleteBtn}>🗑️</button>
              </div>
            </div>
          )
        ))}
        {showAddForm && (
          <div className={styles.addRow}>
            <input
              type="text"
              value={formData.location || ''}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="Where is the money?"
              className={styles.editInput}
              autoFocus
            />
            <input
              type="number"
              value={formData.amount || ''}
              onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
              placeholder="Amount"
              className={styles.editInput}
            />
            <input
              type="text"
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notes (optional)"
              className={styles.editInput}
            />
            <div className={styles.editActions}>
              <button onClick={handleAdd} className={styles.saveBtn}>✓</button>
              <button onClick={cancelAdd} className={styles.cancelBtn}>×</button>
            </div>
          </div>
        )}
        <div className={styles.totalRow}>
          <div className={styles.totalLabel}>Total</div>
          <div className={styles.totalAmount}>${calculateTotal(items).toLocaleString()}</div>
        </div>
      </div>
    )
  }

  const renderExpectedMoneyTable = () => {
    const items = data.expectedMoney
    return (
      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <div className={styles.colSource}>Source</div>
          <div className={styles.colDate}>Expected</div>
          <div className={styles.colAmount}>Amount</div>
          <div className={styles.colNotes}>Notes</div>
          <div className={styles.colActions}></div>
        </div>
        {items.map(item => (
          editingId === item.id ? (
            <div key={item.id} className={styles.editRow}>
              <input
                type="text"
                value={formData.source || ''}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                placeholder="Source"
                className={styles.editInput}
              />
              <input
                type="date"
                value={formData.expected_date || ''}
                onChange={(e) => setFormData({ ...formData, expected_date: e.target.value })}
                className={styles.editInput}
              />
              <input
                type="number"
                value={formData.amount || ''}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                placeholder="Amount"
                className={styles.editInput}
              />
              <input
                type="text"
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notes"
                className={styles.editInput}
              />
              <div className={styles.editActions}>
                <button onClick={() => handleUpdate(item.id)} className={styles.saveBtn}>✓</button>
                <button onClick={cancelEdit} className={styles.cancelBtn}>×</button>
              </div>
            </div>
          ) : (
            <div key={item.id} className={styles.tableRow}>
              <div className={styles.colSource}>{item.source}</div>
              <div className={styles.colDate}>{formatDate(item.expected_date)}</div>
              <div className={styles.colAmount}>${item.amount?.toLocaleString()}</div>
              <div className={styles.colNotes}>{item.notes || '—'}</div>
              <div className={styles.colActions}>
                <button onClick={() => startEdit(item)} className={styles.editBtn}>✏️</button>
                <button onClick={() => handleDelete(item.id)} className={styles.deleteBtn}>🗑️</button>
              </div>
            </div>
          )
        ))}
        {showAddForm && (
          <div className={styles.addRow}>
            <input
              type="text"
              value={formData.source || ''}
              onChange={(e) => setFormData({ ...formData, source: e.target.value })}
              placeholder="Who's paying you?"
              className={styles.editInput}
              autoFocus
            />
            <input
              type="date"
              value={formData.expected_date || ''}
              onChange={(e) => setFormData({ ...formData, expected_date: e.target.value })}
              className={styles.editInput}
            />
            <input
              type="number"
              value={formData.amount || ''}
              onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
              placeholder="Amount"
              className={styles.editInput}
            />
            <input
              type="text"
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notes (optional)"
              className={styles.editInput}
            />
            <div className={styles.editActions}>
              <button onClick={handleAdd} className={styles.saveBtn}>✓</button>
              <button onClick={cancelAdd} className={styles.cancelBtn}>×</button>
            </div>
          </div>
        )}
        <div className={styles.totalRow}>
          <div className={styles.totalLabel}>Total Expected</div>
          <div className={styles.totalAmount}>${calculateTotal(items).toLocaleString()}</div>
        </div>
      </div>
    )
  }

  const renderPayablesTable = () => {
    const items = data.payables
    return (
      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <div className={styles.colSource}>Pay To</div>
          <div className={styles.colDate}>Due</div>
          <div className={styles.colAmount}>Amount</div>
          <div className={styles.colNotes}>Notes</div>
          <div className={styles.colActions}></div>
        </div>
        {items.map(item => (
          editingId === item.id ? (
            <div key={item.id} className={styles.editRow}>
              <input
                type="text"
                value={formData.source || ''}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                placeholder="Pay to"
                className={styles.editInput}
              />
              <input
                type="date"
                value={formData.pay_date || ''}
                onChange={(e) => setFormData({ ...formData, pay_date: e.target.value })}
                className={styles.editInput}
              />
              <input
                type="number"
                value={formData.amount || ''}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                placeholder="Amount"
                className={styles.editInput}
              />
              <input
                type="text"
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notes"
                className={styles.editInput}
              />
              <div className={styles.editActions}>
                <button onClick={() => handleUpdate(item.id)} className={styles.saveBtn}>✓</button>
                <button onClick={cancelEdit} className={styles.cancelBtn}>×</button>
              </div>
            </div>
          ) : (
            <div key={item.id} className={styles.tableRow}>
              <div className={styles.colSource}>{item.source}</div>
              <div className={styles.colDate}>{formatDate(item.pay_date)}</div>
              <div className={styles.colAmount}>${item.amount?.toLocaleString()}</div>
              <div className={styles.colNotes}>{item.notes || '—'}</div>
              <div className={styles.colActions}>
                <button onClick={() => startEdit(item)} className={styles.editBtn}>✏️</button>
                <button onClick={() => handleDelete(item.id)} className={styles.deleteBtn}>🗑️</button>
              </div>
            </div>
          )
        ))}
        {showAddForm && (
          <div className={styles.addRow}>
            <input
              type="text"
              value={formData.source || ''}
              onChange={(e) => setFormData({ ...formData, source: e.target.value })}
              placeholder="Who to pay?"
              className={styles.editInput}
              autoFocus
            />
            <input
              type="date"
              value={formData.pay_date || ''}
              onChange={(e) => setFormData({ ...formData, pay_date: e.target.value })}
              className={styles.editInput}
            />
            <input
              type="number"
              value={formData.amount || ''}
              onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
              placeholder="Amount"
              className={styles.editInput}
            />
            <input
              type="text"
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notes (optional)"
              className={styles.editInput}
            />
            <div className={styles.editActions}>
              <button onClick={handleAdd} className={styles.saveBtn}>✓</button>
              <button onClick={cancelAdd} className={styles.cancelBtn}>×</button>
            </div>
          </div>
        )}
        <div className={styles.totalRow}>
          <div className={styles.totalLabel}>Total Owed</div>
          <div className={styles.totalAmount}>${calculateTotal(items).toLocaleString()}</div>
        </div>
      </div>
    )
  }

  const renderRecurringTable = () => {
    return (
      <div className={styles.recurringContainer}>
        {RECURRING_TYPES.map(type => {
          const items = getRecurringByType(type)
          const typeColors = {
            Family: '#ec4899',
            Home: '#f59e0b', 
            Personal: '#8b5cf6'
          }
          return (
            <div key={type} className={styles.recurringSection}>
              <div className={styles.recurringHeader} style={{ borderColor: typeColors[type] }}>
                <span className={styles.recurringType}>{type}</span>
                <span className={styles.recurringTotal}>${calculateTotal(items).toLocaleString()}/mo</span>
              </div>
              {items.map(item => (
                editingId === item.id ? (
                  <div key={item.id} className={styles.editRow}>
                    <input
                      type="text"
                      value={formData.target || ''}
                      onChange={(e) => setFormData({ ...formData, target: e.target.value })}
                      placeholder="Target"
                      className={styles.editInput}
                    />
                    <select
                      value={formData.type || type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      className={styles.editSelect}
                    >
                      {RECURRING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input
                      type="number"
                      value={formData.amount || ''}
                      onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                      placeholder="Amount"
                      className={styles.editInput}
                    />
                    <div className={styles.editActions}>
                      <button onClick={() => handleUpdate(item.id)} className={styles.saveBtn}>✓</button>
                      <button onClick={cancelEdit} className={styles.cancelBtn}>×</button>
                    </div>
                  </div>
                ) : (
                  <div key={item.id} className={styles.recurringRow}>
                    <div className={styles.recurringTarget}>{item.target}</div>
                    <div className={styles.recurringAmount}>${item.amount?.toLocaleString()}</div>
                    <div className={styles.colActions}>
                      <button onClick={() => startEdit(item)} className={styles.editBtn}>✏️</button>
                      <button onClick={() => handleDelete(item.id)} className={styles.deleteBtn}>🗑️</button>
                    </div>
                  </div>
                )
              ))}
            </div>
          )
        })}
        {showAddForm && (
          <div className={styles.addRow}>
            <input
              type="text"
              value={formData.target || ''}
              onChange={(e) => setFormData({ ...formData, target: e.target.value })}
              placeholder="What's the payment for?"
              className={styles.editInput}
              autoFocus
            />
            <select
              value={formData.type || 'Personal'}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className={styles.editSelect}
            >
              {RECURRING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              type="number"
              value={formData.amount || ''}
              onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
              placeholder="Monthly amount"
              className={styles.editInput}
            />
            <div className={styles.editActions}>
              <button onClick={handleAdd} className={styles.saveBtn}>✓</button>
              <button onClick={cancelAdd} className={styles.cancelBtn}>×</button>
            </div>
          </div>
        )}
        <div className={styles.totalRow}>
          <div className={styles.totalLabel}>Total Monthly</div>
          <div className={styles.totalAmount}>${calculateTotal(data.recurring).toLocaleString()}/mo</div>
        </div>
      </div>
    )
  }

  const renderHeldMoneyTable = () => {
    const items = data.heldMoney
    return (
      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <div className={styles.colLocation}>For</div>
          <div className={styles.colAmount}>Amount</div>
          <div className={styles.colNotes}>Notes</div>
          <div className={styles.colActions}></div>
        </div>
        {items.map(item => (
          editingId === item.id ? (
            <div key={item.id} className={styles.editRow}>
              <input
                type="text"
                value={formData.person || ''}
                onChange={(e) => setFormData({ ...formData, person: e.target.value })}
                placeholder="Person"
                className={styles.editInput}
              />
              <input
                type="number"
                value={formData.amount || ''}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                placeholder="Amount"
                className={styles.editInput}
              />
              <input
                type="text"
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notes"
                className={styles.editInput}
              />
              <div className={styles.editActions}>
                <button onClick={() => handleUpdate(item.id)} className={styles.saveBtn}>✓</button>
                <button onClick={cancelEdit} className={styles.cancelBtn}>×</button>
              </div>
            </div>
          ) : (
            <div key={item.id} className={styles.tableRow}>
              <div className={styles.colLocation}>{item.person}</div>
              <div className={styles.colAmount}>${item.amount?.toLocaleString()}</div>
              <div className={styles.colNotes}>{item.notes || '—'}</div>
              <div className={styles.colActions}>
                <button onClick={() => startEdit(item)} className={styles.editBtn}>✏️</button>
                <button onClick={() => handleDelete(item.id)} className={styles.deleteBtn}>🗑️</button>
              </div>
            </div>
          )
        ))}
        {showAddForm && (
          <div className={styles.addRow}>
            <input
              type="text"
              value={formData.person || ''}
              onChange={(e) => setFormData({ ...formData, person: e.target.value })}
              placeholder="Holding for who?"
              className={styles.editInput}
              autoFocus
            />
            <input
              type="number"
              value={formData.amount || ''}
              onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
              placeholder="Amount"
              className={styles.editInput}
            />
            <input
              type="text"
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notes (optional)"
              className={styles.editInput}
            />
            <div className={styles.editActions}>
              <button onClick={handleAdd} className={styles.saveBtn}>✓</button>
              <button onClick={cancelAdd} className={styles.cancelBtn}>×</button>
            </div>
          </div>
        )}
        {items.length === 0 && !showAddForm && (
          <div className={styles.emptyRow}>
            <span>No money held for others</span>
          </div>
        )}
      </div>
    )
  }

  const renderMetalsTable = () => {
    const { holdings, prices, values } = metals
    return (
      <div className={styles.metalsContainer}>
        <div className={styles.metalsHeader}>
          <span className={styles.metalsTitle}>Precious Metals Holdings</span>
          {!metalsEditing ? (
            <button onClick={() => setMetalsEditing(true)} className={styles.editMetalsBtn}>
              ✏️ Edit
            </button>
          ) : (
            <div className={styles.editActions}>
              <button onClick={handleMetalsUpdate} className={styles.saveBtn}>✓</button>
              <button onClick={() => { setMetalsEditing(false); setMetalsForm(holdings); }} className={styles.cancelBtn}>×</button>
            </div>
          )}
        </div>

        {prices.source === 'fallback' && (
          <div className={styles.priceWarning}>
            ⚠️ Using estimated prices - live data unavailable
          </div>
        )}

        <div className={styles.metalRows}>
          {/* Gold 24K */}
          <div className={styles.metalRow}>
            <div className={styles.metalInfo}>
              <span className={styles.metalIcon}>🥇</span>
              <div className={styles.metalDetails}>
                <span className={styles.metalName}>Gold 24K</span>
                <span className={styles.metalPrice}>${prices.gold_24k_per_gram?.toFixed(2)}/gram</span>
              </div>
            </div>
            {metalsEditing ? (
              <input
                type="number"
                value={metalsForm.gold_24k_grams || ''}
                onChange={(e) => setMetalsForm({ ...metalsForm, gold_24k_grams: parseFloat(e.target.value) || 0 })}
                placeholder="0"
                className={styles.metalInput}
                step="0.01"
              />
            ) : (
              <span className={styles.metalGrams}>{holdings.gold_24k_grams?.toFixed(2)}g</span>
            )}
            <span className={styles.metalValue}>${values.gold_24k?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>

          {/* Gold 21K */}
          <div className={styles.metalRow}>
            <div className={styles.metalInfo}>
              <span className={styles.metalIcon}>🏅</span>
              <div className={styles.metalDetails}>
                <span className={styles.metalName}>Gold 21K</span>
                <span className={styles.metalPrice}>${prices.gold_21k_per_gram?.toFixed(2)}/gram</span>
              </div>
            </div>
            {metalsEditing ? (
              <input
                type="number"
                value={metalsForm.gold_21k_grams || ''}
                onChange={(e) => setMetalsForm({ ...metalsForm, gold_21k_grams: parseFloat(e.target.value) || 0 })}
                placeholder="0"
                className={styles.metalInput}
                step="0.01"
              />
            ) : (
              <span className={styles.metalGrams}>{holdings.gold_21k_grams?.toFixed(2)}g</span>
            )}
            <span className={styles.metalValue}>${values.gold_21k?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>

          {/* Silver */}
          <div className={styles.metalRow}>
            <div className={styles.metalInfo}>
              <span className={styles.metalIcon}>🥈</span>
              <div className={styles.metalDetails}>
                <span className={styles.metalName}>Silver</span>
                <span className={styles.metalPrice}>${prices.silver_per_kg?.toFixed(2)}/kg</span>
              </div>
            </div>
            {metalsEditing ? (
              <input
                type="number"
                value={metalsForm.silver_kg || ''}
                onChange={(e) => setMetalsForm({ ...metalsForm, silver_kg: parseFloat(e.target.value) || 0 })}
                placeholder="0"
                className={styles.metalInput}
                step="0.01"
              />
            ) : (
              <span className={styles.metalGrams}>{holdings.silver_kg?.toFixed(2)}kg</span>
            )}
            <span className={styles.metalValue}>${values.silver?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
        </div>

        <div className={styles.metalsTotalRow}>
          <span className={styles.metalsTotalLabel}>Total Metal Value</span>
          <span className={styles.metalsTotalValue}>${values.total?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>

        {prices.last_updated && (
          <div className={styles.pricesUpdated}>
            Prices from {prices.source} • Updated {new Date(prices.last_updated).toLocaleTimeString()}
          </div>
        )}
      </div>
    )
  }

  const renderActiveTable = () => {
    switch (activeTab) {
      case 'current': return renderCurrentMoneyTable()
      case 'metals': return renderMetalsTable()
      case 'expected': return renderExpectedMoneyTable()
      case 'payables': return renderPayablesTable()
      case 'recurring': return renderRecurringTable()
      case 'held': return renderHeldMoneyTable()
      default: return null
    }
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
      </div>
    )
  }

  const activeTabData = TABS.find(t => t.id === activeTab)

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.logo}>Accounts</h1>
          <button className={styles.menuBtn} onClick={() => router.push('/lifestyle')}>
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
        <div className={styles.summary}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Cash</span>
            <span className={styles.summaryValue} style={{ color: '#10b981' }}>
              ${calculateTotal(data.currentMoney).toLocaleString()}
            </span>
          </div>
          <div className={styles.summaryDivider}>|</div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Metals</span>
            <span className={styles.summaryValue} style={{ color: '#d97706' }}>
              ${(metals.values?.total || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className={styles.summaryDivider}>|</div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Owe</span>
            <span className={styles.summaryValue} style={{ color: '#ef4444' }}>
              ${calculateTotal(data.payables).toLocaleString()}
            </span>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className={styles.tabs}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.activeTab : ''}`}
            onClick={() => {
              setActiveTab(tab.id)
              setEditingId(null)
              setShowAddForm(false)
              setFormData({})
            }}
            style={activeTab === tab.id ? { borderColor: tab.color, color: tab.color } : {}}
          >
            <span className={styles.tabIcon}>{tab.icon}</span>
            <span className={styles.tabName}>{tab.name}</span>
          </button>
        ))}
      </div>

      {/* Active Table */}
      <section className={styles.tableSection}>
        <div className={styles.tableTitle}>
          <span style={{ color: activeTabData?.color }}>{activeTabData?.icon}</span>
          <span>{activeTabData?.name}</span>
          {activeTab !== 'metals' && (
            <button onClick={startAdd} className={styles.addButton}>+ Add</button>
          )}
        </div>
        {renderActiveTable()}
      </section>

      {/* Bottom Navigation */}
      <nav className={styles.bottomNav}>
        <button className={styles.navItem} onClick={() => router.push('/dashboard')}>
          <span className={styles.navIcon}>🏠</span>
          <span>Home</span>
        </button>
        <button className={`${styles.navItem} ${styles.active}`}>
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

