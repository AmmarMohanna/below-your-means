"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import BottomNav from "@/components/BottomNav";
import { getTodayBeirut } from "@/lib/date";

import styles from "./accounts.module.css";

const tabs = [
  { id: "current", name: "Current" },
  { id: "expected", name: "Expected" },
  { id: "payables", name: "Payables" },
  { id: "recurring", name: "Monthly" },
  { id: "plan", name: "Saving Plan" },
  { id: "metals", name: "Savings" },
  { id: "projects", name: "Projects" },
];

const recurringTypes = ["Family", "Home", "Personal", "Subscription", "Donations"];
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

function getMonthKey(dateText) {
  if (!dateText || !/^\d{4}-\d{2}/.test(dateText)) return "undated";
  return dateText.slice(0, 7);
}

function formatMonthLabel(monthKey) {
  if (monthKey === "undated") return "No date";
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 1, 12);
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function groupItemsByMonth(items, dateField) {
  const groups = new Map();
  const sortedItems = [...items].sort((first, second) => {
    const dateCompare = (first[dateField] || "").localeCompare(second[dateField] || "");
    if (dateCompare !== 0) return dateCompare;
    return (first.id || 0) - (second.id || 0);
  });

  for (const item of sortedItems) {
    const monthKey = getMonthKey(item[dateField]);
    if (!groups.has(monthKey)) {
      groups.set(monthKey, {
        monthKey,
        items: [],
      });
    }
    groups.get(monthKey).items.push(item);
  }

  return Array.from(groups.values());
}

