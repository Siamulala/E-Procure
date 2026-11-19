import { normalizeInventoryTransaction, parseInventoryTransactionRows } from "./inventoryTransactions";

test("imports formatted transaction rows and computes recorded totals", () => {
  const transactions = parseInventoryTransactionRows([
    ["Date", "Item", "Description", "Quantity", "UOM", "Unit Cost", "Supplier", "Category"],
    ["2026-07-12", "Fiber Cable", "Quarterly purchase", "2", "km", "KSh 58,500", "FiberLink", "Fiber Optics"],
  ]);

  expect(transactions).toEqual([{
    date: "2026-07-12",
    item: "Fiber Cable",
    description: "Quarterly purchase",
    quantity: 2,
    uom: "km",
    amount: 58500,
    supplier: "FiberLink",
    category: "Fiber Optics",
    total: 117000,
  }]);
});

test("rejects invalid transaction rows instead of partially importing them", () => {
  expect(() => parseInventoryTransactionRows([
    ["Date", "Item", "Quantity", "UOM", "Amount", "Supplier"],
    ["2026-02-30", "Fiber Cable", 2, "km", 100, "FiberLink"],
    ["2026-07-12", "Battery", 0, "pcs", 500, "PowerGrid"],
  ])).toThrow("Row 2: Date must be a valid calendar date. Row 3: Quantity must be greater than zero.");
});

test("requires a real date and non-empty unit cost for manual transactions", () => {
  expect(() => normalizeInventoryTransaction({
    date: "2026-2-01",
    item: "Battery",
    quantity: 1,
    uom: "pcs",
    amount: 0,
    supplier: "PowerGrid",
  })).toThrow("Date must use YYYY-MM-DD format.");

  expect(() => normalizeInventoryTransaction({
    date: "2026-02-01",
    item: "Battery",
    quantity: 1,
    uom: "pcs",
    amount: "",
    supplier: "PowerGrid",
  })).toThrow("Unit cost is required.");
});
