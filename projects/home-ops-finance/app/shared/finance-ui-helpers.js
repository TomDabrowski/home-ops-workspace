// Shared browser helpers for labels, select options, and baseline line-item
// shaping. Keep these stateless so workspaces can reuse them safely.

export function wealthSnapshotCashAccounts(entry) {
  const accounts = entry?.cashAccounts;
  if (accounts && typeof accounts === "object") {
    return {
      giro: Number(accounts.giro ?? 0),
      cash: Number(accounts.cash ?? 0),
      savings: Number(accounts.savings ?? 0),
    };
  }

  return {
    giro: Number(entry?.cashAmount ?? 0),
    cash: 0,
    savings: 0,
  };
}

export function wealthSnapshotCashTotal(entry, roundCurrency) {
  const accounts = wealthSnapshotCashAccounts(entry);
  return roundCurrency(accounts.giro + accounts.cash + accounts.savings);
}

export function thresholdAccountLabel(accountOptions, accountId) {
  return accountOptions.find((entry) => entry.id === accountId)?.label ?? accountId;
}

export function buildCategoryOptions(items) {
  return items.map((item) => ({ id: item.id, label: item.name }));
}

export function buildAccountOptions(items, fallbackAccountOptions) {
  if (!items || items.length === 0) {
    return fallbackAccountOptions;
  }

  return items
    .filter((item) => item.isActive !== false)
    .map((item) => ({ id: item.id, label: item.name }));
}

export function optionMarkup(options, selectedValue) {
  return options
    .map((option) => `<option value="${option.id}" ${option.id === selectedValue ? "selected" : ""}>${option.label}</option>`)
    .join("");
}

export function baselineLineItemKey(item) {
  return `${item.category}:${item.label}`;
}

export function normalizeComparisonLabel(value) {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function annualReserveDueDateForItem(importDraft, item) {
  if (!importDraft || item.category !== "annual_reserve") {
    return null;
  }

  const itemLabel = normalizeComparisonLabel(item.label);
  if (!itemLabel) {
    return null;
  }

  const itemTokens = itemLabel.split(" ").filter(Boolean);
  const candidates = (importDraft.expenseEntries ?? [])
    .filter((entry) => {
      const description = normalizeComparisonLabel(entry.description);
      if (!description) {
        return false;
      }
      return itemTokens.every((token) => description.includes(token)) || description.includes(itemLabel);
    })
    .sort((left, right) => String(right.entryDate ?? "").localeCompare(String(left.entryDate ?? "")));

  return candidates[0]?.entryDate ?? null;
}

export function formatRecurringDayMonth(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) {
    return "";
  }

  return String(value).slice(8, 10) + "." + String(value).slice(5, 7) + ".";
}

export function baselineAmountLabel(item, importDraft, deps) {
  const { euro, formatDisplayDate } = deps;
  const monthlyAmount = euro.format(item.amount);
  if (item.category === "annual_reserve") {
    const dueDate = annualReserveDueDateForItem(importDraft, item);
    const recurringDueDate = formatRecurringDayMonth(dueDate);
    const dueDateLabel = recurringDueDate ? ` · Abbuchung immer am ${recurringDueDate}` : "";
    return `${monthlyAmount} (${euro.format(Number(item.amount ?? 0) * 12)} p.a.${dueDateLabel})`;
  }

  if (item.pendingStopLabel && item.pendingStopDate) {
    return `${monthlyAmount} · ${formatDisplayDate(item.pendingStopDate)}`;
  }

  return monthlyAmount;
}

export function storedAmountFromEditorValue(category, rawAmount, roundCurrency) {
  if (category === "annual_reserve") {
    return roundCurrency(rawAmount / 12);
  }

  return roundCurrency(rawAmount);
}

export function editorValueFromStoredAmount(category, storedAmount, roundCurrency) {
  if (category === "annual_reserve") {
    return roundCurrency(Number(storedAmount ?? 0) * 12);
  }

  return roundCurrency(Number(storedAmount ?? 0));
}

export function incomeStreamLabel(importDraft, streamId) {
  return importDraft.incomeStreams.find((item) => item.id === streamId)?.name ?? streamId;
}

export function expenseCategoryLabel(importDraft, categoryId) {
  return importDraft.expenseCategories.find((item) => item.id === categoryId)?.name ?? categoryId;
}

export function baselineCategoryLabel(category) {
  const labels = {
    fixed: "Fixkosten",
    variable: "Variable Basis",
    annual_reserve: "Jahreskostenblock",
    savings: "Geplantes Investment",
  };
  return labels[category] ?? category;
}

export function sourcePreview(notes) {
  if (!notes) {
    return "Keine zusätzliche Herkunftsnotiz.";
  }

  return notes.length > 160 ? `${notes.slice(0, 157)}...` : notes;
}

export function activeBaselineLineItemsForMonth(importDraft, monthKey, deps) {
  const {
    todayIsoDate,
    readBaselineOverrides,
    formatDisplayDate,
    formatMonthLabel,
  } = deps;

  const today = todayIsoDate();
  const todayMonthKey = today.slice(0, 7);
  const mergedItems = [
    ...(importDraft.baselineLineItems ?? []),
    ...readBaselineOverrides().filter((item) => item.isActive !== false),
  ];
  const activeItems = mergedItems.filter((item) => item.effectiveFrom <= monthKey);
  const latestByKey = new Map();

  for (const item of activeItems.sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))) {
    const key = baselineLineItemKey(item);
    if (Number(item.amount) <= 0) {
      const stopDate = String(item.endDate ?? "");
      const stillRunningThisMonth =
        monthKey === todayMonthKey &&
        item.effectiveFrom === todayMonthKey &&
        stopDate &&
        stopDate > today;

      if (stillRunningThisMonth) {
        const existing = latestByKey.get(key);
        if (existing) {
          latestByKey.set(key, {
            ...existing,
            pendingStopDate: stopDate,
            pendingStopLabel: `Gekündigt zum ${formatDisplayDate(stopDate)}`,
          });
        }
        continue;
      }

      latestByKey.delete(key);
      continue;
    }

    latestByKey.set(key, {
      ...item,
      pendingStopDate: null,
      pendingStopLabel: "",
    });
  }

  for (const item of mergedItems
    .filter((entry) => entry.isActive !== false && Number(entry.amount) <= 0 && entry.effectiveFrom > monthKey)
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))) {
    const key = baselineLineItemKey(item);
    const existing = latestByKey.get(key);
    if (!existing || existing.pendingStopLabel) {
      continue;
    }

    latestByKey.set(key, {
      ...existing,
      pendingStopDate: item.endDate ?? null,
      pendingStopLabel: item.endDate
        ? `Gekündigt zum ${formatDisplayDate(item.endDate)}`
        : `Endet ab ${formatMonthLabel(item.effectiveFrom)}`,
    });
  }

  return [...latestByKey.values()];
}
