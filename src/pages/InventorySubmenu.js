import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import PrintHeader from "../components/PrintHeader";
import PurchaseOrderBatchModal from "../components/PurchaseOrderBatchModal";
import RecordActions from "../components/RecordActions";
import { useInventory } from "../contexts/InventoryContext";
import { formatKsh } from "../utils/currency";
import {
  normalizeInventoryTransaction,
  parseInventoryTransactionRows,
} from "../utils/inventoryTransactions";
import { deleteReceiptFile, getReceiptFile, saveReceiptFile } from "../utils/receiptStorage";
import "../styles/Pages.css";

const sectionDetails = {
  suppliers: {
    title: "Suppliers",
    subtitle: "Manage supplier contacts, lead times, and payment terms.",
  },
  items: {
    title: "Inventory Stock & Items",
    subtitle: "Review annual purchase records and manage item details and on-hand stock.",
  },
  "purchase-orders": {
    title: "Purchase Orders",
    subtitle: "Create purchase orders and receive stock into inventory.",
  },
  "stock-in": {
    title: "Stock In",
    subtitle: "Record incoming stock and review purchase-order receipts.",
  },
  "stock-out": {
    title: "Stock Out",
    subtitle: "Record issued stock and review outgoing movements.",
  },
};

function Feedback({ error, message }) {
  if (!error && !message) return null;
  return <p role={error ? "alert" : "status"} style={{ color: error ? "#b91c1c" : "#15803d" }}>{error || message}</p>;
}

