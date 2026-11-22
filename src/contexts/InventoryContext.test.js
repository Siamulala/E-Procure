import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import * as XLSX from "xlsx";
import { MemoryRouter } from "react-router-dom";
import InventoryDashboard from "../pages/InventoryDashboard";
import InventorySubmenu from "../pages/InventorySubmenu";
import InventoryStock from "../pages/InventoryStock";
import PurchaseRequests from "../pages/PurchaseRequests";
import Quotations from "../pages/Quotations";
import Reporting from "../pages/Reporting";
import SupplierInvoices from "../pages/SupplierInvoices";
import { InventoryProvider, normalizeUomName, useInventory } from "./InventoryContext";

function receiptCheckbox(reference) {
  const movement = JSON.parse(localStorage.getItem("inventory-stock-movements")).find((entry) => entry.reference === reference);
  return screen.getByLabelText(`Select stock in ${movement.id}`);
}

function InventoryStateProbe() {
  const { items, purchaseOrders, stockMovements, receivePurchaseOrder } = useInventory();
  const cable = items.find((item) => item.id === "ITM-1");
  const purchaseOrder = purchaseOrders.find((order) => order.id === "PO-1005");

  return (
    <>
      <output data-testid="cable-stock">{cable.stock}</output>
      <output data-testid="order-status">{purchaseOrder.status}</output>
      <output data-testid="stock-movement-count">{stockMovements.length}</output>
      <button type="button" onClick={() => receivePurchaseOrder("PO-1005")}>Receive seeded order</button>
    </>
  );
}

function SeedAnnualPurchases() {
  const { recordStockMovement } = useInventory();
  const initialized = React.useRef(false);
  React.useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    [
      ["2026-01-15", "ITM-1"],
      ["2026-12-20", "ITM-2"],
    ].forEach(([date, itemId]) => recordStockMovement({
      date,
      itemId,
      movementType: "in",
      quantity: 2,
      isPurchase: true,
      supplierId: "SUP-1",
      unitCost: 100,
    }));
  }, [recordStockMovement]);
  return null;
}

function InventoryItemsProbe() {
  const { items } = useInventory();
  return <output data-testid="inventory-item-names">{items.map((item) => `${item.name} (${item.uom})`).join(", ")}</output>;
}

function ReferencedItemArchiveProbe() {
  const { items, purchaseOrders, deleteItem, receivePurchaseOrder } = useInventory();
  const cable = items.find((item) => item.id === "ITM-1");
  const pendingOrder = purchaseOrders.find((order) => order.id === "PO-1005");
  return (
    <>
      <output data-testid="cable-archived">{String(Boolean(cable?.archived))}</output>
      <output data-testid="archived-cable-stock">{cable?.stock}</output>
      <output data-testid="archived-cable-order-status">{pendingOrder?.status}</output>
      <button type="button" onClick={() => deleteItem("ITM-1")}>Archive cable</button>
      <button type="button" onClick={() => receivePurchaseOrder("PO-1005")}>Receive archived cable order</button>
    </>
  );
}

function SeedDashboardTransactions() {
  const { recordStockMovement, items, suppliers } = useInventory();
  const initialized = React.useRef(false);
  React.useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    [
      ["2026-07-12", "24-Core Fiber Optic Cable (1km)", 8, 59000, "FiberLink Distributors", "Fiber Optics"],
      ["2026-07-12", "1x16 PLC Fiber Optic Splitter", 50, 2200, "FiberLink Distributors", "Fiber Optics"],
      ["2026-08-19", "12V 100Ah Deep Cycle Battery", 20, 23500, "PowerGrid Supplies Ltd", "Power & Backup"],
      ["2026-09-10", "Dual-Band Wi-Fi 6 GPON ONT Router", 120, 4800, "FiberLink Distributors", "Customer Premises (CPE)"],
      ["2026-09-10", "24-Core Fiber Optic Cable (1km)", 5, 58500, "FiberLink Distributors", "Fiber Optics"],
      ["2026-10-22", "48-Port Gigabit Rack Switch", 6, 42000, "PowerGrid Supplies Ltd", "Networking Hardware"],
      ["2026-10-22", "12V 100Ah Deep Cycle Battery", 12, 23500, "PowerGrid Supplies Ltd", "Power & Backup"],
      ["2026-11-14", "24-Core Fiber Optic Cable (1km)", 6, 58500, "FiberLink Distributors", "Fiber Optics"],
      ["2026-11-14", "Dual-Band Wi-Fi 6 GPON ONT Router", 80, 4750, "FiberLink Distributors", "Customer Premises (CPE)"],
    ].forEach(([date, item, quantity, amount, supplier]) => recordStockMovement({
      date,
      itemId: items.find((entry) => entry.name === item).id,
      movementType: "in",
      quantity,
      isPurchase: true,
      supplierId: suppliers.find((entry) => entry.name === supplier).id,
      unitCost: amount,
    }));
  }, [recordStockMovement, items, suppliers]);
  return null;
}

function InventoryStoreProbe() {
  const { receivePurchaseOrder } = useInventory();
  return (
    <>
      <button type="button" onClick={() => receivePurchaseOrder("PO-1005")}>Receive stock into store</button>
      <InventorySubmenu section="items" />
    </>
  );
}

function ReceivedOrderProbe() {
  const { receivePurchaseOrder } = useInventory();
  return (
    <>
      <button type="button" onClick={() => receivePurchaseOrder("PO-1005")}>Receive order before printing</button>
      <InventorySubmenu section="purchase-orders" />
    </>
  );
}

function QuotationFlowProbe() {
  const { quotations, purchaseOrders, createQuotation, convertQuotationToPO } = useInventory();
  const newQuotation = quotations.find((quotation) => quotation.id !== "QT-3001");
  return (
    <>
      <button
        type="button"
        onClick={() => createQuotation({
          prId: "PR-2001",
          supplierId: "SUP-2",
          validUntil: "2999-12-31",
          lineItems: [{ itemId: "ITM-1", quantity: 10, quotedUnitCost: 400 }],
        })}
      >
        Add competing quote
      </button>
      <button
        type="button"
        onClick={() => convertQuotationToPO(newQuotation.id)}
        disabled={!newQuotation}
      >
        Convert competing quote
      </button>
      <output data-testid="quotation-status">{quotations.find((quotation) => quotation.id === newQuotation?.id)?.status || "Missing"}</output>
      <output data-testid="original-quotation-status">{quotations.find((quotation) => quotation.id === "QT-3001")?.status}</output>
      <output data-testid="converted-order">{purchaseOrders.find((order) => order.quotationId === newQuotation?.id)?.lineItems[0].unitCost || ""}</output>
    </>
  );
}

function PurchaseOrderNumberProbe() {
  const { createPurchaseOrder, purchaseOrders } = useInventory();
  const createOrder = () => createPurchaseOrder("SUP-1", [
    { itemId: "ITM-1", quantity: 1, unitCost: 500 },
  ]);
  return (
    <>
      <button type="button" onClick={createOrder}>Create numbered PO</button>
      <output data-testid="po-numbers">{purchaseOrders.map((order) => order.orderNumber).join(",")}</output>
    </>
  );
}

function ProcurementPurchaseOrdersProbe() {
  const { setCurrentRole, purchaseOrders } = useInventory();
  React.useEffect(() => setCurrentRole("Procurement"), [setCurrentRole]);
  return (
    <>
      <output data-testid="created-po-line-count">
        {purchaseOrders.find((order) => order.orderNumber === "PO:006")?.lineItems.length || 0}
      </output>
      <InventorySubmenu section="purchase-orders" />
    </>
  );
}

function IssueCableProbe() {
  const { recordStockMovement } = useInventory();
  return <button type="button" onClick={() => recordStockMovement({
    itemId: "ITM-1", movementType: "out", date: "2026-01-01", quantity: 9, uom: "km",
  })}>Issue cable for test</button>;
}

function editOrder(number) {
  const target = screen.getByRole("checkbox", { name: `Select ${number}` });
  screen.getAllByRole("checkbox", { name: /^Select PO:/ }).forEach((checkbox) => {
    if (checkbox !== target && checkbox.checked) fireEvent.click(checkbox);
  });
  if (!target.checked) fireEvent.click(target);
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
}

beforeEach(() => {
  localStorage.clear();
});

test("receiving a purchase order updates stock once", () => {
  render(
    <InventoryProvider>
      <InventoryStateProbe />
    </InventoryProvider>
  );

  const receiveButton = screen.getByRole("button", { name: "Receive seeded order" });
  fireEvent.click(receiveButton);
  expect(screen.getByTestId("cable-stock")).toHaveTextContent("10");
  expect(screen.getByTestId("order-status")).toHaveTextContent("Received");
  expect(screen.getByTestId("stock-movement-count")).toHaveTextContent("2");

  fireEvent.click(receiveButton);
  expect(screen.getByTestId("cable-stock")).toHaveTextContent("10");
  expect(screen.getByTestId("stock-movement-count")).toHaveTextContent("2");
});

test("archiving a referenced item preserves it for historical goods receipt", () => {
  render(
    <InventoryProvider>
      <ReferencedItemArchiveProbe />
    </InventoryProvider>
  );

  fireEvent.click(screen.getByRole("button", { name: "Archive cable" }));
  expect(screen.getByTestId("cable-archived")).toHaveTextContent("true");
  fireEvent.click(screen.getByRole("button", { name: "Receive archived cable order" }));

  expect(screen.getByTestId("archived-cable-order-status")).toHaveTextContent("Received");
  expect(screen.getByTestId("archived-cable-stock")).toHaveTextContent("10");
  expect(screen.getByTestId("cable-archived")).toHaveTextContent("true");
});

test("migrates the untouched previous demo seed to the expanded inventory sample", () => {
  localStorage.setItem("inventory-managed-items", JSON.stringify([
    { id: "ITM-1", sku: "FOC-24C", name: "24-Core Fiber Optic Cable (1km)", category: "Fiber Optics", unitCost: 58500, stock: 4, reorderLevel: 5 },
    { id: "ITM-2", sku: "BAT-12V", name: "12V 100Ah Deep Cycle Battery", category: "Power & Backup", unitCost: 23500, stock: 14, reorderLevel: 6 },
    { id: "ITM-3", sku: "SWT-48G", name: "48-Port Gigabit Rack Switch", category: "Networking Hardware", unitCost: 42000, stock: 2, reorderLevel: 4 },
  ]));
  localStorage.setItem("inventory-managed-purchase-orders", JSON.stringify([{
    id: "PO-1001",
    orderNumber: "PO:001",
    supplierId: "SUP-1",
    quotationId: null,
    date: "2026-11-14",
    status: "Pending",
    lineItems: [{ itemId: "ITM-1", quantity: 6, unitCost: 58500 }],
  }]));

  render(
    <InventoryProvider>
      <InventoryItemsProbe />
    </InventoryProvider>
  );

  expect(screen.getByTestId("inventory-item-names")).toHaveTextContent("Dual-Band Wi-Fi 6 GPON ONT Router");
  expect(screen.getByTestId("inventory-item-names")).toHaveTextContent("24-Core Fiber Optic Cable (1km) (km)");
});

test("new purchase orders receive short sequential numbers", () => {
  render(
    <InventoryProvider>
      <PurchaseOrderNumberProbe />
    </InventoryProvider>
  );

  fireEvent.click(screen.getByRole("button", { name: "Create numbered PO" }));
  expect(screen.getByTestId("po-numbers")).toHaveTextContent("PO:006,PO:001,PO:002,PO:003,PO:004,PO:005");

  fireEvent.click(screen.getByRole("button", { name: "Create numbered PO" }));
  expect(screen.getByTestId("po-numbers")).toHaveTextContent("PO:007,PO:006,PO:001,PO:002,PO:003,PO:004,PO:005");
});

test("one purchase order can contain multiple items for one supplier", () => {
  render(
    <InventoryProvider>
      <ProcurementPurchaseOrdersProbe />
    </InventoryProvider>
  );

  fireEvent.change(screen.getByLabelText("Supplier"), { target: { value: "SUP-2" } });
  fireEvent.change(screen.getByLabelText("Item 1"), { target: { value: "ITM-1" } });
  fireEvent.change(screen.getByLabelText("Quantity 1"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Add another item" }));
  fireEvent.change(screen.getByLabelText("Item 2"), { target: { value: "ITM-3" } });
  fireEvent.change(screen.getByLabelText("Quantity 2"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Create purchase order" }));

  expect(screen.getByTestId("created-po-line-count")).toHaveTextContent("2");
  expect(screen.getByLabelText("Supplier for register")).toHaveValue("SUP-2");
  expect(screen.getByText("PO:006")).toBeInTheDocument();
  expect(screen.getByText("2 km × 24-Core Fiber Optic Cable (1km)")).toBeInTheDocument();
  expect(screen.getByText("3 piece × 48-Port Gigabit Rack Switch")).toBeInTheDocument();
});

test("purchase order register filters item lines and exports by supplier", async () => {
  localStorage.setItem("inventory-managed-suppliers", JSON.stringify([
    { id: "SUP-1", name: "Fiber supplier" },
    { id: "SUP-2", name: "Power supplier" },
    { id: "SUP-3", name: "New supplier" },
  ]));
  const createObjectURL = URL.createObjectURL;
  const revokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn(() => "blob:test");
  URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  try {
    render(<InventoryProvider><InventorySubmenu section="purchase-orders" /></InventoryProvider>);
    expect(screen.getByRole("columnheader", { name: "Status" })).toHaveClass("no-print");
    expect(screen.getByText("Pending")).toHaveClass("no-print");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select PO:005" }));
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Download (JSON)" }));
    const selection = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(JSON.parse(reader.result));
      reader.onerror = reject;
      reader.readAsText(URL.createObjectURL.mock.calls[0][0]);
    });
    expect(selection[0]).toMatchObject({ orderNumber: "PO:005" });
    expect(selection[0]).not.toHaveProperty("status");
    fireEvent.change(screen.getByLabelText("Supplier for register"), { target: { value: "SUP-2" } });
    expect(screen.getByText("PO:002")).toBeInTheDocument();
    expect(screen.getByText("PO:004")).toBeInTheDocument();
    expect(screen.getAllByText(/12V 100Ah Deep Cycle Battery/).length).toBeGreaterThan(0);
    expect(screen.getByText(/48-Port Gigabit Rack Switch/)).toBeInTheDocument();
    expect(screen.queryByText("PO:005")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Documents (0)" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Export (CSV)" }));
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(URL.createObjectURL.mock.calls[1][0]);
    });
    expect(text).toContain("PO:002");
    expect(text).toContain("PO:004");
    expect(text).not.toContain("PO:005");
    expect(text).not.toMatch(/status/i);
    fireEvent.change(screen.getByLabelText("Supplier for register"), { target: { value: "SUP-3" } });
    expect(screen.getByText("No purchase orders found for this supplier.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Supplier for register"), { target: { value: "" } });
    expect(screen.getByText("PO:005")).toBeInTheDocument();
    expect(screen.getByText("PO:002")).toBeInTheDocument();
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2));
  } finally {
    click.mockRestore();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  }
});

