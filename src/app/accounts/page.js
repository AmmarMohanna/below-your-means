"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import BottomNav from "@/components/BottomNav";
import AppHeader from "@/components/AppHeader";
import { getTodayBeirut, getNextMonthlyPaymentDate, isValidDateOnly } from "@/lib/date";
import { buildMonthlyDates, isValidCalendarDate, MAX_MONTHLY_ENTRIES } from "@/lib/monthly-series";

import styles from "./accounts.module.css";

const tabs = [
  { id: "current", name: "Current" },
  { id: "expected", name: "Expected" },
  { id: "payables", name: "Payables" },
  { id: "recurring", name: "Monthly" },
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

function getInitialSavingsPlanForm() {
  return {
    source: "",
    planned_date: getTodayBeirut(),
    amount: "",
    notes: "",
  };
}

function getInitialMonthlyRepeat() {
  return { enabled: false, endType: "count", count: "6", endDate: "" };
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
  const [cashSavingsAmount, setCashSavingsAmount] = useState(0);
  const [cashSavingsForm, setCashSavingsForm] = useState(0);
  const [savingsPlan, setSavingsPlan] = useState({
    items: [],
    summary: { planned: 0, item_count: 0 },
  });
  const [savingsPlanForm, setSavingsPlanForm] = useState(getInitialSavingsPlanForm);
  const [savingsPlanEditingId, setSavingsPlanEditingId] = useState(null);
  const [showSavingsPlanForm, setShowSavingsPlanForm] = useState(false);
  const [savingsPlanExpanded, setSavingsPlanExpanded] = useState(false);
  const [pricesForm, setPricesForm] = useState({ gold_per_oz: 2650, silver_per_kg: 950 });
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState(getInitialForm("current"));
  const [monthlyRepeat, setMonthlyRepeat] = useState(getInitialMonthlyRepeat);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formUncertain, setFormUncertain] = useState(false);
  const formSubmittingRef = useRef(false);
  const [metalsEditing, setMetalsEditing] = useState(false);
  const [pensionEditing, setPensionEditing] = useState(false);
  const [cashSavingsEditing, setCashSavingsEditing] = useState(false);
  const [pricesEditing, setPricesEditing] = useState(false);
  const [refreshingLivePrices, setRefreshingLivePrices] = useState(false);
  const [completingId, setCompletingId] = useState(null);
  const [monthGroupOverrides, setMonthGroupOverrides] = useState({});
  const [payingIds, setPayingIds] = useState([]);
  const [paymentErrors, setPaymentErrors] = useState({});
  const [today, setToday] = useState(getTodayBeirut);

  useEffect(() => {
    const refreshToday = () => setToday(getTodayBeirut());
    const timer = setInterval(refreshToday, 60_000);
    window.addEventListener("focus", refreshToday);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refreshToday);
    };
  }, []);

  const handleRecurringPaid = async (id, paid) => {
    setPayingIds((previous) => [...previous, id]);
    setPaymentErrors((previous) => ({ ...previous, [id]: "" }));
    try {
      const response = await fetch(`/api/accounts/recurring/${id}/payment`, { method: paid ? "POST" : "DELETE" });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) throw new Error("Could not save payment. Please try again.");
      const { item } = await response.json();
      setData((previous) => ({
        ...previous,
        recurring: previous.recurring.map((row) => row.id === item.id ? item : row),
      }));
      setToday(getTodayBeirut());
    } catch {
      setPaymentErrors((previous) => ({ ...previous, [id]: "Could not save payment. Please try again." }));
    } finally {
      setPayingIds((previous) => previous.filter((value) => value !== id));
    }
  };

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
      setCashSavingsAmount(result.longTermSavings?.cash_savings_amount || 0);
      setCashSavingsForm(result.longTermSavings?.cash_savings_amount || 0);
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
      longTermSavings: (metals.values.total || 0) + cashSavingsAmount,
    }),
    [cashSavingsAmount, data, metals.values.total]
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
    setMonthlyRepeat(getInitialMonthlyRepeat());
    setFormError("");
    setFormUncertain(false);
  };

  const selectTab = (tab) => {
    if (formSubmittingRef.current) return;
    if (formUncertain) { fetchData(); if (activeTab === "expected") fetchSavingsPlan(); }
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

  const getMonthlyPlan = () => {
    if (editingId !== null || !["expected", "payables"].includes(activeTab) || !monthlyRepeat.enabled) {
      return { repeat: null, dates: [], error: "" };
    }
    const repeat = monthlyRepeat.endType === "count"
      ? { end_type: "count", count: Number(monthlyRepeat.count) }
      : { end_type: "date", end_date: monthlyRepeat.endDate };
    try {
      const dates = buildMonthlyDates(activeTab === "expected" ? formData.expected_date : formData.pay_date, repeat);
      return { repeat, dates, error: "" };
    } catch (error) {
      return { repeat, dates: [], error: error.message };
    }
  };

  const getFormValidationError = () => {
    if (activeTab === "projects" && (!formData.description?.trim() || formData.estimated_amount === "" || !Number.isFinite(Number(formData.estimated_amount)) || Number(formData.estimated_amount) < 0)) {
      return "Enter a project description and a valid amount.";
    }
    if (activeTab === "recurring" && formData.last_paid_date &&
      (!isValidDateOnly(formData.last_paid_date) || formData.last_paid_date > today)) {
      return "Last paid must be a valid date on or before today.";
    }
    if (!["expected", "payables"].includes(activeTab)) return "";
    if (!formData.source?.trim()) return activeTab === "expected" ? "Source is required." : "Payee is required.";
    if (formData.source.length > 500) return "Use 500 characters or fewer.";
    const date = activeTab === "expected" ? formData.expected_date : formData.pay_date;
    if (!isValidCalendarDate(date)) return "Choose a valid date.";
    if (formData.amount === "" || !Number.isFinite(Number(formData.amount)) || Number(formData.amount) < 0) return "Enter an amount of zero or more.";
    if ((formData.notes || "").length > 2000) return "Keep notes to 2,000 characters or fewer.";
    if (activeTab === "expected" && formData.planned_save_amount !== "" && formData.planned_save_amount != null && (!Number.isFinite(Number(formData.planned_save_amount)) || Number(formData.planned_save_amount) < 0 || Number(formData.planned_save_amount) > Number(formData.amount))) {
      return "Planned savings must be between zero and the expected amount.";
    }
    return getMonthlyPlan().error;
  };

  const submitAccountForm = async (id = null) => {
    if (formSubmittingRef.current || formUncertain) return;
    const validationError = getFormValidationError();
    if (validationError) { setFormError(validationError); return; }
    const table = getTableName(activeTab);
    const monthlyPlan = getMonthlyPlan();
    const fields = { ...formData };
    delete fields.monthly_repeat;
    const payload = { table, ...fields };
    if (id !== null) payload.id = id;
    else if (["expected", "payables"].includes(activeTab)) payload.monthly_repeat = monthlyPlan.repeat;
    if (["expected", "payables"].includes(activeTab)) payload.amount = Number(formData.amount);
    formSubmittingRef.current = true;
    setFormSubmitting(true);
    setFormError("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch("/api/accounts", {
        method: id !== null ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const failure = new Error(result?.error || "Could not save this item. Please try again.");
        failure.uncertain = response.status >= 500 || response.status === 408 || Boolean(result?.uncertain);
        throw failure;
      }
      if (result?.success !== true || (id === null && (!Number.isSafeInteger(Number(result.id)) || Number(result.id) <= 0))) throw new Error("The save response could not be confirmed.");
      setEditingId(null);
      setShowAddForm(false);
      resetForm();
      await Promise.all([fetchData(), activeTab === "expected" ? fetchSavingsPlan() : null]);
    } catch (error) {
      const uncertain = error.uncertain !== false;
      setFormUncertain(uncertain);
      setFormError(uncertain ? "The save could not be confirmed. Close this form and check your items before adding them again." : error.message);
    } finally {
      clearTimeout(timeout);
      formSubmittingRef.current = false;
      setFormSubmitting(false);
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

  const resetSavingsPlanForm = () => {
    setSavingsPlanForm(getInitialSavingsPlanForm());
    setSavingsPlanEditingId(null);
    setShowSavingsPlanForm(false);
  };

  const handleSavingsPlanSubmit = async () => {
    const method = savingsPlanEditingId ? "PATCH" : "POST";
    const payload = savingsPlanEditingId
      ? { id: savingsPlanEditingId, ...savingsPlanForm }
      : savingsPlanForm;

    try {
      const response = await fetch("/api/savings-plan", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Failed to save savings plan item");

      resetSavingsPlanForm();
      await Promise.all([fetchSavingsPlan(), fetchData()]);
    } catch (error) {
      console.error("Error saving savings plan item:", error);
    }
  };

  const startSavingsPlanEdit = (item) => {
    setSavingsPlanEditingId(item.id);
    setShowSavingsPlanForm(true);
    setSavingsPlanForm({
      source: item.source || "",
      planned_date: item.planned_date || "",
      amount: item.amount || "",
      notes: item.notes || "",
    });
  };

  const handleSavingsPlanDelete = async (id) => {
    try {
      const response = await fetch(`/api/savings-plan?id=${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete savings plan item");

      if (savingsPlanEditingId === id) resetSavingsPlanForm();
      await Promise.all([fetchSavingsPlan(), fetchData()]);
    } catch (error) {
      console.error("Error deleting savings plan item:", error);
    }
  };


  const startEdit = (item) => {
    if (formSubmittingRef.current) return;
    if (formUncertain) { fetchData(); if (activeTab === "expected") fetchSavingsPlan(); }
    resetForm();
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

  const handleCashSavingsUpdate = async () => {
    try {
      const response = await fetch("/api/long-term-savings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cash_savings_amount: cashSavingsForm }),
      });

      if (!response.ok) {
        throw new Error("Failed to update current cash savings");
      }

      setCashSavingsEditing(false);
      await fetchMetals();
    } catch (error) {
      console.error("Error updating current cash savings:", error);
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
            aria-label="Source"
            maxLength={500}
            value={formData.source || ""}
            onChange={(event) => setFormData({ ...formData, source: event.target.value })}
          />
          <input
            type="date"
            className={styles.formInput}
            aria-label="Expected date"
            value={formData.expected_date || ""}
            onChange={(event) => setFormData({ ...formData, expected_date: event.target.value })}
          />
          <input
            type="number"
            className={styles.formInput}
            placeholder="Expected amount"
            aria-label="Expected amount"
            min="0" step="0.01" inputMode="decimal"
            value={formData.amount ?? ""}
            onChange={(event) => setFormData({ ...formData, amount: event.target.value })}
          />
          <input
            type="text"
            className={styles.formInput}
            placeholder="Notes"
            aria-label="Notes"
            maxLength={2000}
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
            aria-label="Pay to"
            maxLength={500}
            value={formData.source || ""}
            onChange={(event) => setFormData({ ...formData, source: event.target.value })}
          />
          <input
            type="date"
            className={styles.formInput}
            aria-label="Pay date"
            value={formData.pay_date || ""}
            onChange={(event) => setFormData({ ...formData, pay_date: event.target.value })}
          />
          <input
            type="number"
            className={styles.formInput}
            placeholder="Amount"
            aria-label="Amount"
            min="0" step="0.01" inputMode="decimal"
            value={formData.amount ?? ""}
            onChange={(event) => setFormData({ ...formData, amount: event.target.value })}
          />
          <input
            type="text"
            className={styles.formInput}
            placeholder="Notes"
            aria-label="Notes"
            maxLength={2000}
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
          <label className={styles.formField}>
            <span className={styles.formLabel}>Last paid · optional</span>
            <input
              type="date"
              className={styles.formInput}
              max={today}
              value={formData.last_paid_date || ""}
              onChange={(event) => setFormData({ ...formData, last_paid_date: event.target.value })}
            />
          </label>
        </>
      );
    }

    return null;
  };

  const renderForm = () => {
    if (!showAddForm && editingId === null) return null;
    const monthlyPlan = getMonthlyPlan();
    const supportsMonthlyRepeat = editingId === null && ["expected", "payables"].includes(activeTab);
    const showAdvanced = activeTab === "expected" || supportsMonthlyRepeat;
    const startDate = activeTab === "expected" ? formData.expected_date : formData.pay_date;

    return (
      <div className={styles.formCard} aria-busy={formSubmitting}>
        <fieldset className={styles.formFields} disabled={formSubmitting || formUncertain} onChange={() => setFormError("")}>
          <div className={styles.formGrid}>{renderFormFields()}</div>
          {showAdvanced && <details key={`${activeTab}-${editingId ?? "new"}`} className={styles.advanced}>
            <summary>Advanced</summary>
            <div className={styles.advancedFields}>
              {activeTab === "expected" && <label className={styles.formField}>
                <span className={styles.formLabel}>Add to savings plan (optional)</span>
                <input type="number" aria-label="Add to savings plan (optional)" className={styles.formInput} min="0" max={formData.amount === "" ? undefined : formData.amount} step="0.01" inputMode="decimal"
                  aria-describedby={supportsMonthlyRepeat && monthlyRepeat.enabled ? "expected-repeat-savings-help" : undefined}
                  placeholder="Amount" value={formData.planned_save_amount ?? ""}
                  onChange={(event) => setFormData({ ...formData, planned_save_amount: event.target.value === "" ? "" : Number(event.target.value) })} />
                {supportsMonthlyRepeat && monthlyRepeat.enabled && <span id="expected-repeat-savings-help" className={styles.formHelp}>Per month.</span>}
              </label>}
              {supportsMonthlyRepeat && <>
                <label className={styles.repeatToggle}>
                  <input type="checkbox" checked={monthlyRepeat.enabled} onChange={(event) => setMonthlyRepeat({ ...monthlyRepeat, enabled: event.target.checked })} />
                  <span>Repeat monthly</span>
                </label>
                {monthlyRepeat.enabled && <>
                  <div className={styles.formGrid}>
                    <label className={styles.formField}>
                      <span className={styles.formLabel}>Repeat until</span>
                      <select aria-label="Repeat until" className={`${styles.formInput} ${styles.repeatSelect}`} value={monthlyRepeat.endType}
                        onChange={(event) => setMonthlyRepeat({ ...monthlyRepeat, endType: event.target.value })}>
                        <option value="count">Number of months</option><option value="date">End date</option>
                      </select>
                    </label>
                    {monthlyRepeat.endType === "count" ? <label className={styles.formField}>
                      <span className={styles.formLabel}>Number of months</span>
                      <input type="number" className={styles.formInput} min="1" max={MAX_MONTHLY_ENTRIES} step="1" inputMode="numeric" value={monthlyRepeat.count}
                        aria-describedby={monthlyPlan.error ? undefined : "monthly-repeat-help"} aria-invalid={Boolean(formError && monthlyPlan.error)}
                        onChange={(event) => setMonthlyRepeat({ ...monthlyRepeat, count: event.target.value })} />
                    </label> : <label className={styles.formField}>
                      <span className={styles.formLabel}>End date</span>
                      <input type="date" className={styles.formInput} min={startDate || undefined} value={monthlyRepeat.endDate}
                        aria-describedby={monthlyPlan.error ? undefined : "monthly-repeat-help"} aria-invalid={Boolean(formError && monthlyPlan.error)}
                        onChange={(event) => setMonthlyRepeat({ ...monthlyRepeat, endDate: event.target.value })} />
                    </label>}
                  </div>
                  {!monthlyPlan.error && <p id="monthly-repeat-help" className={styles.formHelp} aria-live="polite">
                    {`${monthlyPlan.dates.length} monthly ${monthlyPlan.dates.length === 1 ? "item" : "items"} · ${formatDate(monthlyPlan.dates[0])}–${formatDate(monthlyPlan.dates.at(-1))} (first included)`}
                  </p>}
                </>}
              </>}
            </div>
          </details>}
        </fieldset>
        {formError && <p className={styles.formError} role="alert">{formError}</p>}
        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => submitAccountForm(editingId)}
            disabled={formSubmitting || formUncertain}
          >
            {formSubmitting ? (editingId !== null ? "Saving…" : "Adding…") : editingId !== null ? "Save changes" : "Add item"}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={formSubmitting}
            onClick={() => {
              if (formSubmittingRef.current) return;
              if (formUncertain) { fetchData(); if (activeTab === "expected") fetchSavingsPlan(); }
              setEditingId(null);
              setShowAddForm(false);
              resetForm();
            }}
          >
            {formUncertain ? "Close and check entries" : "Cancel"}
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

  const renderSavingsPlanSection = () => {
    const plannedAmount = savingsPlan.summary?.planned || 0;
    const planFormInvalid =
      !savingsPlanForm.source.trim() ||
      !Number.isFinite(Number(savingsPlanForm.amount)) ||
      Number(savingsPlanForm.amount) <= 0;

    return (
      <div className={styles.savingsPlanDashboard}>
        <div className={styles.planMetrics}>
          <section className={styles.planMetricCard} aria-labelledby="current-savings-title">
            <h3 id="current-savings-title" className={styles.savingsMetricLabel}>Current savings</h3>
            <strong className={styles.savingsMetricValue}>${formatMoney(summary.longTermSavings)}</strong>
            <dl className={styles.savingsBreakdown}>
              <div><dt>Gold</dt><dd>${formatMoney((metals.values.gold_24k || 0) + (metals.values.gold_21k || 0))}</dd></div>
              <div><dt>Silver</dt><dd>${formatMoney(metals.values.silver || 0)}</dd></div>
              <div><dt>Cash</dt><dd>${formatMoney(cashSavingsAmount)}</dd></div>
            </dl>
          </section>
          <section className={`${styles.planMetricCard} ${styles.projectedSavingsCard}`} aria-labelledby="planned-savings-title">
            <h3 id="planned-savings-title" className={styles.savingsMetricLabel}>Planned savings</h3>
            <strong className={styles.savingsMetricValue}>${formatMoney(summary.longTermSavings + plannedAmount)}</strong>
            <p className={styles.savingsMetricNote}>Current + planned additions</p>
            <div className={styles.savingsAddition}>
              <strong>+${formatMoney(plannedAmount)}</strong>
              <span>upcoming · {formatItemCount(savingsPlan.items.length)}</span>
            </div>
          </section>
        </div>

        <section className={styles.groupCard}>
          <h3>
            <button
              type="button"
              className={styles.monthGroupButton}
              aria-expanded={savingsPlanExpanded}
              aria-controls="savings-plan-content"
              onClick={() => setSavingsPlanExpanded((expanded) => !expanded)}
            >
              <span className={styles.monthGroupMain}>
                <span className={styles.monthGroupTitle}>Savings plan</span>
                <span className={styles.monthGroupMeta}>{formatItemCount(savingsPlan.items.length)} · all registered dates</span>
              </span>
              <span className={styles.monthGroupAmount}>${formatMoney(plannedAmount)}</span>
              <span className={styles.monthGroupChevron} aria-hidden="true">{savingsPlanExpanded ? "⌃" : "⌄"}</span>
            </button>
          </h3>
          <div id="savings-plan-content" hidden={!savingsPlanExpanded}>
            <div className={styles.planToolbar}>
              {!showSavingsPlanForm ? (
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={() => {
                    setSavingsPlanEditingId(null);
                    setSavingsPlanForm(getInitialSavingsPlanForm());
                    setShowSavingsPlanForm(true);
                  }}
                >
                  Add amount
                </button>
              ) : null}
            </div>

            {showSavingsPlanForm ? (
              <div className={`${styles.formCard} ${styles.planFormCard}`}>
                <div className={styles.formGrid}>
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder="Source or purpose"
                    value={savingsPlanForm.source}
                    onChange={(event) =>
                      setSavingsPlanForm({ ...savingsPlanForm, source: event.target.value })
                    }
                  />
                  <label className={styles.formField}>
                    <span className={styles.formLabel}>Date (optional)</span>
                    <input
                      type="date"
                      className={styles.formInput}
                      value={savingsPlanForm.planned_date}
                      onChange={(event) =>
                        setSavingsPlanForm({ ...savingsPlanForm, planned_date: event.target.value })
                      }
                    />
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    className={styles.formInput}
                    placeholder="Amount"
                    value={savingsPlanForm.amount}
                    onChange={(event) =>
                      setSavingsPlanForm({ ...savingsPlanForm, amount: event.target.value })
                    }
                  />
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder="Notes"
                    value={savingsPlanForm.notes}
                    onChange={(event) =>
                      setSavingsPlanForm({ ...savingsPlanForm, notes: event.target.value })
                    }
                  />
                </div>
                <div className={styles.formActions}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={handleSavingsPlanSubmit}
                    disabled={planFormInvalid}
                  >
                    {savingsPlanEditingId ? "Save amount" : "Add amount"}
                  </button>
                  <button type="button" className={styles.secondaryButton} onClick={resetSavingsPlanForm}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            <div className={styles.groupRows}>
              {savingsPlan.items.map((item) => (
                <article key={item.id} className={styles.planRow}>
                  <div className={styles.itemMain}>
                    <div className={styles.itemLine}>
                      <span className={styles.itemTitle}>{item.source}</span>
                      {item.planned_date ? (
                        <span className={styles.itemMeta}>{formatDate(item.planned_date)}</span>
                      ) : null}
                    </div>
                    {item.notes ? <span className={styles.planExpected}>{item.notes}</span> : null}
                  </div>
                  <div className={styles.planAmounts}>
                    <strong className={styles.itemAmount}>${formatMoney(item.amount)}</strong>
                    {item.expected_amount != null ? (
                      <span className={styles.planExpectedAmount}>of ${formatMoney(item.expected_amount)} expected</span>
                    ) : null}
                  </div>
                  <div className={styles.rowActions}>
                    <button
                      type="button"
                      className={styles.actionButton}
                      onClick={() => startSavingsPlanEdit(item)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => handleSavingsPlanDelete(item.id)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
              {savingsPlan.items.length === 0 ? (
                <div className={styles.emptyState}>
                  No savings amounts listed yet.
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    );
  };

  const renderCurrentTab = () => {
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
            item.planned_save_amount > 0
              ? `$${formatMoney(item.planned_save_amount)} added to savings plan`
              : "",
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
                  .map((item) => {
                    const nextDue = getNextMonthlyPaymentDate(item.last_paid_date);
                    const isDue = nextDue && nextDue <= today;
                    const isPaid = Boolean(nextDue && nextDue > today);
                    const saving = payingIds.includes(item.id);
                    return (
                      <article key={item.id} className={`${styles.groupRow} ${styles.recurringRow}`}>
                        <div className={`${styles.itemMain} ${styles.paymentMain}`}>
                          <label className={styles.paymentToggle}>
                            <input
                              type="checkbox"
                              checked={isPaid}
                              disabled={saving}
                              aria-label={`Mark ${item.target} ${isPaid ? "unpaid" : "paid"}`}
                              onChange={(event) => handleRecurringPaid(item.id, event.target.checked)}
                            />
                          </label>
                          <div className={styles.paymentDetails}>
                            <span className={styles.itemTitle}>{item.target}</span>
                            {nextDue && (
                              <p
                                className={`${styles.paymentDate} ${isDue ? styles.paymentDue : ""}`}
                                title={`Last paid ${formatDate(item.last_paid_date)}`}
                                aria-live="polite"
                              >
                                {nextDue < today ? "Overdue · " : nextDue === today ? "Due today · " : "Next due "}
                                <time dateTime={nextDue}>{formatDate(nextDue)}</time>
                              </p>
                            )}
                          </div>
                        </div>
                        <strong className={styles.itemAmount}>${formatMoney(item.amount || 0)}</strong>
                        <div className={`${styles.rowActions} ${styles.paymentActions}`}>
                          <button
                            type="button"
                            className={styles.actionButton}
                            disabled={saving}
                            aria-label={`Edit ${item.target}`}
                            onClick={() => startEdit(item)}
                          >
                            <span className={styles.mobileIcon} aria-hidden="true">✎</span>
                            <span className={styles.buttonLabel}>Edit</span>
                          </button>
                          <button
                            type="button"
                            className={styles.deleteButton}
                            disabled={saving}
                            aria-label={`Delete ${item.target}`}
                            onClick={() => handleDelete(item.id)}
                          >
                            <span className={styles.mobileIcon} aria-hidden="true">⌫</span>
                            <span className={styles.buttonLabel}>Delete</span>
                          </button>
                        </div>
                        {paymentErrors[item.id] && (
                          <p className={styles.paymentError} role="alert">{paymentErrors[item.id]}</p>
                        )}
                      </article>
                    );
                  })}
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
        {renderSavingsPlanSection()}

        <div className={styles.savingsHoldingsHeader}>
          <div>
            <h3 className={styles.groupTitle}>Savings breakdown</h3>
          </div>
        </div>

        <div className={styles.savingsAccountsGrid}>
          <section className={styles.groupCard}>
            <div className={styles.groupHeader}>
              <div className={styles.itemMain}>
                <h3 className={styles.groupTitle}>Current cash savings</h3>
              </div>
              {cashSavingsEditing ? (
                <input
                  type="number"
                  className={styles.inlineInput}
                  min="0"
                  step="0.01"
                  aria-label="Current cash savings balance"
                  value={cashSavingsForm || ""}
                  onChange={(event) => setCashSavingsForm(parseFloat(event.target.value) || 0)}
                />
              ) : (
                <strong className={styles.itemAmount}>${formatMoney(cashSavingsAmount)}</strong>
              )}
            </div>

            <div className={styles.cardActions}>
              {!cashSavingsEditing ? (
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={() => setCashSavingsEditing(true)}
                >
                  Edit cash savings
                </button>
              ) : (
                <>
                  <button type="button" className={styles.actionButton} onClick={handleCashSavingsUpdate}>
                    Save cash savings
                  </button>
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={() => {
                      setCashSavingsEditing(false);
                      setCashSavingsForm(cashSavingsAmount);
                    }}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </section>
        </div>

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

        <section className={`${styles.groupCard} ${styles.pensionCard}`}>
          <div className={styles.groupHeader}>
            <div className={styles.itemMain}>
              <h3 className={styles.groupTitle}>AUB Pension</h3>
              <p className={styles.savingsMetricNote}>Excluded from savings totals</p>
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
  const canAdd = activeTab !== "metals";

  return (
    <div className={styles.container}>
      <AppHeader title="Money" />
      <div className={styles.header}>
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
      </div>

      <div className={styles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`${styles.tabButton} ${activeTab === tab.id ? styles.activeTab : ""}`}
            disabled={formSubmitting}
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
              disabled={formSubmitting || formUncertain}
              onClick={() => {
                if (formSubmittingRef.current) return;
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
