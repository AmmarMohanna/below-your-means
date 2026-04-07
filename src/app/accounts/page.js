"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import BottomNav from "@/components/BottomNav";
import { getTodayBeirut } from "@/lib/date";

import styles from "./accounts.module.css";

const tabs = [
  { id: "current", name: "Current" },
  { id: "metals", name: "Metals" },
  { id: "expected", name: "Expected" },
  { id: "payables", name: "Payables" },
  { id: "recurring", name: "Monthly" },
  { id: "held", name: "Held" },
];

const recurringTypes = ["Family", "Home", "Personal"];
const troyOuncesPerKg = 32.1507465686;

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value || 0);
}

function formatDate(dateText) {
  if (!dateText) return "";
  const date = new Date(`${dateText}T12:00:00`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function joinParts(...parts) {
  return parts.filter(Boolean).join(" • ");
}

function getInitialForm(tab) {
  if (tab === "recurring") {
    return { target: "", type: "Personal", amount: "" };
  }

  if (tab === "current") {
    return { location: "", amount: "", notes: "" };
  }

  if (tab === "expected") {
    return { source: "", expected_date: getTodayBeirut(), amount: "", notes: "" };
  }

  if (tab === "payables") {
    return { source: "", pay_date: getTodayBeirut(), amount: "", notes: "" };
  }

  return { person: "", amount: "", notes: "" };
}

export default function Accounts() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("current");
  const [expandedMetaIds, setExpandedMetaIds] = useState([]);
  const [data, setData] = useState({
    currentMoney: [],
    expectedMoney: [],
    payables: [],
    recurring: [],
    heldMoney: [],
  });
  const [metals, setMetals] = useState({
    holdings: { gold_24k_grams: 0, gold_21k_grams: 0, silver_kg: 0 },
    prices: { gold_24k_per_gram: 85, gold_21k_per_gram: 74.4, silver_per_kg: 950, source: "manual" },
    values: { gold_24k: 0, gold_21k: 0, silver: 0, total: 0 },
  });
  const [metalsForm, setMetalsForm] = useState({ gold_24k_grams: 0, gold_21k_grams: 0, silver_kg: 0 });
  const [pricesForm, setPricesForm] = useState({ gold_per_oz: 2650, silver_per_kg: 950 });
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState(getInitialForm("current"));
  const [metalsEditing, setMetalsEditing] = useState(false);
  const [pricesEditing, setPricesEditing] = useState(false);
  const [refreshingLivePrices, setRefreshingLivePrices] = useState(false);
  const [completingId, setCompletingId] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch("/api/accounts");
      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to fetch accounts");
      }

      setData(await response.json());
    } catch (error) {
      console.error("Error fetching accounts:", error);
    } finally {
      setLoading(false);
    }
  }, [router]);

  const fetchMetals = useCallback(async () => {
    try {
      const response = await fetch("/api/metals");
      if (!response.ok) {
        throw new Error("Failed to fetch metals");
      }

      const result = await response.json();
      setMetals(result);
      setMetalsForm(result.holdings);
      setPricesForm({
        gold_per_oz: Math.round((result.prices.gold_24k_per_gram || 85) * 31.1035),
        silver_per_kg: result.prices.silver_per_kg || 950,
      });
    } catch (error) {
      console.error("Error fetching metals:", error);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchMetals();
  }, [fetchData, fetchMetals]);

  const summary = useMemo(
    () => ({
      cash: data.currentMoney.reduce((sum, item) => sum + (item.amount || 0), 0),
      expected: data.expectedMoney.reduce((sum, item) => sum + (item.amount || 0), 0),
      owe: data.payables.reduce((sum, item) => sum + (item.amount || 0), 0),
      metals: metals.values.total || 0,
    }),
    [data, metals.values.total]
  );

  const recurringByType = useMemo(
    () =>
      recurringTypes.reduce((groups, type) => {
        groups[type] = data.recurring.filter((item) => item.type === type);
        return groups;
      }, {}),
    [data.recurring]
  );

  const getTableName = (tab) => {
    if (tab === "current") return "currentMoney";
    if (tab === "expected") return "expectedMoney";
    if (tab === "payables") return "payables";
    if (tab === "recurring") return "recurring";
    if (tab === "held") return "heldMoney";
    return "currentMoney";
  };

  const resetForm = (tab = activeTab) => {
    setFormData(getInitialForm(tab));
  };

  const selectTab = (tab) => {
    setActiveTab(tab);
    setEditingId(null);
    setShowAddForm(false);
    setExpandedMetaIds([]);
    resetForm(tab);
  };

  const toggleExpandedMeta = (id) => {
    setExpandedMetaIds((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]
    );
  };

  const handleAdd = async () => {
    const table = getTableName(activeTab);

    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, ...formData }),
      });

      if (!response.ok) {
        throw new Error("Failed to add item");
      }

      setShowAddForm(false);
      resetForm();
      await fetchData();
    } catch (error) {
      console.error("Error adding account item:", error);
    }
  };

  const handleUpdate = async (id) => {
    const table = getTableName(activeTab);

    try {
      const response = await fetch("/api/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, id, ...formData }),
      });

      if (!response.ok) {
        throw new Error("Failed to update item");
      }

      setEditingId(null);
      setShowAddForm(false);
      resetForm();
      await fetchData();
    } catch (error) {
      console.error("Error updating account item:", error);
    }
  };

  const handleDelete = async (id) => {
    const table = getTableName(activeTab);

    try {
      const response = await fetch(`/api/accounts?table=${table}&id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete item");
      }

      await fetchData();
    } catch (error) {
      console.error("Error deleting account item:", error);
    }
  };

  const handleShift = async (direction, id) => {
    const table = getTableName(activeTab);

    try {
      const response = await fetch("/api/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, id, direction }),
      });

      if (!response.ok) {
        throw new Error("Failed to move dated item");
      }

      await fetchData();
    } catch (error) {
      console.error("Error shifting dated item:", error);
    }
  };

  const handleComplete = async (table, id) => {
    const completionKey = `${table}:${id}`;
    setCompletingId(completionKey);

    try {
      const response = await fetch("/api/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          table,
          id,
          date: getTodayBeirut(),
          scope: "personal",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to complete item");
      }

      setExpandedMetaIds((previous) =>
        previous.filter((entryId) => entryId !== `${table}:${id}` && entryId !== id)
      );
      await fetchData();
    } catch (error) {
      console.error("Error completing scheduled item:", error);
    } finally {
      setCompletingId(null);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setShowAddForm(false);
    setFormData({ ...item });
  };

  const handleMetalsUpdate = async () => {
    try {
      const response = await fetch("/api/metals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metalsForm),
      });

      if (!response.ok) {
        throw new Error("Failed to update holdings");
      }

      setMetalsEditing(false);
      await fetchMetals();
    } catch (error) {
      console.error("Error updating metals:", error);
    }
  };

  const handleManualPricesUpdate = async () => {
    const gold24kPerGram = pricesForm.gold_per_oz / 31.1035;
    const gold21kPerGram = gold24kPerGram * (21 / 24);

    try {
      const response = await fetch("/api/metals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gold_24k_price_per_gram: gold24kPerGram,
          gold_21k_price_per_gram: gold21kPerGram,
          silver_price_per_kg: pricesForm.silver_per_kg,
          fromApi: false,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update prices");
      }

      setPricesEditing(false);
      await fetchMetals();
    } catch (error) {
      console.error("Error updating prices:", error);
    }
  };

  const handleRefreshLivePrices = async () => {
    setRefreshingLivePrices(true);

    try {
      const [goldResponse, silverResponse] = await Promise.all([
        fetch("https://api.gold-api.com/price/XAU"),
        fetch("https://api.gold-api.com/price/XAG"),
      ]);

      if (!goldResponse.ok || !silverResponse.ok) {
        throw new Error("Failed to fetch live prices");
      }

      const goldPayload = await goldResponse.json();
      const silverPayload = await silverResponse.json();
      const gold24kPerGram = (goldPayload.price || 0) / 31.1035;
      const gold21kPerGram = gold24kPerGram * (21 / 24);
      const silverPerKg = (silverPayload.price || 0) * troyOuncesPerKg;

      const saveResponse = await fetch("/api/metals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gold_24k_price_per_gram: gold24kPerGram,
          gold_21k_price_per_gram: gold21kPerGram,
          silver_price_per_kg: silverPerKg,
          fromApi: true,
        }),
      });

      if (!saveResponse.ok) {
        throw new Error("Failed to save live prices");
      }

      await fetchMetals();
    } catch (error) {
      console.error("Error refreshing live prices:", error);
    } finally {
      setRefreshingLivePrices(false);
    }
  };

  const renderFormFields = () => {
    if (activeTab === "current") {
      return (
        <>
          <input
            type="text"
            className={styles.formInput}
            placeholder="Where is the money?"
            value={formData.location || ""}
            onChange={(event) => setFormData({ ...formData, location: event.target.value })}
          />
          <input
            type="number"
            className={styles.formInput}
            placeholder="Amount"
            value={formData.amount || ""}
            onChange={(event) => setFormData({ ...formData, amount: parseFloat(event.target.value) || 0 })}
          />
          <input
            type="text"
            className={styles.formInput}
            placeholder="Notes"
            value={formData.notes || ""}
            onChange={(event) => setFormData({ ...formData, notes: event.target.value })}
          />
        </>
      );
    }

    if (activeTab === "expected") {
      return (
        <>
          <input
            type="text"
            className={styles.formInput}
            placeholder="Source"
            value={formData.source || ""}
            onChange={(event) => setFormData({ ...formData, source: event.target.value })}
          />
          <input
            type="date"
            className={styles.formInput}
            value={formData.expected_date || ""}
            onChange={(event) => setFormData({ ...formData, expected_date: event.target.value })}
          />
          <input
            type="number"
            className={styles.formInput}
            placeholder="Amount"
            value={formData.amount || ""}
            onChange={(event) => setFormData({ ...formData, amount: parseFloat(event.target.value) || 0 })}
          />
          <input
            type="text"
            className={styles.formInput}
            placeholder="Notes"
            value={formData.notes || ""}
            onChange={(event) => setFormData({ ...formData, notes: event.target.value })}
          />
        </>
      );
    }

    if (activeTab === "payables") {
      return (
        <>
          <input
            type="text"
            className={styles.formInput}
            placeholder="Pay to"
            value={formData.source || ""}
            onChange={(event) => setFormData({ ...formData, source: event.target.value })}
          />
          <input
            type="date"
            className={styles.formInput}
            value={formData.pay_date || ""}
            onChange={(event) => setFormData({ ...formData, pay_date: event.target.value })}
          />
          <input
            type="number"
            className={styles.formInput}
            placeholder="Amount"
            value={formData.amount || ""}
            onChange={(event) => setFormData({ ...formData, amount: parseFloat(event.target.value) || 0 })}
          />
          <input
            type="text"
            className={styles.formInput}
            placeholder="Notes"
            value={formData.notes || ""}
            onChange={(event) => setFormData({ ...formData, notes: event.target.value })}
          />
        </>
      );
    }

    if (activeTab === "recurring") {
      return (
        <>
          <input
            type="text"
            className={styles.formInput}
            placeholder="Target"
            value={formData.target || ""}
            onChange={(event) => setFormData({ ...formData, target: event.target.value })}
          />
          <select
            className={styles.formInput}
            value={formData.type || "Personal"}
            onChange={(event) => setFormData({ ...formData, type: event.target.value })}
          >
            {recurringTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <input
            type="number"
            className={styles.formInput}
            placeholder="Amount"
            value={formData.amount || ""}
            onChange={(event) => setFormData({ ...formData, amount: parseFloat(event.target.value) || 0 })}
          />
        </>
      );
    }

    return (
      <>
        <input
          type="text"
          className={styles.formInput}
          placeholder="Person"
          value={formData.person || ""}
          onChange={(event) => setFormData({ ...formData, person: event.target.value })}
        />
        <input
          type="number"
          className={styles.formInput}
          placeholder="Amount"
          value={formData.amount || ""}
          onChange={(event) => setFormData({ ...formData, amount: parseFloat(event.target.value) || 0 })}
        />
        <input
          type="text"
          className={styles.formInput}
          placeholder="Notes"
          value={formData.notes || ""}
          onChange={(event) => setFormData({ ...formData, notes: event.target.value })}
        />
      </>
    );
  };

  const renderForm = () => {
    if (!showAddForm && editingId === null) return null;

    return (
      <div className={styles.formCard}>
        <div className={styles.formGrid}>{renderFormFields()}</div>
        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => (editingId ? handleUpdate(editingId) : handleAdd())}
          >
            {editingId ? "Save changes" : "Add item"}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => {
              setEditingId(null);
              setShowAddForm(false);
              resetForm();
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const renderItemCard = (item, options) => {
    const isEditing = editingId === item.id;
    const canRevealMeta = Boolean(options.meta);
    const detailId = options.detailId ?? item.id;
    const isMetaExpanded = expandedMetaIds.includes(detailId);
    const completionKey = options.completeAction ? `${options.completeAction.table}:${item.id}` : null;
    const isCompleting = completionKey ? completingId === completionKey : false;
    if (isEditing) {
      return null;
    }

    return (
      <article
        key={item.id}
        className={`${styles.itemCard} ${isMetaExpanded ? styles.itemCardExpanded : ""}`}
      >
        {canRevealMeta ? (
          <button
            type="button"
            className={styles.itemToggle}
            onClick={() => toggleExpandedMeta(detailId)}
            aria-expanded={isMetaExpanded}
          >
            <div className={styles.itemMain}>
              <div className={styles.itemLine}>
                <span className={styles.itemTitle}>{options.title}</span>
                <span className={styles.itemMeta}>{options.meta}</span>
                <span className={styles.mobileReveal}>
                  {isMetaExpanded ? "Hide" : "Details"}
                </span>
              </div>
            </div>
          </button>
        ) : (
          <div className={styles.itemMain}>
            <div className={styles.itemLine}>
              <span className={styles.itemTitle}>{options.title}</span>
            </div>
          </div>
        )}
        <strong className={styles.itemAmount}>${formatMoney(item.amount || 0)}</strong>
        <div className={styles.rowActions}>
          {options.canShift ? (
            <>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => handleShift("up", item.id)}
                aria-label="Move up"
                title="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => handleShift("down", item.id)}
                aria-label="Move down"
                title="Move down"
              >
                ↓
              </button>
            </>
          ) : null}
          <button type="button" className={styles.actionButton} onClick={() => startEdit(item)}>
            <span className={styles.mobileIcon} aria-hidden="true">✎</span>
            <span className={styles.buttonLabel}>Edit</span>
          </button>
          <button type="button" className={styles.deleteButton} onClick={() => handleDelete(item.id)}>
            <span className={styles.mobileIcon} aria-hidden="true">⌫</span>
            <span className={styles.buttonLabel}>Delete</span>
          </button>
        </div>
        {canRevealMeta && isMetaExpanded ? (
          <div className={styles.itemDetail}>
            <strong className={styles.itemDetailTitle}>{options.title}</strong>
            <span className={styles.itemDetailText}>{options.meta}</span>
            {options.completeAction ? (
              <button
                type="button"
                className={styles.completeButton}
                onClick={() => handleComplete(options.completeAction.table, item.id)}
                disabled={isCompleting}
              >
                {isCompleting ? `${options.completeAction.label}...` : options.completeAction.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </article>
    );
  };

  const renderStandardList = (items, mapper, canShift = false) => (
    <div className={styles.cardList}>
      {items.map((item) =>
        renderItemCard(
          item,
          mapper(item, {
            canShift,
          })
        )
      )}
      {items.length === 0 && <div className={styles.emptyState}>Nothing here yet.</div>}
    </div>
  );

  const renderCurrentTab = () => {
    if (activeTab === "current") {
      return renderStandardList(data.currentMoney, (item) => ({
        title: item.location,
        meta: item.notes || "",
        canShift: true,
      }));
    }

    if (activeTab === "expected") {
      return renderStandardList(
        data.expectedMoney,
        (item) => ({
          title: item.source,
          meta: joinParts(formatDate(item.expected_date), item.notes),
          detailId: `expectedMoney:${item.id}`,
          canShift: true,
          completeAction: {
            table: "expectedMoney",
            label: "Received",
          },
        }),
        true
      );
    }

    if (activeTab === "payables") {
      return renderStandardList(
        data.payables,
        (item) => ({
          title: item.source,
          meta: joinParts(formatDate(item.pay_date), item.notes),
          detailId: `payables:${item.id}`,
          canShift: true,
          completeAction: {
            table: "payables",
            label: "Paid",
          },
        }),
        true
      );
    }

    if (activeTab === "held") {
      return renderStandardList(data.heldMoney, (item) => ({
        title: item.person,
        meta: joinParts(item.notes, item.created_at ? formatDate(item.created_at.slice(0, 10)) : ""),
      }));
    }

    if (activeTab === "recurring") {
      return (
        <div className={styles.groupList}>
          {recurringTypes.map((type) => (
            <section key={type} className={styles.groupCard}>
              <div className={styles.groupHeader}>
                <h3 className={styles.groupTitle}>
                  {type} · ${formatMoney(recurringByType[type].reduce((sum, item) => sum + (item.amount || 0), 0))}/mo
                </h3>
              </div>

              <div className={styles.groupRows}>
                {recurringByType[type]
                  .filter((item) => item.id !== editingId)
                  .map((item) => (
                    <article key={item.id} className={styles.groupRow}>
                      <div className={styles.itemMain}>
                        <div className={styles.itemLine}>
                          <span className={styles.itemTitle}>{item.target}</span>
                        </div>
                      </div>
                      <strong className={styles.itemAmount}>${formatMoney(item.amount || 0)}</strong>
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.actionButton}
                          onClick={() => startEdit(item)}
                        >
                          <span className={styles.mobileIcon} aria-hidden="true">✎</span>
                          <span className={styles.buttonLabel}>Edit</span>
                        </button>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => handleDelete(item.id)}
                        >
                          <span className={styles.mobileIcon} aria-hidden="true">⌫</span>
                          <span className={styles.buttonLabel}>Delete</span>
                        </button>
                      </div>
                    </article>
                  ))}
                {recurringByType[type].length === 0 && (
                  <div className={styles.emptyState}>No items.</div>
                )}
              </div>
            </section>
          ))}
        </div>
      );
    }

    return (
      <section className={styles.metalsCard}>
        <div className={styles.metalsHeader}>
          <h2 className={styles.metalsValue}>${formatMoney(metals.values.total || 0)}</h2>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleRefreshLivePrices}
            disabled={refreshingLivePrices}
          >
            {refreshingLivePrices ? "Refreshing..." : "Refresh live prices"}
          </button>
        </div>

        <div className={styles.metalsRows}>
          {[
            {
              label: "Gold 24K",
              quantityKey: "gold_24k_grams",
              quantitySuffix: "g",
              price: metals.prices.gold_24k_per_gram,
              value: metals.values.gold_24k,
            },
            {
              label: "Gold 21K",
              quantityKey: "gold_21k_grams",
              quantitySuffix: "g",
              price: metals.prices.gold_21k_per_gram,
              value: metals.values.gold_21k,
            },
            {
              label: "Silver",
              quantityKey: "silver_kg",
              quantitySuffix: "kg",
              price: metals.prices.silver_per_kg,
              value: metals.values.silver,
            },
          ].map((metal) => (
            <div
              key={metal.label}
              className={`${styles.metalRow} ${
                expandedMetaIds.includes(`metal:${metal.quantityKey}`) ? styles.itemCardExpanded : ""
              }`}
            >
              <button
                type="button"
                className={styles.itemToggle}
                onClick={() => toggleExpandedMeta(`metal:${metal.quantityKey}`)}
                aria-expanded={expandedMetaIds.includes(`metal:${metal.quantityKey}`)}
              >
                <div className={styles.itemMain}>
                  <div className={styles.itemLine}>
                    <span className={styles.itemTitle}>{metal.label}</span>
                    <span className={styles.itemMeta}>${metal.price?.toFixed(2)} / {metal.quantitySuffix}</span>
                    <span className={styles.mobileReveal}>
                      {expandedMetaIds.includes(`metal:${metal.quantityKey}`) ? "Hide" : "Details"}
                    </span>
                  </div>
                </div>
              </button>
              {metalsEditing ? (
                <input
                  type="number"
                  className={styles.inlineInput}
                  step="0.01"
                  value={metalsForm[metal.quantityKey] || ""}
                  onChange={(event) =>
                    setMetalsForm({
                      ...metalsForm,
                      [metal.quantityKey]: parseFloat(event.target.value) || 0,
                    })
                  }
                />
              ) : (
                <span className={styles.itemMetaValue}>
                  {(metals.holdings[metal.quantityKey] || 0).toFixed(2)}
                  {metal.quantitySuffix}
                </span>
              )}
              <strong className={styles.itemAmount}>${formatMoney(metal.value || 0)}</strong>
              {expandedMetaIds.includes(`metal:${metal.quantityKey}`) ? (
                <div className={styles.itemDetail}>
                  <strong className={styles.itemDetailTitle}>{metal.label}</strong>
                  <span className={styles.itemDetailText}>
                    ${metal.price?.toFixed(2)} / {metal.quantitySuffix}
                  </span>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className={styles.cardActions}>
          {!metalsEditing ? (
            <button type="button" className={styles.actionButton} onClick={() => setMetalsEditing(true)}>
              Edit holdings
            </button>
          ) : (
            <>
              <button type="button" className={styles.actionButton} onClick={handleMetalsUpdate}>
                Save holdings
              </button>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => {
                  setMetalsEditing(false);
                  setMetalsForm(metals.holdings);
                }}
              >
                Cancel
              </button>
            </>
          )}
          {!pricesEditing ? (
            <button type="button" className={styles.actionButton} onClick={() => setPricesEditing(true)}>
              Manual prices
            </button>
          ) : null}
        </div>

        {pricesEditing && (
          <div className={styles.formCard}>
            <div className={styles.formGrid}>
              <input
                type="number"
                className={styles.formInput}
                placeholder="Gold per oz"
                value={pricesForm.gold_per_oz || ""}
                onChange={(event) =>
                  setPricesForm({ ...pricesForm, gold_per_oz: parseFloat(event.target.value) || 0 })
                }
              />
              <input
                type="number"
                className={styles.formInput}
                placeholder="Silver per kg"
                value={pricesForm.silver_per_kg || ""}
                onChange={(event) =>
                  setPricesForm({ ...pricesForm, silver_per_kg: parseFloat(event.target.value) || 0 })
                }
              />
            </div>
            <div className={styles.formActions}>
              <button type="button" className={styles.primaryButton} onClick={handleManualPricesUpdate}>
                Save prices
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setPricesEditing(false);
                  setPricesForm({
                    gold_per_oz: Math.round((metals.prices.gold_24k_per_gram || 85) * 31.1035),
                    silver_per_kg: metals.prices.silver_per_kg || 950,
                  });
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <p className={styles.footerMeta}>
          Last metal refresh:{" "}
          {metals.prices.last_updated
            ? new Date(metals.prices.last_updated).toLocaleString()
            : "manual only so far"}
        </p>
      </section>
    );
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
      </div>
    );
  }

  const activeTabMeta = tabs.find((tab) => tab.id === activeTab);
  const canAdd = activeTab !== "metals";

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Accounts</h1>

        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Cash</span>
            <strong>${formatMoney(summary.cash)}</strong>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Expected</span>
            <strong>${formatMoney(summary.expected)}</strong>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Metals</span>
            <strong>${formatMoney(summary.metals)}</strong>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Owe</span>
            <strong>${formatMoney(summary.owe)}</strong>
          </div>
        </div>
      </header>

      <div className={styles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`${styles.tabButton} ${activeTab === tab.id ? styles.activeTab : ""}`}
            onClick={() => selectTab(tab.id)}
          >
            <span>{tab.name}</span>
          </button>
        ))}
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{activeTabMeta?.name}</h2>

          {canAdd && (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => {
                setShowAddForm(true);
                setEditingId(null);
                resetForm();
              }}
            >
              Add
            </button>
          )}
        </div>

        {renderForm()}
        {renderCurrentTab()}
      </section>

      <BottomNav active="accounts" />
    </div>
  );
}