test("editing a received PO updates stock, receipts and linked invoices without changing payments", () => {
  localStorage.setItem("inventory-managed-purchase-orders", JSON.stringify([{
    id: "order-1", orderNumber: "PO:005", supplierId: "SUP-1", quotationId: "QT-3001",
    date: "2026-01-01", status: "Pending", lineItems: [
      { itemId: "ITM-1", quantity: 2, unitCost: 10, uom: "km" },
      { itemId: "ITM-4", quantity: 4, unitCost: 30, uom: "piece" },
    ],
  }]));
  localStorage.setItem("inventory-supplier-invoices", JSON.stringify([{
    id: "invoice-1", purchaseOrderId: "order-1", purchaseOrderNumber: "PO:005",
    supplierId: "SUP-1", supplier: "FiberLink Distributors", number: "INV-1", date: "2026-01-01",
    amountCents: 100000, paidCents: 10000, payments: [{ id: "payment-1", amountCents: 10000 }],
  }]));
  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  try {
    render(<InventoryProvider><ProcurementPurchaseOrdersProbe /></InventoryProvider>);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select PO:005" }));
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Edit purchase order" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Receive" }));
    editOrder("PO:005");
    fireEvent.change(screen.getByLabelText("Supplier"), { target: { value: "SUP-2" } });
    fireEvent.change(screen.getByLabelText("PO date"), { target: { value: "2026-02-01" } });
    fireEvent.change(screen.getByLabelText("Quantity 1"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Unit cost 1 (KSh)"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Invoice number 1"), { target: { value: "INV-UPDATED" } });
    fireEvent.change(screen.getByLabelText("Invoice total 1 (KSh)"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Save purchase order" }));
    expect(screen.getByRole("alert")).toHaveTextContent("cannot be reduced below its recorded payments");
    expect(JSON.parse(localStorage.getItem("inventory-managed-items")).find((item) => item.id === "ITM-1").stock).toBe(6);
    expect(JSON.parse(localStorage.getItem("inventory-supplier-invoices"))[0].number).toBe("INV-1");
    fireEvent.change(screen.getByLabelText("Invoice total 1 (KSh)"), { target: { value: "1234.56" } });
    fireEvent.click(screen.getByRole("button", { name: "Save purchase order" }));

    const order = JSON.parse(localStorage.getItem("inventory-managed-purchase-orders"))[0];
    expect(order).toMatchObject({ supplierId: "SUP-2", date: "2026-02-01", quotationId: null, status: "Received" });
    expect(order.lineItems[0]).toMatchObject({ itemId: "ITM-1", quantity: 4, unitCost: 50 });
    const cable = JSON.parse(localStorage.getItem("inventory-managed-items")).find((item) => item.id === "ITM-1");
    expect(cable.stock).toBe(8);
    const receipts = JSON.parse(localStorage.getItem("inventory-stock-movements"));
    expect(receipts).toHaveLength(2);
    expect(receipts.find((movement) => movement.itemId === "ITM-1")).toMatchObject({
      quantity: 4, unitCost: 50, supplierId: "SUP-2", purchaseOrderId: "order-1",
    });
    const invoice = JSON.parse(localStorage.getItem("inventory-supplier-invoices"))[0];
    expect(invoice).toMatchObject({ supplierId: "SUP-2", number: "INV-UPDATED", amountCents: 123456, paidCents: 10000 });
    expect(invoice.payments).toEqual([{ id: "payment-1", amountCents: 10000 }]);
  } finally {
    confirmSpy.mockRestore();
  }
});

