import React, { createContext, useContext, useEffect, useState } from "react";
import { formatKsh } from "../utils/currency";
import { formatPONumber, getPONumberSequence } from "../utils/purchaseOrderNumber";
import { normalizeInventoryTransaction } from "../utils/inventoryTransactions";

const InventoryContext = createContext(null);

const defaultSuppliers = [
  { id: "SUP-1", name: "FiberLink Distributors", email: "sales@fiberlink.co.ke", leadTimeDays: 3, paymentTerms: "Net 30" },
  { id: "SUP-2", name: "PowerGrid Supplies Ltd", email: "orders@powergrid.com", leadTimeDays: 7, paymentTerms: "50% Upfront" },
];

const defaultItems = [
  { id: "ITM-1", sku: "FOC-24C", name: "24-Core Fiber Optic Cable (1km)", category: "Fiber Optics", unitCost: 58500, stock: 4, reorderLevel: 5, uom: "km" },
  { id: "ITM-2", sku: "BAT-12V", name: "12V 100Ah Deep Cycle Battery", category: "Power & Backup", unitCost: 23500, stock: 14, reorderLevel: 6, uom: "piece" },
  { id: "ITM-3", sku: "SWT-48G", name: "48-Port Gigabit Rack Switch", category: "Networking Hardware", unitCost: 42000, stock: 2, reorderLevel: 4, uom: "piece" },
  { id: "ITM-4", sku: "ONT-DUAL", name: "Dual-Band Wi-Fi 6 GPON ONT Router", category: "Customer Premises (CPE)", unitCost: 4800, stock: 45, reorderLevel: 30, uom: "piece" },
  { id: "ITM-5", sku: "SPL-1X16", name: "1x16 PLC Fiber Optic Splitter", category: "Fiber Optics", unitCost: 2200, stock: 18, reorderLevel: 20, uom: "piece" },
];

const defaultPurchaseOrders = [
  {
    id: "PO-1001",
    orderNumber: "PO:001",
    supplierId: "SUP-1",
    quotationId: "QT-3001",
    date: "2026-07-12",
    status: "Received",
    lineItems: [
      { itemId: "ITM-1", quantity: 8, unitCost: 59000 },
      { itemId: "ITM-5", quantity: 50, unitCost: 2200 },
    ],
  },
  {
    id: "PO-1002",
    orderNumber: "PO:002",
    supplierId: "SUP-2",
    quotationId: null,
    date: "2026-08-19",
    status: "Received",
    lineItems: [{ itemId: "ITM-2", quantity: 20, unitCost: 23500 }],
  },
  {
    id: "PO-1003",
    orderNumber: "PO:003",
    supplierId: "SUP-1",
    quotationId: null,
    date: "2026-09-10",
    status: "Received",
    lineItems: [
      { itemId: "ITM-4", quantity: 120, unitCost: 4800 },
      { itemId: "ITM-1", quantity: 5, unitCost: 58500 },
    ],
  },
  {
    id: "PO-1004",
    orderNumber: "PO:004",
    supplierId: "SUP-2",
    quotationId: null,
    date: "2026-10-22",
    status: "Received",
    lineItems: [
      { itemId: "ITM-3", quantity: 6, unitCost: 42000 },
      { itemId: "ITM-2", quantity: 12, unitCost: 23500 },
    ],
  },
  {
    id: "PO-1005",
    orderNumber: "PO:005",
    supplierId: "SUP-1",
    quotationId: null,
    date: "2026-11-14",
    status: "Pending",
    lineItems: [
      { itemId: "ITM-1", quantity: 6, unitCost: 58500 },
      { itemId: "ITM-4", quantity: 80, unitCost: 4750 },
    ],
  },
];

const previousDefaultItems = [
  { id: "ITM-1", sku: "FOC-24C", name: "24-Core Fiber Optic Cable (1km)", category: "Fiber Optics", unitCost: 58500, stock: 4, reorderLevel: 5 },
  { id: "ITM-2", sku: "BAT-12V", name: "12V 100Ah Deep Cycle Battery", category: "Power & Backup", unitCost: 23500, stock: 14, reorderLevel: 6 },
  { id: "ITM-3", sku: "SWT-48G", name: "48-Port Gigabit Rack Switch", category: "Networking Hardware", unitCost: 42000, stock: 2, reorderLevel: 4 },
];

const previousDefaultPurchaseOrders = [{
  id: "PO-1001",
  orderNumber: "PO:001",
  supplierId: "SUP-1",
  quotationId: null,
  date: "2026-11-14",
  status: "Pending",
  lineItems: [{ itemId: "ITM-1", quantity: 6, unitCost: 58500 }],
}];

const defaultPurchaseRequests = [
  {
    id: "PR-2001",
    requestedBy: "Field Engineering Team",
    department: "Network Maintenance",
    urgency: "High",
    date: "2026-11-16",
    status: "Quoted",
    lineItems: [{ itemId: "ITM-1", quantity: 10 }],
  },
];

const defaultQuotations = [
  {
    id: "QT-3001",
    prId: "PR-2001",
    supplierId: "SUP-1",
    validUntil: "2026-11-30",
    status: "Submitted",
    lineItems: [{ itemId: "ITM-1", quantity: 10, quotedUnitCost: 58500 }],
  },
];

const defaultNotifications = [
  {
    id: "NOTIF-1",
    targetRoles: ["Procurement", "Director"],
    title: "Quotation received for PR-2001",
    message: "A supplier quotation is ready for review and purchase order conversion.",
    link: "/inventory/quotations",
    read: false,
    timestamp: "10 mins ago",
  },
];

const roles = ["Requester", "Procurement", "Director"];
const metricUnitFactors = { km: 1000, m: 1 };

export const normalizeUomName = (uom) => {
  const normalized = String(uom || "").trim().toLowerCase();
  const aliases = {
    kilometer: "km",
    kilometers: "km",
    kilometre: "km",
    kilometres: "km",
    meter: "m",
    meters: "m",
    metre: "m",
    metres: "m",
    pc: "piece",
    pcs: "piece",
    pieces: "piece",
    reels: "reel",
    rolls: "roll",
    pairs: "pair",
    pkt: "packet",
    pkts: "packet",
    packets: "packet",
  };
  return aliases[normalized] || normalized;
};

const lengthFactor = (item, unit) => {
  const normalized = normalizeUomName(unit);
  if (metricUnitFactors[normalized]) return metricUnitFactors[normalized];
  if (normalized === item?.cablePackageUnit && Number(item?.cableLengthMeters) > 0) return Number(item.cableLengthMeters);
  return null;
};

export const convertItemQuantity = (quantity, fromUom, toUom, item) => {
  const from = normalizeUomName(fromUom);
  const to = normalizeUomName(toUom);
  if (from === to) return Number(quantity);
  const fromFactor = lengthFactor(item, from);
  const toFactor = lengthFactor(item, to);
  if (fromFactor && toFactor) return Number(quantity) * fromFactor / toFactor;
  return null;
};

export const getStockUnit = (item, uom) => {
  const unit = normalizeUomName(uom);
  if (!unit) throw new Error("Enter a unit of measure.");
  const units = [item.uom, ...Object.keys(item.unitBalances || {})];
  return units.find((candidate) => convertItemQuantity(1, unit, candidate, item) !== null) || unit;
};

export const getStockBalance = (item, unit) => (
  normalizeUomName(unit) === normalizeUomName(item.uom)
    ? Number(item.stock)
    : Number(item.unitBalances?.[normalizeUomName(unit)] || 0)
);

export const formatStockBalances = (item) => [
  `${item.stock} ${item.uom}${lengthFactor(item, item.uom) && ["roll", "reel"].includes(normalizeUomName(item.uom)) ? ` (${Number((Number(item.stock) * lengthFactor(item, item.uom)).toFixed(6))} m)` : ""}`,
  ...Object.entries(item.unitBalances || {}).filter(([, quantity]) => Number(quantity) !== 0)
    .map(([unit, quantity]) => `${quantity} ${unit}${lengthFactor(item, unit) && ["roll", "reel"].includes(unit) ? ` (${Number((Number(quantity) * lengthFactor(item, unit)).toFixed(6))} m)` : ""}`),
].join(", ");

const updateStockBalance = (item, unit, quantity) => {
  if (normalizeUomName(unit) === normalizeUomName(item.uom)) return { ...item, stock: quantity };
  return { ...item, unitBalances: { ...item.unitBalances, [unit]: quantity } };
};

export const convertQuantity = (quantity, fromUom, toUom) => {
  const from = normalizeUomName(fromUom);
  const to = normalizeUomName(toUom);
  if (from === to) return Number(quantity);
  if (metricUnitFactors[from] && metricUnitFactors[to]) {
    return Number(quantity) * metricUnitFactors[from] / metricUnitFactors[to];
  }
  throw new Error(`Cannot convert ${fromUom} to ${toUom}. Use the item's stock unit.`);
};

const convertUnitCost = (unitCost, fromUom, toUom) => {
  const from = normalizeUomName(fromUom);
  const to = normalizeUomName(toUom);
  if (from === to) return Number(unitCost);
  return Number(unitCost) * metricUnitFactors[to] / metricUnitFactors[from];
};

