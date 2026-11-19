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
import { InventoryProvider, useInventory } from "./InventoryContext";

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

  fireEvent.change(screen.getByLabelText("Supplier"), { target: { value: "SUP-1" } });
  fireEvent.change(screen.getByLabelText("Item 1"), { target: { value: "ITM-1" } });
  fireEvent.change(screen.getByLabelText("Quantity 1"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Add another item" }));
  fireEvent.change(screen.getByLabelText("Item 2"), { target: { value: "ITM-3" } });
  fireEvent.change(screen.getByLabelText("Quantity 2"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Create purchase order" }));

  expect(screen.getByTestId("created-po-line-count")).toHaveTextContent("2");
  expect(screen.getByText("PO:006")).toBeInTheDocument();
  expect(screen.getByText("2 km × 24-Core Fiber Optic Cable (1km)")).toBeInTheDocument();
  expect(screen.getByText("3 piece × 48-Port Gigabit Rack Switch")).toBeInTheDocument();
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
  fireEvent.change(screen.getByLabelText("Purchase unit cost (KSh per selected UOM)"), { target: { value: "250" } });
  fireEvent.change(screen.getByLabelText("Reference"), { target: { value: "BUY-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Record stock in" }));
  fireEvent.click(screen.getByLabelText("Purchased stock"));
  fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Reference"), { target: { value: "RETURN-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Record stock in" }));

  rerender(<MemoryRouter><InventoryProvider><InventoryStock /><InventoryDashboard /></InventoryProvider></MemoryRouter>);
  const register = screen.getByRole("heading", { name: "Inventory report" }).closest("section");
  expect(screen.queryByRole("heading", { name: "Current stock" })).not.toBeInTheDocument();
  expect(within(register).getByText("BUY-1")).toBeInTheDocument();
  expect(within(register).getByText("RETURN-1")).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText("Purchase unit cost (KSh per selected UOM)"), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText("Reference"), { target: { value: "EDIT-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Record stock in" }));

    rerender(<MemoryRouter><InventoryProvider><InventoryStock /><InventoryDashboard /></InventoryProvider></MemoryRouter>);
    fireEvent.click(screen.getByLabelText("Select stock in EDIT-1"));
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    const editor = screen.getByRole("heading", { name: "Edit Stock In record" }).closest("section");
    fireEvent.change(within(editor).getByLabelText("Quantity"), { target: { value: "500" } });
    fireEvent.change(within(editor).getByLabelText("UOM"), { target: { value: "m" } });
    fireEvent.change(within(editor).getByLabelText("Purchase unit cost (KSh per selected UOM)"), { target: { value: "0.5" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Save changes" }));
    expect(JSON.parse(localStorage.getItem("inventory-managed-items")).find((item) => item.id === "ITM-1").stock).toBeCloseTo(4.5);
    expect(screen.getByText(/Annual expenditure/).closest("section")).toHaveTextContent("KSh 250.00");
    expect(screen.getByRole("row", { name: /500 m.*EDIT-1/ })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Select stock in EDIT-1"));
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

    const orderCheckbox = screen.getAllByLabelText("Select stock in PO:005")[0];
    fireEvent.click(orderCheckbox);
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
    expect(screen.getByText(/Purchase-order receipts cannot be edited/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(orderCheckbox);
    fireEvent.click(screen.getByLabelText("Select stock in MANUAL"));
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
    expect(screen.getByLabelText("Select stock in MANUAL")).toBeInTheDocument();
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
  fireEvent.click(screen.getByLabelText("Select stock in PRIVATE"));
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  expect(screen.getByRole("menuitem", { name: "Edit" })).toBeDisabled();
  expect(screen.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
  expect(screen.queryByRole("menuitem", { name: "Upload spreadsheet" })).not.toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: "Manage categories" })).not.toBeInTheDocument();
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
  fireEvent.click(screen.getByLabelText("Select stock in MANUAL"));
  fireEvent.change(screen.getByLabelText("Category for selected receipt"), { target: { value: "Network Tools" } });
  fireEvent.click(screen.getByRole("button", { name: "Update selected receipt category" }));
  expect(screen.getByRole("row", { name: /Network Tools.*MANUAL/ })).toBeInTheDocument();
  expect(screen.getByRole("row", { name: /Fiber Optics.*PO-RECEIPT/ })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Category to rename"), { target: { value: "Fiber Optics" } });
  fireEvent.change(screen.getByLabelText("Rename category to"), { target: { value: "Fibre Network" } });
  fireEvent.click(screen.getByRole("button", { name: "Rename category" }));
  expect(JSON.parse(localStorage.getItem("inventory-managed-items")).find((item) => item.id === "ITM-1").category).toBe("Fibre Network");
  expect(JSON.parse(localStorage.getItem("inventory-transactions"))[0].category).toBe("Fibre Network");
  expect(screen.getByRole("row", { name: /Fibre Network.*PO-RECEIPT/ })).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Select stock in PO-RECEIPT"));
  fireEvent.change(screen.getByLabelText("Category for selected receipt"), { target: { value: "Network Tools" } });
  fireEvent.click(screen.getByRole("button", { name: "Update selected receipt category" }));
  const order = JSON.parse(localStorage.getItem("inventory-stock-movements")).find((movement) => movement.id === "order");
  expect(order).toMatchObject({ category: "Network Tools", quantity: 2, unitCost: 10, notes: "Purchase order receipt", supplierId: "SUP-1" });
  expect(screen.getByText(/Purchased value/)).toHaveTextContent("KSh 20.00");
  unmount();
  render(page);
  expect(screen.getAllByRole("row", { name: /Network Tools/ })).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Manage categories" }));
  expect(within(screen.getByLabelText("Category to rename")).getByRole("option", { name: "Fibre Network" })).toBeInTheDocument();
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
  expect(within(report).getByText("PO-01")).toBeInTheDocument();
  expect(within(report).getByText("PO-02")).toBeInTheDocument();
  expect(within(report).getByText("RETURN")).toBeInTheDocument();
  expect(within(report).queryByText("ISSUE-1")).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("inventory-stock-movements"))).toHaveLength(4);
  expect(report).toHaveTextContent("Purchased value KSh 700.00");
  fireEvent.change(within(report).getByLabelText("Month"), { target: { value: "01" } });
  fireEvent.change(within(report).getByLabelText("Receipt type"), { target: { value: "purchase" } });
  expect(within(report).getByText("300 m")).toBeInTheDocument();
  expect(within(report).queryByText("RETURN")).not.toBeInTheDocument();
  expect(within(report).queryByText("PO-02")).not.toBeInTheDocument();
  expect(report).toHaveTextContent("Purchased value KSh 600.00");
  fireEvent.change(within(report).getByLabelText("Search receipts"), { target: { value: "fiber supplier" } });
  expect(within(report).getByText("PO-01")).toBeInTheDocument();
  fireEvent.change(within(report).getByLabelText("Category"), { target: { value: "Power" } });
  expect(within(report).getByText("No stock received matches these filters.")).toBeInTheDocument();
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
    expect(text).toContain('"2026-01-03","CABLE","Cable","Fiber","Purchase","300","m","Fiber supplier","2","600","PO-01"');
    expect(text).not.toContain("Battery");
    fireEvent.click(screen.getByLabelText("Select stock in PO-01"));
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
      "Unit cost (KSh)": 2, "Total (KSh)": 600, Reference: "PO-01", Notes: "",
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
    ["2026-01-05", "unmatched cable", 500, "reel", "unknown supplier", 1, "INV-3"],
  ])] } });
  await screen.findByText("import.xlsx");
  fireEvent.click(screen.getByRole("button", { name: "Review spreadsheet rows" }));
  expect(screen.queryByLabelText(/Match item row/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Match supplier row/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Record reviewed Stock In" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Spreadsheet row 4: Cannot convert reel to km");
  expect(JSON.parse(localStorage.getItem("inventory-stock-movements"))).toHaveLength(0);
  expect(JSON.parse(localStorage.getItem("inventory-managed-items"))).toHaveLength(5);
  expect(JSON.parse(localStorage.getItem("inventory-managed-suppliers"))).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("UOM row 4"), { target: { value: "m" } });
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
  expect(within(register).getByText("INV-1")).toBeInTheDocument();
  const dashboardPage = screen.getByRole("heading", { name: "Inventory Dashboard" }).closest(".procurement-dashboard");
  fireEvent.change(within(dashboardPage).getByLabelText("Year"), { target: { value: "2026" } });
  const dashboard = screen.getByText("Annual expenditure · 2026").closest("section");
  expect(dashboard).toHaveTextContent("KSh 1,200.00");
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