function formatItemCount(count) {
  return `${count} ${count === 1 ? "item" : "items"}`;
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

  if (tab === "projects") {
    return { description: "", estimated_amount: "", target_date: "" };
  }

  if (tab === "expected") {
    return {
      source: "",
      expected_date: getTodayBeirut(),
      amount: "",
      planned_save_amount: "",
      notes: "",
    };
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
    projects: [],
    expectedMoney: [],
    payables: [],
    recurring: [],
  });
  const [metals, setMetals] = useState({
    holdings: { gold_24k_grams: 0, gold_21k_grams: 0, silver_kg: 0 },
    prices: { gold_24k_per_gram: 85, gold_21k_per_gram: 74.4, silver_per_kg: 950, source: "manual" },
    values: { gold_24k: 0, gold_21k: 0, silver: 0, total: 0 },
  });
  const [metalsForm, setMetalsForm] = useState({ gold_24k_grams: 0, gold_21k_grams: 0, silver_kg: 0 });
  const [pensionAmount, setPensionAmount] = useState(0);
  const [pensionForm, setPensionForm] = useState(0);
  const [savingsPlan, setSavingsPlan] = useState({
    goal: { target_amount: 0, target_date: null },
    items: [],
    summary: { expected: 0, planned: 0, item_count: 0, planned_rate: 0 },
  });
  const [goalForm, setGoalForm] = useState({ target_amount: "", target_date: "" });
  const [goalEditing, setGoalEditing] = useState(false);
  const [pricesForm, setPricesForm] = useState({ gold_per_oz: 2650, silver_per_kg: 950 });
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState(getInitialForm("current"));
  const [metalsEditing, setMetalsEditing] = useState(false);
  const [pensionEditing, setPensionEditing] = useState(false);
  const [pricesEditing, setPricesEditing] = useState(false);
  const [refreshingLivePrices, setRefreshingLivePrices] = useState(false);
  const [completingId, setCompletingId] = useState(null);
  const [monthGroupOverrides, setMonthGroupOverrides] = useState({});

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
      setPensionAmount(result.longTermSavings?.aub_pension_amount || 0);
      setPensionForm(result.longTermSavings?.aub_pension_amount || 0);
      setPricesForm({
        gold_per_oz: Math.round((result.prices.gold_24k_per_gram || 85) * 31.1035),
        silver_per_kg: result.prices.silver_per_kg || 950,
      });
    } catch (error) {
      console.error("Error fetching metals:", error);
    }
  }, []);

  const fetchSavingsPlan = useCallback(async () => {
    try {
      const response = await fetch("/api/savings-plan");
      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to fetch savings plan");
      }

      const result = await response.json();
      setSavingsPlan(result);
      setGoalForm({
        target_amount: result.goal?.target_amount || "",
        target_date: result.goal?.target_date || "",
      });
    } catch (error) {
      console.error("Error fetching savings plan:", error);
    }
  }, [router]);

  useEffect(() => {
    fetchData();
    fetchMetals();
    fetchSavingsPlan();
  }, [fetchData, fetchMetals, fetchSavingsPlan]);

  const summary = useMemo(
    () => ({
      cash: data.currentMoney.reduce((sum, item) => sum + (item.amount || 0), 0),
      expected: data.expectedMoney.reduce((sum, item) => sum + (item.amount || 0), 0),
      owe: data.payables.reduce((sum, item) => sum + (item.amount || 0), 0),
      monthly: data.recurring.reduce((sum, item) => sum + (item.amount || 0), 0),
      longTermSavings: (metals.values.total || 0) + pensionAmount,
    }),
    [data, metals.values.total, pensionAmount]
  );

  const recurringByType = useMemo(
    () =>
      recurringTypes.reduce((groups, type) => {
        groups[type] = data.recurring.filter((item) => item.type === type);
        return groups;
      }, {}),
    [data.recurring]
  );

  const projectTotal = useMemo(
    () => data.projects.reduce((sum, item) => sum + (item.estimated_amount || 0), 0),
    [data.projects]
  );

  const getTableName = (tab) => {
    if (tab === "current") return "currentMoney";
    if (tab === "projects") return "projects";
    if (tab === "expected") return "expectedMoney";
    if (tab === "payables") return "payables";
    if (tab === "recurring") return "recurring";
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

  const toggleMonthGroup = (groupId, isOpen) => {
    setMonthGroupOverrides((previous) => ({
      ...previous,
      [groupId]: !isOpen,
    }));
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
      await Promise.all([fetchData(), activeTab === "expected" ? fetchSavingsPlan() : null]);
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
      await Promise.all([fetchData(), activeTab === "expected" ? fetchSavingsPlan() : null]);
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

      await Promise.all([fetchData(), activeTab === "expected" ? fetchSavingsPlan() : null]);
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

      await Promise.all([fetchData(), activeTab === "expected" ? fetchSavingsPlan() : null]);
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
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Failed to complete item");
      }

      setExpandedMetaIds((previous) =>
        previous.filter((entryId) => entryId !== `${table}:${id}` && entryId !== id)
      );
      await Promise.all([fetchData(), fetchSavingsPlan()]);
    } catch (error) {
      console.error("Error completing scheduled item:", error);
    } finally {
      setCompletingId(null);
    }
  };

  const handleGoalUpdate = async () => {
    const targetAmount = Number(goalForm.target_amount || 0);
    if (!Number.isFinite(targetAmount) || targetAmount < 0) return;

    try {
      const response = await fetch("/api/savings-plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_amount: targetAmount,
          target_date: goalForm.target_date || null,
        }),
      });
      if (!response.ok) throw new Error("Failed to update savings goal");

      setGoalEditing(false);
      await fetchSavingsPlan();
    } catch (error) {
      console.error("Error updating savings goal:", error);
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

  const handlePensionUpdate = async () => {
    try {
      const response = await fetch("/api/long-term-savings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aub_pension_amount: pensionForm }),
      });

      if (!response.ok) {
        throw new Error("Failed to update AUB pension");
      }

      setPensionEditing(false);
      await fetchMetals();
    } catch (error) {
      console.error("Error updating AUB pension:", error);
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

    if (activeTab === "projects") {
      return (
        <>
          <input
            type="text"
            className={styles.formInput}
            placeholder="Project description"
            value={formData.description || ""}
            onChange={(event) => setFormData({ ...formData, description: event.target.value })}
          />
          <input
            type="number"
            className={styles.formInput}
            min="0"
            step="0.01"
            placeholder="Estimated amount"
            value={formData.estimated_amount ?? ""}
            onChange={(event) =>
              setFormData({
                ...formData,
                estimated_amount: event.target.value === "" ? "" : Number(event.target.value),
              })
            }
          />
          <label className={styles.formField}>
            <span className={styles.formLabel}>Optional date</span>
            <input
              type="date"
              className={styles.formInput}
              value={formData.target_date || ""}
              onChange={(event) => setFormData({ ...formData, target_date: event.target.value })}
            />
          </label>
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
            placeholder="Expected amount"
            value={formData.amount || ""}
            onChange={(event) => setFormData({ ...formData, amount: parseFloat(event.target.value) || 0 })}
          />
          <input
            type="number"
            className={styles.formInput}
            min="0"
            max={formData.amount || undefined}
            step="0.01"
            placeholder="Planned to save"
            value={formData.planned_save_amount ?? ""}
            onChange={(event) =>
              setFormData({
                ...formData,
                planned_save_amount: event.target.value === "" ? "" : Number(event.target.value),
              })
            }
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

    return null;
  };

  const renderForm = () => {
    if (!showAddForm && editingId === null) return null;

    const projectFormInvalid =
      activeTab === "projects" &&
      (!formData.description?.trim() ||
        formData.estimated_amount === "" ||
        !Number.isFinite(Number(formData.estimated_amount)) ||
        Number(formData.estimated_amount) < 0);
    const expectedFormInvalid =
      activeTab === "expected" &&
      (formData.planned_save_amount === "" ||
        !Number.isFinite(Number(formData.planned_save_amount)) ||
        Number(formData.planned_save_amount) < 0 ||
        Number(formData.planned_save_amount) > Number(formData.amount || 0));

    return (
      <div className={styles.formCard}>
        <div className={styles.formGrid}>{renderFormFields()}</div>
        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => (editingId ? handleUpdate(editingId) : handleAdd())}
            disabled={projectFormInvalid || expectedFormInvalid}
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
        className={`${options.variant === "groupRow" ? styles.groupRow : styles.itemCard} ${
          isMetaExpanded ? styles.itemCardExpanded : ""
        }`}
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
        <strong className={styles.itemAmount}>
          ${formatMoney(options.amount ?? item.amount ?? 0)}
        </strong>
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

  const renderMonthGroupedList = (items, dateField, mapper, groupPrefix) => {
    const currentMonthKey = getMonthKey(getTodayBeirut());
    const groups = groupItemsByMonth(items, dateField);

    if (items.length === 0) {
      return (
        <div className={styles.groupList}>
          <div className={styles.emptyState}>Nothing here yet.</div>
        </div>
      );
    }

    return (
      <div className={styles.groupList}>
        {groups.map((group) => {
          const groupId = `${groupPrefix}:${group.monthKey}`;
          const isOpen = monthGroupOverrides[groupId] ?? group.monthKey === currentMonthKey;
          const total = group.items.reduce((sum, item) => sum + (item.amount || 0), 0);

          return (
            <section key={groupId} className={styles.groupCard}>
              <div className={`${styles.groupHeader} ${styles.monthGroupHeader}`}>
                <button
                  type="button"
                  className={styles.monthGroupButton}
                  onClick={() => toggleMonthGroup(groupId, isOpen)}
                  aria-expanded={isOpen}
                >
                  <span className={styles.monthGroupMain}>
                    <span className={styles.monthGroupTitle}>{formatMonthLabel(group.monthKey)}</span>
                    <span className={styles.monthGroupMeta}>{formatItemCount(group.items.length)}</span>
                  </span>
                  <strong className={styles.monthGroupAmount}>${formatMoney(total)}</strong>
                  <span className={styles.monthGroupChevron} aria-hidden="true">
                    {isOpen ? "⌃" : "⌄"}
                  </span>
                </button>
              </div>

              {isOpen ? (
                <div className={`${styles.groupRows} ${styles.monthGroupRows}`}>
                  {group.items.map((item) =>
                    renderItemCard(item, {
                      ...mapper(item),
                      canShift: true,
                      variant: "groupRow",
                    })
                  )}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    );
  };

  const renderSavingsPlanTab = () => {
    const targetAmount = savingsPlan.goal?.target_amount || 0;
    const plannedAmount = savingsPlan.summary?.planned || 0;
    const progress = targetAmount > 0 ? Math.min(100, (plannedAmount / targetAmount) * 100) : 0;

    return (
      <div className={styles.savingsPlanDashboard}>
        <section className={styles.savingsGoalCard}>
          <div className={styles.savingsGoalHeader}>
            <div>
              <span className={styles.summaryLabel}>Savings goal</span>
              <h3 className={styles.savingsGoalValue}>
                {targetAmount > 0 ? `$${formatMoney(targetAmount)}` : "Set your goal"}
              </h3>
              {savingsPlan.goal?.target_date ? (
                <p className={styles.itemMeta}>Target {formatDate(savingsPlan.goal.target_date)}</p>
              ) : null}
            </div>
            {!goalEditing ? (
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => setGoalEditing(true)}
              >
                {targetAmount > 0 ? "Edit goal" : "Set goal"}
              </button>
            ) : null}
          </div>

          {goalEditing ? (
            <div className={styles.goalForm}>
              <label className={styles.formField}>
                <span className={styles.formLabel}>Target amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={styles.formInput}
                  value={goalForm.target_amount}
                  onChange={(event) =>
                    setGoalForm({ ...goalForm, target_amount: event.target.value })
                  }
                />
              </label>
              <label className={styles.formField}>
                <span className={styles.formLabel}>Target date (optional)</span>
                <input
                  type="date"
                  className={styles.formInput}
                  value={goalForm.target_date}
                  onChange={(event) =>
                    setGoalForm({ ...goalForm, target_date: event.target.value })
                  }
                />
              </label>
              <div className={styles.formActions}>
                <button type="button" className={styles.primaryButton} onClick={handleGoalUpdate}>
                  Save goal
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    setGoalEditing(false);
                    setGoalForm({
                      target_amount: savingsPlan.goal?.target_amount || "",
                      target_date: savingsPlan.goal?.target_date || "",
                    });
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.progressTrack} aria-label={`${progress.toFixed(0)}% of goal planned`}>
                <span className={styles.progressFill} style={{ width: `${progress}%` }} />
              </div>
              <div className={styles.progressMeta}>
                <strong>${formatMoney(plannedAmount)} planned</strong>
                <span>{targetAmount > 0 ? `${progress.toFixed(0)}%` : "No goal yet"}</span>
              </div>
            </>
          )}
        </section>

        <div className={styles.planMetrics}>
          <div className={styles.planMetricCard}>
            <span className={styles.summaryLabel}>Planned to save</span>
            <strong>${formatMoney(plannedAmount)}</strong>
          </div>
          <div className={styles.planMetricCard}>
            <span className={styles.summaryLabel}>Expected payments</span>
            <strong>${formatMoney(savingsPlan.summary?.expected || 0)}</strong>
          </div>
          <div className={styles.planMetricCard}>
            <span className={styles.summaryLabel}>Planned rate</span>
            <strong>{(savingsPlan.summary?.planned_rate || 0).toFixed(1)}%</strong>
          </div>
        </div>

        <section className={styles.groupCard}>
          <div className={styles.groupHeader}>
            <div>
              <h3 className={styles.groupTitle}>Expected payments</h3>
              <p className={styles.itemMeta}>
                {formatItemCount(savingsPlan.summary?.item_count || 0)}
              </p>
            </div>
          </div>

          <div className={styles.groupRows}>
            {savingsPlan.items.map((item) => (
              <article key={item.id} className={styles.planRow}>
                <div className={styles.itemMain}>
                  <div className={styles.itemLine}>
                    <span className={styles.itemTitle}>{item.source || "Expected payment"}</span>
                    <span className={styles.itemMeta}>{formatDate(item.expected_date)}</span>
                  </div>
                  <span className={styles.planExpected}>
                    From ${formatMoney(item.expected_amount)} expected
                  </span>
                </div>
                <strong className={styles.itemAmount}>
                  ${formatMoney(item.planned_save_amount)}
                </strong>
                <div className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={() => {
                      setActiveTab("expected");
                      startEdit({ ...item, amount: item.expected_amount });
                    }}
                  >
                    Edit
                  </button>
                </div>
              </article>
            ))}
            {savingsPlan.items.length === 0 ? (
              <div className={styles.emptyState}>
                Add an expected payment and choose how much you plan to save from it.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    );
  };

  const renderCurrentTab = () => {
    if (activeTab === "plan") {
      return renderSavingsPlanTab();
    }

    if (activeTab === "current") {
      return renderStandardList(data.currentMoney, (item) => ({
        title: item.location,
        meta: item.notes || "",
        canShift: true,
      }));
    }

    if (activeTab === "projects") {
      return (
        <div className={styles.projectList}>
          <section className={styles.projectSummaryCard}>
            <span className={styles.summaryLabel}>{formatItemCount(data.projects.length)}</span>
            <strong>${formatMoney(projectTotal)} estimated</strong>
          </section>
          {renderStandardList(data.projects, (item) => ({
            title: item.description,
            amount: item.estimated_amount,
            meta: item.target_date ? `Target ${formatDate(item.target_date)}` : "",
            canShift: true,
          }))}
        </div>
      );
    }

    if (activeTab === "expected") {
      return renderMonthGroupedList(
        data.expectedMoney,
        "expected_date",
        (item) => ({
          title: item.source,
          meta: joinParts(
            formatDate(item.expected_date),
            `$${formatMoney(item.planned_save_amount || 0)} planned to save`,
            item.notes
          ),
          detailId: `expectedMoney:${item.id}`,
          canShift: true,
          completeAction: {
            table: "expectedMoney",
            label: "Received",
          },
        }),
        "expectedMoney"
      );
    }

    if (activeTab === "payables") {
      return renderMonthGroupedList(
        data.payables,
        "pay_date",
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
        "payables"
      );
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
      <div className={styles.longTermList}>
        <section className={styles.groupCard}>
          <div className={styles.groupHeader}>
            <div className={styles.itemMain}>
              <h3 className={styles.groupTitle}>AUB Pension</h3>
              <p className={styles.itemMeta}>Pension balance</p>
            </div>
            {pensionEditing ? (
              <input
                type="number"
                className={styles.inlineInput}
                min="0"
                step="0.01"
                aria-label="AUB Pension balance"
                value={pensionForm || ""}
                onChange={(event) => setPensionForm(parseFloat(event.target.value) || 0)}
              />
            ) : (
              <strong className={styles.itemAmount}>${formatMoney(pensionAmount)}</strong>
            )}
          </div>

          <div className={styles.cardActions}>
            {!pensionEditing ? (
              <button type="button" className={styles.actionButton} onClick={() => setPensionEditing(true)}>
                Edit pension
              </button>
            ) : (
              <>
                <button type="button" className={styles.actionButton} onClick={handlePensionUpdate}>
                  Save pension
                </button>
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={() => {
                    setPensionEditing(false);
                    setPensionForm(pensionAmount);
                  }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </section>

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
      </div>
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
  const canAdd = activeTab !== "metals" && activeTab !== "plan";

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
            <span className={styles.summaryLabel}>Savings</span>
            <strong>${formatMoney(summary.longTermSavings)}</strong>
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

          {activeTab === "recurring" && (
            <p className={styles.sectionTotal}>Total · ${formatMoney(summary.monthly)}/mo</p>
          )}

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