const readStoredList = (key, fallback) => {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const readInitialInventoryTransactions = () => {
  const savedTransactions = readStoredList("inventory-transactions", null);
  if (savedTransactions) return savedTransactions;

  return readStoredList("inventory", [])
    .filter((entry) => (
      entry
      && entry.date
      && String(entry.item || "").trim()
      && String(entry.supplier || "").trim()
      && Number(entry.quantity) > 0
      && Number.isFinite(Number(entry.amount))
      && Number(entry.amount) >= 0
    ))
    .map((entry, index) => ({
      ...entry,
      id: entry.id || `LEGACY-INV-${index + 1}`,
      uom: entry.uom || "Units",
      category: entry.category || "General Materials",
      total: Number(entry.quantity) * Number(entry.amount),
    }));
};

const normalizePurchaseOrders = (orders) => {
  const usedNumbers = new Set(
    orders
      .map((order) => getPONumberSequence(order.orderNumber))
      .filter((number) => Number.isInteger(number) && number > 0)
  );
  const orderNumbers = new Map();
  orders.forEach((order, index) => {
    const number = getPONumberSequence(order.orderNumber);
    if (Number.isInteger(number) && number > 0) {
      orderNumbers.set(index, formatPONumber(number));
    }
  });

  const missingNumbers = orders
    .map((order, index) => ({ order, index }))
    .filter(({ index }) => !orderNumbers.has(index))
    .sort((left, right) => String(left.order.date || "").localeCompare(String(right.order.date || "")));
  let nextNumber = 1;
  missingNumbers.forEach(({ index }) => {
    while (usedNumbers.has(nextNumber)) nextNumber += 1;
    orderNumbers.set(index, formatPONumber(nextNumber));
    usedNumbers.add(nextNumber);
    nextNumber += 1;
  });

  return orders.map((order, index) => ({ ...order, orderNumber: orderNumbers.get(index) }));
};

const addItemUnits = (items) => items.map((item) => ({
  ...item,
  uom: normalizeUomName(item.uom || (item.sku === "FOC-24C" ? "km" : "piece")),
}));

const addPurchaseOrderLineUnits = (orders, items) => orders.map((order) => ({
  ...order,
  lineItems: order.lineItems.map((line) => ({
    ...line,
    uom: line.uom || items.find((item) => item.id === line.itemId)?.uom || "piece",
  })),
}));

const readInitialInventory = () => {
  const storedItems = readStoredList("inventory-managed-items", null);
  const storedPurchaseOrders = readStoredList("inventory-managed-purchase-orders", null);
  const canUpgradeSeed = (!storedItems || JSON.stringify(storedItems) === JSON.stringify(previousDefaultItems))
    && (!storedPurchaseOrders || JSON.stringify(storedPurchaseOrders) === JSON.stringify(previousDefaultPurchaseOrders));

  if (canUpgradeSeed) {
    const items = addItemUnits(defaultItems);
    return {
      items,
      purchaseOrders: normalizePurchaseOrders(addPurchaseOrderLineUnits(defaultPurchaseOrders, items)),
    };
  }

  const items = addItemUnits(storedItems || defaultItems);
  return {
    items,
    purchaseOrders: normalizePurchaseOrders(addPurchaseOrderLineUnits(storedPurchaseOrders || defaultPurchaseOrders, items)),
  };
};

const readStoredValue = (key, fallback) => {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
};

function normalizeItem(item) {
  const name = String(item.name || "").trim();
  const sku = String(item.sku || "").trim();
  const unitCost = Number(item.unitCost);
  const stock = Number(item.stock);
  const reorderLevel = Number(item.reorderLevel);
  const uom = normalizeUomName(item.uom);
  if (!name || !sku) throw new Error("Item name and SKU are required.");
  if (!uom) throw new Error("Unit of measure is required.");
  if (![unitCost, stock, reorderLevel].every(Number.isFinite) || unitCost < 0 || stock < 0 || reorderLevel < 0) {
    throw new Error("Unit cost, stock, and reorder level must be valid non-negative numbers.");
  }
  return {
    ...item,
    name,
    sku,
    category: String(item.category || "").trim() || "General Materials",
    uom,
    unitCost,
    stock,
    reorderLevel,
  };
}

let idSequence = 0;
const createId = (prefix) => `${prefix}-${Date.now()}-${++idSequence}`;
const categoryKey = (value) => String(value || "").trim().toLowerCase();

export function InventoryProvider({ children }) {
  const [initialInventory] = useState(readInitialInventory);
  const [currentRole, setCurrentRole] = useState(() => {
    const storedRole = readStoredValue("inventory-current-role", "Director");
    return roles.includes(storedRole) ? storedRole : "Director";
  });
  const [notifications, setNotifications] = useState(() => readStoredList("inventory-notifications", defaultNotifications));
  const [suppliers, setSuppliers] = useState(() => readStoredList("inventory-managed-suppliers", defaultSuppliers));
  const [supplierInvoices, setSupplierInvoices] = useState(() => readStoredList("inventory-supplier-invoices", []));
  const [items, setItems] = useState(initialInventory.items);
  const [purchaseOrders, setPurchaseOrders] = useState(initialInventory.purchaseOrders);
  const [inventoryTransactions, setInventoryTransactions] = useState(readInitialInventoryTransactions);
  const [customCategories, setCustomCategories] = useState(() => readStoredList("inventory-categories", []));
  const [stockMovements, setStockMovements] = useState(() => readStoredList("inventory-stock-movements", []).map((movement) => {
    const item = initialInventory.items.find((entry) => entry.id === movement.itemId);
    const uom = normalizeUomName(movement.uom || item?.uom || "piece");
    const stockUom = movement.stockUom || item?.uom || uom;
    const receiptOrders = !movement.isPurchase && movement.notes === "Purchase order receipt"
      ? initialInventory.purchaseOrders.filter((order) => (order.orderNumber || order.id) === movement.reference)
      : [];
    const receiptOrder = receiptOrders.length === 1 ? receiptOrders[0] : null;
    const receiptLines = receiptOrder?.lineItems.filter((line) => line.itemId === movement.itemId) || [];
    const receiptSupplier = suppliers.find((supplier) => supplier.id === receiptOrder?.supplierId);
    const legacyPurchase = receiptLines.length === 1 && receiptSupplier ? {
      isPurchase: true,
      supplierId: receiptSupplier.id,
      supplier: receiptSupplier.name,
      category: item?.category || "General Materials",
      unitCost: convertUnitCost(receiptLines[0].unitCost, receiptLines[0].uom || uom, uom),
    } : {};
    return {
      ...movement,
      ...legacyPurchase,
      uom,
      stockUom,
      quantityInStockUnit: movement.quantityInStockUnit ?? convertQuantity(movement.quantity, uom, stockUom),
    };
  }));
  const [purchaseRequests, setPurchaseRequests] = useState(() => readStoredList("inventory-purchase-requests", defaultPurchaseRequests));
  const [quotations, setQuotations] = useState(() => readStoredList("inventory-quotations", defaultQuotations));
  const [roleMenuPermissions, setRoleMenuPermissions] = useState(() => (
    readStoredValue("roleMenuPermissions", {})
  ));
  const categoriesByKey = new Map();
  ["General Materials", ...customCategories, ...items.map((item) => item.category), ...stockMovements.map((movement) => movement.category), ...inventoryTransactions.map((transaction) => transaction.category)]
    .forEach((value) => {
      const name = String(value || "").trim();
      if (name && !categoriesByKey.has(categoryKey(name))) categoriesByKey.set(categoryKey(name), name);
    });
  const inventoryCategories = [...categoriesByKey.values()].sort((a, b) => a.localeCompare(b));
  const purchaseTransactions = stockMovements
    .filter((movement) => movement.movementType === "in" && movement.isPurchase)
    .map((movement) => ({
      id: movement.id, itemId: movement.itemId, date: movement.date, item: movement.item, sku: movement.sku,
      supplier: movement.supplier, category: movement.category || items.find((item) => item.id === movement.itemId)?.category || "General Materials", quantity: movement.quantity,
      uom: movement.uom, amount: movement.unitCost, total: movement.quantity * movement.unitCost,
      reference: movement.reference, notes: movement.notes,
    }));

  useEffect(() => {
    localStorage.setItem("inventory-current-role", JSON.stringify(currentRole));
  }, [currentRole]);

  useEffect(() => {
    localStorage.setItem("inventory-notifications", JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem("inventory-managed-suppliers", JSON.stringify(suppliers));
  }, [suppliers]);

  useEffect(() => {
    localStorage.setItem("inventory-supplier-invoices", JSON.stringify(supplierInvoices));
  }, [supplierInvoices]);

  useEffect(() => {
    localStorage.setItem("inventory-managed-items", JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem("inventory-managed-purchase-orders", JSON.stringify(purchaseOrders));
  }, [purchaseOrders]);

  useEffect(() => {
    localStorage.setItem("inventory-transactions", JSON.stringify(inventoryTransactions));
  }, [inventoryTransactions]);

  useEffect(() => {
    localStorage.setItem("inventory-stock-movements", JSON.stringify(stockMovements));
  }, [stockMovements]);

  useEffect(() => {
    localStorage.setItem("inventory-categories", JSON.stringify(customCategories));
  }, [customCategories]);

  useEffect(() => {
    localStorage.setItem("inventory-purchase-requests", JSON.stringify(purchaseRequests));
  }, [purchaseRequests]);

  useEffect(() => {
    localStorage.setItem("inventory-quotations", JSON.stringify(quotations));
  }, [quotations]);

  useEffect(() => {
    localStorage.setItem("roleMenuPermissions", JSON.stringify(roleMenuPermissions));
  }, [roleMenuPermissions]);

  const notifyLeadership = (title, message, link) => {
    const notification = {
      id: createId("NOTIF"),
      targetRoles: ["Procurement", "Director"],
      title,
      message,
      link,
      read: false,
      timestamp: new Date().toISOString(),
    };
    setNotifications((previous) => [notification, ...previous]);
  };

  const markNotificationRead = (notificationId) => {
    setNotifications((previous) => previous.map((notification) => (
      notification.id === notificationId ? { ...notification, read: true } : notification
    )));
  };

  const addSupplier = (supplier) => {
    const name = String(supplier.name || "").trim();
    const email = String(supplier.email || "").trim();
    const phone = String(supplier.phone || "").trim();
    const address = String(supplier.address || "").trim();
    const leadTimeDays = Number(supplier.leadTimeDays);
    const paymentTerms = String(supplier.paymentTerms || "").trim();
    if (!name || !paymentTerms) throw new Error("Supplier name and payment terms are required.");
    if (!Number.isFinite(leadTimeDays) || leadTimeDays < 0) throw new Error("Lead time must be a non-negative number of days.");
    setSuppliers((previous) => [
      ...previous,
      {
        ...supplier,
        id: createId("SUP"),
        name,
        email,
        phone,
        address,
        leadTimeDays,
        paymentTerms,
      },
    ]);
  };

  const updateSupplier = (supplierId, updates) => {
    const existing = suppliers.find((supplier) => supplier.id === supplierId);
    if (!existing) throw new Error("Supplier was not found.");
    if (existing.archived) throw new Error("Restore this supplier before editing it.");
    const name = String(updates.name || "").trim();
    const email = String(updates.email || "").trim();
    const phone = String(updates.phone || "").trim();
    const address = String(updates.address || "").trim();
    const leadTimeDays = Number(updates.leadTimeDays);
    const paymentTerms = String(updates.paymentTerms || "").trim();
    if (!name || !paymentTerms) throw new Error("Supplier name and payment terms are required.");
    if (!Number.isFinite(leadTimeDays) || leadTimeDays < 0) throw new Error("Lead time must be a non-negative number of days.");
    const updated = { ...existing, name, email, phone, address, leadTimeDays, paymentTerms };
    setSuppliers((previous) => previous.map((supplier) => supplier.id === supplierId ? updated : supplier));
    return updated;
  };

  const deleteSuppliers = (supplierIds) => {
    const selectedIds = new Set(supplierIds);
    const selectedSuppliers = suppliers.filter((supplier) => selectedIds.has(supplier.id) && !supplier.archived);
    if (!selectedIds.size || selectedSuppliers.length !== selectedIds.size) {
      throw new Error("One or more active suppliers could not be found.");
    }
    setSuppliers((previous) => previous.map((supplier) => (
      selectedIds.has(supplier.id) ? { ...supplier, archived: true } : supplier
    )));
    return selectedSuppliers;
  };

  const restoreSupplier = (supplierId) => {
    const supplier = suppliers.find((entry) => entry.id === supplierId);
    if (!supplier || !supplier.archived) throw new Error("Removed supplier was not found.");
    setSuppliers((previous) => previous.map((entry) => (
      entry.id === supplierId ? { ...entry, archived: false } : entry
    )));
  };

  const toCents = (value) => {
    const text = String(value ?? "").trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error("Enter a valid amount with at most two decimal places.");
    const [whole, fraction = ""] = text.split(".");
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error("Amount must be greater than zero.");
    return cents;
  };

  const addSupplierInvoice = ({ supplierId, number, date, amount, purchaseOrderId }) => {
    const supplier = suppliers.find((entry) => entry.id === supplierId && !entry.archived);
    if (!supplier) throw new Error("Choose a valid supplier.");
    const invoiceNumber = String(number || "").trim();
    if (!invoiceNumber) throw new Error("Invoice number is required.");
    if (supplierInvoices.some((invoice) => invoice.supplierId === supplierId && invoice.number.toLowerCase() === invoiceNumber.toLowerCase())) {
      throw new Error("This supplier invoice number already exists.");
    }
    const parsedDate = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
      throw new Error("Enter a valid invoice date.");
    }
    const order = purchaseOrderId ? purchaseOrders.find((entry) => entry.id === purchaseOrderId && entry.supplierId === supplierId) : null;
    if (purchaseOrderId && !order) throw new Error("Choose a purchase order for this supplier.");
    const invoice = {
      id: createId("INVOICE"), supplierId, supplier: supplier.name, number: invoiceNumber, date,
      purchaseOrderId: order?.id || "", purchaseOrderNumber: order?.orderNumber || order?.id || "",
      amountCents: toCents(amount), paidCents: 0, payments: [],
    };
    setSupplierInvoices((previous) => [invoice, ...previous]);
    return invoice;
  };

  const recordSupplierPayment = (invoiceId, amount) => {
    const invoice = supplierInvoices.find((entry) => entry.id === invoiceId);
    if (!invoice) throw new Error("Invoice was not found.");
    const amountCents = toCents(amount);
    if (amountCents > invoice.amountCents - invoice.paidCents) throw new Error("Payment exceeds the outstanding invoice balance.");
    const payment = { id: createId("PAYMENT"), amountCents, date: new Date().toISOString().slice(0, 10) };
    setSupplierInvoices((previous) => previous.map((entry) => entry.id === invoiceId
      ? { ...entry, paidCents: entry.paidCents + amountCents, payments: [...entry.payments, payment] }
      : entry));
    return payment;
  };

  const rememberItemCategory = (category) => {
    const categoryName = String(category || "").trim();
    if (categoryName) {
      setCustomCategories((previous) => (
        previous.some((category) => categoryKey(category) === categoryKey(categoryName))
          ? previous
          : [...previous, categoryName]
      ));
    }
  };

  const addItem = (item) => {
    const normalized = normalizeItem(item);
    rememberItemCategory(normalized.category);
    setItems((previous) => [...previous, { ...normalized, id: createId("ITM") }]);
  };

  const updateItem = (itemId, updates) => {
    const existing = items.find((item) => item.id === itemId);
    if (!existing) throw new Error("Inventory item was not found.");
    const nextUom = normalizeUomName(updates.uom || existing.uom);
    if (nextUom !== existing.uom && Object.prototype.hasOwnProperty.call(existing.unitBalances || {}, nextUom)) {
      throw new Error("The new stock unit already has a separate balance. Reconcile it before changing the stock unit.");
    }
    const stock = convertQuantity(updates.stock ?? existing.stock, existing.uom, nextUom);
    const reorderLevel = convertQuantity(updates.reorderLevel ?? existing.reorderLevel, existing.uom, nextUom);
    const unitCost = convertUnitCost(updates.unitCost ?? existing.unitCost, existing.uom, nextUom);
    const updated = {
      ...normalizeItem({ ...existing, ...updates, uom: nextUom, stock, reorderLevel, unitCost }),
      id: itemId,
    };
    rememberItemCategory(updated.category);
    setItems((previous) => previous.map((item) => item.id === itemId ? updated : item));
    if (nextUom !== existing.uom) {
      setStockMovements((previous) => previous.map((movement) => {
        if (movement.itemId !== itemId || normalizeUomName(movement.stockUom || existing.uom) !== existing.uom) return movement;
        return { ...movement, stockUom: nextUom, quantityInStockUnit: convertQuantity(movement.quantityInStockUnit, existing.uom, nextUom) };
      }));
    }
    return updated;
  };

  const deleteItem = (itemId) => {
    const existing = items.find((item) => item.id === itemId);
    if (!existing) throw new Error("Inventory item was not found.");
    const isReferenced = [...purchaseOrders, ...purchaseRequests, ...quotations].some((record) =>
      record.lineItems.some((line) => line.itemId === itemId)
    ) || stockMovements.some((movement) => movement.itemId === itemId);
    if (isReferenced) {
      const archivedItem = { ...existing, archived: true };
      setItems((previous) => previous.map((item) => item.id === itemId ? archivedItem : item));
      return archivedItem;
    }
    setItems((previous) => previous.filter((item) => item.id !== itemId));
    return existing;
  };

  const restoreItem = (itemId) => {
    const existing = items.find((item) => item.id === itemId);
    if (!existing) throw new Error("Inventory item was not found.");
    if (!existing.archived) throw new Error("This inventory item is already active.");
    const restoredItem = { ...existing, archived: false };
    setItems((previous) => previous.map((item) => item.id === itemId ? restoredItem : item));
    return restoredItem;
  };

  const configureCable = (itemId, cableType, value) => {
    const item = items.find((entry) => entry.id === itemId && !entry.archived);
    if (!item) throw new Error("Choose an active inventory item.");
    if (!["adss", "drop"].includes(cableType)) throw new Error("Choose a cable type.");
    const length = Number(value);
    if (!Number.isFinite(length) || length <= 0) throw new Error("Enter a positive length in metres.");
    const packageUnit = cableType === "adss" ? "roll" : "reel";
    const configured = { ...item, cableType, cablePackageUnit: packageUnit, cableLengthMeters: length };
    const changed = item.cablePackageUnit && (item.cablePackageUnit !== packageUnit || Number(item.cableLengthMeters) !== length);
    if (changed && stockMovements.some((movement) => movement.itemId === item.id
      && convertItemQuantity(1, movement.uom, movement.stockUom || item.uom, item)
        !== convertItemQuantity(1, movement.uom, movement.stockUom || item.uom, configured))) {
      throw new Error("This cable length has already been used for converted movements and cannot be changed without reconciling stock history.");
    }
    const sourceUnits = [normalizeUomName(item.uom), ...Object.keys(item.unitBalances || {}).map(normalizeUomName)];
    const targets = new Map();
    const keptUnits = [];
    sourceUnits.forEach((unit) => {
      const target = keptUnits.find((candidate) => convertItemQuantity(1, unit, candidate, configured) !== null) || unit;
      targets.set(unit, target);
      if (!keptUnits.includes(target)) keptUnits.push(target);
    });
    let updatedItem = { ...configured, stock: 0, unitBalances: {} };
    sourceUnits.forEach((unit) => {
      const target = targets.get(unit);
      const quantity = convertItemQuantity(getStockBalance(item, unit), unit, target, configured);
      updatedItem = updateStockBalance(updatedItem, target, getStockBalance(updatedItem, target) + quantity);
    });
    setItems((previous) => previous.map((entry) => entry.id === itemId ? updatedItem : entry));
    setStockMovements((previous) => previous.map((movement) => {
      if (movement.itemId !== itemId) return movement;
      const originalUnit = normalizeUomName(movement.stockUom || item.uom);
      const target = targets.get(originalUnit) || originalUnit;
      return {
        ...movement,
        stockUom: target,
        quantityInStockUnit: convertItemQuantity(movement.quantityInStockUnit, originalUnit, target, configured),
      };
    }));
  };

  const addInventoryCategory = (value) => {
    const name = String(value || "").trim();
    if (!name) throw new Error("Enter a category name.");
    if (categoriesByKey.has(categoryKey(name))) throw new Error("A category with this name already exists.");
    setCustomCategories((previous) => [...previous, name]);
    return name;
  };

  const renameInventoryCategory = (oldName, value) => {
    const oldKey = categoryKey(oldName);
    const name = String(value || "").trim();
    const newKey = categoryKey(name);
    if (!categoriesByKey.has(oldKey)) throw new Error("Choose an existing category.");
    if (oldKey === categoryKey("General Materials")) throw new Error("General Materials is the default category and cannot be renamed.");
    if (!name) throw new Error("Enter a category name.");
    if (newKey !== oldKey && categoriesByKey.has(newKey)) throw new Error("A category with this name already exists.");
    const rename = (record) => categoryKey(record.category) === oldKey ? { ...record, category: name } : record;
    setCustomCategories((previous) => [...previous.filter((category) => categoryKey(category) !== oldKey), name]);
    setItems((previous) => previous.map(rename));
    setStockMovements((previous) => previous.map(rename));
    setInventoryTransactions((previous) => previous.map(rename));
    return name;
  };

  const deleteInventoryCategory = (value, replacement) => {
    const oldKey = categoryKey(value);
    const replacementKey = categoryKey(replacement);
    if (!categoriesByKey.has(oldKey)) throw new Error("Choose an existing category to delete.");
    if (oldKey === categoryKey("General Materials")) throw new Error("General Materials is the default category and cannot be deleted.");
    if (!categoriesByKey.has(replacementKey) || replacementKey === oldKey) {
      throw new Error("Choose a different existing replacement category.");
    }
    const name = categoriesByKey.get(replacementKey);
    const reassign = (record) => categoryKey(record.category) === oldKey ? { ...record, category: name } : record;
    setCustomCategories((previous) => previous.filter((category) => categoryKey(category) !== oldKey));
    setItems((previous) => previous.map(reassign));
    setStockMovements((previous) => previous.map(reassign));
    setInventoryTransactions((previous) => previous.map(reassign));
    return name;
  };

  const setStockMovementCategory = (movementId, value) => {
    const movement = stockMovements.find((entry) => entry.id === movementId && entry.movementType === "in");
    if (!movement) throw new Error("Stock In record was not found.");
    const name = categoriesByKey.get(categoryKey(value));
    if (!name) throw new Error("Choose an existing category.");
    setStockMovements((previous) => previous.map((entry) => entry.id === movementId ? { ...entry, category: name } : entry));
  };

  const addInventoryTransaction = (transaction) => {
    const record = {
      ...normalizeInventoryTransaction(transaction),
      id: createId("INV"),
    };
    setInventoryTransactions((previous) => [record, ...previous]);
    return record;
  };

  const importInventoryTransactions = (transactions) => {
    if (!Array.isArray(transactions) || !transactions.length) {
      throw new Error("Choose a spreadsheet with at least one valid transaction.");
    }
    const records = transactions.map((transaction) => ({
      ...normalizeInventoryTransaction(transaction),
      id: createId("INV"),
    }));
    setInventoryTransactions((previous) => [...records, ...previous]);
    return records.length;
  };

  const prepareStockMovement = ({ itemId, movementType, date, quantity, uom, reference = "", notes = "", isPurchase = false, supplierId = "", unitCost = "", category = "" }, inventoryItems = items, inventorySuppliers = suppliers, allowArchivedSupplierId = "") => {
    const item = inventoryItems.find((entry) => entry.id === itemId);
    if (!item) throw new Error("Choose a valid inventory item.");
    if (!["in", "out"].includes(movementType)) throw new Error("Choose stock in or stock out.");
    const categoryName = category ? categoriesByKey.get(categoryKey(category)) || (categoryKey(category) === categoryKey(item.category) ? item.category : "") : item.category || "General Materials";
    if (movementType === "in" && !categoryName) throw new Error("Choose an existing category.");
    const movementDate = String(date || "").trim();
    const parsedDate = new Date(`${movementDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(movementDate) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== movementDate) {
      throw new Error("Enter a valid movement date.");
    }
    const movedQuantity = Number(quantity);
    if (!Number.isFinite(movedQuantity) || movedQuantity <= 0) {
      throw new Error("Movement quantity must be greater than zero.");
    }
    const movementUom = normalizeUomName(uom || item.uom);
    const stockUom = getStockUnit(item, movementUom);
    const stockQuantity = convertItemQuantity(movedQuantity, movementUom, stockUom, item);
    const balance = getStockBalance(item, stockUom);
    if (movementType === "out" && stockQuantity > balance + 1e-9) {
      throw new Error(`Only ${balance} ${stockUom} of ${item.name} currently in stock.`);
    }
    const purchaseSupplier = isPurchase && movementType === "in" ? inventorySuppliers.find((supplier) => supplier.id === supplierId && (!supplier.archived || supplier.id === allowArchivedSupplierId)) : null;
    const purchaseCost = Number(unitCost);
    if (isPurchase && movementType === "in" && (!purchaseSupplier || String(unitCost).trim() === "" || !Number.isFinite(purchaseCost) || purchaseCost < 0)) {
      throw new Error("Choose a supplier and enter a valid non-negative rate.");
    }

    return {
      id: createId("MOV"),
      itemId: item.id,
      item: item.name,
      sku: item.sku,
      movementType,
      date: movementDate,
      quantity: movedQuantity,
      uom: movementUom,
      stockUom,
      quantityInStockUnit: stockQuantity,
      reference: String(reference || "").trim(),
      notes: String(notes || "").trim(),
      ...(movementType === "in" ? { category: categoryName } : {}),
      ...(purchaseSupplier ? { isPurchase: true, supplierId, supplier: purchaseSupplier.name, unitCost: purchaseCost } : {}),
    };
  };

  const recordStockMovement = (input) => {
    const movement = prepareStockMovement(input);
    const quantityChange = movement.movementType === "in" ? movement.quantityInStockUnit : -movement.quantityInStockUnit;
    setItems((previous) => previous.map((entry) => (
      entry.id === movement.itemId
        ? updateStockBalance(entry, movement.stockUom, Math.max(0, getStockBalance(entry, movement.stockUom) + quantityChange))
        : entry
    )));
    setStockMovements((previous) => [movement, ...previous]);
    return movement;
  };

  const addItemWithReceipt = (input) => {
    const item = normalizeItem({
      name: input.name,
      sku: input.sku,
      category: input.category,
      uom: input.uom,
      unitCost: input.unitCost,
      reorderLevel: input.reorderLevel,
      stock: 0,
      id: createId("ITM"),
    });
    if (items.some((existing) => categoryKey(existing.sku) === categoryKey(item.sku))) {
      throw new Error("An item with this SKU already exists. Record additional stock through Stock In.");
    }
    const movement = prepareStockMovement({
      ...input,
      itemId: item.id,
      movementType: "in",
    }, [item], suppliers);
    const stockedItem = updateStockBalance(item, movement.stockUom, movement.quantityInStockUnit);
    rememberItemCategory(item.category);
    setItems((previous) => [...previous, stockedItem]);
    setStockMovements((previous) => [movement, ...previous]);
    return movement;
  };

  const recordPurchasedStockBatch = (rows) => {
    if (!Array.isArray(rows) || !rows.length) throw new Error("Add at least one purchased stock line.");
    const availableItems = [...items];
    const availableSuppliers = [...suppliers];
    const newItems = [];
    const newSuppliers = [];
    const sameText = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
    const movements = rows.map((row, index) => {
      try {
        const itemName = String(row.item || "").trim();
        const supplierName = String(row.supplier || "").trim();
        if (!itemName) throw new Error("Enter an item name or SKU.");
        if (!supplierName) throw new Error("Enter a supplier name.");
        const matchingItems = availableItems.filter((item) => [item.id, item.sku, item.name].some((value) => sameText(value, itemName)));
        if (matchingItems.length > 1) throw new Error(`More than one item has the name or SKU "${itemName}". Resolve the duplicate records before importing.`);
        let item = matchingItems[0];
        if (item?.archived) throw new Error(`The item "${itemName}" is archived. Restore it before importing.`);
        if (!item) {
          item = normalizeItem({
            id: createId("ITM"), name: itemName, sku: itemName, uom: row.uom,
            unitCost: row.unitCost, stock: 0, reorderLevel: 0, category: "General Materials",
          });
          availableItems.push(item);
          newItems.push(item);
        }
        const matchingSuppliers = availableSuppliers.filter((supplier) => [supplier.id, supplier.name].some((value) => sameText(value, supplierName)));
        if (matchingSuppliers.length > 1) throw new Error(`More than one supplier is named "${supplierName}". Resolve the duplicate records before importing.`);
        let supplier = matchingSuppliers[0];
        if (supplier?.archived) throw new Error(`The supplier "${supplierName}" was removed. Restore it before importing.`);
        if (!supplier) {
          supplier = { id: createId("SUP"), name: supplierName, email: "", leadTimeDays: null, paymentTerms: "" };
          availableSuppliers.push(supplier);
          newSuppliers.push(supplier);
        }
        const movement = prepareStockMovement({ ...row, itemId: item.id, supplierId: supplier.id, movementType: "in", isPurchase: true }, availableItems, availableSuppliers);
        const itemIndex = availableItems.findIndex((entry) => entry.id === item.id);
        availableItems[itemIndex] = updateStockBalance(item, movement.stockUom, getStockBalance(item, movement.stockUom) + movement.quantityInStockUnit);
        return movement;
      } catch (error) {
        throw new Error(`Spreadsheet row ${row.sourceRow ?? index + 1}: ${error.message}`);
      }
    });
    const quantities = new Map();
    movements.forEach((movement) => {
      const byUnit = quantities.get(movement.itemId) || new Map();
      byUnit.set(movement.stockUom, (byUnit.get(movement.stockUom) || 0) + movement.quantityInStockUnit);
      quantities.set(movement.itemId, byUnit);
    });
    setItems((previous) => [...previous, ...newItems].map((item) => {
      const adjustments = quantities.get(item.id);
      if (!adjustments) return item;
      let updated = item;
      adjustments.forEach((quantity, unit) => { updated = updateStockBalance(updated, unit, getStockBalance(updated, unit) + quantity); });
      return updated;
    }));
    if (newSuppliers.length) setSuppliers((previous) => [...previous, ...newSuppliers]);
    setStockMovements((previous) => [...movements, ...previous]);
    return movements;
  };

  const deleteStockMovements = (movementIds) => {
    const selectedIds = new Set(movementIds);
    const movementsToDelete = stockMovements.filter((movement) => selectedIds.has(movement.id));
    if (!selectedIds.size || movementsToDelete.length !== selectedIds.size) {
      throw new Error("One or more stock movement records could not be found.");
    }
    if (movementsToDelete.some((movement) => movement.notes === "Purchase order receipt")) {
      throw new Error("Purchase-order receipt movements cannot be deleted independently of their purchase order.");
    }

    const stockAdjustments = new Map();
    movementsToDelete.forEach((movement) => {
      const item = items.find((entry) => entry.id === movement.itemId);
      if (!item) throw new Error("A stock movement item no longer exists.");
      if (!["in", "out"].includes(movement.movementType)) throw new Error("A stock movement has an invalid type.");
      const quantity = Number(movement.quantityInStockUnit);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("A stock movement has an invalid quantity.");
      const reverseQuantity = movement.movementType === "in" ? -quantity : quantity;
      const stockUom = movement.stockUom || item.uom;
      const byUnit = stockAdjustments.get(item.id) || new Map();
      byUnit.set(stockUom, (byUnit.get(stockUom) || 0) + reverseQuantity);
      stockAdjustments.set(item.id, byUnit);
    });

    const nextStocks = new Map();
    stockAdjustments.forEach((adjustments, itemId) => {
      const item = items.find((entry) => entry.id === itemId);
      const balances = new Map();
      adjustments.forEach((adjustment, unit) => {
        const balance = getStockBalance(item, unit);
        const nextStock = balance + adjustment;
        if (nextStock < -1e-9) {
          throw new Error(`Cannot remove the stock-in movement because only ${balance} ${unit} remains in stock.`);
        }
        balances.set(unit, Math.max(0, nextStock));
      });
      nextStocks.set(itemId, balances);
    });

    setItems((previous) => previous.map((item) => {
      let updated = item;
      nextStocks.get(item.id)?.forEach((quantity, unit) => { updated = updateStockBalance(updated, unit, quantity); });
      return updated;
    }));
    setStockMovements((previous) => previous.filter((movement) => !selectedIds.has(movement.id)));
    return movementsToDelete;
  };

  const updateStockMovement = (movementId, updates) => {
    const movement = stockMovements.find((entry) => entry.id === movementId);
    if (!movement) throw new Error("Stock movement record was not found.");
    if (movement.notes === "Purchase order receipt") {
      throw new Error("Purchase-order receipt movements cannot be edited independently of their purchase order.");
    }
    if (!["in", "out"].includes(movement.movementType)) throw new Error("The stock movement type is invalid.");

    const movementDate = String(updates.date || "").trim();
    const parsedDate = new Date(`${movementDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(movementDate) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== movementDate) {
      throw new Error("Enter a valid movement date.");
    }
    const quantity = Number(updates.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Movement quantity must be greater than zero.");
    const item = items.find((entry) => entry.id === movement.itemId);
    if (!item) throw new Error("A stock movement item no longer exists.");
    const uom = normalizeUomName(updates.uom || item.uom);
    const stockUom = getStockUnit(item, uom);
    const quantityInStockUnit = convertItemQuantity(quantity, uom, stockUom, item);
    const previousStockUom = movement.stockUom || item.uom;
    const previousQuantity = Number(movement.quantityInStockUnit);
    if (!Number.isFinite(previousQuantity) || previousQuantity <= 0) throw new Error("The existing stock movement has an invalid quantity.");
    const previousChange = movement.movementType === "in" ? previousQuantity : -previousQuantity;
    const nextChange = movement.movementType === "in" ? quantityInStockUnit : -quantityInStockUnit;
    const adjustments = new Map([[previousStockUom, -previousChange]]);
    adjustments.set(stockUom, (adjustments.get(stockUom) || 0) + nextChange);
    let updatedItem = item;
    adjustments.forEach((adjustment, unit) => {
      const balance = getStockBalance(item, unit);
      const nextStock = balance + adjustment;
      if (nextStock < -1e-9) {
        throw new Error(`This change would make the stock balance for ${item.name} negative. Only ${balance} ${unit} currently remains.`);
      }
      updatedItem = updateStockBalance(updatedItem, unit, Math.max(0, nextStock));
    });
    const purchaseSupplier = movement.movementType === "in" && updates.isPurchase
      ? suppliers.find((supplier) => supplier.id === updates.supplierId && (!supplier.archived || supplier.id === movement.supplierId))
      : null;
    const purchaseCost = Number(updates.unitCost);
    if (updates.isPurchase && movement.movementType === "in" && (!purchaseSupplier || String(updates.unitCost ?? "").trim() === "" || !Number.isFinite(purchaseCost) || purchaseCost < 0)) {
      throw new Error("Choose a supplier and enter a valid non-negative rate.");
    }

    const updatedCategory = updates.category
      ? categoriesByKey.get(categoryKey(updates.category))
      : movement.category || item.category || "General Materials";
    if (movement.movementType === "in" && !updatedCategory) throw new Error("Choose an existing category.");
    const updatedMovement = {
      ...movement,
      date: movementDate,
      quantity,
      uom,
      stockUom,
      quantityInStockUnit,
      reference: String(updates.reference || "").trim(),
      notes: String(updates.notes || "").trim(),
      isPurchase: Boolean(purchaseSupplier),
      supplierId: purchaseSupplier?.id || "",
      supplier: purchaseSupplier?.name || "",
      category: updatedCategory,
      unitCost: purchaseSupplier ? purchaseCost : null,
    };
    setItems((previous) => previous.map((entry) => (
      entry.id === item.id ? updatedItem : entry
    )));
    setStockMovements((previous) => previous.map((entry) => (
      entry.id === movementId ? updatedMovement : entry
    )));
    return updatedMovement;
  };

  const nextPurchaseOrderNumber = () => {
    const existingSequence = purchaseOrders.reduce((max, order) => (
      Math.max(max, getPONumberSequence(order.orderNumber))
    ), 0);
    const storedSequence = Number(localStorage.getItem("inventory-po-sequence")) || 0;
    const nextSequence = Math.max(existingSequence, storedSequence) + 1;
    localStorage.setItem("inventory-po-sequence", String(nextSequence));
    return formatPONumber(nextSequence);
  };

  const createPurchaseOrder = (supplierId, lineItems, quotationId = null) => {
    if (!suppliers.some((supplier) => supplier.id === supplierId && !supplier.archived)) {
      throw new Error("Choose a valid supplier.");
    }
    if (!Array.isArray(lineItems) || !lineItems.length) {
      throw new Error("Add at least one item to the purchase order.");
    }

    const normalizedLineItems = lineItems.map((line) => {
      const quantity = Number(line.quantity);
      const unitCost = Number(line.unitCost);
      const item = items.find((entry) => entry.id === line.itemId);
      if (!item) {
        throw new Error("Choose a valid inventory item for every purchase order line.");
      }
      const sourceUom = line.uom || item.uom;
      const quoteContainsItem = quotationId && quotations.some((quotation) => (
        quotation.id === quotationId
        && quotation.status === "Submitted"
        && quotation.lineItems.some((quotationLine) => quotationLine.itemId === line.itemId)
      ));
      if (item.archived && !quoteContainsItem) {
        throw new Error("Archived inventory items cannot be added to new purchase orders.");
      }
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
        throw new Error("Each purchase order line needs a positive quantity and a valid unit cost.");
      }
      return {
        ...line,
        quantity: convertQuantity(quantity, sourceUom, item.uom),
        unitCost: convertUnitCost(unitCost, sourceUom, item.uom),
        uom: item.uom,
      };
    });

    const purchaseOrder = {
      id: createId("PO"),
      orderNumber: nextPurchaseOrderNumber(),
      supplierId,
      quotationId,
      date: new Date().toISOString().slice(0, 10),
      status: "Pending",
      lineItems: normalizedLineItems,
    };
    setPurchaseOrders((previous) => [purchaseOrder, ...previous]);
    return purchaseOrder;
  };

  const splitPurchaseOrder = (purchaseOrderId, selectedLineIndexes) => {
    const existing = purchaseOrders.find((order) => order.id === purchaseOrderId);
    if (!existing) throw new Error("Purchase order was not found.");
    if (!suppliers.some((supplier) => supplier.id === existing.supplierId && !supplier.archived)) {
      throw new Error("Restore the supplier before creating a new purchase order.");
    }
    if (existing.status !== "Pending") throw new Error("Only pending purchase orders can be split.");
    if (supplierInvoices.some((invoice) => invoice.purchaseOrderId === purchaseOrderId)) {
      throw new Error("Purchase orders linked to supplier invoices cannot be split.");
    }
    if (!Array.isArray(selectedLineIndexes)) throw new Error("Select the items to move to a new purchase order.");
    const selected = new Set(selectedLineIndexes);
    if (selected.size !== selectedLineIndexes.length || [...selected].some((index) => !Number.isInteger(index) || index < 0 || index >= existing.lineItems.length)) {
      throw new Error("One or more selected purchase order lines could not be found.");
    }
    if (!selected.size || selected.size === existing.lineItems.length) {
      throw new Error("Select at least one item and leave at least one item on the original order.");
    }
    const newOrder = {
      ...existing,
      id: createId("PO"),
      orderNumber: nextPurchaseOrderNumber(),
      date: new Date().toISOString().slice(0, 10),
      lineItems: existing.lineItems.filter((_, index) => selected.has(index)),
    };
    const remainingOrder = {
      ...existing,
      lineItems: existing.lineItems.filter((_, index) => !selected.has(index)),
    };
    setPurchaseOrders((previous) => [newOrder, ...previous.map((order) => order.id === purchaseOrderId ? remainingOrder : order)]);
    return newOrder;
  };

  const getPurchaseOrderReceipts = (order) => {
    const reference = order.orderNumber || order.id;
    const linked = stockMovements.filter((movement) => movement.purchaseOrderId === order.id);
    const legacy = stockMovements.filter((movement) => !movement.purchaseOrderId
      && movement.notes === "Purchase order receipt" && movement.reference === reference);
    if (legacy.length && purchaseOrders.some((entry) => entry.id !== order.id && (entry.orderNumber || entry.id) === reference)) {
      throw new Error("Receipt records are ambiguous for this purchase order. Reconcile them before changing the order.");
    }
    const receipts = [...linked, ...legacy];
    if (receipts.length !== order.lineItems.length || receipts.some((movement) => movement.movementType !== "in")) {
      throw new Error("The purchase order's receipt records are missing or incomplete. Reconcile them before changing the order.");
    }
    const unused = new Set(receipts.map((movement) => movement.id));
    return order.lineItems.map((line, index) => {
      const candidates = receipts.filter((movement) => unused.has(movement.id)
        && (!movement.purchaseOrderId || movement.purchaseOrderLineIndex === index)
        && movement.itemId === line.itemId && normalizeUomName(movement.uom) === normalizeUomName(line.uom)
        && Number(movement.quantity) === Number(line.quantity)
        && (movement.unitCost == null || Number(movement.unitCost) === Number(line.unitCost)));
      if (candidates.length !== 1) throw new Error("Receipt records are ambiguous for this purchase order. Reconcile them before changing the order.");
      unused.delete(candidates[0].id);
      return candidates[0];
    });
  };

  const reconcileReceiptStock = (oldReceipts, newReceipts) => {
    const adjustments = new Map();
    const addAdjustment = (movement, sign) => {
      const item = items.find((entry) => entry.id === movement.itemId);
      const quantity = Number(movement.quantityInStockUnit);
      if (!item || !Number.isFinite(quantity) || quantity <= 0) throw new Error("A receipt has an invalid item or quantity.");
      const unit = movement.stockUom || item.uom;
      const byUnit = adjustments.get(item.id) || new Map();
      byUnit.set(unit, (byUnit.get(unit) || 0) + sign * quantity);
      adjustments.set(item.id, byUnit);
    };
    oldReceipts.forEach((movement) => addAdjustment(movement, -1));
    newReceipts.forEach((movement) => addAdjustment(movement, 1));
    return items.map((item) => {
      let updatedItem = item;
      adjustments.get(item.id)?.forEach((adjustment, unit) => {
        const balance = getStockBalance(item, unit) + adjustment;
        if (!Number.isFinite(balance) || balance < -1e-9) throw new Error(`This change would make the stock balance for ${item.name} negative or invalid.`);
        updatedItem = updateStockBalance(updatedItem, unit, Math.max(0, balance));
      });
      return updatedItem;
    });
  };

  const getDeletionReceipts = (orders) => orders.flatMap((order) => {
    if (order.status === "Received") return getPurchaseOrderReceipts(order);
    const reference = order.orderNumber || order.id;
    if (stockMovements.some((movement) => movement.purchaseOrderId === order.id
      || (!movement.purchaseOrderId && movement.notes === "Purchase order receipt" && movement.reference === reference))) {
      throw new Error("An unreceived purchase order has receipt records. Reconcile them before deletion.");
    }
    return [];
  });

  const updatePurchaseOrder = (purchaseOrderId, supplierId, lineItems, date, invoiceUpdates) => {
    const existing = purchaseOrders.find((order) => order.id === purchaseOrderId);
    if (!existing) throw new Error("Purchase order was not found.");
    const supplier = suppliers.find((entry) => entry.id === supplierId && (!entry.archived || entry.id === existing.supplierId));
    if (!supplier) throw new Error("Choose a valid supplier.");
    if (!Array.isArray(lineItems) || !lineItems.length) throw new Error("Add at least one item to the purchase order.");
    const orderDate = String(date || "").trim();
    const parsedDate = new Date(`${orderDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== orderDate) {
      throw new Error("Enter a valid purchase order date.");
    }

    const normalizedLineItems = lineItems.map((line) => {
      const quantity = Number(line.quantity);
      const unitCost = Number(line.unitCost);
      const item = items.find((entry) => entry.id === line.itemId);
      const originalLine = existing.lineItems[line.sourceLineIndex];
      if (!item || (item.archived && originalLine?.itemId !== item.id)) throw new Error("Choose an active inventory item for every new purchase order line.");
      const sourceUom = line.uom || item.uom;
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
        throw new Error("Each purchase order line needs a positive quantity and a valid unit cost.");
      }
      return {
        itemId: line.itemId,
        quantity: convertQuantity(quantity, sourceUom, item.uom),
        unitCost: convertUnitCost(unitCost, sourceUom, item.uom),
        uom: item.uom,
      };
    });

    const linkedInvoices = supplierInvoices.filter((invoice) => invoice.purchaseOrderId === purchaseOrderId);
    if (!Array.isArray(invoiceUpdates) || invoiceUpdates.length !== linkedInvoices.length
      || new Set(invoiceUpdates.map((invoice) => invoice.id)).size !== linkedInvoices.length
      || linkedInvoices.some((invoice) => !invoiceUpdates.some((entry) => entry.id === invoice.id))) {
      throw new Error("Linked invoices changed. Reopen the purchase order and try again.");
    }
    const updatedInvoices = linkedInvoices.map((invoice) => {
      const changes = invoiceUpdates.find((entry) => entry.id === invoice.id);
      const number = String(changes.number || "").trim();
      const invoiceDate = String(changes.date || "").trim();
      const parsedInvoiceDate = new Date(`${invoiceDate}T00:00:00Z`);
      if (!number) throw new Error("Enter a number for every linked invoice.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) || Number.isNaN(parsedInvoiceDate.getTime()) || parsedInvoiceDate.toISOString().slice(0, 10) !== invoiceDate) {
        throw new Error("Enter a valid date for every linked invoice.");
      }
      const amountCents = toCents(changes.amount);
      if (amountCents < invoice.paidCents) throw new Error(`Invoice ${invoice.number} cannot be reduced below its recorded payments.`);
      return { ...invoice, supplierId, supplier: supplier.name, number, date: invoiceDate, amountCents };
    });
    const otherInvoices = supplierInvoices.filter((invoice) => invoice.purchaseOrderId !== purchaseOrderId);
    const allInvoices = [...otherInvoices, ...updatedInvoices];
    if (updatedInvoices.some((invoice) => allInvoices.some((other) => other.id !== invoice.id
      && other.supplierId === invoice.supplierId && other.number.toLowerCase() === invoice.number.toLowerCase()))) {
      throw new Error("An invoice with this number already exists for the selected supplier.");
    }

    let updatedItems = null;
    let nextMovements = null;
    if (existing.status === "Received") {
      const reference = existing.orderNumber || existing.id;
      const oldReceipts = getPurchaseOrderReceipts(existing);
      const sourceIndexes = lineItems.map((line) => line.sourceLineIndex).filter((index) => index != null);
      if (new Set(sourceIndexes).size !== sourceIndexes.length
        || sourceIndexes.some((index) => !Number.isInteger(index) || index < 0 || index >= oldReceipts.length)) {
        throw new Error("Purchase order lines changed. Reopen the order and try again.");
      }
      const receiptDates = [...new Set(oldReceipts.map((movement) => movement.date))];
      if (lineItems.some((line) => line.sourceLineIndex == null) && receiptDates.length !== 1) {
        throw new Error("The order has multiple receipt dates. Reconcile them before adding an item.");
      }
      const newReceipts = normalizedLineItems.map((line, index) => {
        const previous = oldReceipts[lineItems[index].sourceLineIndex];
        const movement = prepareStockMovement({
          ...line, movementType: "in", date: previous?.date || receiptDates[0],
          reference, notes: "Purchase order receipt", isPurchase: true, supplierId,
        }, items, suppliers, existing.supplierId);
        return {
          ...movement,
          id: previous?.id || movement.id,
          category: previous?.itemId === line.itemId ? previous.category || movement.category : movement.category,
          purchaseOrderId: existing.id,
          purchaseOrderLineIndex: index,
        };
      });
      updatedItems = reconcileReceiptStock(oldReceipts, newReceipts);
      const receiptIds = new Set(oldReceipts.map((movement) => movement.id));
      nextMovements = [...newReceipts, ...stockMovements.filter((movement) => !receiptIds.has(movement.id))];
    }

    const updated = {
      ...existing, supplierId, date: orderDate, lineItems: normalizedLineItems,
      quotationId: supplierId === existing.supplierId ? existing.quotationId : null,
    };
    if (updatedItems) setItems(updatedItems);
    if (nextMovements) setStockMovements(nextMovements);
    if (updatedInvoices.length) {
      const byId = new Map(updatedInvoices.map((invoice) => [invoice.id, invoice]));
      setSupplierInvoices((previous) => previous.map((invoice) => byId.get(invoice.id) || invoice));
    }
    setPurchaseOrders((previous) => previous.map((order) => order.id === purchaseOrderId ? updated : order));
    return updated;
  };

  const deletePurchaseOrders = (purchaseOrderIds) => {
    const selectedIds = new Set(purchaseOrderIds);
    const selectedOrders = purchaseOrders.filter((order) => selectedIds.has(order.id));
    if (!selectedIds.size || selectedOrders.length !== selectedIds.size) {
      throw new Error("One or more purchase orders could not be found.");
    }
    const oldReceipts = getDeletionReceipts(selectedOrders);
    const updatedItems = reconcileReceiptStock(oldReceipts, []);
    const receiptIds = new Set(oldReceipts.map((movement) => movement.id));
    const quotationIds = new Set(selectedOrders.map((order) => order.quotationId).filter(Boolean));
    const unusedQuotationIds = new Set([...quotationIds].filter((id) => !purchaseOrders.some(
      (order) => !selectedIds.has(order.id) && order.quotationId === id
    )));
    const removedQuotations = quotations.filter((quotation) => unusedQuotationIds.has(quotation.id));
    const remainingQuotations = quotations.filter((quotation) => !unusedQuotationIds.has(quotation.id));
    const affectedRequests = new Set(removedQuotations.map((quotation) => quotation.prId).filter(Boolean));
    if (oldReceipts.length) {
      setItems(updatedItems);
      setStockMovements((previous) => previous.filter((movement) => !receiptIds.has(movement.id)));
    }
    setSupplierInvoices((previous) => previous.filter((invoice) => !selectedIds.has(invoice.purchaseOrderId)));
    if (removedQuotations.length) {
      setQuotations(remainingQuotations);
      setPurchaseRequests((previous) => previous.map((request) => (
        affectedRequests.has(request.id) && request.status === "Quoted"
        && !remainingQuotations.some((quotation) => quotation.prId === request.id && ["Submitted", "Selected"].includes(quotation.status))
          ? { ...request, status: "Approved" }
          : request
      )));
    }
    setPurchaseOrders((previous) => previous.filter((order) => !selectedIds.has(order.id)));
    return selectedOrders;
  };

  const createPurchaseRequest = ({ requestedBy, department, urgency, lineItems }) => {
    const cleanRequestedBy = String(requestedBy || "").trim();
    const cleanDepartment = String(department || "").trim();
    if (!cleanRequestedBy || !cleanDepartment) throw new Error("Requester and department are required.");
    if (!["Normal", "High", "Critical"].includes(urgency)) throw new Error("Choose a valid request urgency.");
    if (!Array.isArray(lineItems) || !lineItems.length) throw new Error("Add at least one requested item.");

    const normalizedLineItems = lineItems.map((line) => {
      const quantity = Number(line.quantity);
      const item = items.find((entry) => entry.id === line.itemId && !entry.archived);
      if (!item) {
        throw new Error("Choose an active inventory item for every request line.");
      }
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Request quantities must be positive numbers.");
      return { itemId: line.itemId, quantity, uom: item.uom };
    });
    const requestId = createId("PR");
    const estimatedTotal = normalizedLineItems.reduce((sum, line) => {
      const item = items.find((entry) => entry.id === line.itemId);
      return sum + Number(item.unitCost) * line.quantity;
    }, 0);
    const request = {
      id: requestId,
      requestedBy: cleanRequestedBy,
      department: cleanDepartment,
      urgency,
      date: new Date().toISOString().slice(0, 10),
      status: "Pending Approval",
      lineItems: normalizedLineItems,
    };
    setPurchaseRequests((previous) => [request, ...previous]);
    notifyLeadership(
      `New PR ${requestId} (${urgency} Priority)`,
      `${cleanRequestedBy} (${cleanDepartment}) submitted a request worth ${formatKsh(estimatedTotal)} for review.`,
      "/inventory/purchase-requests"
    );
    return request;
  };

  const updatePurchaseRequest = (requestId, updates) => {
    const request = purchaseRequests.find((entry) => entry.id === requestId);
    if (!request) throw new Error("Purchase request was not found.");
    if (request.status !== "Pending Approval") throw new Error("Only pending purchase requests can be edited.");
    const cleanRequestedBy = String(updates.requestedBy || "").trim();
    const cleanDepartment = String(updates.department || "").trim();
    if (!cleanRequestedBy || !cleanDepartment) throw new Error("Requester and department are required.");
    if (!["Normal", "High", "Critical"].includes(updates.urgency)) throw new Error("Choose a valid request urgency.");
    if (!Array.isArray(updates.lineItems) || !updates.lineItems.length) throw new Error("Add at least one requested item.");

    const normalizedLineItems = updates.lineItems.map((line) => {
      const quantity = Number(line.quantity);
      const item = items.find((entry) => entry.id === line.itemId && !entry.archived);
      if (!item) throw new Error("Choose an active inventory item for every request line.");
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Request quantities must be positive numbers.");
      return { itemId: line.itemId, quantity, uom: item.uom };
    });
    const updated = {
      ...request,
      requestedBy: cleanRequestedBy,
      department: cleanDepartment,
      urgency: updates.urgency,
      lineItems: normalizedLineItems,
    };
    setPurchaseRequests((previous) => previous.map((entry) => entry.id === requestId ? updated : entry));
    return updated;
  };

  const deletePurchaseRequests = (requestIds) => {
    const selectedIds = new Set(requestIds);
    const selectedRequests = purchaseRequests.filter((request) => selectedIds.has(request.id));
    if (!selectedIds.size || selectedRequests.length !== selectedIds.size) {
      throw new Error("One or more purchase requests could not be found.");
    }
    if (selectedRequests.some((request) => request.status !== "Pending Approval")) {
      throw new Error("Only pending purchase requests can be deleted.");
    }
    if (selectedRequests.some((request) => quotations.some((quotation) => quotation.prId === request.id))) {
      throw new Error("Purchase requests with quotation history cannot be deleted.");
    }
    setPurchaseRequests((previous) => previous.filter((request) => !selectedIds.has(request.id)));
    return selectedRequests;
  };

  const updatePRStatus = (requestId, newStatus) => {
    const request = purchaseRequests.find((entry) => entry.id === requestId);
    if (!request) throw new Error("Purchase request was not found.");
    if (request.status !== "Pending Approval" || !["Approved", "Rejected"].includes(newStatus)) {
      throw new Error("This purchase request can no longer be approved or rejected.");
    }

    setPurchaseRequests((previous) => previous.map((entry) => (
      entry.id === requestId ? { ...entry, status: newStatus } : entry
    )));
    if (newStatus === "Approved") {
      notifyLeadership(
        `${requestId} Approved for Sourcing`,
        `${currentRole} approved ${requestId}. Procurement can request supplier quotations.`,
        "/inventory/quotations"
      );
    }
  };

  const createQuotation = ({ prId, supplierId, validUntil, lineItems }) => {
    const request = prId ? purchaseRequests.find((entry) => entry.id === prId) : null;
    if (prId && (!request || !["Approved", "Quoted"].includes(request.status))) throw new Error("Only approved purchase requests can receive quotations.");
    if (!suppliers.some((supplier) => supplier.id === supplierId && !supplier.archived)) throw new Error("Choose a valid supplier.");
    if (!validUntil || !Number.isFinite(Date.parse(validUntil))) throw new Error("Enter a valid quotation expiry date.");
    if (!Array.isArray(lineItems) || !lineItems.length || (request && lineItems.length !== request.lineItems.length)) {
      throw new Error("Add a quotation price for every item.");
    }

    const normalizedLineItems = lineItems.map((line, index) => {
      const quotedUnitCost = Number(line.quotedUnitCost);
      const quantity = Number(line.quantity);
      if (request && (line.itemId !== request.lineItems[index].itemId || quantity !== Number(request.lineItems[index].quantity))) {
        throw new Error("Quotation lines must match the approved request.");
      }
      const item = items.find((entry) => entry.id === line.itemId);
      const itemIsInExistingRequest = request?.lineItems.some((requestLine) => requestLine.itemId === line.itemId);
      if (!item || (item.archived && !itemIsInExistingRequest)) {
        throw new Error("Choose an active inventory item for every new quotation line.");
      }
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(quotedUnitCost) || quotedUnitCost < 0) {
        throw new Error("Quotation quantities must be positive and prices must be valid non-negative numbers.");
      }
      return { itemId: line.itemId, quantity, quotedUnitCost, uom: request?.lineItems[index].uom || item.uom };
    });

    const quotation = {
      id: createId("QT"),
      prId,
      supplierId,
      validUntil,
      status: "Submitted",
      lineItems: normalizedLineItems,
    };
    setQuotations((previous) => [quotation, ...previous]);
    if (prId) {
      setPurchaseRequests((previous) => previous.map((entry) => (
        entry.id === prId ? { ...entry, status: "Quoted" } : entry
      )));
    }
    return quotation;
  };

  const updateQuotation = (quotationId, updates) => {
    const quotation = quotations.find((entry) => entry.id === quotationId);
    if (!quotation) throw new Error("Quotation was not found.");
    if (quotation.status !== "Submitted") throw new Error("Only submitted quotations can be edited.");
    const request = quotation.prId ? purchaseRequests.find((entry) => entry.id === quotation.prId) : null;
    if (quotation.prId && (!request || !["Approved", "Quoted"].includes(request.status))) {
      throw new Error("Only quotations linked to approved purchase requests can be edited.");
    }
    if (!suppliers.some((supplier) => supplier.id === updates.supplierId && (!supplier.archived || supplier.id === quotation.supplierId))) throw new Error("Choose a valid supplier.");
    if (!updates.validUntil || !Number.isFinite(Date.parse(updates.validUntil))) throw new Error("Enter a valid quotation expiry date.");
    if (!Array.isArray(updates.lineItems) || !updates.lineItems.length || (request && updates.lineItems.length !== request.lineItems.length)) {
      throw new Error("Add a quotation price for every item.");
    }

    const normalizedLineItems = updates.lineItems.map((line, index) => {
      const quotedUnitCost = Number(line.quotedUnitCost);
      const quantity = Number(line.quantity);
      if (request && (line.itemId !== request.lineItems[index].itemId || quantity !== Number(request.lineItems[index].quantity))) {
        throw new Error("Quotation lines must match the approved request.");
      }
      const item = items.find((entry) => entry.id === line.itemId);
      const itemIsInExistingRequest = request?.lineItems.some((requestLine) => requestLine.itemId === line.itemId);
      if (!item || (item.archived && !itemIsInExistingRequest)) {
        throw new Error("Choose an active inventory item for every new quotation line.");
      }
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(quotedUnitCost) || quotedUnitCost < 0) {
        throw new Error("Quotation quantities must be positive and prices must be valid non-negative numbers.");
      }
      return { itemId: line.itemId, quantity, quotedUnitCost, uom: request?.lineItems[index].uom || item.uom };
    });
    const updated = {
      ...quotation,
      supplierId: updates.supplierId,
      validUntil: updates.validUntil,
      lineItems: normalizedLineItems,
    };
    setQuotations((previous) => previous.map((entry) => entry.id === quotationId ? updated : entry));
    return updated;
  };

  const deleteQuotations = (quotationIds) => {
    const selectedIds = new Set(quotationIds);
    const selectedQuotations = quotations.filter((quotation) => selectedIds.has(quotation.id));
    if (!selectedIds.size || selectedQuotations.length !== selectedIds.size) {
      throw new Error("One or more quotations could not be found.");
    }
    if (selectedQuotations.some((quotation) => quotation.status !== "Submitted")) {
      throw new Error("Only submitted quotations can be deleted.");
    }
    if (selectedQuotations.some((quotation) => purchaseOrders.some((order) => order.quotationId === quotation.id))) {
      throw new Error("Quotations linked to purchase orders cannot be deleted.");
    }
    const remainingQuotations = quotations.filter((quotation) => !selectedIds.has(quotation.id));
    setQuotations(remainingQuotations);
    setPurchaseRequests((previous) => previous.map((request) => (
      request.status === "Quoted"
      && !remainingQuotations.some((quotation) => quotation.prId === request.id && quotation.status === "Submitted")
        ? { ...request, status: "Approved" }
        : request
    )));
    return selectedQuotations;
  };

  const convertQuotationToPO = (quotationId) => {
    const quotation = quotations.find((entry) => entry.id === quotationId);
    if (!quotation || quotation.status !== "Submitted") throw new Error("This quotation is no longer available for selection.");
    if (quotation.validUntil < new Date().toISOString().slice(0, 10)) throw new Error("This quotation has expired.");
    createPurchaseOrder(
      quotation.supplierId,
      quotation.lineItems.map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity,
        uom: line.uom,
        unitCost: line.quotedUnitCost,
      })),
      quotation.id
    );
    setQuotations((previous) => previous.map((entry) => (
      entry.id === quotationId
        ? { ...entry, status: "Selected" }
        : quotation.prId && entry.prId === quotation.prId && entry.status === "Submitted"
          ? { ...entry, status: "Rejected" }
          : entry
    )));
  };

  const receivePurchaseOrder = (purchaseOrderId) => {
    const purchaseOrder = purchaseOrders.find((order) => order.id === purchaseOrderId);
    if (!purchaseOrder) throw new Error("Purchase order was not found.");
    if (purchaseOrder.status === "Received") return false;
    const supplier = suppliers.find((entry) => entry.id === purchaseOrder.supplierId);
    if (!supplier) throw new Error("The purchase order supplier no longer exists.");

    const receivedQuantities = purchaseOrder.lineItems.reduce((totals, line) => {
      const item = items.find((entry) => entry.id === line.itemId);
      if (!item) throw new Error("A purchase order item no longer exists.");
      const quantity = convertQuantity(line.quantity, line.uom || item.uom, item.uom);
      totals.set(line.itemId, (totals.get(line.itemId) || 0) + quantity);
      return totals;
    }, new Map());

    setItems((previous) => previous.map((item) => (
      receivedQuantities.has(item.id)
        ? { ...item, stock: Number(item.stock) + receivedQuantities.get(item.id) }
        : item
    )));
    const movementDate = new Date().toISOString().slice(0, 10);
    const receiptMovements = purchaseOrder.lineItems.map((line, index) => {
      const item = items.find((entry) => entry.id === line.itemId);
      return {
        id: createId("MOV"),
        itemId: line.itemId,
        item: item.name,
        sku: item.sku,
        movementType: "in",
        date: movementDate,
        quantity: Number(line.quantity),
        uom: line.uom || item.uom,
        quantityInStockUnit: convertQuantity(line.quantity, line.uom || item.uom, item.uom),
        reference: purchaseOrder.orderNumber || purchaseOrder.id,
        notes: "Purchase order receipt",
        purchaseOrderId: purchaseOrder.id,
        purchaseOrderLineIndex: index,
        isPurchase: true,
        supplierId: supplier.id,
        supplier: supplier.name,
        category: item.category,
        unitCost: Number(line.unitCost),
      };
    });
    setStockMovements((previous) => [...receiptMovements, ...previous]);
    setPurchaseOrders((previous) => previous.map((order) => (
      order.id === purchaseOrderId ? { ...order, status: "Received" } : order
    )));
    return true;
  };

  const value = {
    currentRole,
    setCurrentRole,
    roleMenuPermissions,
    setRoleMenuPermissions,
    notifications,
    markNotificationRead,
    suppliers,
    supplierInvoices,
    items,
    inventoryTransactions,
    purchaseTransactions,
    purchaseRequests,
    quotations,
    purchaseOrders,
    stockMovements,
    inventoryCategories,
    addInventoryCategory,
    renameInventoryCategory,
    deleteInventoryCategory,
    setStockMovementCategory,
    addSupplier,
    updateSupplier,
    deleteSuppliers,
    restoreSupplier,
    addSupplierInvoice,
    recordSupplierPayment,
    addItem,
    updateItem,
    deleteItem,
    restoreItem,
    configureCable,
    addInventoryTransaction,
    importInventoryTransactions,
    recordStockMovement,
    addItemWithReceipt,
    recordPurchasedStockBatch,
    deleteStockMovements,
    updateStockMovement,
    createPurchaseRequest,
    updatePurchaseRequest,
    deletePurchaseRequests,
    updatePRStatus,
    createQuotation,
    updateQuotation,
    deleteQuotations,
    convertQuotationToPO,
    createPurchaseOrder,
    splitPurchaseOrder,
    updatePurchaseOrder,
    deletePurchaseOrders,
    receivePurchaseOrder,
  };

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  const context = useContext(InventoryContext);
  if (!context) throw new Error("useInventory must be used within an InventoryProvider.");
  return context;
}