test("suppliers referenced by stock receipts cannot be deleted", () => {
  localStorage.setItem("inventory-managed-suppliers", JSON.stringify([
    { id: "SUP-NEW", name: "New supplier", email: "", leadTimeDays: null, paymentTerms: "" },
  ]));
  localStorage.setItem("inventory-stock-movements", JSON.stringify([
    { id: "receipt", itemId: "ITM-1", movementType: "in", quantity: 1, uom: "km", supplierId: "SUP-NEW", isPurchase: true },
  ]));
  const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  try {
    render(<MemoryRouter><InventoryProvider><InventorySubmenu section="suppliers" /></InventoryProvider></MemoryRouter>);
    fireEvent.click(screen.getByLabelText("Select New supplier"));
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByRole("alert")).toHaveTextContent("used by procurement history and cannot be deleted");
    expect(JSON.parse(localStorage.getItem("inventory-managed-suppliers"))).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(screen.getByLabelText("Lead time (days)")).toHaveValue(null);
    expect(screen.getByLabelText("Payment terms")).toHaveValue("");
  } finally {
    confirmSpy.mockRestore();
  }
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
  expect(screen.getByText("Highest material consumption")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Item"), { target: { value: "ITM-1" } });
  const itemSection = screen.getByRole("heading", { name: "Monthly expenditure by item" }).closest("section");
  fireEvent.click(within(itemSection).getByText("Item monthly values"));
  expect(within(itemSection).getByText("KSh 351,000.00")).toBeInTheDocument();
});