function SuppliersView() {
  const { suppliers, addSupplier, updateSupplier, deleteSuppliers } = useInventory();
  const emptyForm = { name: "", email: "", leadTimeDays: "5", paymentTerms: "Net 30" };
  const [form, setForm] = useState(emptyForm);
  const [selectedIds, setSelectedIds] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selectedSuppliers = suppliers.filter((supplier) => selectedIds.includes(supplier.id));

  const submit = (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      if (form.id) {
        updateSupplier(form.id, form);
        setMessage("Supplier updated.");
      } else {
        addSupplier(form);
        setMessage("Supplier added.");
      }
      setForm(emptyForm);
      setSelectedIds([]);
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  const startEdit = (supplier) => {
    setForm({ ...supplier, leadTimeDays: supplier.leadTimeDays == null ? "" : String(supplier.leadTimeDays) });
    setError("");
    setMessage("");
  };

  const removeSelected = (records) => {
    if (!window.confirm(`Delete ${records.length} selected supplier(s)? Suppliers used in procurement or stock history cannot be deleted.`)) return;
    setError("");
    setMessage("");
    try {
      deleteSuppliers(records.map((supplier) => supplier.id));
      setSelectedIds([]);
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  return (
    <>
      <section className="page-card no-print">
        <h2 className="panel-title">{form.id ? "Edit supplier" : "Add supplier"}</h2>
        <form onSubmit={submit} className="form-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label>Supplier name<input className="input-field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label>Email<input className="input-field" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
          <label>Lead time (days)<input className="input-field" type="number" min="0" step="1" value={form.leadTimeDays} onChange={(event) => setForm({ ...form, leadTimeDays: event.target.value })} /></label>
          <label>Payment terms
            <select className="input-field" value={form.paymentTerms} onChange={(event) => setForm({ ...form, paymentTerms: event.target.value })}>
              <option value="">Select payment terms</option>
              <option value="Net 30">Net 30</option>
              <option value="Net 15">Net 15</option>
              <option value="50% Upfront">50% Upfront</option>
              <option value="Cash on Delivery">Cash on Delivery</option>
            </select>
          </label>
          <button className="primary-btn" type="submit">{form.id ? "Save supplier changes" : "Add supplier"}</button>
          {form.id ? <button className="secondary-btn" type="button" onClick={() => setForm(emptyForm)}>Cancel edit</button> : null}
        </form>
        <Feedback error={error} message={message} />
      </section>

      <section className="page-card" style={{ overflowX: "auto" }}>
        <div className="panel-heading">
          <div>
            <h2 className="panel-title">Supplier list</h2>
            <p className="panel-copy">Select suppliers to edit, delete, print, export, or download.</p>
          </div>
        </div>
        <RecordActions
          records={suppliers}
          selectedRecords={selectedSuppliers}
          recordName="suppliers"
          onEdit={startEdit}
          onDelete={removeSelected}
        />
        <table className="data-table">
          <thead>
            <tr>
              <th className="no-print">
                <input
                  type="checkbox"
                  aria-label="Select all suppliers"
                  checked={suppliers.length > 0 && suppliers.every((supplier) => selectedIds.includes(supplier.id))}
                  onChange={() => setSelectedIds(
                    suppliers.length > 0 && suppliers.every((supplier) => selectedIds.includes(supplier.id))
                      ? []
                      : suppliers.map((supplier) => supplier.id)
                  )}
                  disabled={!suppliers.length}
                />
              </th>
              <th>Supplier</th><th>Email</th><th>Lead time</th><th>Payment terms</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((supplier) => (
              <tr key={supplier.id}>
                <td className="no-print">
                  <input
                    type="checkbox"
                    aria-label={`Select ${supplier.name}`}
                    checked={selectedIds.includes(supplier.id)}
                    onChange={() => setSelectedIds((current) => current.includes(supplier.id)
                      ? current.filter((id) => id !== supplier.id)
                      : [...current, supplier.id])}
                  />
                </td>
                <td>{supplier.name}</td><td>{supplier.email || "—"}</td>
                <td>{supplier.leadTimeDays == null ? "—" : `${Number(supplier.leadTimeDays)} days`}</td><td>{supplier.paymentTerms || "—"}</td>
              </tr>
            ))}
            {!suppliers.length ? <tr><td colSpan="5">No suppliers found.</td></tr> : null}
          </tbody>
        </table>
      </section>
    </>
  );
}

function ItemsView() {
  const {
    items,
    addItem,
    updateItem,
    deleteItem,
    restoreItem,
    inventoryTransactions,
    purchaseTransactions,
    addInventoryTransaction,
    importInventoryTransactions,
  } = useInventory();
  const activeItems = items.filter((item) => !item.archived);
  const archivedItems = items.filter((item) => item.archived);
  const emptyForm = { sku: "", name: "", category: "", unitCost: "", stock: "", reorderLevel: "", uom: "" };
  const [form, setForm] = useState(emptyForm);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [editingItemId, setEditingItemId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [transactionForm, setTransactionForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    item: "",
    description: "",
    quantity: "",
    uom: "",
    amount: "",
    supplier: "",
    category: "",
  });
  const [receiptFile, setReceiptFile] = useState(null);
  const [transactionError, setTransactionError] = useState("");
  const [transactionMessage, setTransactionMessage] = useState("");
  const [selectedTransactionIds, setSelectedTransactionIds] = useState([]);
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const purchaseYears = Array.from(new Set(purchaseTransactions
    .map((transaction) => String(transaction.date || "").slice(0, 4))
    .filter((year) => /^\d{4}$/.test(year))));
  const currentYear = String(new Date().getFullYear());
  const availablePurchaseYears = Array.from(new Set([currentYear, ...purchaseYears])).sort((left, right) => right.localeCompare(left));
  const [purchaseYear, setPurchaseYear] = useState(() => (
    purchaseYears.includes(currentYear) || !purchaseYears.length ? currentYear : purchaseYears.sort((left, right) => right.localeCompare(left))[0]
  ));
  const receiptInputRef = useRef(null);
  const selectedItems = activeItems.filter((item) => selectedItemIds.includes(item.id));

  const submit = (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      if (editingItemId) {
        updateItem(editingItemId, form);
        setMessage("Item updated.");
      } else {
        addItem(form);
        setMessage("Item added.");
      }
      setForm(emptyForm);
      setEditingItemId(null);
      setSelectedItemIds([]);
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  const startEdit = (item) => {
    setError("");
    setMessage("");
    setEditingItemId(item.id);
    setForm({
      sku: item.sku,
      name: item.name,
      category: item.category || "",
      unitCost: String(item.unitCost),
      stock: String(item.stock),
      reorderLevel: String(item.reorderLevel),
      uom: item.uom || "piece",
    });
  };

  const removeItems = (selectedRecords) => {
    if (!window.confirm(`Remove ${selectedRecords.length} selected item(s) from active inventory? Referenced items will be archived to preserve procurement history.`)) return;
    setError("");
    setMessage("");
    try {
      const removedItems = selectedRecords.map((item) => deleteItem(item.id));
      setMessage(removedItems.some((item) => item.archived)
        ? "Referenced items archived. Historical procurement records are preserved."
        : "Selected items deleted.");
      setSelectedItemIds([]);
      setEditingItemId(null);
      setForm(emptyForm);
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  const unarchiveItem = (item) => {
    setError("");
    setMessage("");
    try {
      restoreItem(item.id);
      setMessage(`${item.name} restored to active inventory.`);
    } catch (restoreError) {
      setError(restoreError.message);
    }
  };

  const cancelEdit = () => {
    setEditingItemId(null);
    setForm(emptyForm);
    setError("");
    setMessage("");
  };

  const submitTransaction = async (event) => {
    event.preventDefault();
    setTransactionError("");
    setTransactionMessage("");
    let receiptId;
    try {
      const transaction = normalizeInventoryTransaction(transactionForm);
      if (receiptFile) {
        const validExtension = /\.(pdf|png|jpe?g)$/i.test(receiptFile.name);
        const validType = !receiptFile.type
          || ["application/pdf", "image/png", "image/jpeg"].includes(receiptFile.type);
        if (!validExtension || !validType) {
          throw new Error("Attach a PDF, PNG, or JPEG receipt.");
        }
        if (receiptFile.size > 10 * 1024 * 1024) {
          throw new Error("Receipt files must be 10 MB or smaller.");
        }
        receiptId = await saveReceiptFile(receiptFile);
      }

      addInventoryTransaction({
        ...transaction,
        ...(receiptId ? { receiptId, receiptName: receiptFile.name } : {}),
      });
      setTransactionForm({
        date: new Date().toISOString().slice(0, 10),
        item: "",
        description: "",
        quantity: "",
        uom: "",
        amount: "",
        supplier: "",
        category: "",
      });
      setReceiptFile(null);
      if (receiptInputRef.current) receiptInputRef.current.value = "";
      setTransactionMessage("Purchase transaction recorded.");
    } catch (submitError) {
      if (receiptId) {
        try {
          await deleteReceiptFile(receiptId);
        } catch (cleanupError) {
          setTransactionError(`${submitError.message} Receipt cleanup failed: ${cleanupError.message}`);
          return;
        }
      }
      setTransactionError(submitError.message);
    }
  };

  const parseSpreadsheet = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setImportError("");
    setImportMessage("");
    setImportPreview(null);
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setImportError("Spreadsheet files must be 10 MB or smaller.");
      return;
    }
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setImportError("Choose an Excel (.xlsx, .xls) or CSV file.");
      return;
    }

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error("The spreadsheet does not contain a worksheet.");
      const rows = XLSX.utils.sheet_to_json(firstSheet, {
        header: 1,
        raw: false,
        defval: "",
        dateNF: "yyyy-mm-dd",
      });
      const transactions = parseInventoryTransactionRows(rows);
      setImportPreview({ fileName: file.name, transactions });
    } catch (parseError) {
      setImportError(parseError.message);
    }
  };

  const importSpreadsheet = () => {
    if (!importPreview) return;
    setImportError("");
    setImportMessage("");
    try {
      const count = importInventoryTransactions(importPreview.transactions);
      setImportPreview(null);
      setImportMessage(`${count} purchase transaction(s) imported. Review the transaction register below.`);
    } catch (submitError) {
      setImportError(submitError.message);
    }
  };

  const downloadImportTemplate = () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["Date", "Item", "Description", "Quantity", "UOM", "Unit Cost", "Supplier", "Category"],
      ["2026-07-12", "24-Core Fiber Optic Cable (1km)", "Example purchase", 8, "km", 59000, "FiberLink Distributors", "Fiber Optics"],
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Purchase Transactions");
    XLSX.writeFile(workbook, "inventory-transactions-template.xlsx");
  };

  const downloadReceipt = async (transaction) => {
    setTransactionError("");
    try {
      const receipt = await getReceiptFile(transaction.receiptId);
      if (!receipt) throw new Error("The receipt file could not be found in browser storage.");
      const url = URL.createObjectURL(receipt.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = receipt.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (receiptError) {
      setTransactionError(receiptError.message);
    }
  };

  const annualPurchases = purchaseTransactions
    .filter((transaction) => String(transaction.date || "").startsWith(`${purchaseYear}-`))
    .sort((left, right) => right.date.localeCompare(left.date));
  const selectedTransactions = annualPurchases.filter((transaction) => selectedTransactionIds.includes(transaction.id));
  const annualPurchaseTotal = annualPurchases.reduce(
    (total, transaction) => total + Number(transaction.total || Number(transaction.quantity) * Number(transaction.amount)),
    0
  );
  return (
    <>
      <section className="page-card no-print">
        <h2 className="panel-title">{editingItemId ? "Edit inventory item" : "Add inventory item"}</h2>
        <form onSubmit={submit} className="form-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label>SKU<input className="input-field" value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} required /></label>
          <label>Item name<input className="input-field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label>Category<input className="input-field" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="General Materials" /></label>
          <label>Stock unit of measure<input className="input-field" value={form.uom} onChange={(event) => setForm({ ...form, uom: event.target.value })} placeholder="piece, km, m, reel, roll" list="inventory-uom-options" required /></label>
          <label>Unit cost (KSh)<input className="input-field" type="number" min="0" step="0.01" value={form.unitCost} onChange={(event) => setForm({ ...form, unitCost: event.target.value })} required /></label>
          <label>Stock quantity<input className="input-field" type="number" min="0" step="0.001" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} required /></label>
          <label>Reorder level<input className="input-field" type="number" min="0" step="0.001" value={form.reorderLevel} onChange={(event) => setForm({ ...form, reorderLevel: event.target.value })} required /></label>
          <button className="primary-btn" type="submit">{editingItemId ? "Save item changes" : "Add item"}</button>
          {editingItemId ? <button className="secondary-btn" type="button" onClick={cancelEdit}>Cancel edit</button> : null}
        </form>
        <datalist id="inventory-uom-options">
          {["km", "m", "reel", "roll", "piece"].map((unit) => <option key={unit} value={unit} />)}
        </datalist>
        <p className="panel-copy">Stock quantity, reorder level, and unit cost use the selected stock unit. Metres and kilometres convert when recording stock movements.</p>
        <Feedback error={error} message={message} />
      </section>

      <section className="page-card no-print">
        <div className="panel-heading">
          <div>
            <h2 className="panel-title">Record a historical purchase</h2>
            <p className="panel-copy">Historical entries are stored separately and do not update stock or appear in purchase inventory and dashboard analysis. Record purchased stock through Stock In instead.</p>
          </div>
        </div>
        <form onSubmit={submitTransaction} className="form-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label>Date<input className="input-field" type="date" value={transactionForm.date} onChange={(event) => setTransactionForm({ ...transactionForm, date: event.target.value })} required /></label>
          <label>Item<input className="input-field" value={transactionForm.item} onChange={(event) => setTransactionForm({ ...transactionForm, item: event.target.value })} list="transaction-item-options" required /></label>
          <label>Description<input className="input-field" value={transactionForm.description} onChange={(event) => setTransactionForm({ ...transactionForm, description: event.target.value })} /></label>
          <label>Quantity<input className="input-field" type="number" min="0.001" step="any" value={transactionForm.quantity} onChange={(event) => setTransactionForm({ ...transactionForm, quantity: event.target.value })} required /></label>
          <label>Unit of measure<input className="input-field" value={transactionForm.uom} onChange={(event) => setTransactionForm({ ...transactionForm, uom: event.target.value })} required /></label>
          <label>Unit cost (KSh)<input className="input-field" type="number" min="0" step="0.01" value={transactionForm.amount} onChange={(event) => setTransactionForm({ ...transactionForm, amount: event.target.value })} required /></label>
          <label>Supplier<input className="input-field" value={transactionForm.supplier} onChange={(event) => setTransactionForm({ ...transactionForm, supplier: event.target.value })} required /></label>
          <label>Material category<input className="input-field" value={transactionForm.category} onChange={(event) => setTransactionForm({ ...transactionForm, category: event.target.value })} /></label>
          <label>Receipt (PDF, PNG, JPEG; max 10 MB)
            <input
              ref={receiptInputRef}
              className="input-field"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              onChange={(event) => setReceiptFile(event.target.files?.[0] || null)}
            />
          </label>
          <button className="primary-btn" type="submit">Record purchase</button>
        </form>
        <datalist id="transaction-item-options">{activeItems.map((item) => <option key={item.id} value={item.name} />)}</datalist>
        <p className="panel-copy">Receipt files are stored in this browser and attached to the transaction; values are entered and verified manually.</p>
        <Feedback error={transactionError} message={transactionMessage} />
      </section>

      <section className="page-card no-print">
        <div className="panel-heading">
          <div>
            <h2 className="panel-title">Import purchase transactions</h2>
            <p className="panel-copy">Import historical purchases from Excel or CSV. Imported rows remain separate from Stock In and purchase analysis. Each row needs Date, Item, Quantity, UOM, Unit Cost, and Supplier.</p>
          </div>
          <button className="secondary-btn" type="button" onClick={downloadImportTemplate}>Download template</button>
        </div>
        <label>Choose spreadsheet
          <input className="input-field" type="file" accept=".xlsx,.xls,.csv" onChange={parseSpreadsheet} />
        </label>
        <p className="panel-copy">Imports add recorded transactions only. They do not create purchase orders or adjust store stock. Re-importing the same file will create duplicate transaction records.</p>
        {importPreview ? (
          <div>
            <p role="status">{importPreview.fileName}: {importPreview.transactions.length} valid transaction(s), total {formatKsh(importPreview.transactions.reduce((sum, transaction) => sum + transaction.total, 0))}.</p>
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Date</th><th>Item</th><th>Supplier</th><th>Category</th><th>Quantity</th><th>Total</th></tr></thead>
                <tbody>{importPreview.transactions.slice(0, 5).map((transaction, index) => (
                  <tr key={`${transaction.date}-${transaction.item}-${index}`}>
                    <td>{transaction.date}</td><td>{transaction.item}</td><td>{transaction.supplier}</td>
                    <td>{transaction.category}</td><td>{transaction.quantity} {transaction.uom}</td><td>{formatKsh(transaction.total)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <button className="primary-btn" type="button" onClick={importSpreadsheet}>Import {importPreview.transactions.length} transactions</button>
          </div>
        ) : null}
        <Feedback error={importError} message={importMessage} />
      </section>

      <section className="page-card" style={{ overflowX: "auto" }}>
        <div className="panel-heading">
          <div>
            <h2 className="panel-title">Active store inventory</h2>
            <p className="panel-copy">Select items to edit, remove, print, export, or download.</p>
          </div>
        </div>
        <p className="panel-copy">Referenced items are archived when removed so purchase history and goods receipt remain available.</p>
        <RecordActions
          records={activeItems}
          selectedRecords={selectedItems}
          recordName="inventory-items"
          onEdit={startEdit}
          onDelete={removeItems}
        />
        <table className="data-table">
          <thead>
            <tr>
              <th className="no-print">
                <input
                  type="checkbox"
                  aria-label="Select all inventory items"
                  checked={activeItems.length > 0 && activeItems.every((item) => selectedItemIds.includes(item.id))}
                  onChange={() => setSelectedItemIds(
                    activeItems.length > 0 && activeItems.every((item) => selectedItemIds.includes(item.id))
                      ? []
                      : activeItems.map((item) => item.id)
                  )}
                  disabled={!activeItems.length}
                />
              </th>
              <th>SKU</th><th>Item</th><th>Category</th><th>Unit cost</th><th>Stock (UOM)</th><th>Reorder level (UOM)</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {activeItems.map((item) => {
              const isLow = Number(item.stock) <= Number(item.reorderLevel);
              return (
                <tr key={item.id}>
                  <td className="no-print">
                    <input
                      type="checkbox"
                      aria-label={`Select ${item.name}`}
                      checked={selectedItemIds.includes(item.id)}
                      onChange={() => setSelectedItemIds((current) => current.includes(item.id)
                        ? current.filter((id) => id !== item.id)
                        : [...current, item.id])}
                    />
                  </td>
                  <td>{item.sku}</td><td>{item.name}</td><td>{item.category || "General Materials"}</td><td>{formatKsh(item.unitCost, true)}</td>
                  <td>{item.stock} {item.uom}</td><td>{item.reorderLevel} {item.uom}</td>
                  <td style={{ color: isLow ? "#b91c1c" : "#15803d", fontWeight: 600 }}>{isLow ? "Reorder" : "In stock"}</td>
                </tr>
              );
            })}
            {!activeItems.length ? <tr><td colSpan="8">No active inventory items found.</td></tr> : null}
          </tbody>
        </table>
      </section>

      {archivedItems.length ? (
        <section className="page-card" style={{ overflowX: "auto" }}>
          <h2 className="panel-title">Archived inventory items</h2>
          <p className="panel-copy">Archived items are hidden from new requests and purchase orders but retained for historical records and existing receipts.</p>
          <table className="data-table">
            <thead><tr><th>SKU</th><th>Item</th><th>Category</th><th>Unit cost</th><th>Stock (UOM)</th><th>Reorder level (UOM)</th><th>Actions</th></tr></thead>
            <tbody>
              {archivedItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.sku}</td><td>{item.name}</td><td>{item.category || "General Materials"}</td>
                  <td>{formatKsh(item.unitCost, true)}</td><td>{item.stock} {item.uom}</td><td>{item.reorderLevel} {item.uom}</td>
                  <td><button className="secondary-btn" type="button" onClick={() => unarchiveItem(item)} aria-label={`Restore ${item.name}`}>Restore</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="page-card" style={{ overflowX: "auto" }}>
        <div className="panel-heading">
          <div>
            <h2 className="panel-title">Annual purchase inventory</h2>
            <p className="panel-copy">Purchases received through Stock In from January through December for the selected year. Total: {formatKsh(annualPurchaseTotal)} across {annualPurchases.length} receipt line(s).</p>
          </div>
          <label>Purchase year
            <select className="input-field" aria-label="Purchase year" value={purchaseYear} onChange={(event) => setPurchaseYear(event.target.value)}>
              {availablePurchaseYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
        </div>
        <RecordActions
          records={annualPurchases}
          selectedRecords={selectedTransactions}
          recordName={`purchases-${purchaseYear}`}
        />
        <table className="data-table">
          <thead>
            <tr>
              <th className="no-print">
                <input
                  type="checkbox"
                  aria-label="Select all annual purchases"
                  checked={annualPurchases.length > 0 && annualPurchases.every((transaction) => selectedTransactionIds.includes(transaction.id))}
                  onChange={() => setSelectedTransactionIds(
                    annualPurchases.length > 0 && annualPurchases.every((transaction) => selectedTransactionIds.includes(transaction.id))
                      ? []
                      : annualPurchases.map((transaction) => transaction.id)
                  )}
                  disabled={!annualPurchases.length}
                />
              </th>
              <th>Month</th><th>Date</th><th>Item</th><th>Supplier</th><th>Category</th><th>Quantity</th><th>Unit cost</th><th>Purchase total</th><th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {annualPurchases.map((transaction) => (
              <tr key={transaction.id}>
                <td className="no-print">
                  <input
                    type="checkbox"
                    aria-label={`Select purchase ${transaction.item} ${transaction.date}`}
                    checked={selectedTransactionIds.includes(transaction.id)}
                    onChange={() => setSelectedTransactionIds((current) => current.includes(transaction.id)
                      ? current.filter((id) => id !== transaction.id)
                      : [...current, transaction.id])}
                  />
                </td>
                <td>{new Date(`${transaction.date}T00:00:00`).toLocaleString(undefined, { month: "long" })}</td>
                <td>{transaction.date}</td><td>{transaction.item}</td><td>{transaction.supplier}</td>
                <td>{transaction.category || "General Materials"}</td>
                <td>{transaction.quantity} {transaction.uom}</td>
                <td>{formatKsh(transaction.amount, true)}</td><td>{formatKsh(transaction.total)}</td>
                <td>{transaction.reference || "—"}</td>
              </tr>
            ))}
            {!annualPurchases.length ? <tr><td colSpan="10">No purchase transactions recorded for {purchaseYear}.</td></tr> : null}
          </tbody>
        </table>
      </section>
      {inventoryTransactions.length ? (
        <section className="page-card" style={{ overflowX: "auto" }}>
          <h2 className="panel-title">Historical unlinked purchases</h2>
          <p className="panel-copy">These records are retained separately; they do not adjust stock or feed the purchase dashboard.</p>
          <table className="data-table">
            <thead><tr><th>Date</th><th>Item</th><th>Supplier</th><th>Quantity</th><th>Total</th><th>Receipt</th></tr></thead>
            <tbody>{inventoryTransactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>{transaction.date}</td><td>{transaction.item}</td><td>{transaction.supplier}</td>
                <td>{transaction.quantity} {transaction.uom}</td><td>{formatKsh(transaction.total)}</td>
                <td>{transaction.receiptId ? <button className="secondary-btn" type="button" onClick={() => downloadReceipt(transaction)}>{transaction.receiptName || "Download receipt"}</button> : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}

function StockMovementView({ movementType }) {
  const { items, suppliers, stockMovements, recordStockMovement, updateStockMovement, deleteStockMovements } = useInventory();
  const activeItems = items.filter((item) => !item.archived);
  const [selectedIds, setSelectedIds] = useState([]);
  const [editingMovementId, setEditingMovementId] = useState(null);
  const [form, setForm] = useState({
    itemId: "",
    uom: "",
    date: new Date().toISOString().slice(0, 10),
    quantity: "",
    reference: "",
    notes: "",
    isPurchase: false,
    supplierId: "",
    unitCost: "",
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const title = movementType === "in" ? "Stock in" : "Stock out";
  const movements = stockMovements.filter((movement) => movement.movementType === movementType);
  const selectableMovements = movements.filter((movement) => movement.notes !== "Purchase order receipt");
  const selectedMovements = selectableMovements.filter((movement) => selectedIds.includes(movement.id));
  const selectedItem = items.find((item) => item.id === form.itemId);
  const movementUnitOptions = selectedItem
    ? ["km", "m"].includes(String(selectedItem.uom).toLowerCase())
      ? ["km", "m"]
      : [selectedItem.uom]
    : [];

  const submit = (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      if (editingMovementId) {
        updateStockMovement(editingMovementId, form);
        setMessage(`${title} movement updated.`);
        setEditingMovementId(null);
      } else {
        recordStockMovement({ ...form, movementType });
        setMessage(`${title} movement recorded.`);
      }
      setForm((current) => ({ ...current, quantity: "", reference: "", notes: "" }));
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  const startEdit = (movement) => {
    setEditingMovementId(movement.id);
    setForm({
      itemId: movement.itemId,
      uom: movement.uom,
      date: movement.date,
      quantity: String(movement.quantity),
      reference: movement.reference || "",
      notes: movement.notes || "",
      isPurchase: Boolean(movement.isPurchase),
      supplierId: movement.supplierId || "",
      unitCost: movement.unitCost == null ? "" : String(movement.unitCost),
    });
    setError("");
    setMessage("");
  };

  const deleteSelected = (records) => {
    if (!window.confirm(`Remove ${records.length} ${title.toLowerCase()} movement(s)? Stock quantities will be adjusted to reverse the selected movement(s).`)) return;
    setError("");
    setMessage("");
    try {
      deleteStockMovements(records.map((movement) => movement.id));
      setSelectedIds([]);
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  return (
    <>
      <section className="page-card no-print">
        <h2 className="panel-title">{editingMovementId ? `Edit ${title.toLowerCase()} movement` : `Record ${title.toLowerCase()}`}</h2>
        <p className="panel-copy">Stock is kept in each item's unit. Metres and kilometres convert automatically; reels, rolls, and pieces use their item's listed unit.</p>
        <form onSubmit={submit} className="form-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label>Item
            <select className="input-field" value={form.itemId} onChange={(event) => {
              const item = activeItems.find((entry) => entry.id === event.target.value);
              setForm({ ...form, itemId: event.target.value, uom: item?.uom || "" });
            }} required disabled={Boolean(editingMovementId)}>
              <option value="">Select item</option>
              {items.filter((item) => !item.archived || item.id === form.itemId).map((item) => (
                <option key={item.id} value={item.id}>{item.name}{item.archived ? " (Archived)" : ""} ({item.stock} {item.uom} in stock)</option>
              ))}
            </select>
          </label>
          <label>Date<input className="input-field" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required /></label>
          <label>Quantity<input className="input-field" type="number" min="0.001" step="any" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required /></label>
          <label>UOM
            <select className="input-field" value={form.uom} onChange={(event) => setForm({ ...form, uom: event.target.value })} required disabled={!selectedItem}>
              {movementUnitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </label>
          <label>Reference<input className="input-field" value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} placeholder="Receipt or issue number" /></label>
          <label>Notes<input className="input-field" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          {movementType === "in" ? <>
            <label><input type="checkbox" checked={form.isPurchase} onChange={(event) => setForm({ ...form, isPurchase: event.target.checked })} /> Purchased stock</label>
            {form.isPurchase ? <>
              <label>Purchase supplier<select className="input-field" value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })} required>
                <option value="">Select supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select></label>
              <label>Purchase unit cost (KSh per selected UOM)<input className="input-field" type="number" min="0" step="0.01" value={form.unitCost} onChange={(event) => setForm({ ...form, unitCost: event.target.value })} required /></label>
            </> : null}
          </> : null}
          <button className="primary-btn" type="submit">{editingMovementId ? "Save changes" : `Record ${title.toLowerCase()}`}</button>
          {editingMovementId ? (
            <button className="secondary-btn" type="button" onClick={() => {
              setEditingMovementId(null);
              setForm((current) => ({ ...current, quantity: "", reference: "", notes: "" }));
            }}>Cancel edit</button>
          ) : null}
        </form>
        <Feedback error={error} message={message} />
      </section>

      <section className="page-card" style={{ overflowX: "auto" }}>
        <div className="panel-heading">
          <div>
            <h2 className="panel-title">{title} records</h2>
            <p className="panel-copy">{selectedMovements.length ? `${selectedMovements.length} movement(s) selected.` : "Select movement records to edit, remove, or download."}</p>
          </div>
        </div>
        <RecordActions
          records={movements}
          selectedRecords={selectedMovements}
          recordName={`${movementType === "in" ? "stock-in" : "stock-out"}-movements`}
          onEdit={startEdit}
          onDelete={deleteSelected}
        />
        <table className="data-table">
          <thead>
            <tr>
              <th className="no-print">
                <input
                  type="checkbox"
                  aria-label={`Select all ${title.toLowerCase()} movements`}
                  checked={selectableMovements.length > 0 && selectableMovements.every((movement) => selectedIds.includes(movement.id))}
                  onChange={() => setSelectedIds(
                    selectableMovements.length > 0 && selectableMovements.every((movement) => selectedIds.includes(movement.id))
                      ? []
                      : selectableMovements.map((movement) => movement.id)
                  )}
                  disabled={!selectableMovements.length}
                />
              </th>
              <th>Date</th><th>SKU</th><th>Item</th><th>Quantity</th><th>Reference</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((movement) => (
              <tr key={movement.id}>
                <td className="no-print">
                  {movement.notes === "Purchase order receipt" ? "—" : (
                    <input
                      type="checkbox"
                      aria-label={`Select ${movement.reference || movement.id}`}
                      checked={selectedIds.includes(movement.id)}
                      onChange={() => setSelectedIds((current) => current.includes(movement.id)
                        ? current.filter((id) => id !== movement.id)
                        : [...current, movement.id])}
                    />
                  )}
                </td>
                <td>{movement.date}</td><td>{movement.sku}</td><td>{movement.item}</td>
                <td>{movement.quantity} {movement.uom}</td><td>{movement.reference || "—"}</td><td>{movement.notes || "—"}</td>
              </tr>
            ))}
            {!movements.length ? <tr><td colSpan="7">No {title.toLowerCase()} records yet.</td></tr> : null}
          </tbody>
        </table>
      </section>
    </>
  );
}

function PurchaseOrdersView() {
  const {
    currentRole,
    suppliers,
    items,
    purchaseOrders,
    createPurchaseOrder,
    updatePurchaseOrder,
    deletePurchaseOrders,
    receivePurchaseOrder,
  } = useInventory();
  const activeItems = items.filter((item) => !item.archived);
  const [form, setForm] = useState({
    supplierId: "",
    lineItems: [{ itemId: "", quantity: "", unitCost: "" }],
  });
  const [selectedSupplierId, setSelectedSupplierId] = useState(
    () => purchaseOrders.find((order) => order.status !== "Received")?.supplierId || ""
  );
  const [selectedPOIds, setSelectedPOIds] = useState([]);
  const [ordersToPrint, setOrdersToPrint] = useState([]);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canCreate = currentRole === "Procurement";
  const canReceive = currentRole === "Procurement" || currentRole === "Director";
  const printableOrdersForSupplier = purchaseOrders.filter(
    (order) => order.supplierId === selectedSupplierId && order.status !== "Received"
  );
  const selectedOrders = printableOrdersForSupplier.filter((order) => selectedPOIds.includes(order.id));

  const changeSupplier = (supplierId) => {
    setSelectedSupplierId(supplierId);
    setSelectedPOIds([]);
  };

  const toggleOrderSelection = (orderId) => {
    setSelectedPOIds((current) => current.includes(orderId)
      ? current.filter((id) => id !== orderId)
      : [...current, orderId]);
  };

  const toggleSelectAllForSupplier = () => {
    const allSelected = printableOrdersForSupplier.length > 0
      && printableOrdersForSupplier.every((order) => selectedPOIds.includes(order.id));
    setSelectedPOIds(allSelected ? [] : printableOrdersForSupplier.map((order) => order.id));
  };

  const updateFormLine = (index, updates) => {
    setForm((current) => ({
      ...current,
      lineItems: current.lineItems.map((line, lineIndex) => (
        lineIndex === index ? { ...line, ...updates } : line
      )),
    }));
  };

  const addFormLine = () => {
    setForm((current) => ({
      ...current,
      lineItems: [...current.lineItems, { itemId: "", quantity: "", unitCost: "" }],
    }));
  };

  const removeFormLine = (index) => {
    setForm((current) => ({
      ...current,
      lineItems: current.lineItems.filter((_, lineIndex) => lineIndex !== index),
    }));
  };

  const submit = (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      if (editingOrderId) {
        updatePurchaseOrder(editingOrderId, form.supplierId, form.lineItems);
        setMessage("Purchase order updated.");
      } else {
        createPurchaseOrder(form.supplierId, form.lineItems);
        setMessage("Purchase order created.");
      }
      setEditingOrderId(null);
      setForm({ supplierId: "", lineItems: [{ itemId: "", quantity: "", unitCost: "" }] });
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  const startEdit = (purchaseOrder) => {
    setEditingOrderId(purchaseOrder.id);
    setForm({
      supplierId: purchaseOrder.supplierId,
      lineItems: purchaseOrder.lineItems.map((line) => ({
        itemId: line.itemId,
        quantity: String(line.quantity),
        unitCost: String(line.unitCost),
        uom: line.uom,
      })),
    });
    setError("");
    setMessage("");
  };

  const deleteSelectedOrders = (selectedRecords) => {
    if (!window.confirm(`Delete ${selectedRecords.length} selected purchase order(s)? Received or quotation-linked orders cannot be deleted.`)) return;
    setError("");
    setMessage("");
    try {
      deletePurchaseOrders(selectedRecords.map((order) => order.id));
      setSelectedPOIds([]);
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  const receive = (purchaseOrder) => {
    setError("");
    setMessage("");
    try {
      const updated = receivePurchaseOrder(purchaseOrder.id);
      const orderNumber = purchaseOrder.orderNumber || purchaseOrder.id;
      setMessage(updated ? `${orderNumber} received and stock updated.` : `${orderNumber} was already received.`);
    } catch (actionError) {
      setError(actionError.message);
    }
  };

  return (
    <>
      <div className="page-shell page-content">
        <PrintHeader title="Purchase Orders" subtitle="Issued supplier orders and goods receipt log." />
        {canCreate ? (
          <section className="page-card no-print">
            <h2 className="panel-title">{editingOrderId ? "Edit purchase order" : "Create purchase order"}</h2>
            <form onSubmit={submit} className="po-create-form">
              <label>Supplier
                <select className="input-field" value={form.supplierId} onChange={(event) => setForm((current) => ({ ...current, supplierId: event.target.value }))} required>
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
              </label>
              <div className="po-create-lines">
                <div className="panel-heading">
                  <h3 className="panel-title">Items on this PO</h3>
                  <button className="secondary-btn" type="button" onClick={addFormLine}>Add another item</button>
                </div>
                {form.lineItems.map((line, index) => (
                  <div className="po-create-line" key={`po-line-${index}`}>
                    <label>Item {index + 1}
                      <select
                        className="input-field"
                        aria-label={`Item ${index + 1}`}
                        value={line.itemId}
                        onChange={(event) => {
                          const item = activeItems.find((entry) => entry.id === event.target.value);
                          updateFormLine(index, {
                            itemId: event.target.value,
                            unitCost: item ? String(item.unitCost) : "",
                            uom: item?.uom || "",
                          });
                        }}
                        required
                      >
                        <option value="">Select item</option>
                        {activeItems.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.uom})</option>)}
                      </select>
                    </label>
                    <label>Quantity {index + 1}
                      <input
                        className="input-field"
                        aria-label={`Quantity ${index + 1}`}
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={line.quantity}
                        onChange={(event) => updateFormLine(index, { quantity: event.target.value })}
                        required
                      />
                      <span className="panel-copy">UOM: {line.uom || activeItems.find((item) => item.id === line.itemId)?.uom || "—"}</span>
                    </label>
                    <label>Unit cost {index + 1} (KSh)
                      <input
                        className="input-field"
                        aria-label={`Unit cost ${index + 1} (KSh)`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitCost}
                        onChange={(event) => updateFormLine(index, { unitCost: event.target.value })}
                        required
                      />
                    </label>
                    <button
                      className="secondary-btn"
                      type="button"
                      aria-label={`Remove item ${index + 1}`}
                      onClick={() => removeFormLine(index)}
                      disabled={form.lineItems.length === 1}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button className="primary-btn" type="submit">{editingOrderId ? "Save purchase order" : "Create purchase order"}</button>
              {editingOrderId ? (
                <button className="secondary-btn" type="button" onClick={() => {
                  setEditingOrderId(null);
                  setForm({ supplierId: "", lineItems: [{ itemId: "", quantity: "", unitCost: "" }] });
                }}>Cancel edit</button>
              ) : null}
            </form>
            <Feedback error={error} message={message} />
          </section>
        ) : <p className="panel-copy no-print">Switch the demo role to Procurement on the Inventory Dashboard to create purchase orders.</p>}

        <section className="page-card" style={{ overflowX: "auto" }}>
          <div className="panel-heading po-list-heading">
            <div>
              <h2 className="panel-title">Purchase order register</h2>
              <p className="panel-copy">Select open orders from one supplier to print, download, share, or export them together.</p>
            </div>
            <div className="po-selection-controls no-print">
              <label>
                Supplier for documents
                <select
                  className="input-field"
                  value={selectedSupplierId}
                  onChange={(event) => changeSupplier(event.target.value)}
                  aria-label="Supplier for documents"
                >
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
              </label>
              <button
                className="primary-btn"
                type="button"
                disabled={!selectedOrders.length}
                onClick={() => setOrdersToPrint(selectedOrders)}
              >
                Documents ({selectedOrders.length})
              </button>
            </div>
          </div>
          <RecordActions
            records={purchaseOrders}
            selectedRecords={selectedOrders}
            recordName="purchase-orders"
            onEdit={canCreate ? startEdit : undefined}
            onDelete={canCreate ? deleteSelectedOrders : undefined}
            canEdit={selectedOrders.length === 1 && !selectedOrders[0]?.quotationId}
            canDelete={selectedOrders.every((order) => order.status !== "Received" && !order.quotationId)}
          />
          <p className="po-selection-hint no-print">
            Received purchase orders are excluded from document selection. Choose one supplier, then select one or more open orders.
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th className="no-print">
                  <input
                    type="checkbox"
                    aria-label="Select all printable purchase orders"
                    checked={printableOrdersForSupplier.length > 0 && printableOrdersForSupplier.every((order) => selectedPOIds.includes(order.id))}
                    onChange={toggleSelectAllForSupplier}
                    disabled={!printableOrdersForSupplier.length}
                  />
                </th>
                <th>PO number</th><th>Supplier</th><th>Date</th><th>Items</th><th>Total cost</th><th>Status</th><th className="no-print">Action</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.map((purchaseOrder) => {
                const totalCost = purchaseOrder.lineItems.reduce(
                  (sum, line) => sum + Number(line.quantity) * Number(line.unitCost),
                  0
                );
                return (
                  <tr key={purchaseOrder.id}>
                    <td className="no-print">
                      {purchaseOrder.status !== "Received" && purchaseOrder.supplierId === selectedSupplierId ? (
                        <input
                          type="checkbox"
                          aria-label={`Select ${purchaseOrder.orderNumber || purchaseOrder.id}`}
                          checked={selectedPOIds.includes(purchaseOrder.id)}
                          onChange={() => toggleOrderSelection(purchaseOrder.id)}
                        />
                      ) : "—"}
                    </td>
                    <td>{purchaseOrder.orderNumber || purchaseOrder.id}</td>
                    <td>{suppliers.find((supplier) => supplier.id === purchaseOrder.supplierId)?.name || "Unknown supplier"}</td>
                    <td>{purchaseOrder.date}</td>
                    <td>{purchaseOrder.lineItems.map((line, index) => {
                      const item = items.find((entry) => entry.id === line.itemId);
                      const itemName = item?.name || "Unknown item";
                      return <div key={`${purchaseOrder.id}-${line.itemId}-${index}`}>{line.quantity} {line.uom || item?.uom || ""} × {itemName}</div>;
                    })}</td>
                    <td>{formatKsh(totalCost, true)}</td>
                    <td>{purchaseOrder.status}</td>
                    <td className="no-print">
                      {canReceive && purchaseOrder.status !== "Received"
                        ? <button className="secondary-btn" type="button" onClick={() => receive(purchaseOrder)}>Receive</button>
                        : "—"}
                    </td>
                  </tr>
                );
              })}
              {!purchaseOrders.length ? <tr><td colSpan="8">No purchase orders found.</td></tr> : null}
            </tbody>
          </table>
        </section>
      </div>
      <PurchaseOrderBatchModal orders={ordersToPrint} onClose={() => setOrdersToPrint([])} />
    </>
  );
}

export default function InventorySubmenu({ section }) {
  const details = sectionDetails[section];
  if (!details) return null;
  if (section === "purchase-orders") return <PurchaseOrdersView />;

  if (section === "stock-in" || section === "stock-out") {
    const movementType = section === "stock-in" ? "in" : "out";
    return (
      <div className="page-shell">
        <PrintHeader title={details.title} subtitle={details.subtitle} />
        <StockMovementView key={section} movementType={movementType} />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PrintHeader title={details.title} subtitle={details.subtitle} />
      {section === "suppliers" ? <SuppliersView /> : null}
      {section === "items" ? <ItemsView /> : null}
    </div>
  );
}
