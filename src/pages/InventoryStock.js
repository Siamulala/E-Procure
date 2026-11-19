import React, { useState } from "react";
import PrintHeader from "../components/PrintHeader";
import RecordActions from "../components/RecordActions";
import SpreadsheetImport from "../components/SpreadsheetImport";
import { useInventory } from "../contexts/InventoryContext";
import { formatKsh } from "../utils/currency";
import { canRoleViewMenu } from "../utils/menuAccess";
import "../styles/Pages.css";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const exportRecord = (movement) => ({
  "Receipt date": movement.date,
  SKU: movement.sku,
  Item: movement.item,
  Category: movement.category,
  Type: movement.isPurchase ? "Purchase" : "Other receipt",
  Quantity: movement.quantity,
  UOM: movement.uom,
  Supplier: movement.isPurchase ? movement.supplier : "",
  "Unit cost (KSh)": movement.isPurchase ? movement.unitCost : "",
  "Total (KSh)": movement.isPurchase ? Number(movement.quantity) * Number(movement.unitCost) : "",
  Reference: movement.reference || "",
  Notes: movement.notes || "",
});

export default function InventoryStock({ user }) {
  const { items, suppliers, stockMovements, roleMenuPermissions, recordPurchasedStockBatch, updateStockMovement, deleteStockMovements, inventoryCategories, addInventoryCategory, renameInventoryCategory, setStockMovementCategory } = useInventory();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [category, setCategory] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [categoryToRename, setCategoryToRename] = useState("");
  const [renamedCategory, setRenamedCategory] = useState("");
  const [categoryToAssign, setCategoryToAssign] = useState("");
  const [categoryFeedback, setCategoryFeedback] = useState({ error: "", message: "" });
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const itemCategories = new Map(items.map((item) => [item.id, item.category]));
  const movements = stockMovements.filter((movement) => movement.movementType === "in")
    .map((movement) => ({ ...movement, category: movement.category || itemCategories.get(movement.itemId) || "" }));
  const years = [...new Set([String(new Date().getFullYear()), ...movements.map((movement) => String(movement.date).slice(0, 4))])]
    .filter((value) => /^\d{4}$/.test(value)).sort((a, b) => b.localeCompare(a));
  const categories = [...new Set(movements.map((movement) => movement.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const searchTerm = search.trim().toLowerCase();
  const records = movements.filter((movement) => {
    const date = String(movement.date);
    return date.startsWith(`${year}-`)
      && (!month || date.slice(5, 7) === month)
      && (type === "all" || (type === "purchase" ? movement.isPurchase : !movement.isPurchase))
      && (!category || movement.category === category)
      && (!searchTerm || [movement.item, movement.sku, movement.supplier, movement.reference, movement.category]
        .some((value) => String(value || "").toLowerCase().includes(searchTerm)));
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const selected = records.filter((movement) => selectedIds.includes(movement.id));
  const canManageStock = canRoleViewMenu(user?.role, "/inventory/stock-in", roleMenuPermissions);
  const hasOrderReceipt = selected.some((movement) => movement.notes === "Purchase order receipt");
  const editingItem = items.find((item) => item.id === editing?.itemId);
  const unitOptions = editingItem
    ? ["km", "m"].includes(String(editingItem.uom).toLowerCase()) ? ["km", "m"] : [editingItem.uom]
    : [];
  const purchaseTotal = records.reduce((sum, movement) => (
    sum + (movement.isPurchase ? Number(movement.quantity) * Number(movement.unitCost) : 0)
  ), 0);
  const changeFilter = (setter, value) => {
    setter(value);
    setSelectedIds([]);
  };

  const manageCategory = (event, action) => {
    event.preventDefault();
    setCategoryFeedback({ error: "", message: "" });
    try {
      if (!canManageStock) throw new Error("You do not have permission to manage Stock In.");
      if (action === "add") {
        addInventoryCategory(newCategory);
        setNewCategory("");
        setCategoryFeedback({ error: "", message: "Category added." });
      } else if (action === "rename") {
        const name = renameInventoryCategory(categoryToRename, renamedCategory);
        if (category.toLowerCase() === categoryToRename.toLowerCase()) setCategory(name);
        if (categoryToAssign.toLowerCase() === categoryToRename.toLowerCase()) setCategoryToAssign(name);
        setCategoryToRename(name);
        setRenamedCategory("");
        setCategoryFeedback({ error: "", message: "Category renamed in inventory records." });
      } else {
        if (selected.length !== 1) throw new Error("Select one Stock In record.");
        setStockMovementCategory(selected[0].id, categoryToAssign);
        setSelectedIds([]);
        setCategoryToAssign("");
        setCategoryFeedback({ error: "", message: "Record category updated." });
      }
    } catch (categoryError) {
      setCategoryFeedback({ error: categoryError.message, message: "" });
    }
  };

  const startEdit = (movement) => {
    setError("");
    setMessage("");
    setImportOpen(false);
    setEditing({
      id: movement.id, itemId: movement.itemId, item: movement.item,
      date: movement.date, quantity: String(movement.quantity), uom: movement.uom,
      reference: movement.reference || "", notes: movement.notes || "",
      isPurchase: Boolean(movement.isPurchase), supplierId: movement.supplierId || "",
      unitCost: movement.unitCost == null ? "" : String(movement.unitCost),
    });
  };

  const saveEdit = (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      if (!canManageStock) throw new Error("You do not have permission to manage Stock In.");
      if (editing.notes.trim() === "Purchase order receipt") throw new Error("This note is reserved for purchase-order receipts.");
      updateStockMovement(editing.id, editing);
      setEditing(null);
      setSelectedIds([]);
      setMessage("Stock In record updated. Stock balance adjusted.");
    } catch (saveError) {
      setError(saveError.message);
    }
  };

  const deleteSelected = (movementsToDelete) => {
    if (!window.confirm(`Remove ${movementsToDelete.length} Stock In record(s)? Stock balances will be adjusted.`)) return;
    setError("");
    setMessage("");
    try {
      if (!canManageStock) throw new Error("You do not have permission to manage Stock In.");
      deleteStockMovements(movementsToDelete.map((movement) => movement.id));
      if (movementsToDelete.some((movement) => movement.id === editing?.id)) setEditing(null);
      setSelectedIds([]);
      setMessage("Stock In record(s) removed. Stock balances adjusted.");
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  return (
    <div className="page-shell inventory-stock">
      <PrintHeader title="Inventory Stock" subtitle="Inventory report from Stock In records." />

      {editing ? <section className="page-card no-print">
        <h2 className="panel-title">Edit Stock In record</h2>
        <p className="panel-copy">Item: {editing.item}. Saving adjusts the stock balance.</p>
        <form className="form-row" onSubmit={saveEdit}>
          <label>Receipt date<input className="input-field" type="date" value={editing.date} onChange={(event) => setEditing({ ...editing, date: event.target.value })} required /></label>
          <label>Quantity<input className="input-field" type="number" min="0" step="any" value={editing.quantity} onChange={(event) => setEditing({ ...editing, quantity: event.target.value })} required /></label>
          <label>UOM<select className="input-field" value={editing.uom} onChange={(event) => setEditing({ ...editing, uom: event.target.value })} required>{unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
          <label>Reference<input className="input-field" value={editing.reference} onChange={(event) => setEditing({ ...editing, reference: event.target.value })} /></label>
          <label>Notes<input className="input-field" value={editing.notes} onChange={(event) => setEditing({ ...editing, notes: event.target.value })} /></label>
          <label><input type="checkbox" checked={editing.isPurchase} onChange={(event) => setEditing({ ...editing, isPurchase: event.target.checked })} /> Purchased stock</label>
          {editing.isPurchase ? <>
            <label>Purchase supplier<select className="input-field" value={editing.supplierId} onChange={(event) => setEditing({ ...editing, supplierId: event.target.value })} required><option value="">Select supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
            <label>Purchase unit cost (KSh per selected UOM)<input className="input-field" type="number" min="0" step="any" value={editing.unitCost} onChange={(event) => setEditing({ ...editing, unitCost: event.target.value })} required /></label>
          </> : null}
          <button className="primary-btn" type="submit">Save changes</button>
          <button className="secondary-btn" type="button" onClick={() => { setEditing(null); setError(""); }}>Cancel edit</button>
        </form>
      </section> : null}
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}

      {importOpen ? <SpreadsheetImport mode="stock" items={items} onClose={() => setImportOpen(false)} onApply={(rows) => {
        recordPurchasedStockBatch(rows);
        setImportMessage(`${rows.length} purchased stock receipt line(s) recorded. Filter by receipt year to see them.`);
      }} /> : null}
      {importMessage ? <p role="status">{importMessage}</p> : null}

      <section className="page-card inventory-stock__report">
        <div className="panel-heading">
          <div><h2 className="panel-title">Inventory report</h2><p className="panel-copy">Stock received, by receipt date.</p></div>
          <RecordActions records={records} selectedRecords={selected} formatRecord={exportRecord} recordName={`stock-in-${year}`}
            onEdit={canManageStock ? startEdit : undefined} onDelete={canManageStock ? deleteSelected : undefined}
            canEdit={!hasOrderReceipt} canDelete={!hasOrderReceipt}
            onManageCategories={canManageStock ? () => setCategoriesOpen(true) : undefined}
            onUpload={canManageStock ? () => { setEditing(null); setError(""); setMessage(""); setImportMessage(""); setImportOpen(true); } : undefined} />
        </div>
        {hasOrderReceipt ? <p className="panel-copy no-print">Purchase-order receipts cannot be edited or deleted independently of their order; their category can still be changed.</p> : null}
        {canManageStock && categoriesOpen ? <section className="no-print">
          <div className="panel-heading"><h3 className="panel-title">Manage categories</h3><button className="secondary-btn" type="button" onClick={() => setCategoriesOpen(false)}>Close categories</button></div>
          <p className="panel-copy">Rename a category across inventory records, or select one receipt to change only its category. Purchase-order quantities and values remain unchanged.</p>
          <form className="form-row" onSubmit={(event) => manageCategory(event, "add")}>
            <label>New category<input className="input-field" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} required /></label>
            <button className="secondary-btn" type="submit">Add category</button>
          </form>
          <form className="form-row" onSubmit={(event) => manageCategory(event, "rename")}>
            <label>Category to rename<select className="input-field" value={categoryToRename} onChange={(event) => setCategoryToRename(event.target.value)} required>
              <option value="">Select category</option>{inventoryCategories.map((name) => <option key={name} value={name}>{name}</option>)}
            </select></label>
            <label>Rename category to<input className="input-field" value={renamedCategory} onChange={(event) => setRenamedCategory(event.target.value)} required /></label>
            <button className="secondary-btn" type="submit">Rename category</button>
          </form>
          <form className="form-row" onSubmit={(event) => manageCategory(event, "assign")}>
            <label>Category for selected receipt<select className="input-field" value={categoryToAssign} onChange={(event) => setCategoryToAssign(event.target.value)} required>
              <option value="">Select category</option>{inventoryCategories.map((name) => <option key={name} value={name}>{name}</option>)}
            </select></label>
            <button className="secondary-btn" type="submit" disabled={selected.length !== 1}>Update selected receipt category</button>
          </form>
          {categoryFeedback.error || categoryFeedback.message ? <p role={categoryFeedback.error ? "alert" : "status"}>{categoryFeedback.error || categoryFeedback.message}</p> : null}
        </section> : null}
        <div className="inventory-stock__filters no-print">
          <label>Year<select className="input-field" value={year} onChange={(event) => changeFilter(setYear, event.target.value)}>
            {years.map((value) => <option key={value} value={value}>{value}</option>)}
          </select></label>
          <label>Month<select className="input-field" value={month} onChange={(event) => changeFilter(setMonth, event.target.value)}>
            <option value="">All months</option>{MONTHS.map((name, index) => <option key={name} value={String(index + 1).padStart(2, "0")}>{name}</option>)}
          </select></label>
          <label>Receipt type<select className="input-field" value={type} onChange={(event) => changeFilter(setType, event.target.value)}>
            <option value="all">All receipts</option><option value="purchase">Purchases</option><option value="other">Other receipts</option>
          </select></label>
          <label>Category<select className="input-field" value={category} onChange={(event) => changeFilter(setCategory, event.target.value)}>
            <option value="">All categories</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}
          </select></label>
          <label>Search receipts<input className="input-field" type="search" value={search} onChange={(event) => changeFilter(setSearch, event.target.value)} placeholder="Item, SKU, supplier or reference" /></label>
        </div>
        <p className="inventory-stock__report-meta">
          {year}{month ? ` · ${MONTHS[Number(month) - 1]}` : " · All months"}
          {type !== "all" ? ` · ${type === "purchase" ? "Purchases" : "Other receipts"}` : ""}
          {category ? ` · ${category}` : ""}{search.trim() ? ` · Search: ${search.trim()}` : ""}
          {" · "}{records.length} receipt line(s) · Purchased value {formatKsh(purchaseTotal, true)}
        </p>
        <div className="inventory-stock__table">
          <table className="data-table">
            <thead><tr><th className="no-print"><input type="checkbox" aria-label="Select all displayed stock in records" checked={records.length > 0 && records.every((movement) => selectedIds.includes(movement.id))} onChange={(event) => setSelectedIds(event.target.checked ? records.map((movement) => movement.id) : [])} disabled={!records.length} /></th><th>Received</th><th>SKU</th><th>Item</th><th>Category</th><th>Type</th><th>Quantity</th><th>Supplier</th><th>Unit cost</th><th>Total</th><th>Reference</th></tr></thead>
            <tbody>
              {records.map((movement) => (
                <tr key={movement.id}>
                  <td className="no-print"><input type="checkbox" aria-label={`Select stock in ${movement.reference || movement.id}`} checked={selectedIds.includes(movement.id)} onChange={() => setSelectedIds((ids) => ids.includes(movement.id) ? ids.filter((id) => id !== movement.id) : [...ids, movement.id])} /></td>
                  <td>{movement.date}</td><td>{movement.sku}</td><td>{movement.item}</td><td>{movement.category || "—"}</td><td>{movement.isPurchase ? "Purchase" : "Other receipt"}</td><td>{movement.quantity} {movement.uom}</td>
                  <td>{movement.isPurchase ? movement.supplier : "—"}</td><td>{movement.isPurchase ? formatKsh(movement.unitCost, true) : "—"}</td>
                  <td>{movement.isPurchase ? formatKsh(movement.quantity * movement.unitCost, true) : "—"}</td><td>{movement.reference || "—"}</td>
                </tr>
              ))}
              {!records.length ? <tr><td colSpan="11">No stock received matches these filters.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