test("dashboard compares purchased receipts by month with the previous year", () => {
  localStorage.setItem("inventory-stock-movements", JSON.stringify([
    { id: "previous", itemId: "ITM-1", item: "Cable", sku: "CABLE", movementType: "in", date: "2025-01-03", quantity: 1, uom: "km", isPurchase: true, supplier: "Fiber supplier", unitCost: 100 },
    { id: "current", itemId: "ITM-1", item: "Cable", sku: "CABLE", movementType: "in", date: "2026-01-05", quantity: 300, uom: "m", isPurchase: true, supplier: "Fiber supplier", unitCost: 2 },
    { id: "return", itemId: "ITM-1", item: "Cable", sku: "CABLE", movementType: "in", date: "2026-01-06", quantity: 1, uom: "km" },
  ]));
  render(<InventoryProvider><InventoryDashboard /></InventoryProvider>);
  fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2026" } });
  expect(screen.getByText("Annual expenditure · 2026").closest("section")).toHaveTextContent("KSh 600.00");
  expect(screen.getByText("Purchase receipt lines").closest("section")).toHaveTextContent("1");
  expect(screen.getByText("Suppliers").closest("section")).toHaveTextContent("1");
  const section = screen.getByRole("heading", { name: "Monthly total expenditure" }).closest("section");
  fireEvent.click(within(section).getByText("Monthly values"));
  const january = within(section).getByRole("row", { name: /Jan/ });
  expect(january).toHaveTextContent("KSh 600.00");
  expect(january).toHaveTextContent("KSh 100.00");
  const february = within(section).getByRole("row", { name: /Feb/ });
  expect(within(february).getAllByText("KSh 0.00")).toHaveLength(2);
});

test("consumption compares stock-out quantities only within compatible units", () => {
  localStorage.setItem("inventory-stock-movements", JSON.stringify([
    { id: "out-1", itemId: "ITM-1", item: "Cable", movementType: "out", date: "2026-01-01", quantity: 1, uom: "km" },
    { id: "out-2", itemId: "ITM-1", item: "Cable", movementType: "out", date: "2026-02-01", quantity: 300, uom: "m" },
    { id: "out-3", itemId: "ITM-2", item: "Battery", movementType: "out", date: "2026-02-01", quantity: 2, uom: "piece" },
    { id: "in-1", itemId: "ITM-1", item: "Cable", movementType: "in", date: "2026-02-01", quantity: 3, uom: "km" },
  ]));
  render(<InventoryProvider><InventoryDashboard /></InventoryProvider>);
  fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2026" } });
  fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "m" } });
  const section = screen.getByRole("heading", { name: "Highest material consumption" }).closest("section");
  fireEvent.click(within(section).getByText("Consumption values"));
  expect(within(section).getByText("1300")).toBeInTheDocument();
  expect(within(section).queryByText("Battery")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "piece" } });
  expect(within(section).getByText("Battery")).toBeInTheDocument();
  expect(within(section).getByText("2")).toBeInTheDocument();
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
  const { rerender } = render(
    <InventoryProvider>
      <InventorySubmenu section="suppliers" />
    </InventoryProvider>
  );

  fireEvent.change(screen.getByLabelText("Supplier name"), { target: { value: "New Supplier" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
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
  expect(screen.getByText("Cables")).toBeInTheDocument();
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

test("received purchase orders cannot be selected for document printing", () => {
  render(
    <InventoryProvider>
      <ReceivedOrderProbe />
    </InventoryProvider>
  );

  fireEvent.click(screen.getByRole("button", { name: "Receive order before printing" }));

  expect(screen.getByRole("checkbox", { name: "Select all printable purchase orders" })).toBeDisabled();
  expect(screen.queryByRole("checkbox", { name: "Select PO:005" })).not.toBeInTheDocument();
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