test("editing received lines can replace and add items while preserving subsequent reconciliation", () => {
  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  try {
    const { unmount } = render(<InventoryProvider><ProcurementPurchaseOrdersProbe /></InventoryProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Receive" }));
    unmount();
    const legacyReceipts = JSON.parse(localStorage.getItem("inventory-stock-movements")).map((movement) => {
      delete movement.purchaseOrderId;
      delete movement.purchaseOrderLineIndex;
      return movement;
    });
    localStorage.setItem("inventory-stock-movements", JSON.stringify(legacyReceipts));
    render(<InventoryProvider><ProcurementPurchaseOrdersProbe /></InventoryProvider>);
    editOrder("PO:005");
    fireEvent.change(screen.getByLabelText("Item 1"), { target: { value: "ITM-3" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove item 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Add another item" }));
    fireEvent.change(screen.getByLabelText("Item 2"), { target: { value: "ITM-2" } });
    fireEvent.change(screen.getByLabelText("Quantity 2"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save purchase order" }));
    let items = JSON.parse(localStorage.getItem("inventory-managed-items"));
    expect(items.find((item) => item.id === "ITM-1").stock).toBe(4);
    expect(items.find((item) => item.id === "ITM-3").stock).toBe(8);
    expect(items.find((item) => item.id === "ITM-4").stock).toBe(45);
    expect(items.find((item) => item.id === "ITM-2").stock).toBe(17);
    editOrder("PO:005");
    fireEvent.change(screen.getByLabelText("Quantity 2"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save purchase order" }));
    items = JSON.parse(localStorage.getItem("inventory-managed-items"));
    expect(items.find((item) => item.id === "ITM-2").stock).toBe(16);
  } finally {
    confirmSpy.mockRestore();
  }
});

test("received PO edits reject negative stock and missing receipt history without changing records", () => {
  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  try {
    render(<InventoryProvider><ProcurementPurchaseOrdersProbe /><IssueCableProbe /></InventoryProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Receive" }));
    fireEvent.click(screen.getByRole("button", { name: "Issue cable for test" }));
    editOrder("PO:005");
    fireEvent.change(screen.getByLabelText("Quantity 1"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save purchase order" }));
    expect(screen.getByRole("alert")).toHaveTextContent("negative");
    expect(JSON.parse(localStorage.getItem("inventory-managed-items")).find((item) => item.id === "ITM-1").stock).toBe(1);
    expect(JSON.parse(localStorage.getItem("inventory-managed-purchase-orders")).find((order) => order.id === "PO-1005").lineItems[0].quantity).toBe(6);
    fireEvent.click(screen.getByRole("button", { name: "Cancel edit" }));
    editOrder("PO:001");
    fireEvent.click(screen.getByRole("button", { name: "Save purchase order" }));
    expect(screen.getByRole("alert")).toHaveTextContent("receipt records are missing or incomplete");
  } finally {
    confirmSpy.mockRestore();
  }
});

test("selected lines become a separate PO for the same supplier and only those lines are received", () => {
  localStorage.setItem("inventory-managed-purchase-orders", JSON.stringify([{
    id: "original-order", orderNumber: "PO:005", supplierId: "SUP-1", quotationId: "QT-3001",
    date: "2026-01-01", status: "Pending", lineItems: [
      { itemId: "ITM-1", quantity: 2, unitCost: 10, uom: "km" },
      { itemId: "ITM-3", quantity: 3, unitCost: 20, uom: "piece" },
      { itemId: "ITM-4", quantity: 4, unitCost: 30, uom: "piece" },
    ],
  }]));
  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  try {
    render(<InventoryProvider><ProcurementPurchaseOrdersProbe /></InventoryProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Select items" }));
    const selector = screen.getByRole("region", { name: "Select items for a new purchase order" });
    fireEvent.click(within(selector).getByRole("checkbox", { name: /24-Core Fiber Optic Cable/ }));
    fireEvent.click(within(selector).getByRole("checkbox", { name: /48-Port Gigabit Rack Switch/ }));
    fireEvent.click(within(selector).getByRole("button", { name: "Create PO for selected items" }));

    const orders = JSON.parse(localStorage.getItem("inventory-managed-purchase-orders"));
    const newOrder = orders.find((order) => order.orderNumber === "PO:006");
    const original = orders.find((order) => order.id === "original-order");
    expect(newOrder).toMatchObject({ supplierId: "SUP-1", quotationId: "QT-3001", status: "Pending" });
    expect(newOrder.lineItems.map((line) => line.itemId)).toEqual(["ITM-1", "ITM-3"]);
    expect(original.lineItems.map((line) => line.itemId)).toEqual(["ITM-4"]);
    expect(screen.getByRole("checkbox", { name: "Select PO:006" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Documents (1)" }));
    const document = screen.getByRole("dialog");
    expect(document).toHaveTextContent("24-Core Fiber Optic Cable");
    expect(document).toHaveTextContent("48-Port Gigabit Rack Switch");
    expect(document).not.toHaveTextContent("Dual-Band Wi-Fi");
    fireEvent.click(within(document).getByRole("button", { name: "Close" }));

    const newRow = screen.getByRole("checkbox", { name: "Select PO:006" }).closest("tr");
    fireEvent.click(within(newRow).getByRole("button", { name: "Receive" }));
    const items = JSON.parse(localStorage.getItem("inventory-managed-items"));
    expect(items.find((item) => item.id === "ITM-1").stock).toBe(6);
    expect(items.find((item) => item.id === "ITM-3").stock).toBe(5);
    expect(items.find((item) => item.id === "ITM-4").stock).toBe(45);
    expect(JSON.parse(localStorage.getItem("inventory-stock-movements")).map((movement) => movement.itemId)).toEqual(["ITM-1", "ITM-3"]);
  } finally {
    confirmSpy.mockRestore();
  }
});

test("splitting requires a partial selection and rejects orders linked to invoices", () => {
  localStorage.setItem("inventory-supplier-invoices", JSON.stringify([{ id: "invoice-1", purchaseOrderId: "PO-1005" }]));
  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  try {
    render(<InventoryProvider><ProcurementPurchaseOrdersProbe /></InventoryProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Select items" }));
    const selector = screen.getByRole("region", { name: "Select items for a new purchase order" });
    const create = within(selector).getByRole("button", { name: "Create PO for selected items" });
    fireEvent.click(create);
    expect(within(selector).getByRole("alert")).toHaveTextContent("leave at least one item");
    const checkboxes = within(selector).getAllByRole("checkbox");
    checkboxes.forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(create);
    expect(within(selector).getByRole("alert")).toHaveTextContent("leave at least one item");
    fireEvent.click(checkboxes[1]);
    fireEvent.click(create);
    expect(within(selector).getByRole("alert")).toHaveTextContent("linked to supplier invoices cannot be split");
    expect(JSON.parse(localStorage.getItem("inventory-managed-purchase-orders")).find((order) => order.id === "PO-1005").lineItems).toHaveLength(2);
  } finally {
    confirmSpy.mockRestore();
  }
});

test("an order cannot be split while an edit is in progress", () => {
  render(<InventoryProvider><ProcurementPurchaseOrdersProbe /></InventoryProvider>);
  fireEvent.click(screen.getByRole("checkbox", { name: "Select PO:005" }));
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
  expect(screen.getByRole("button", { name: "Select items" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel edit" }));
  expect(screen.getByRole("button", { name: "Select items" })).toBeEnabled();
});

test("Actions keeps editing available without losing an unfinished PO edit", () => {
  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
  try {
    render(<InventoryProvider><ProcurementPurchaseOrdersProbe /></InventoryProvider>);
    editOrder("PO:005");
    fireEvent.change(screen.getByLabelText("Quantity 1"), { target: { value: "7" } });
    editOrder("PO:005");
    expect(screen.getByLabelText("Quantity 1")).toHaveValue(7);
    expect(confirmSpy).not.toHaveBeenCalled();

    editOrder("PO:001");
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Quantity 1")).toHaveValue(7);
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Quantity 1")).toHaveValue(8);
  } finally {
    confirmSpy.mockRestore();
  }
});

test("Actions edits one selected received order while documents include only open orders", () => {
  render(<InventoryProvider><ProcurementPurchaseOrdersProbe /></InventoryProvider>);
  expect(screen.queryByRole("button", { name: "Edit PO:001" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "Select PO:001" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all printable purchase orders" }));
  expect(screen.getByRole("checkbox", { name: "Select PO:001" })).toBeChecked();
  expect(screen.getByRole("button", { name: "Documents (1)" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  expect(screen.getByRole("menuitem", { name: "Edit" })).toBeDisabled();
  expect(screen.getByRole("menuitem", { name: "Delete" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all printable purchase orders" }));
  expect(screen.getByRole("checkbox", { name: "Select PO:001" })).toBeChecked();
  expect(screen.getByRole("button", { name: "Documents (0)" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  expect(screen.getByRole("menuitem", { name: "Edit" })).toBeEnabled();
  expect(screen.getByRole("menuitem", { name: "Delete" })).toBeEnabled();
  fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
  expect(screen.getByRole("heading", { name: "Edit purchase order" })).toBeInTheDocument();
});

test("deleting a received PO reverses stock and removes linked invoices, payments and unshared quotation", () => {
  localStorage.setItem("inventory-managed-purchase-orders", JSON.stringify([{
    id: "order-1", orderNumber: "PO:005", supplierId: "SUP-1", quotationId: "QT-3001",
    date: "2026-01-01", status: "Pending",
    lineItems: [{ itemId: "ITM-1", quantity: 2, unitCost: 10, uom: "km" }],
  }]));
  localStorage.setItem("inventory-supplier-invoices", JSON.stringify([{
    id: "invoice-1", purchaseOrderId: "order-1", supplierId: "SUP-1",
    supplier: "FiberLink Distributors", number: "INV-1", date: "2026-01-01",
    amountCents: 100000, paidCents: 10000, payments: [{ id: "payment-1", amountCents: 10000 }],
  }]));
  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
  try {
    render(<InventoryProvider><ProcurementPurchaseOrdersProbe /></InventoryProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Receive" }));
    editOrder("PO:005");
    fireEvent.change(screen.getByLabelText("Quantity 1"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(confirmSpy.mock.calls[0][0]).toMatch(/1 linked invoice.*payment history.*1 unshared quotation.*Unsaved changes/);
    expect(screen.getByLabelText("Quantity 1")).toHaveValue(3);
    expect(JSON.parse(localStorage.getItem("inventory-supplier-invoices"))).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(JSON.parse(localStorage.getItem("inventory-managed-items")).find((item) => item.id === "ITM-1").stock).toBe(4);
    expect(JSON.parse(localStorage.getItem("inventory-managed-purchase-orders"))).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem("inventory-stock-movements"))).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem("inventory-supplier-invoices"))).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem("inventory-quotations"))).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem("inventory-purchase-requests"))[0].status).toBe("Approved");
    expect(screen.getByRole("heading", { name: "Create purchase order" })).toBeInTheDocument();
  } finally {
    confirmSpy.mockRestore();
  }
});

test("deleting a PO keeps its quotation if another order uses it", () => {
  localStorage.setItem("inventory-managed-purchase-orders", JSON.stringify([
    { id: "order-1", orderNumber: "PO:005", supplierId: "SUP-1", quotationId: "QT-3001", date: "2026-01-01", status: "Pending", lineItems: [{ itemId: "ITM-1", quantity: 1, unitCost: 10, uom: "km" }] },
    { id: "order-2", orderNumber: "PO:006", supplierId: "SUP-1", quotationId: "QT-3001", date: "2026-01-01", status: "Pending", lineItems: [{ itemId: "ITM-1", quantity: 1, unitCost: 10, uom: "km" }] },
  ]));
  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  try {
    render(<InventoryProvider><ProcurementPurchaseOrdersProbe /></InventoryProvider>);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select PO:005" }));
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(confirmSpy.mock.calls[0][0]).toContain("0 unshared quotation");
    expect(JSON.parse(localStorage.getItem("inventory-managed-purchase-orders")).map((order) => order.id)).toEqual(["order-2"]);
    expect(JSON.parse(localStorage.getItem("inventory-quotations"))[0].id).toBe("QT-3001");
    expect(JSON.parse(localStorage.getItem("inventory-purchase-requests"))[0].status).toBe("Quoted");
  } finally {
    confirmSpy.mockRestore();
  }
});

test("deletion leaves all records unchanged when received stock cannot be reversed", () => {
  localStorage.setItem("inventory-supplier-invoices", JSON.stringify([{
    id: "invoice-1", purchaseOrderId: "PO-1005", supplierId: "SUP-1", number: "INV-1",
    date: "2026-01-01", amountCents: 10000, paidCents: 0, payments: [],
  }]));
  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  try {
    render(<InventoryProvider><ProcurementPurchaseOrdersProbe /><IssueCableProbe /></InventoryProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Receive" }));
    fireEvent.click(screen.getByRole("button", { name: "Issue cable for test" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select PO:005" }));
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByRole("alert")).toHaveTextContent("negative");
    expect(JSON.parse(localStorage.getItem("inventory-managed-items")).find((item) => item.id === "ITM-1").stock).toBe(1);
    expect(JSON.parse(localStorage.getItem("inventory-managed-purchase-orders")).find((order) => order.id === "PO-1005")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("inventory-supplier-invoices"))).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem("inventory-stock-movements"))).toHaveLength(3);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select PO:005" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select PO:001" }));
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByRole("alert")).toHaveTextContent("receipt records are missing or incomplete");
    expect(JSON.parse(localStorage.getItem("inventory-managed-purchase-orders")).find((order) => order.id === "PO-1001")).toBeTruthy();
  } finally {
    confirmSpy.mockRestore();
  }
});

test("deleting several received orders validates their combined stock reversal atomically", () => {
  localStorage.setItem("inventory-managed-purchase-orders", JSON.stringify([
    { id: "order-1", orderNumber: "PO:005", supplierId: "SUP-1", date: "2026-01-01", status: "Pending", lineItems: [{ itemId: "ITM-1", quantity: 2, unitCost: 10, uom: "km" }] },
    { id: "order-2", orderNumber: "PO:006", supplierId: "SUP-1", date: "2026-01-01", status: "Pending", lineItems: [{ itemId: "ITM-1", quantity: 3, unitCost: 10, uom: "km" }] },
  ]));
  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  try {
    render(<InventoryProvider><ProcurementPurchaseOrdersProbe /><IssueCableProbe /></InventoryProvider>);
    fireEvent.click(within(screen.getByText("PO:005").closest("tr")).getByRole("button", { name: "Receive" }));
    fireEvent.click(within(screen.getByText("PO:006").closest("tr")).getByRole("button", { name: "Receive" }));
    fireEvent.click(screen.getByRole("button", { name: "Issue cable for test" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select PO:005" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select PO:006" }));
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByRole("alert")).toHaveTextContent("negative");
    expect(JSON.parse(localStorage.getItem("inventory-managed-purchase-orders"))).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem("inventory-stock-movements"))).toHaveLength(3);
    expect(JSON.parse(localStorage.getItem("inventory-managed-items")).find((item) => item.id === "ITM-1").stock).toBe(0);
  } finally {
    confirmSpy.mockRestore();
  }
});

test("received purchase-order items appear in inventory stock", () => {
  render(
    <InventoryProvider>
      <InventoryStoreProbe />
    </InventoryProvider>
  );

  fireEvent.click(screen.getByRole("button", { name: "Receive stock into store" }));
  const activeStoreSection = screen.getByRole("heading", { name: "Active store inventory" }).closest("section");
  expect(within(activeStoreSection).getByRole("row", { name: /FOC-24C/ })).toHaveTextContent("10 km");
});

test("inventory items require and display a unit of measure", () => {
  render(
    <InventoryProvider>
      <InventorySubmenu section="items" />
    </InventoryProvider>
  );

  fireEvent.change(screen.getByLabelText("SKU"), { target: { value: "ROLL-1" } });
  fireEvent.change(screen.getByLabelText("Item name"), { target: { value: "Drop cable" } });
  fireEvent.change(screen.getByLabelText("Stock unit of measure"), { target: { value: "roll" } });
  fireEvent.change(screen.getAllByLabelText("Unit cost (KSh)")[0], { target: { value: "3500" } });
  fireEvent.change(screen.getByLabelText("Stock quantity"), { target: { value: "6" } });
  fireEvent.change(screen.getByLabelText("Reorder level"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Add item" }));

  const activeStoreSection = screen.getByRole("heading", { name: "Active store inventory" }).closest("section");
  expect(within(activeStoreSection).getByRole("row", { name: /ROLL-1/ })).toHaveTextContent("6 roll");
});

test("stock movements update on-hand quantities in separate stock-in and stock-out submenus", () => {
  const { rerender } = render(
    <InventoryProvider>
      <InventorySubmenu section="stock-out" />
    </InventoryProvider>
  );

  fireEvent.change(screen.getByLabelText("Item", { selector: "select" }), { target: { value: "ITM-1" } });
  fireEvent.change(screen.getByLabelText("UOM"), { target: { value: "km" } });
  fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "5" } });
  fireEvent.change(screen.getByLabelText("Reference"), { target: { value: "ISS-500" } });
  fireEvent.click(screen.getByRole("button", { name: "Record stock out" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Only 4");

  fireEvent.change(screen.getByLabelText("UOM"), { target: { value: "m" } });
  fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "300" } });
  fireEvent.click(screen.getByRole("button", { name: "Record stock out" }));
  const stockOutSection = screen.getByRole("heading", { name: "Stock out records" }).closest("section");
  expect(within(stockOutSection).getByRole("row", { name: /300 m.*ISS-500/ })).toBeInTheDocument();

  rerender(
    <InventoryProvider>
      <InventorySubmenu section="stock-in" />
    </InventoryProvider>
  );
  fireEvent.change(screen.getByLabelText("Item", { selector: "select" }), { target: { value: "ITM-1" } });
  fireEvent.change(screen.getByLabelText("UOM"), { target: { value: "m" } });
  fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "1000" } });
  fireEvent.change(screen.getByLabelText("Reference"), { target: { value: "REC-501" } });
  fireEvent.click(screen.getByRole("button", { name: "Record stock in" }));
  const stockInSection = screen.getByRole("heading", { name: "Stock in records" }).closest("section");
  expect(within(stockInSection).getByRole("row", { name: /1000 m.*REC-501/ })).toBeInTheDocument();
  const savedMovements = JSON.parse(localStorage.getItem("inventory-stock-movements"));
  expect(savedMovements).toHaveLength(2);
  expect(savedMovements[0]).toMatchObject({ quantity: 1000, uom: "m", quantityInStockUnit: 1 });

  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  rerender(
    <InventoryProvider>
      <InventorySubmenu section="stock-out" />
    </InventoryProvider>
  );
  fireEvent.click(screen.getByLabelText("Select ISS-500"));
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
  expect(JSON.parse(localStorage.getItem("inventory-stock-movements"))).toHaveLength(1);

  rerender(
    <InventoryProvider>
      <InventorySubmenu section="stock-in" />
    </InventoryProvider>
  );
  fireEvent.click(screen.getByLabelText("Select REC-501"));
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
  expect(JSON.parse(localStorage.getItem("inventory-stock-movements"))).toHaveLength(0);
  confirmSpy.mockRestore();

  rerender(
    <InventoryProvider>
      <InventorySubmenu section="items" />
    </InventoryProvider>
  );
  const activeStoreSection = screen.getByRole("heading", { name: "Active store inventory" }).closest("section");
  expect(within(activeStoreSection).getByRole("row", { name: /FOC-24C/ })).toHaveTextContent("4 km");
});

test("purchased stock-in feeds the annual inventory and dashboard, but other receipts do not", () => {
  const { rerender } = render(
    <MemoryRouter><InventoryProvider><InventorySubmenu section="stock-in" /></InventoryProvider></MemoryRouter>
  );
  fireEvent.change(screen.getByLabelText("Item", { selector: "select" }), { target: { value: "ITM-1" } });
  fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "1" } });
  fireEvent.click(screen.getByLabelText("Purchased stock"));
  fireEvent.change(screen.getByLabelText("Purchase supplier"), { target: { value: "SUP-1" } });
  fireEvent.change(screen.getByLabelText("Rate (KSh per selected UOM)"), { target: { value: "250" } });
  fireEvent.change(screen.getByLabelText("Reference"), { target: { value: "BUY-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Record stock in" }));
  fireEvent.click(screen.getByLabelText("Purchased stock"));
  fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Reference"), { target: { value: "RETURN-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Record stock in" }));

  rerender(<MemoryRouter><InventoryProvider><InventoryStock /><InventoryDashboard /></InventoryProvider></MemoryRouter>);
  const register = screen.getByRole("heading", { name: "Inventory report" }).closest("section");
  expect(screen.queryByRole("heading", { name: "Current stock" })).not.toBeInTheDocument();
  expect(receiptCheckbox("BUY-1")).toBeInTheDocument();
  expect(receiptCheckbox("RETURN-1")).toBeInTheDocument();
  expect(within(register).getAllByText(/250/).length).toBeGreaterThan(0);
  expect(screen.getByLabelText("Item")).toHaveValue("ITM-1");
  expect(screen.getByText(/Annual expenditure/).closest("section")).toHaveTextContent("KSh 250.00");
});

test("inventory report edits and deletes Stock In while updating stock and purchase analysis", () => {
  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  try {
    const { rerender } = render(<MemoryRouter><InventoryProvider><InventorySubmenu section="stock-in" /></InventoryProvider></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Item", { selector: "select" }), { target: { value: "ITM-1" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "1" } });
    fireEvent.click(screen.getByLabelText("Purchased stock"));
    fireEvent.change(screen.getByLabelText("Purchase supplier"), { target: { value: "SUP-1" } });
    fireEvent.change(screen.getByLabelText("Rate (KSh per selected UOM)"), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText("Reference"), { target: { value: "EDIT-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Record stock in" }));

    rerender(<MemoryRouter><InventoryProvider><InventoryStock /><InventoryDashboard /></InventoryProvider></MemoryRouter>);
    fireEvent.click(receiptCheckbox("EDIT-1"));
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    const editor = screen.getByRole("heading", { name: "Edit Stock In record" }).closest("section");
    expect(within(editor).queryByLabelText("Reference")).not.toBeInTheDocument();
    fireEvent.change(within(editor).getByLabelText("Quantity"), { target: { value: "500" } });
    fireEvent.change(within(editor).getByLabelText("UOM"), { target: { value: "m" } });
    fireEvent.change(within(editor).getByLabelText("Rate (KSh per selected UOM)"), { target: { value: "0.5" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Save changes" }));
    expect(JSON.parse(localStorage.getItem("inventory-managed-items")).find((item) => item.id === "ITM-1").stock).toBeCloseTo(4.5);
    expect(screen.getByText(/Annual expenditure/).closest("section")).toHaveTextContent("KSh 250.00");
    const updatedCells = within(receiptCheckbox("EDIT-1").closest("tr")).getAllByRole("cell");
    expect(updatedCells[4]).toHaveTextContent(/^500$/);
    expect(updatedCells[5]).toHaveTextContent(/^m$/);
    expect(JSON.parse(localStorage.getItem("inventory-stock-movements"))[0].reference).toBe("EDIT-1");

    fireEvent.click(receiptCheckbox("EDIT-1"));
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(JSON.parse(localStorage.getItem("inventory-managed-items")).find((item) => item.id === "ITM-1").stock).toBeCloseTo(4);
    expect(JSON.parse(localStorage.getItem("inventory-stock-movements"))).toHaveLength(0);
    expect(screen.getByText(/Annual expenditure/).closest("section")).toHaveTextContent("KSh 0.00");
  } finally {
    confirmSpy.mockRestore();
  }
});

test("inventory report blocks purchase-order receipt changes and unsafe stock reversals", () => {
  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  try {
    const { rerender } = render(<MemoryRouter><InventoryProvider><InventorySubmenu section="stock-in" /><InventoryStateProbe /></InventoryProvider></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Item", { selector: "select" }), { target: { value: "ITM-1" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Reference"), { target: { value: "MANUAL" } });
    fireEvent.click(screen.getByRole("button", { name: "Record stock in" }));
    fireEvent.click(screen.getByRole("button", { name: "Receive seeded order" }));
    rerender(<MemoryRouter><InventoryProvider><InventorySubmenu section="stock-out" /></InventoryProvider></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Item", { selector: "select" }), { target: { value: "ITM-1" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "10.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Record stock out" }));
    rerender(<MemoryRouter><InventoryProvider><InventoryStock /></InventoryProvider></MemoryRouter>);

    const orderCheckbox = receiptCheckbox("PO:005");
    fireEvent.click(orderCheckbox);
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
    expect(screen.getByText(/Purchase-order receipts cannot be edited/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(orderCheckbox);
    fireEvent.click(receiptCheckbox("MANUAL"));
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    const editor = screen.getByRole("heading", { name: "Edit Stock In record" }).closest("section");
    fireEvent.change(within(editor).getByLabelText("Quantity"), { target: { value: "0.1" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent("would make the stock balance");
    fireEvent.click(within(editor).getByRole("button", { name: "Cancel edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Cannot remove the stock-in movement");
    expect(receiptCheckbox("MANUAL")).toBeInTheDocument();
  } finally {
    confirmSpy.mockRestore();
  }
});

test("inventory report denies stock changes without Stock In menu access", () => {
  localStorage.setItem("roleMenuPermissions", JSON.stringify({ Requester: ["/inventory"] }));
  localStorage.setItem("inventory-stock-movements", JSON.stringify([
    { id: "receipt", itemId: "ITM-1", item: "Cable", movementType: "in", date: `${new Date().getFullYear()}-01-03`, quantity: 1, uom: "km", reference: "PRIVATE" },
  ]));
  render(<MemoryRouter><InventoryProvider><InventoryStock user={{ role: "Requester" }} /></InventoryProvider></MemoryRouter>);
  fireEvent.click(screen.getByLabelText("Select stock in receipt"));
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  expect(screen.getByRole("menuitem", { name: "Edit" })).toBeDisabled();
  expect(screen.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
  expect(screen.queryByRole("menuitem", { name: "Upload spreadsheet" })).not.toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: "Manage categories" })).not.toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: "Add item" })).not.toBeInTheDocument();
});

test("inventory adds a new item and opening receipt and retains both after reload", () => {
  localStorage.setItem("inventory-categories", JSON.stringify(["Cables"]));
  const page = <MemoryRouter><InventoryProvider><InventoryStock user={{ role: "Director" }} /></InventoryProvider></MemoryRouter>;
  const { unmount } = render(page);
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Add item" }));
  let form = screen.getByRole("heading", { name: "Add item to inventory" }).closest("section");
  expect(within(form).queryByLabelText("Reference")).not.toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: "Add item" })).not.toBeInTheDocument();
  fireEvent.change(within(form).getByLabelText("SKU"), { target: { value: "FOC-24C" } });
  fireEvent.click(within(form).getByRole("button", { name: "Close add item" }));
  expect(screen.queryByRole("heading", { name: "Add item to inventory" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Add item" }));
  expect(screen.getByLabelText("SKU")).toHaveValue("FOC-24C");
  form = screen.getByRole("heading", { name: "Add item to inventory" }).closest("section");
  fireEvent.change(within(form).getByLabelText("New item name"), { target: { value: "New cable" } });
  fireEvent.change(within(form).getByLabelText("Item category"), { target: { value: "Cables" } });
  fireEvent.change(within(form).getByLabelText("Unit of measure"), { target: { value: "m" } });
  fireEvent.change(within(form).getByLabelText("Receipt date"), { target: { value: "2024-06-02" } });
  fireEvent.change(within(form).getByLabelText("Quantity"), { target: { value: "4" } });
  fireEvent.change(within(form).getByLabelText("Unit cost (KSh)"), { target: { value: "25" } });
  fireEvent.click(within(form).getByRole("button", { name: "Save item and receipt" }));
  expect(screen.getByRole("alert")).toHaveTextContent("SKU already exists");
  expect(JSON.parse(localStorage.getItem("inventory-stock-movements"))).toHaveLength(0);

  fireEvent.change(within(form).getByLabelText("SKU"), { target: { value: "NEW-CAB" } });
  fireEvent.change(within(form).getByLabelText("Quantity"), { target: { value: "0" } });
  fireEvent.submit(within(form).getByRole("button", { name: "Save item and receipt" }).closest("form"));
  expect(screen.getByRole("alert")).toHaveTextContent("quantity must be greater than zero");
  expect(JSON.parse(localStorage.getItem("inventory-managed-items")).some((item) => item.sku === "NEW-CAB")).toBe(false);
  fireEvent.change(within(form).getByLabelText("Quantity"), { target: { value: "4" } });
  fireEvent.click(within(form).getByRole("button", { name: "Save item and receipt" }));
  expect(screen.getByRole("status")).toHaveTextContent("New cable added and stock received");
  expect(screen.getByRole("row", { name: /New cable.*4 m/ })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("inventory-managed-items")).find((item) => item.sku === "NEW-CAB"))
    .toMatchObject({ name: "New cable", category: "Cables", stock: 4, uom: "m", unitCost: 25 });
  expect(JSON.parse(localStorage.getItem("inventory-categories"))).toContain("Cables");
  unmount();
  render(page);
  fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2024" } });
  expect(screen.getByRole("row", { name: /New cable.*4 m/ })).toBeInTheDocument();
});

test("inventory can record a new item as purchased stock", () => {
  render(<MemoryRouter><InventoryProvider><InventoryStock user={{ role: "Director" }} /></InventoryProvider></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Add item" }));
  const form = screen.getByRole("heading", { name: "Add item to inventory" }).closest("section");
  fireEvent.change(within(form).getByLabelText("SKU"), { target: { value: "NEW-TOOL" } });
  fireEvent.change(within(form).getByLabelText("New item name"), { target: { value: "New tool" } });
  fireEvent.change(within(form).getByLabelText("Unit of measure"), { target: { value: "piece" } });
  fireEvent.change(within(form).getByLabelText("Quantity"), { target: { value: "2" } });
  fireEvent.change(within(form).getByLabelText("Unit cost (KSh)"), { target: { value: "50" } });
  fireEvent.click(within(form).getByLabelText("Purchased stock"));
  fireEvent.change(within(form).getByLabelText("Purchase supplier"), { target: { value: "SUP-1" } });
  fireEvent.click(within(form).getByRole("button", { name: "Save item and receipt" }));
  expect(screen.getByRole("row", { name: /New tool.*2 piece.*FiberLink Distributors/ })).toBeInTheDocument();
  expect(screen.getByText(/Purchased value/)).toHaveTextContent("KSh 100.00");
});

test("item dropdown receives stock for an existing item without creating a duplicate", () => {
  const page = <MemoryRouter><InventoryProvider><InventoryStock user={{ role: "Director" }} /></InventoryProvider></MemoryRouter>;
  const { unmount } = render(page);
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Add item" }));
  const form = screen.getByRole("heading", { name: "Add item to inventory" }).closest("section");
  fireEvent.change(within(form).getByLabelText("New item name"), { target: { value: "Draft item" } });
  fireEvent.change(within(form).getByLabelText("Item name"), { target: { value: "ITM-1" } });
  expect(within(form).getByText("Stock unit: km")).toBeInTheDocument();
  expect(within(form).queryByLabelText("New item name")).not.toBeInTheDocument();
  fireEvent.change(within(form).getByLabelText("Item name"), { target: { value: "" } });
  expect(within(form).getByLabelText("New item name")).toHaveValue("Draft item");
  fireEvent.change(within(form).getByLabelText("Item name"), { target: { value: "ITM-1" } });
  fireEvent.change(within(form).getByLabelText("Receipt date"), { target: { value: "2024-06-02" } });
  fireEvent.change(within(form).getByLabelText("Quantity"), { target: { value: "2" } });
  fireEvent.click(within(form).getByLabelText("Purchased stock"));
  fireEvent.change(within(form).getByLabelText("Purchase supplier"), { target: { value: "SUP-1" } });
  fireEvent.change(within(form).getByLabelText("Unit cost (KSh)"), { target: { value: "100" } });
  fireEvent.click(within(form).getByRole("button", { name: "Record receipt" }));
  expect(screen.getByRole("status")).toHaveTextContent("Stock received for 24-Core Fiber Optic Cable");
  expect(screen.getByRole("row", { name: /24-Core Fiber Optic Cable.*2 km/ })).toBeInTheDocument();
  const savedItems = JSON.parse(localStorage.getItem("inventory-managed-items"));
  expect(savedItems.filter((item) => item.id === "ITM-1")).toHaveLength(1);
  expect(savedItems.find((item) => item.id === "ITM-1")).toMatchObject({ stock: 6, unitCost: 58500 });
  unmount();
  render(page);
  fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2024" } });
  expect(screen.getByRole("row", { name: /24-Core Fiber Optic Cable.*2 km/ })).toBeInTheDocument();
});

test("item dropdown excludes archived items and records other receipts", () => {
  render(<MemoryRouter><InventoryProvider><InventoryStock user={{ role: "Director" }} /><ReferencedItemArchiveProbe /></InventoryProvider></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Archive cable" }));
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Add item" }));
  const form = screen.getByRole("heading", { name: "Add item to inventory" }).closest("section");
  expect(within(form).queryByRole("option", { name: /24-Core Fiber Optic Cable/ })).not.toBeInTheDocument();
  fireEvent.change(within(form).getByLabelText("Item name"), { target: { value: "ITM-2" } });
  fireEvent.change(within(form).getByLabelText("Quantity"), { target: { value: "3" } });
  fireEvent.click(within(form).getByRole("button", { name: "Record receipt" }));
  expect(screen.getByRole("row", { name: /12V 100Ah Deep Cycle Battery.*3 piece/ })).toBeInTheDocument();
  expect(screen.getByText(/Purchased value/)).toHaveTextContent("KSh 0.00");
  expect(JSON.parse(localStorage.getItem("inventory-managed-items")).find((item) => item.id === "ITM-2").stock).toBe(17);
});

test("inventory categories can be added, assigned per receipt and renamed across records", () => {
  const date = `${new Date().getFullYear()}-01-03`;
  localStorage.setItem("inventory-stock-movements", JSON.stringify([
    { id: "manual", itemId: "ITM-1", item: "Cable", movementType: "in", date, quantity: 1, uom: "km", category: "Fiber Optics", reference: "MANUAL" },
    { id: "order", itemId: "ITM-1", item: "Cable", movementType: "in", date, quantity: 2, uom: "km", category: "Fiber Optics", reference: "PO-RECEIPT", notes: "Purchase order receipt", isPurchase: true, supplierId: "SUP-1", supplier: "FiberLink Distributors", unitCost: 10 },
  ]));
  localStorage.setItem("inventory-transactions", JSON.stringify([{ category: "Fiber Optics", item: "Historical cable" }]));
  const page = <MemoryRouter><InventoryProvider><InventoryStock /></InventoryProvider></MemoryRouter>;
  const { unmount } = render(page);
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Manage categories" }));
  fireEvent.change(screen.getByLabelText("New category"), { target: { value: "  Network Tools  " } });
  fireEvent.click(screen.getByRole("button", { name: "Add category" }));
  expect(screen.getByRole("status")).toHaveTextContent("Category added");
  fireEvent.change(screen.getByLabelText("New category"), { target: { value: "network tools" } });
  fireEvent.click(screen.getByRole("button", { name: "Add category" }));
  expect(screen.getByRole("alert")).toHaveTextContent("already exists");
  fireEvent.click(screen.getByLabelText("Select stock in manual"));
  fireEvent.change(screen.getByLabelText("Category for selected receipt"), { target: { value: "Network Tools" } });
  fireEvent.click(screen.getByRole("button", { name: "Update selected receipt category" }));
  expect(JSON.parse(localStorage.getItem("inventory-stock-movements")).find((movement) => movement.id === "manual").category).toBe("Network Tools");
  expect(JSON.parse(localStorage.getItem("inventory-stock-movements")).find((movement) => movement.id === "order").category).toBe("Fiber Optics");

  fireEvent.change(screen.getByLabelText("Category to rename"), { target: { value: "Fiber Optics" } });
  fireEvent.change(screen.getByLabelText("Rename category to"), { target: { value: "Fibre Network" } });
  fireEvent.click(screen.getByRole("button", { name: "Rename category" }));
  expect(JSON.parse(localStorage.getItem("inventory-managed-items")).find((item) => item.id === "ITM-1").category).toBe("Fibre Network");
  expect(JSON.parse(localStorage.getItem("inventory-transactions"))[0].category).toBe("Fibre Network");
  expect(JSON.parse(localStorage.getItem("inventory-stock-movements")).find((movement) => movement.id === "order").category).toBe("Fibre Network");
  fireEvent.click(screen.getByLabelText("Select stock in order"));
  fireEvent.change(screen.getByLabelText("Category for selected receipt"), { target: { value: "Network Tools" } });
  fireEvent.click(screen.getByRole("button", { name: "Update selected receipt category" }));
  const order = JSON.parse(localStorage.getItem("inventory-stock-movements")).find((movement) => movement.id === "order");
  expect(order).toMatchObject({ category: "Network Tools", quantity: 2, unitCost: 10, notes: "Purchase order receipt", supplierId: "SUP-1" });
  expect(screen.getByText(/Purchased value/)).toHaveTextContent("KSh 20.00");
  unmount();
  render(page);
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Network Tools" } });
  expect(screen.getByLabelText("Select stock in manual")).toBeInTheDocument();
  expect(screen.getByLabelText("Select stock in order")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Manage categories" }));
  expect(within(screen.getByLabelText("Category to rename")).getByRole("option", { name: "Fibre Network" })).toBeInTheDocument();
});

test("deleting an in-use category reassigns records without changing stock or purchase values", () => {
  const date = `${new Date().getFullYear()}-01-03`;
  localStorage.setItem("inventory-stock-movements", JSON.stringify([
    { id: "receipt", itemId: "ITM-1", item: "Cable", movementType: "in", date, quantity: 2, uom: "km", category: "Fiber Optics", notes: "Purchase order receipt", isPurchase: true, supplierId: "SUP-1", supplier: "FiberLink Distributors", unitCost: 10 },
  ]));
  localStorage.setItem("inventory-transactions", JSON.stringify([{ category: "fiber optics", item: "Historical cable" }]));
  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
  try {
    const page = <MemoryRouter><InventoryProvider><InventoryStock /><InventoryDashboard /></InventoryProvider></MemoryRouter>;
    const { unmount } = render(page);
    const keys = ["inventory-managed-items", "inventory-stock-movements", "inventory-transactions", "inventory-managed-purchase-orders"];
    const before = keys.map((key) => JSON.parse(localStorage.getItem(key)));
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Fiber Optics" } });
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Manage categories" }));
    expect(within(screen.getByLabelText("Category to delete")).queryByRole("option", { name: "General Materials" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Category to delete"), { target: { value: "Fiber Optics" } });
    fireEvent.change(screen.getByLabelText("Move records to"), { target: { value: "Power & Backup" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete category" }));
    expect(keys.map((key) => JSON.parse(localStorage.getItem(key)))).toEqual(before);
    fireEvent.click(screen.getByRole("button", { name: "Delete category" }));
    expect(screen.getByRole("status")).toHaveTextContent("records reassigned");
    const after = keys.map((key) => JSON.parse(localStorage.getItem(key)));
    expect(after[0]).toEqual(before[0].map((item) => item.category === "Fiber Optics" ? { ...item, category: "Power & Backup" } : item));
    expect(after[1]).toEqual(before[1].map((movement) => ({ ...movement, category: "Power & Backup" })));
    expect(after[2]).toEqual([{ ...before[2][0], category: "Power & Backup" }]);
    expect(after[3]).toEqual(before[3]);
    expect(screen.getByLabelText("Category")).toHaveValue("Power & Backup");
    expect(screen.getByRole("heading", { name: "Purchase expenditure by category" }).closest("section")).toHaveTextContent("KSh 20.00");
    unmount();
    render(page);
    expect(within(screen.getByLabelText("Category")).queryByRole("option", { name: "Fiber Optics" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Select stock in receipt")).toBeInTheDocument();
  } finally {
    confirmSpy.mockRestore();
  }
});

test.each([
  ["items", "Manage inventory categories"],
  ["stock-in", "Manage categories"],
])("categories can be renamed and deleted on the %s page", (section, heading) => {
  localStorage.setItem("inventory-categories", JSON.stringify(["Extra"]));
  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  try {
    render(<MemoryRouter><InventoryProvider><InventorySubmenu section={section} /></InventoryProvider></MemoryRouter>);
    const manager = screen.getByRole("heading", { name: heading }).closest("section");
    if (section === "stock-in") fireEvent.change(screen.getByLabelText("Item", { selector: "select" }), { target: { value: "ITM-1" } });
    const formCategory = screen.getByLabelText("Category");
    fireEvent.change(formCategory, { target: { value: "Extra" } });
    if (section === "items") fireEvent.change(screen.getByLabelText("Material category"), { target: { value: " extra " } });
    fireEvent.change(within(manager).getByLabelText("Category to rename"), { target: { value: "Extra" } });
    fireEvent.change(within(manager).getByLabelText("Rename category to"), { target: { value: "Supplies" } });
    fireEvent.click(within(manager).getByRole("button", { name: "Rename category" }));
    expect(JSON.parse(localStorage.getItem("inventory-categories"))).toContain("Supplies");
    expect(formCategory).toHaveValue("Supplies");
    if (section === "items") expect(screen.getByLabelText("Material category")).toHaveValue("Supplies");
    fireEvent.change(within(manager).getByLabelText("Category to delete"), { target: { value: "Supplies" } });
    fireEvent.change(within(manager).getByLabelText("Move records to"), { target: { value: "General Materials" } });
    fireEvent.click(within(manager).getByRole("button", { name: "Delete category" }));
    expect(JSON.parse(localStorage.getItem("inventory-categories"))).not.toContain("Supplies");
    expect(formCategory).toHaveValue("General Materials");
    if (section === "items") expect(screen.getByLabelText("Material category")).toHaveValue("General Materials");
  } finally {
    confirmSpy.mockRestore();
  }
});

test("category deletion validates source and replacement and protects the default", () => {
  function CategoryValidationProbe() {
    const { deleteInventoryCategory, renameInventoryCategory } = useInventory();
    const [error, setError] = React.useState("");
    const attempt = (action) => {
      try {
        action();
        setError("Unexpected success");
      } catch (failure) {
        setError(failure.message);
      }
    };
    return <>
      <button onClick={() => attempt(() => deleteInventoryCategory("missing", "General Materials"))}>Missing source</button>
      <button onClick={() => attempt(() => deleteInventoryCategory("Fiber Optics", "missing"))}>Missing replacement</button>
      <button onClick={() => attempt(() => deleteInventoryCategory("Fiber Optics", " fiber optics "))}>Same replacement</button>
      <button onClick={() => attempt(() => deleteInventoryCategory(" general materials ", "Fiber Optics"))}>Delete default</button>
      <button onClick={() => attempt(() => renameInventoryCategory(" general materials ", "Other"))}>Rename default</button>
      <output>{error}</output>
    </>;
  }
  render(<InventoryProvider><CategoryValidationProbe /></InventoryProvider>);
  const before = localStorage.getItem("inventory-managed-items");
  [
    ["Missing source", "Choose an existing category to delete."],
    ["Missing replacement", "Choose a different existing replacement category."],
    ["Same replacement", "Choose a different existing replacement category."],
    ["Delete default", "General Materials is the default category and cannot be deleted."],
    ["Rename default", "General Materials is the default category and cannot be renamed."],
  ].forEach(([button, error]) => {
    fireEvent.click(screen.getByRole("button", { name: button }));
    expect(screen.getByText(error)).toBeInTheDocument();
  });
  expect(localStorage.getItem("inventory-managed-items")).toBe(before);
});

test("changing the category to delete clears a conflicting replacement", () => {
  render(<MemoryRouter><InventoryProvider><InventorySubmenu section="stock-in" /></InventoryProvider></MemoryRouter>);
  const source = screen.getByLabelText("Category to delete");
  const replacement = screen.getByLabelText("Move records to");
  fireEvent.change(source, { target: { value: "Fiber Optics" } });
  fireEvent.change(replacement, { target: { value: "Power & Backup" } });
  fireEvent.change(source, { target: { value: "Power & Backup" } });
  expect(replacement).toHaveValue("");
});

test("Stock In categories carry through to inventory filtering and category purchase analysis", () => {
  const { rerender, unmount } = render(<MemoryRouter><InventoryProvider><InventorySubmenu section="stock-in" /></InventoryProvider></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("New category"), { target: { value: "Network Tools" } });
  fireEvent.click(screen.getByRole("button", { name: "Add category" }));
  fireEvent.change(screen.getByLabelText("Item", { selector: "select" }), { target: { value: "ITM-1" } });
  expect(screen.getByLabelText("Category")).toHaveValue("Fiber Optics");
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Network Tools" } });
  fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "2" } });
  fireEvent.click(screen.getByLabelText("Purchased stock"));
  fireEvent.change(screen.getByLabelText("Purchase supplier"), { target: { value: "SUP-1" } });
  fireEvent.change(screen.getByLabelText("Rate (KSh per selected UOM)"), { target: { value: "50" } });
  fireEvent.click(screen.getByRole("button", { name: "Record stock in" }));
  expect(JSON.parse(localStorage.getItem("inventory-stock-movements"))[0]).toMatchObject({ category: "Network Tools", quantity: 2 });
  rerender(<MemoryRouter><InventoryProvider><InventoryStock /><InventoryDashboard /></InventoryProvider></MemoryRouter>);
  const report = screen.getByRole("heading", { name: "Inventory report" }).closest("section");
  fireEvent.change(within(report).getByLabelText("Category"), { target: { value: "Network Tools" } });
  expect(within(report).getByRole("row", { name: /Network Tools/ })).toHaveTextContent("KSh 100.00");
  const chart = screen.getByRole("heading", { name: "Purchase expenditure by category" }).closest("section");
  expect(chart).toHaveTextContent("Network Tools was among the highest-value categories");
  expect(chart).toHaveTextContent("KSh 100.00 (100% of purchase value)");
  unmount();
  render(<MemoryRouter><InventoryProvider><InventoryStock /></InventoryProvider></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Network Tools" } });
  expect(screen.getByRole("row", { name: /Network Tools/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: /Select stock in MOV-/ }));
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Receipt category"), { target: { value: "Power & Backup" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(JSON.parse(localStorage.getItem("inventory-stock-movements"))[0].category).toBe("Power & Backup");
});

test("stock register filters receipt history without mixing purchases and other receipts", () => {
  localStorage.setItem("inventory-stock-movements", JSON.stringify([
    { id: "jan", itemId: "ITM-1", item: "Cable", sku: "CABLE", movementType: "in", date: "2026-01-03", quantity: 300, uom: "m", isPurchase: true, supplier: "Fiber supplier", category: "Fiber", unitCost: 2, reference: "PO-01" },
    { id: "dec", itemId: "ITM-2", item: "Battery", sku: "BAT", movementType: "in", date: "2026-12-20", quantity: 2, uom: "piece", isPurchase: true, supplier: "Power supplier", category: "Power", unitCost: 50, reference: "PO-02" },
    { id: "return", itemId: "ITM-1", item: "Cable", sku: "CABLE", movementType: "in", date: "2026-01-04", quantity: 1, uom: "km", reference: "RETURN" },
    { id: "issue", itemId: "ITM-1", item: "Cable", sku: "CABLE", movementType: "out", date: "2026-01-05", quantity: 1, uom: "km", reference: "ISSUE-1" },
  ]));
  render(<MemoryRouter><InventoryProvider><InventoryStock /></InventoryProvider></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2026" } });
  const report = screen.getByRole("heading", { name: "Inventory report" }).closest("section");
  expect(within(report).getByRole("columnheader", { name: "Date" })).toBeInTheDocument();
  expect(within(report).getByRole("columnheader", { name: "Quantity" })).toBeInTheDocument();
  expect(within(report).getByRole("columnheader", { name: "UOM" })).toBeInTheDocument();
  const receiptCells = within(screen.getByLabelText("Select stock in jan").closest("tr")).getAllByRole("cell");
  expect(receiptCells[3]).toHaveTextContent(/^Fiber$/);
  expect(receiptCells[4]).toHaveTextContent(/^300$/);
  expect(receiptCells[5]).toHaveTextContent(/^m$/);
  const otherReceiptCells = within(screen.getByLabelText("Select stock in return").closest("tr")).getAllByRole("cell");
  expect(otherReceiptCells[4]).toHaveTextContent(/^1$/);
  expect(otherReceiptCells[5]).toHaveTextContent(/^km$/);
  expect(within(report).getByRole("columnheader", { name: "Category" })).toHaveClass("no-print");
  expect(within(report).getByRole("columnheader", { name: "Quantity" })).not.toHaveClass("no-print");
  expect(within(report).getByRole("columnheader", { name: "UOM" })).not.toHaveClass("no-print");
  expect(within(report).queryByRole("columnheader", { name: "Quantity / UOM" })).not.toBeInTheDocument();
  expect(within(report).queryByRole("columnheader", { name: /^(Received|SKU|Type)$/ })).not.toBeInTheDocument();
  expect(within(screen.getByLabelText("Select stock in jan").closest("tr")).queryByText("CABLE")).not.toBeInTheDocument();
  expect(within(screen.getByLabelText("Select stock in jan").closest("tr")).getByText("Fiber")).toBeInTheDocument();
  expect(within(report).getByLabelText("Select stock in jan")).toBeInTheDocument();
  expect(within(report).getByLabelText("Select stock in dec")).toBeInTheDocument();
  expect(within(report).getByLabelText("Select stock in return")).toBeInTheDocument();
  expect(within(report).queryByLabelText("Select stock in issue")).not.toBeInTheDocument();
  expect(within(report).queryByRole("columnheader", { name: "Reference" })).not.toBeInTheDocument();
  expect(within(report).queryByText("PO-01")).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("inventory-stock-movements"))).toHaveLength(4);
  expect(report).toHaveTextContent("Purchased value KSh 700.00");
  fireEvent.change(within(report).getByLabelText("Month"), { target: { value: "01" } });
  fireEvent.change(within(report).getByLabelText("Receipt type"), { target: { value: "purchase" } });
  expect(within(report).getByText("300")).toBeInTheDocument();
  expect(within(report).getByText("m")).toBeInTheDocument();
  expect(within(report).queryByLabelText("Select stock in return")).not.toBeInTheDocument();
  expect(within(report).queryByLabelText("Select stock in dec")).not.toBeInTheDocument();
  expect(report).toHaveTextContent("Purchased value KSh 600.00");
  fireEvent.change(within(report).getByLabelText("Search receipts"), { target: { value: "fiber supplier" } });
  expect(within(report).getByLabelText("Select stock in jan")).toBeInTheDocument();
  fireEvent.change(within(report).getByLabelText("Category"), { target: { value: "Power" } });
  const emptyCells = within(report).getAllByText("No stock received matches these filters.");
  expect(emptyCells).toHaveLength(2);
  expect(emptyCells[0]).toHaveAttribute("colspan", "9");
  expect(emptyCells[1]).toHaveAttribute("colspan", "7");
});

test("stock report exports filtered receipt quantities and calculated purchase totals", async () => {
  localStorage.setItem("inventory-stock-movements", JSON.stringify([
    { id: "jan", itemId: "ITM-1", item: "Cable", sku: "CABLE", movementType: "in", date: "2026-01-03", quantity: 300, uom: "m", isPurchase: true, supplier: "Fiber supplier", category: "Fiber", unitCost: 2, reference: "PO-01" },
    { id: "dec", itemId: "ITM-2", item: "Battery", sku: "BAT", movementType: "in", date: "2026-12-20", quantity: 2, uom: "piece", isPurchase: true, supplier: "Power supplier", category: "Power", unitCost: 50 },
  ]));
  const createObjectURL = URL.createObjectURL;
  const revokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn(() => "blob:test");
  URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  try {
    render(<MemoryRouter><InventoryProvider><InventoryStock /></InventoryProvider></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2026" } });
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "01" } });
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Export (CSV)" }));
    const blob = URL.createObjectURL.mock.calls[0][0];
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(blob);
    });
    expect(text).toContain('"Receipt date","SKU","Item","Category","Type","Quantity","UOM"');
    expect(text).toContain('"2026-01-03","CABLE","Cable","Fiber","Purchase","300","m","Fiber supplier","2","600"');
    expect(text).not.toContain("Reference");
    expect(text).not.toContain("PO-01");
    expect(text).not.toContain("Battery");
    fireEvent.click(screen.getByLabelText("Select stock in jan"));
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Download (JSON)" }));
    const json = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(JSON.parse(reader.result));
      reader.onerror = reject;
      reader.readAsText(URL.createObjectURL.mock.calls[1][0]);
    });
    expect(json).toEqual([{
      "Receipt date": "2026-01-03", SKU: "CABLE", Item: "Cable", Category: "Fiber",
      Type: "Purchase", Quantity: 300, UOM: "m", Supplier: "Fiber supplier",
      "Unit cost (KSh)": 2, "Total (KSh)": 600, Notes: "",
    }]);
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2), { timeout: 2000 });
  } finally {
    click.mockRestore();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  }
});

function spreadsheetFile(rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Data");
  const contents = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const file = new File([contents], "import.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => contents });
  return file;
}

test("reviewed spreadsheet stock receipts validate all rows before adjusting stock", async () => {
  render(<MemoryRouter><InventoryProvider><InventoryStock /><InventoryDashboard /></InventoryProvider></MemoryRouter>);
  const register = screen.getByRole("heading", { name: "Inventory report" }).closest("section");
  fireEvent.click(within(register).getByRole("button", { name: "Actions" }));
  fireEvent.click(within(register).getByRole("menuitem", { name: "Upload spreadsheet" }));
  fireEvent.change(screen.getByLabelText("Choose import spreadsheet"), { target: { files: [spreadsheetFile([
    ["Receipt date", "SKU", "Quantity", "UOM", "Supplier", "Unit cost", "Reference"],
    ["2026-01-03", "foc-24c", 300, "m", "fiberlink distributors", 2, "INV-1"],
    ["2026-01-04", "Unmatched cable", 1, "km", "Unknown supplier", 100, "INV-2"],
    ["2026-01-05", "unmatched cable", -500, "m", "unknown supplier", 1, "INV-3"],
  ])] } });
  await screen.findByText("import.xlsx");
  fireEvent.click(screen.getByRole("button", { name: "Review spreadsheet rows" }));
  expect(screen.queryByLabelText(/Match item row/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Match supplier row/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Record reviewed Stock In" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Spreadsheet row 4: Enter a positive quantity");
  expect(JSON.parse(localStorage.getItem("inventory-stock-movements"))).toHaveLength(0);
  expect(JSON.parse(localStorage.getItem("inventory-managed-items"))).toHaveLength(5);
  expect(JSON.parse(localStorage.getItem("inventory-managed-suppliers"))).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Quantity row 4"), { target: { value: "500" } });
  fireEvent.click(screen.getByRole("button", { name: "Record reviewed Stock In" }));
  expect(screen.getByRole("status")).toHaveTextContent("3 purchased stock receipt line(s) recorded");
  const movements = JSON.parse(localStorage.getItem("inventory-stock-movements"));
  const items = JSON.parse(localStorage.getItem("inventory-managed-items"));
  const suppliers = JSON.parse(localStorage.getItem("inventory-managed-suppliers"));
  expect(movements).toHaveLength(3);
  expect(items.find((item) => item.id === "ITM-1").stock).toBeCloseTo(4.3);
  const newItem = items.find((item) => item.name === "Unmatched cable");
  const newSupplier = suppliers.find((supplier) => supplier.name === "Unknown supplier");
  expect(newItem).toMatchObject({ sku: "Unmatched cable", uom: "km", stock: 1.5, reorderLevel: 0 });
  expect(newSupplier).toMatchObject({ email: "", leadTimeDays: null, paymentTerms: "" });
  expect(items).toHaveLength(6);
  expect(suppliers).toHaveLength(3);
  expect(movements.filter((movement) => movement.itemId === newItem.id && movement.supplierId === newSupplier.id)).toHaveLength(2);
  fireEvent.change(within(register).getByLabelText("Year"), { target: { value: "2026" } });
  expect(receiptCheckbox("INV-1")).toBeInTheDocument();
  const dashboardPage = screen.getByRole("heading", { name: "Inventory Dashboard" }).closest(".procurement-dashboard");
  fireEvent.change(within(dashboardPage).getByLabelText("Year"), { target: { value: "2026" } });
  const dashboard = screen.getByText("Annual expenditure · 2026").closest("section");
  expect(dashboard).toHaveTextContent("KSh 1,200.00");
});

test("stock import confirms unrelated units and keeps their balances separate", async () => {
  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
  try {
    const { rerender } = render(<MemoryRouter><InventoryProvider><InventoryStock /></InventoryProvider></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Upload spreadsheet" }));
    fireEvent.change(screen.getByLabelText("Choose import spreadsheet"), { target: { files: [spreadsheetFile([
      ["Receipt date", "SKU", "Quantity", "UOM", "Supplier", "Unit cost"],
      [`${new Date().getFullYear()}-01-03`, "BAT-12V", 1, "rolls", "FiberLink Distributors", 50],
    ])] } });
    await screen.findByText("import.xlsx");
    fireEvent.click(screen.getByRole("button", { name: "Review spreadsheet rows" }));
    fireEvent.click(screen.getByRole("button", { name: "Record reviewed Stock In" }));
    expect(JSON.parse(localStorage.getItem("inventory-stock-movements"))).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Record reviewed Stock In" }));
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(localStorage.getItem("inventory-managed-items")).find((item) => item.id === "ITM-2")).toMatchObject({ stock: 14, unitBalances: { roll: 1 } });
    rerender(<MemoryRouter><InventoryProvider><InventorySubmenu section="stock-out" /></InventoryProvider></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Item", { selector: "select" }), { target: { value: "ITM-2" } });
    expect(screen.getByText(/Current balance:/)).toHaveTextContent("14 piece, 1 roll");
    fireEvent.change(screen.getByLabelText("UOM"), { target: { value: "roll" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Record stock out" }));
    expect(JSON.parse(localStorage.getItem("inventory-managed-items")).find((item) => item.id === "ITM-2")).toMatchObject({ stock: 14, unitBalances: { roll: 0 } });
    fireEvent.click(screen.getByLabelText(/Select MOV-/));
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(JSON.parse(localStorage.getItem("inventory-managed-items")).find((item) => item.id === "ITM-2").unitBalances.roll).toBe(1);
  } finally {
    confirmSpy.mockRestore();
  }
});

test.each([
  ["Inventory Stock", <InventoryStock />, "Inventory report"],
  ["Stock In", <InventorySubmenu section="stock-in" />, "Stock in records"],
])("%s Actions opens cable settings where an item can be selected and saved", (pageName, page, heading) => {
  render(<MemoryRouter><InventoryProvider>{page}</InventoryProvider></MemoryRouter>);
  const report = screen.getByRole("heading", { name: heading }).closest("section");
  expect(within(report).queryByLabelText("Cable item")).not.toBeInTheDocument();
  fireEvent.click(within(report).getByRole("button", { name: "Actions" }));
  fireEvent.click(within(report).getByRole("menuitem", { name: "Configure cable length" }));
  fireEvent.change(within(report).getByLabelText("Cable item"), { target: { value: "ITM-1" } });
  fireEvent.change(within(report).getByLabelText("Cable type"), { target: { value: "adss" } });
  fireEvent.click(within(report).getByRole("button", { name: "Save cable length" }));
  expect(within(report).getByRole("status")).toHaveTextContent("Cable length saved");
  expect(JSON.parse(localStorage.getItem("inventory-managed-items")).find((item) => item.id === "ITM-1")).toMatchObject({ cableType: "adss", cableLengthMeters: 4000 });
  fireEvent.click(within(report).getByRole("button", { name: "Close cable settings" }));
  expect(within(report).queryByLabelText("Cable item")).not.toBeInTheDocument();
});

test("configured cable rolls and reels can be issued in metres and persist the remaining length", () => {
  localStorage.setItem("inventory-managed-items", JSON.stringify([
    { id: "ADSS", sku: "ADSS", name: "ADSS cable", uom: "roll", stock: 1, unitCost: 100, reorderLevel: 0 },
    { id: "DROP", sku: "DROP", name: "Drop cable", uom: "reel", stock: 1, unitCost: 100, reorderLevel: 0 },
  ]));
  const page = <MemoryRouter><InventoryProvider><InventorySubmenu section="stock-out" /></InventoryProvider></MemoryRouter>;
  const { unmount } = render(page);
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Configure cable length" }));
  fireEvent.change(screen.getByLabelText("Cable item"), { target: { value: "ADSS" } });
  fireEvent.change(screen.getByLabelText("Cable type"), { target: { value: "adss" } });
  expect(screen.getByLabelText("Metres per roll")).toHaveValue(4000);
  fireEvent.click(screen.getByRole("button", { name: "Save cable length" }));
  fireEvent.change(screen.getByLabelText("Cable item"), { target: { value: "DROP" } });
  fireEvent.change(screen.getByLabelText("Cable type"), { target: { value: "drop" } });
  expect(screen.getByLabelText("Metres per reel")).toHaveValue(2000);
  fireEvent.click(screen.getByRole("button", { name: "Save cable length" }));
  fireEvent.click(screen.getByRole("button", { name: "Close cable settings" }));
  fireEvent.change(screen.getByLabelText("Item", { selector: "select" }), { target: { value: "ADSS" } });
  fireEvent.change(screen.getByLabelText("UOM"), { target: { value: "m" } });
  fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "800" } });
  fireEvent.click(screen.getByRole("button", { name: "Record stock out" }));
  expect(screen.getByText(/Current balance:/)).toHaveTextContent("0.8 roll (3200 m)");
  fireEvent.change(screen.getByLabelText("Item", { selector: "select" }), { target: { value: "DROP" } });
  fireEvent.change(screen.getByLabelText("UOM"), { target: { value: "m" } });
  fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "100" } });
  fireEvent.click(screen.getByRole("button", { name: "Record stock out" }));
  expect(screen.getByText(/Current balance:/)).toHaveTextContent("0.95 reel (1900 m)");
  unmount();
  render(page);
  fireEvent.change(screen.getByLabelText("Item", { selector: "select" }), { target: { value: "ADSS" } });
  expect(screen.getByText(/Current balance:/)).toHaveTextContent("0.8 roll (3200 m)");
  fireEvent.change(screen.getByLabelText("UOM"), { target: { value: "m" } });
  fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "3201" } });
  fireEvent.click(screen.getByRole("button", { name: "Record stock out" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Only 0.8 roll");
});

test("configuring a cable combines compatible unit balances without changing unrelated pieces", () => {
  localStorage.setItem("inventory-managed-items", JSON.stringify([
    { id: "ADSS", sku: "ADSS", name: "ADSS cable", uom: "piece", stock: 3, unitBalances: { roll: 1, m: 1000 }, unitCost: 100, reorderLevel: 0 },
  ]));
  localStorage.setItem("inventory-stock-movements", JSON.stringify([
    { id: "roll-in", itemId: "ADSS", movementType: "in", quantity: 1, uom: "roll", stockUom: "roll", quantityInStockUnit: 1 },
    { id: "meter-in", itemId: "ADSS", movementType: "in", quantity: 1000, uom: "m", stockUom: "m", quantityInStockUnit: 1000 },
  ]));
  const { unmount } = render(<MemoryRouter><InventoryProvider><InventorySubmenu section="stock-out" /></InventoryProvider></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Configure cable length" }));
  fireEvent.change(screen.getByLabelText("Cable item"), { target: { value: "ADSS" } });
  fireEvent.change(screen.getByLabelText("Cable type"), { target: { value: "adss" } });
  fireEvent.click(screen.getByRole("button", { name: "Save cable length" }));
  const item = JSON.parse(localStorage.getItem("inventory-managed-items"))[0];
  const movements = JSON.parse(localStorage.getItem("inventory-stock-movements"));
  expect(item).toMatchObject({ stock: 3, unitBalances: { roll: 1.25 }, cableLengthMeters: 4000 });
  expect(movements.find((movement) => movement.id === "meter-in")).toMatchObject({ stockUom: "roll", quantityInStockUnit: 0.25 });
  unmount();
  render(<MemoryRouter><InventoryProvider><InventorySubmenu section="stock-out" /></InventoryProvider></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("Item", { selector: "select" }), { target: { value: "ADSS" } });
  fireEvent.change(screen.getByLabelText("UOM"), { target: { value: "m" } });
  fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "800" } });
  fireEvent.click(screen.getByRole("button", { name: "Record stock out" }));
  expect(screen.getByText(/Current balance:/)).toHaveTextContent("3 piece, 1.05 roll (4200 m)");
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Configure cable length" }));
  fireEvent.change(screen.getByLabelText("Cable item"), { target: { value: "ADSS" } });
  fireEvent.change(screen.getByLabelText("Metres per roll"), { target: { value: "5000" } });
  fireEvent.click(screen.getByRole("button", { name: "Save cable length" }));
  expect(screen.getByRole("alert")).toHaveTextContent("already been used for converted movements");
});

test("common stock unit spellings resolve to the same unit", () => {
  expect(["Pcs", "pieces", "rolls", "reels", "pairs", "pkts", "Packet", "packets", "meters"].map(normalizeUomName))
    .toEqual(["piece", "piece", "roll", "reel", "pair", "packet", "packet", "packet", "m"]);
});

test("stock import refuses ambiguous existing items without creating records", async () => {
  localStorage.setItem("inventory-managed-items", JSON.stringify([
    { id: "A", sku: "CABLE-A", name: "Cable", uom: "km", stock: 0, unitCost: 1, reorderLevel: 0 },
    { id: "B", sku: "CABLE-B", name: "Cable", uom: "km", stock: 0, unitCost: 1, reorderLevel: 0 },
  ]));
  render(<MemoryRouter><InventoryProvider><InventoryStock /></InventoryProvider></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Upload spreadsheet" }));
  fireEvent.change(screen.getByLabelText("Choose import spreadsheet"), { target: { files: [spreadsheetFile([
    ["Receipt date", "Item", "Quantity", "UOM", "Supplier", "Unit cost"],
    ["2026-01-03", "Cable", 1, "km", "New supplier", 2],
  ])] } });
  await screen.findByText("import.xlsx");
  fireEvent.click(screen.getByRole("button", { name: "Review spreadsheet rows" }));
  fireEvent.click(screen.getByRole("button", { name: "Record reviewed Stock In" }));
  expect(screen.getByRole("alert")).toHaveTextContent('Spreadsheet row 2: More than one item has the name or SKU "Cable"');
  expect(JSON.parse(localStorage.getItem("inventory-stock-movements"))).toHaveLength(0);
  expect(JSON.parse(localStorage.getItem("inventory-managed-suppliers"))).toHaveLength(2);
});

test("removing a supplier preserves linked history even with missing receipts, and can be restored", () => {
  localStorage.setItem("inventory-managed-suppliers", JSON.stringify([
    { id: "SUP-NEW", name: "New supplier", email: "", leadTimeDays: null, paymentTerms: "" },
    { id: "SUP-OTHER", name: "Other supplier", email: "", leadTimeDays: null, paymentTerms: "" },
  ]));
  localStorage.setItem("inventory-managed-items", JSON.stringify([
    { id: "ITM-X", sku: "CABLE-X", name: "Cable", category: "Fiber", unitCost: 10, stock: 6, reorderLevel: 0, uom: "m" },
  ]));
  localStorage.setItem("inventory-managed-purchase-orders", JSON.stringify([
    { id: "order-1", orderNumber: "PO:100", supplierId: "SUP-NEW", quotationId: "quote-1", date: "2026-01-01", status: "Received", lineItems: [{ itemId: "ITM-X", quantity: 2, unitCost: 10, uom: "m" }] },
    { id: "order-2", orderNumber: "PO:101", supplierId: "SUP-OTHER", date: "2026-01-01", status: "Pending", lineItems: [{ itemId: "ITM-X", quantity: 1, unitCost: 10, uom: "m" }] },
  ]));
  localStorage.setItem("inventory-quotations", JSON.stringify([
    { id: "quote-1", supplierId: "SUP-NEW", prId: "request-1", status: "Selected", lineItems: [] },
    { id: "quote-2", supplierId: "SUP-OTHER", prId: "request-1", status: "Submitted", lineItems: [] },
  ]));
  localStorage.setItem("inventory-purchase-requests", JSON.stringify([
    { id: "request-1", status: "Quoted", lineItems: [] },
  ]));
  localStorage.setItem("inventory-supplier-invoices", JSON.stringify([
    { id: "invoice-1", supplierId: "SUP-NEW", purchaseOrderId: "order-1", payments: [{ id: "payment-1" }] },
    { id: "invoice-2", supplierId: "SUP-NEW", purchaseOrderId: "", payments: [] },
    { id: "invoice-3", supplierId: "SUP-OTHER", purchaseOrderId: "order-2", payments: [] },
  ]));
  localStorage.setItem("inventory-stock-movements", JSON.stringify([
    { id: "manual-receipt", itemId: "ITM-X", item: "Cable", movementType: "in", quantity: 1, uom: "m", supplierId: "SUP-NEW", isPurchase: true, unitCost: 10, date: "2026-01-02" },
    { id: "other-receipt", itemId: "ITM-X", item: "Cable", movementType: "in", quantity: 1, uom: "m", supplierId: "SUP-OTHER", isPurchase: true, unitCost: 10, date: "2026-01-03" },
  ]));
  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
  try {
    const { unmount } = render(<MemoryRouter><InventoryProvider><InventorySubmenu section="suppliers" /></InventoryProvider></MemoryRouter>);
    const keys = ["inventory-managed-items", "inventory-managed-purchase-orders", "inventory-stock-movements", "inventory-supplier-invoices", "inventory-quotations", "inventory-purchase-requests"];
    const original = keys.map((key) => localStorage.getItem(key));
    fireEvent.click(screen.getByLabelText("Select New supplier"));
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(confirmSpy.mock.calls[0][0]).toMatch(/history will be kept/i);
    expect(JSON.parse(localStorage.getItem("inventory-managed-suppliers"))).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(screen.getByLabelText("Lead time (days)")).toHaveValue(null);
    expect(screen.getByLabelText("Payment terms")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByRole("status")).toHaveTextContent("History has been kept");
    expect(screen.queryByRole("heading", { name: "Add supplier" })).not.toBeInTheDocument();
    expect(keys.map((key) => localStorage.getItem(key))).toEqual(original);
    expect(JSON.parse(localStorage.getItem("inventory-managed-suppliers")).find((supplier) => supplier.id === "SUP-NEW").archived).toBe(true);
    unmount();
    render(<MemoryRouter><InventoryProvider><InventorySubmenu section="suppliers" /></InventoryProvider></MemoryRouter>);
    expect(screen.queryByLabelText("Select New supplier")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Select Other supplier")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore New supplier" }));
    expect(screen.getByLabelText("Select New supplier")).toBeInTheDocument();
    expect(keys.map((key) => localStorage.getItem(key))).toEqual(original);
  } finally {
    confirmSpy.mockRestore();
  }
});

test("supplier contact details are optional, editable, and shown on a purchase order", () => {
  const { unmount } = render(<InventoryProvider><InventorySubmenu section="suppliers" /></InventoryProvider>);
  expect(screen.queryByLabelText("Supplier name")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Add supplier" }));
  fireEvent.change(screen.getByLabelText("Supplier name"), { target: { value: "Contact Supplier" } });
  fireEvent.change(screen.getByLabelText("Phone number (optional)"), { target: { value: "  012345  " } });
  fireEvent.change(screen.getByLabelText("Address (optional)"), { target: { value: "  Main Street  " } });
  fireEvent.click(screen.getByRole("button", { name: "Add supplier" }));
  const supplier = JSON.parse(localStorage.getItem("inventory-managed-suppliers")).find((entry) => entry.name === "Contact Supplier");
  expect(supplier).toMatchObject({ email: "", phone: "012345", address: "Main Street" });
  fireEvent.click(screen.getByLabelText("Select Contact Supplier"));
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Address (optional)"), { target: { value: "New Address" } });
  fireEvent.click(screen.getByRole("button", { name: "Save supplier changes" }));
  unmount();
  render(<InventoryProvider><ProcurementPurchaseOrdersProbe /></InventoryProvider>);
  fireEvent.change(screen.getByLabelText("Supplier"), { target: { value: supplier.id } });
  const details = screen.getByLabelText("Selected supplier details");
  expect(details).toHaveTextContent("012345");
  expect(details).toHaveTextContent("New Address");
  expect(details).toHaveTextContent("Net 30");
});

test("supplier list shows cumulative recorded purchase spend per supplier", () => {
  localStorage.setItem("inventory-managed-suppliers", JSON.stringify([
    { id: "SUP-1", name: "Alpha" },
    { id: "SUP-2", name: "Beta" },
  ]));
  localStorage.setItem("inventory-stock-movements", JSON.stringify([
    { id: "alpha-one", supplierId: "SUP-1", movementType: "in", isPurchase: true, quantity: 2, unitCost: 125 },
    { id: "alpha-two", supplierId: "SUP-1", movementType: "in", isPurchase: true, quantity: 3, unitCost: 100 },
    { id: "alpha-legacy", supplier: "Alpha", movementType: "in", isPurchase: true, quantity: 2, unitCost: 25 },
    { id: "alpha-issue", supplierId: "SUP-1", movementType: "out", isPurchase: true, quantity: 1, unitCost: 900 },
    { id: "alpha-restock", supplierId: "SUP-1", movementType: "in", quantity: 1, unitCost: 900 },
  ]));

  render(<InventoryProvider><InventorySubmenu section="suppliers" /></InventoryProvider>);

  expect(within(screen.getByRole("row", { name: /Alpha/ })).getByText("KSh 600.00")).toBeInTheDocument();
  expect(within(screen.getByRole("row", { name: /Beta/ })).getByText("KSh 0.00")).toBeInTheDocument();
});

test("removed suppliers are unavailable for new orders but remain available on existing orders", () => {
  localStorage.setItem("inventory-managed-suppliers", JSON.stringify([
    { id: "SUP-1", name: "Removed supplier", archived: true },
    { id: "SUP-2", name: "Active supplier" },
  ]));
  localStorage.setItem("inventory-managed-purchase-orders", JSON.stringify([{
    id: "order-1", orderNumber: "PO:001", supplierId: "SUP-1", date: "2026-01-01", status: "Pending",
    lineItems: [{ itemId: "ITM-1", quantity: 1, unitCost: 10, uom: "km" }],
  }]));
  render(<InventoryProvider><ProcurementPurchaseOrdersProbe /></InventoryProvider>);
  const select = screen.getByLabelText("Supplier");
  expect(within(select).queryByRole("option", { name: /Removed supplier/ })).not.toBeInTheDocument();
  editOrder("PO:001");
  expect(within(screen.getByLabelText("Supplier")).getByRole("option", { name: "Removed supplier (Removed)" }).selected).toBe(true);
  expect(screen.getByLabelText("Selected supplier details")).toHaveTextContent("Address");
});

test("stock import shows the source row and date error beside the record button, then saves corrected data", async () => {
  render(<MemoryRouter><InventoryProvider><InventoryStock /></InventoryProvider></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Upload spreadsheet" }));
  fireEvent.change(screen.getByLabelText("Choose import spreadsheet"), { target: { files: [spreadsheetFile([
    ["Receipt date", "SKU", "Quantity", "UOM", "Supplier", "Unit cost"],
    ["", "FOC-24C", 300, "m", "FiberLink Distributors", 2],
  ])] } });
  await screen.findByText("import.xlsx");
  fireEvent.click(screen.getByRole("button", { name: "Review spreadsheet rows" }));
  const recordButton = screen.getByRole("button", { name: "Record reviewed Stock In" });
  fireEvent.click(recordButton);
  expect(recordButton.previousElementSibling).toHaveTextContent("Spreadsheet row 2: Enter a valid receipt date in YYYY-MM-DD format.");
  expect(JSON.parse(localStorage.getItem("inventory-stock-movements"))).toHaveLength(0);
  fireEvent.change(screen.getByLabelText("Receipt date row 2"), { target: { value: `${new Date().getFullYear()}-02-30` } });
  fireEvent.click(recordButton);
  expect(screen.getByRole("alert")).toHaveTextContent("valid receipt date");
  fireEvent.change(screen.getByLabelText("Receipt date row 2"), { target: { value: `${new Date().getFullYear()}-01-03` } });
  fireEvent.click(recordButton);
  expect(screen.getByRole("status")).toHaveTextContent("1 purchased stock receipt line(s) recorded");
  expect(JSON.parse(localStorage.getItem("inventory-stock-movements"))).toHaveLength(1);
  expect(JSON.parse(localStorage.getItem("inventory-managed-items")).find((item) => item.id === "ITM-1").stock).toBeCloseTo(4.3);
});

test("request spreadsheet is mapped and converted into an editable request before submission", async () => {
  localStorage.setItem("inventory-current-role", JSON.stringify("Requester"));
  render(<MemoryRouter><InventoryProvider><PurchaseRequests /></InventoryProvider></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Upload spreadsheet" }));
  fireEvent.change(screen.getByLabelText("Choose import spreadsheet"), { target: { files: [spreadsheetFile([
    ["Material code", "Required", "Unit"],
    ["FOC-24C", 300, "metres"],
  ])] } });
  await screen.findByText("import.xlsx");
  fireEvent.change(screen.getByLabelText("Item / SKU column"), { target: { value: "0" } });
  fireEvent.change(screen.getByLabelText("Quantity column"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Review spreadsheet rows" }));
  expect(screen.getByLabelText("Match item row 2")).toHaveValue("ITM-1");
  fireEvent.click(screen.getByRole("button", { name: "Use rows in purchase request" }));
  expect(screen.getByRole("status")).toHaveTextContent("1 spreadsheet line(s) loaded");
  expect(screen.getByLabelText("Quantity (km)")).toHaveValue(0.3);
  expect(JSON.parse(localStorage.getItem("inventory-purchase-requests"))).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("Requester name"), { target: { value: "Network team" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit and notify leadership" }));
  expect(JSON.parse(localStorage.getItem("inventory-purchase-requests"))[0].lineItems[0]).toMatchObject({ itemId: "ITM-1", quantity: 0.3, uom: "km" });
});

test("supplier invoice payments persist and cannot exceed the remaining balance", () => {
  render(<InventoryProvider><SupplierInvoices /></InventoryProvider>);
  fireEvent.change(screen.getByLabelText("Supplier"), { target: { value: "SUP-1" } });
  fireEvent.change(screen.getByLabelText("Invoice number"), { target: { value: "INV-001" } });
  fireEvent.change(screen.getByLabelText("Invoice total (KSh)"), { target: { value: "100.50" } });
  fireEvent.click(screen.getByRole("button", { name: "Save invoice" }));
  fireEvent.change(screen.getByLabelText("Payment for INV-001"), { target: { value: "20.25" } });
  fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
  expect(screen.getByText("KSh 80.25")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Payment for INV-001"), { target: { value: "81" } });
  fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
  expect(screen.getByRole("alert")).toHaveTextContent("exceeds");
  expect(JSON.parse(localStorage.getItem("inventory-supplier-invoices"))[0].paidCents).toBe(2025);
});

test("annual purchase inventory includes purchases from the start and end of the selected year", async () => {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <InventoryProvider>
        <SeedAnnualPurchases />
        <InventorySubmenu section="items" />
      </InventoryProvider>
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.getByText("January")).toBeInTheDocument());
  const purchaseTable = screen.getByRole("heading", { name: "Annual purchase inventory" }).closest("section");
  expect(within(purchaseTable).getByText("January")).toBeInTheDocument();
  expect(within(purchaseTable).getByText("December")).toBeInTheDocument();
});

test("quotation selection creates a purchase order and rejects competing quotes", () => {
  render(
    <InventoryProvider>
      <QuotationFlowProbe />
    </InventoryProvider>
  );

  fireEvent.click(screen.getByRole("button", { name: "Add competing quote" }));
  fireEvent.click(screen.getByRole("button", { name: "Convert competing quote" }));

  expect(screen.getByTestId("quotation-status")).toHaveTextContent("Selected");
  expect(screen.getByTestId("original-quotation-status")).toHaveTextContent("Rejected");
  expect(screen.getByTestId("converted-order")).toHaveTextContent("400");
});

test("inventory dashboard shows annual spend and monthly procurement analysis", () => {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <InventoryProvider>
        <SeedDashboardTransactions />
        <InventoryDashboard />
      </InventoryProvider>
    </MemoryRouter>
  );

  fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2026" } });
  expect(screen.getByRole("heading", { name: "Inventory Dashboard" })).toBeInTheDocument();
  expect(screen.getAllByText("24-Core Fiber Optic Cable (1km)").length).toBeGreaterThan(0);
  expect(screen.getAllByText("48-Port Gigabit Rack Switch").length).toBeGreaterThan(0);
  expect(screen.getByText("Annual expenditure · 2026")).toBeInTheDocument();
  expect(screen.getByText("KSh 3,185,500.00")).toBeInTheDocument();
  expect(screen.getByText("Supplier expenditure")).toBeInTheDocument();
  expect(screen.getByText("Monthly expenditure by item")).toBeInTheDocument();
  expect(screen.getByText("Monthly total expenditure")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Item"), { target: { value: "ITM-1" } });
  const itemSection = screen.getByRole("heading", { name: "Monthly expenditure by item" }).closest("section");
  fireEvent.click(within(itemSection).getByText("Item monthly values"));
  expect(within(itemSection).getByText("KSh 351,000.00")).toBeInTheDocument();
});

test("dashboard compares purchased receipts by month with the previous year", () => {
  localStorage.setItem("inventory-stock-movements", JSON.stringify([
    { id: "pre-baseline", itemId: "ITM-1", item: "Cable", sku: "CABLE", movementType: "in", date: "2025-01-03", quantity: 1, uom: "km", isPurchase: true, supplier: "Fiber supplier", unitCost: 50 },
    { id: "previous", itemId: "ITM-1", item: "Cable", sku: "CABLE", movementType: "in", date: "2026-01-03", quantity: 1, uom: "km", isPurchase: true, supplier: "Fiber supplier", unitCost: 100 },
    { id: "current", itemId: "ITM-1", item: "Cable", sku: "CABLE", movementType: "in", date: "2027-01-05", quantity: 300, uom: "m", isPurchase: true, supplier: "Fiber supplier", unitCost: 2 },
    { id: "return", itemId: "ITM-1", item: "Cable", sku: "CABLE", movementType: "in", date: "2027-01-06", quantity: 1, uom: "km" },
    { id: "later", itemId: "ITM-1", item: "Cable", sku: "CABLE", movementType: "in", date: "2029-01-01", quantity: 1, uom: "km", isPurchase: true, supplier: "Fiber supplier", unitCost: 100 },
  ]));
  render(<InventoryProvider><InventoryDashboard /></InventoryProvider>);
  fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2026" } });
  const section = screen.getByRole("heading", { name: "Monthly total expenditure" }).closest("section");
  expect(section).toHaveTextContent("no prior-year comparison available");
  fireEvent.click(within(section).getByText("Monthly values"));
  expect(within(section).queryByRole("columnheader", { name: "2025" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2027" } });
  expect(screen.getByText("Annual expenditure · 2027").closest("section")).toHaveTextContent("KSh 600.00");
  expect(screen.getByText("Purchase receipt lines", { selector: "p" }).closest("section")).toHaveTextContent("1");
  expect(screen.getByText("Suppliers").closest("section")).toHaveTextContent("1");
  expect(within(section).getByRole("columnheader", { name: "2026" })).toBeInTheDocument();
  const january = within(section).getByRole("row", { name: /Jan/ });
  expect(january).toHaveTextContent("KSh 600.00");
  expect(january).toHaveTextContent("KSh 100.00");
  const february = within(section).getByRole("row", { name: /Feb/ });
  expect(within(february).getAllByText("KSh 0.00")).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2029" } });
  expect(section).toHaveTextContent("no prior-year comparison available");
  expect(within(section).queryByRole("columnheader", { name: "2028" })).not.toBeInTheDocument();
});

test("imported unlinked transactions are retained separately from dashboard expenditure", async () => {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Date", "Item", "Quantity", "UOM", "Unit Cost", "Supplier", "Category"],
    [new Date().toISOString().slice(0, 10), "Test Cable", 3, "units", 200, "Test Supplier", "Fiber Optics"],
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Purchases");
  const fileContents = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const file = new File([fileContents], "purchases.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  Object.defineProperty(file, "arrayBuffer", { value: async () => fileContents });

  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <InventoryProvider>
        <InventorySubmenu section="items" />
        <InventoryDashboard />
      </InventoryProvider>
    </MemoryRouter>
  );

  fireEvent.change(screen.getByLabelText("Choose spreadsheet"), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Import 1 transactions" })).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Import 1 transactions" }));

  expect(screen.getAllByText("Test Cable").length).toBeGreaterThan(0);
  expect(screen.getByRole("heading", { name: "Historical unlinked purchases" })).toBeInTheDocument();
  const itemChart = screen.getByRole("heading", { name: "Monthly expenditure by item" }).closest("section");
  expect(within(itemChart).queryByRole("option", { name: "Test Cable" })).not.toBeInTheDocument();
});

test("supplier and item submenu forms add records through inventory context", () => {
  localStorage.setItem("inventory-categories", JSON.stringify(["Cables"]));
  const { rerender } = render(
    <InventoryProvider>
      <InventorySubmenu section="suppliers" />
    </InventoryProvider>
  );

  expect(screen.queryByLabelText("Supplier name")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Add supplier" }));
  fireEvent.change(screen.getByLabelText("Supplier name"), { target: { value: "New Supplier" } });
  fireEvent.change(screen.getByLabelText("Email (optional)"), { target: { value: "new@example.com" } });
  fireEvent.change(screen.getByLabelText("Lead time (days)"), { target: { value: "4" } });
  fireEvent.change(screen.getByLabelText("Payment terms"), { target: { value: "Net 15" } });
  fireEvent.click(screen.getByRole("button", { name: "Add supplier" }));
  expect(screen.getByText("New Supplier")).toBeInTheDocument();

  rerender(
    <InventoryProvider>
      <InventorySubmenu section="items" />
    </InventoryProvider>
  );
  fireEvent.change(screen.getByLabelText("SKU"), { target: { value: "CAB-01" } });
  fireEvent.change(screen.getByLabelText("Item name"), { target: { value: "Fiber Cable" } });
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Cables" } });
  fireEvent.change(screen.getByLabelText("Stock unit of measure"), { target: { value: "m" } });
  fireEvent.change(screen.getAllByLabelText("Unit cost (KSh)")[0], { target: { value: "25" } });
  fireEvent.change(screen.getByLabelText("Stock quantity"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Reorder level"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Add item" }));
  expect(screen.getByText("Fiber Cable")).toBeInTheDocument();
  expect(screen.getByRole("row", { name: /Fiber Cable.*Cables/ })).toBeInTheDocument();
  expect(screen.getAllByText("Reorder").length).toBeGreaterThan(0);

  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  const activeStoreSection = screen.getByRole("heading", { name: "Active store inventory" }).closest("section");
  fireEvent.click(screen.getByLabelText("Select 24-Core Fiber Optic Cable (1km)"));
  fireEvent.click(within(activeStoreSection).getByRole("button", { name: "Actions" }));
  fireEvent.click(within(activeStoreSection).getByRole("menuitem", { name: "Delete" }));
  expect(screen.getByRole("status")).toHaveTextContent("archived");
  fireEvent.click(screen.getByRole("button", { name: "Restore 24-Core Fiber Optic Cable (1km)" }));
  expect(screen.getByRole("status")).toHaveTextContent("restored to active inventory");
  expect(screen.getByText("24-Core Fiber Optic Cable (1km)")).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("Select Fiber Cable"));
  fireEvent.click(within(activeStoreSection).getByRole("button", { name: "Actions" }));
  fireEvent.click(within(activeStoreSection).getByRole("menuitem", { name: "Edit" }));
  fireEvent.change(screen.getAllByLabelText("Unit cost (KSh)")[0], { target: { value: "45" } });
  fireEvent.click(screen.getByRole("button", { name: "Save item changes" }));
  expect(screen.getByText("KSh 45.00")).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("Select Fiber Cable"));
  fireEvent.click(within(activeStoreSection).getByRole("button", { name: "Actions" }));
  fireEvent.click(within(activeStoreSection).getByRole("menuitem", { name: "Delete" }));
  expect(screen.queryByText("Fiber Cable")).not.toBeInTheDocument();
  confirmSpy.mockRestore();
});

test("requesters can submit purchase requests", () => {
  localStorage.setItem("inventory-current-role", JSON.stringify("Requester"));
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <InventoryProvider>
        <PurchaseRequests />
      </InventoryProvider>
    </MemoryRouter>
  );

  fireEvent.change(screen.getByLabelText("Requester name"), { target: { value: "Sample Requester" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit and notify leadership" }));

  expect(screen.getByText("Sample Requester")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("submitted");
});

test("procurement can record a quotation for an approved request", () => {
  localStorage.setItem("inventory-current-role", JSON.stringify("Procurement"));
  render(
    <MemoryRouter
      initialEntries={["/inventory/quotations?prId=PR-2001"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <InventoryProvider>
        <Quotations />
      </InventoryProvider>
    </MemoryRouter>
  );

  fireEvent.change(screen.getByLabelText("Quoted unit price (KSh)"), { target: { value: "420" } });
  fireEvent.click(screen.getByRole("button", { name: "Save quotation" }));

  expect(screen.getByRole("status")).toHaveTextContent("saved");
  expect(screen.getAllByText(/QT-/).length).toBeGreaterThan(1);
});

test("purchase-order documents include VAT controls and exclude received orders", () => {
  render(
    <InventoryProvider>
      <InventorySubmenu section="purchase-orders" />
    </InventoryProvider>
  );

  fireEvent.click(screen.getByRole("checkbox", { name: "Select PO:005" }));
  fireEvent.click(screen.getByRole("button", { name: "Documents (1)" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("KSh");
  expect(screen.getByRole("dialog")).toHaveTextContent("58,500.00");
  expect(screen.getByRole("dialog")).toHaveTextContent("VAT (16%)");
  expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Export Excel" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
  expect(document.body).toHaveClass("voucher-open");

  fireEvent.click(screen.getByRole("checkbox", { name: "Include VAT (16%)" }));
  expect(screen.getByRole("dialog")).not.toHaveTextContent("KSh 56,160.00");

  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(document.body).not.toHaveClass("voucher-open");
});

test("received purchase orders remain excluded from document printing", () => {
  render(
    <InventoryProvider>
      <ReceivedOrderProbe />
    </InventoryProvider>
  );

  fireEvent.click(screen.getByRole("button", { name: "Receive order before printing" }));

  expect(screen.getByRole("checkbox", { name: "Select all printable purchase orders" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "Select PO:005" }));
  expect(screen.getByRole("button", { name: "Documents (0)" })).toBeDisabled();
});

test("quotation voucher displays quoted line prices", () => {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <InventoryProvider>
        <Quotations />
      </InventoryProvider>
    </MemoryRouter>
  );

  fireEvent.click(screen.getByRole("button", { name: "Voucher" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Supplier Quotation");
  expect(screen.getByRole("dialog")).toHaveTextContent("58,500.00");
});

test("reporting reads live inventory and procurement submenu data", () => {
  render(
    <InventoryProvider>
      <Reporting />
    </InventoryProvider>
  );

  expect(screen.getByText("KSh 902,600")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Purchase Requests" }));
  expect(screen.getByText("PR-2001")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Purchase Quotations" }));
  expect(screen.getByText("QT-3001")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Purchase Orders" }));
  expect(screen.getByText("PO:001")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Inventory" }));
  expect(screen.getAllByText("Fiber Optics").length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole("button", { name: "Suppliers" }));
  expect(screen.getByText("FiberLink Distributors")).toBeInTheDocument();
});
