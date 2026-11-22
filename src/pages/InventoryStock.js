import React, { useState } from "react";
import PrintHeader from "../components/PrintHeader";
import RecordActions from "../components/RecordActions";
import SpreadsheetImport from "../components/SpreadsheetImport";
import CableConfiguration from "../components/CableConfiguration";
import CategoryManager from "../components/CategoryManager";
import { useInventory } from "../contexts/InventoryContext";
import { formatKsh } from "../utils/currency";
import { canRoleViewMenu } from "../utils/menuAccess";
import "../styles/Pages.css";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const emptyItemForm = () => ({
  itemId: "", sku: "", name: "", category: "", uom: "", unitCost: "", reorderLevel: "0",
  date: new Date().toISOString().slice(0, 10), quantity: "",
  isPurchase: false, supplierId: "",
});

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
  Notes: movement.notes || "",
});

export default function InventoryStock({ user }) {
  const { items, suppliers, stockMovements, roleMenuPermissions, addItemWithReceipt, recordStockMovement, recordPurchasedStockBatch, updateStockMovement, deleteStockMovements, inventoryCategories, setStockMovementCategory } = useInventory();
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
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [cableSettingsOpen, setCableSettingsOpen] = useState(false);
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [existingItemCost, setExistingItemCost] = useState("");
  const [itemError, setItemError] = useState("");
  const [itemMessage, setItemMessage] = useState("");
  const selectedStockItem = items.find((item) => item.id === itemForm.itemId && !item.archived);
  const itemCategories = new Map(items.map((item) => [item.id, item.category]));
  const movements = stockMovements.filter((movement) => movement.movementType === "in")
    .map((movement) => ({ ...movement, category: movement.category || itemCategories.get(movement.itemId) || "General Materials" }));
  const years = [...new Set([String(new Date().getFullYear()), ...movements.map((movement) => String(movement.date).slice(0, 4))])]
    .filter((value) => /^\d{4}$/.test(value)).sort((a, b) => b.localeCompare(a));
  const searchTerm = search.trim().toLowerCase();
  const records = movements.filter((movement) => {
    const date = String(movement.date);
    return date.startsWith(`${year}-`)
      && (!month || date.slice(5, 7) === month)
      && (type === "all" || (type === "purchase" ? movement.isPurchase : !movement.isPurchase))
      && (!category || movement.category === category)
      && (!searchTerm || [movement.item, movement.sku, movement.supplier, movement.category]
        .some((value) => String(value || "").toLowerCase().includes(searchTerm)));
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const selected = records.filter((movement) => selectedIds.includes(movement.id));
  const canManageStock = canRoleViewMenu(user?.role, "/inventory/stock-in", roleMenuPermissions);
  const hasOrderReceipt = selected.some((movement) => movement.notes === "Purchase order receipt");
  const editingItem = items.find((item) => item.id === editing?.itemId);
  const unitOptions = editingItem
    ? [...new Set([editingItem.uom, editing.uom, ...Object.keys(editingItem.unitBalances || {}), ...(editingItem.cablePackageUnit ? [editingItem.cablePackageUnit, "km", "m"] : []), ...(["km", "m"].includes(editingItem.uom) ? ["km", "m"] : [])])]
    : [];
  const purchaseTotal = records.reduce((sum, movement) => (
    sum + (movement.isPurchase ? Number(movement.quantity) * Number(movement.unitCost) : 0)
  ), 0);
  const selectedPurchaseTotal = selected.reduce((sum, movement) => (
    sum + (movement.isPurchase ? Number(movement.quantity) * Number(movement.unitCost) : 0)
  ), 0);
  const changeFilter = (setter, value) => {
    setter(value);
    setSelectedIds([]);
  };

  const submitItem = (event) => {
    event.preventDefault();
    setItemError("");
    setItemMessage("");
    try {
      if (!canManageStock) throw new Error("You do not have permission to manage Stock In.");
      if (itemForm.itemId && !selectedStockItem) throw new Error("Choose an active inventory item.");
      const movement = itemForm.itemId
        ? recordStockMovement({ ...itemForm, movementType: "in", uom: selectedStockItem.uom, unitCost: existingItemCost })
        : addItemWithReceipt(itemForm);
      setYear(movement.date.slice(0, 4));
      setMonth("");
      setType("all");
      setCategory("");
      setSearch("");
      setSelectedIds([]);
      setItemForm(emptyItemForm());
      setExistingItemCost("");
      setItemFormOpen(false);
      setItemMessage(itemForm.itemId ? `Stock received for ${movement.item}.` : `${movement.item} added and stock received.`);
    } catch (submitError) {
      setItemError(submitError.message);
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
      category: movement.category,
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
        <form className="form-row inventory-stock__form" onSubmit={saveEdit}>
          <label>Receipt date<input className="input-field" type="date" value={editing.date} onChange={(event) => setEditing({ ...editing, date: event.target.value })} required /></label>
          <label>Quantity<input className="input-field" type="number" min="0" step="any" value={editing.quantity} onChange={(event) => setEditing({ ...editing, quantity: event.target.value })} required /></label>
          <label>UOM<select className="input-field" value={editing.uom} onChange={(event) => setEditing({ ...editing, uom: event.target.value })} required>{unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
          <label>Receipt category<select className="input-field" value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })} required>{inventoryCategories.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label>Notes<input className="input-field" value={editing.notes} onChange={(event) => setEditing({ ...editing, notes: event.target.value })} /></label>
          <label className="inventory-stock__checkbox"><input type="checkbox" checked={editing.isPurchase} onChange={(event) => setEditing({ ...editing, isPurchase: event.target.checked })} /> Purchased stock</label>
          {editing.isPurchase ? <>
            <label>Purchase supplier<select className="input-field" value={editing.supplierId} onChange={(event) => setEditing({ ...editing, supplierId: event.target.value })} required><option value="">Select supplier</option>{suppliers.filter((supplier) => !supplier.archived || supplier.id === stockMovements.find((movement) => movement.id === editing.id)?.supplierId).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}{supplier.archived ? " (Removed)" : ""}</option>)}</select></label>
            <label>Rate (KSh per selected UOM)<input className="input-field" type="number" min="0" step="any" value={editing.unitCost} onChange={(event) => setEditing({ ...editing, unitCost: event.target.value })} required /></label>
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
            formatPdfRecord={(movement) => ({
            Date: movement.date, Item: movement.item, Quantity: movement.quantity, UOM: movement.uom,
            Supplier: movement.isPurchase ? movement.supplier : "",
              "Unit cost": movement.isPurchase ? formatKsh(movement.unitCost, true) : "",
              Total: movement.isPurchase ? formatKsh(movement.quantity * movement.unitCost, true) : "",
            })}
            formatPdfSummary={(pdfRecords) => ({
            "Unit cost": "Total purchased value",
            Total: formatKsh(pdfRecords.reduce((sum, movement) => (
              sum + (movement.isPurchase ? Number(movement.quantity) * Number(movement.unitCost) : 0)
            ), 0), true),
            })}
            onEdit={canManageStock ? startEdit : undefined} onDelete={canManageStock ? deleteSelected : undefined}
            onAdd={canManageStock ? () => { setItemFormOpen(true); setItemError(""); setItemMessage(""); } : undefined}
            canEdit={!hasOrderReceipt} canDelete={!hasOrderReceipt}
            onManageCategories={canManageStock ? () => setCategoriesOpen(true) : undefined}
            onConfigureCable={canManageStock ? () => setCableSettingsOpen(true) : undefined}
            onUpload={canManageStock ? () => { setEditing(null); setError(""); setMessage(""); setImportMessage(""); setImportOpen(true); } : undefined} />
        </div>
        {itemFormOpen && canManageStock ? <section className="no-print inventory-stock__tool">
          <div className="panel-heading">
            <h2 className="panel-title">Add item to inventory</h2>
            <button className="secondary-btn" type="button" onClick={() => { setItemFormOpen(false); setItemError(""); }}>Close add item</button>
          </div>
            <p className="panel-copy">Select an existing item to receive stock in its main unit, or create a new item and record its opening receipt.</p>
          <form className="form-row inventory-stock__form" onSubmit={submitItem}>
              <label>Item name<select className="input-field" value={itemForm.itemId} onChange={(event) => {
                const itemId = event.target.value;
                const item = items.find((entry) => entry.id === itemId && !entry.archived);
                setItemForm({ ...itemForm, itemId, category: item?.category || "General Materials" });
                setExistingItemCost(item?.unitCost == null ? "" : String(item.unitCost));
                setItemError("");
              }}>
                <option value="">Create a new item</option>
                {items.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.sku})</option>)}
              </select></label>
              {itemForm.itemId ? <p className="panel-copy">Stock unit: {selectedStockItem?.uom || "Item unavailable"}</p> : <>
                <label>SKU<input className="input-field" value={itemForm.sku} onChange={(event) => setItemForm({ ...itemForm, sku: event.target.value })} required /></label>
                <label>New item name<input className="input-field" value={itemForm.name} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} required /></label>
                <label>Unit of measure<input className="input-field" value={itemForm.uom} onChange={(event) => setItemForm({ ...itemForm, uom: event.target.value })} placeholder="piece, m, reel" required /></label>
              </>}
            <label>Item category<select className="input-field" value={itemForm.category} onChange={(event) => setItemForm({ ...itemForm, category: event.target.value })}>
              <option value="">General Materials (default)</option>{inventoryCategories.map((name) => <option key={name} value={name}>{name}</option>)}
            </select></label>
            <label>Receipt date<input className="input-field" type="date" value={itemForm.date} onChange={(event) => setItemForm({ ...itemForm, date: event.target.value })} required /></label>
            <label>Quantity<input className="input-field" type="number" min="0" step="any" value={itemForm.quantity} onChange={(event) => setItemForm({ ...itemForm, quantity: event.target.value })} required /></label>
              {!itemForm.itemId ? <>
                <label>Unit cost (KSh)<input className="input-field" type="number" min="0" step="any" value={itemForm.unitCost} onChange={(event) => setItemForm({ ...itemForm, unitCost: event.target.value })} required /></label>
                <label>Reorder level<input className="input-field" type="number" min="0" step="any" value={itemForm.reorderLevel} onChange={(event) => setItemForm({ ...itemForm, reorderLevel: event.target.value })} required /></label>
              </> : null}
            <label className="inventory-stock__checkbox"><input type="checkbox" checked={itemForm.isPurchase} onChange={(event) => setItemForm({ ...itemForm, isPurchase: event.target.checked })} /> Purchased stock</label>
            {itemForm.isPurchase ? <label>Purchase supplier<select className="input-field" value={itemForm.supplierId} onChange={(event) => setItemForm({ ...itemForm, supplierId: event.target.value })} required>
              <option value="">Select supplier</option>{suppliers.filter((supplier) => !supplier.archived).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select></label> : null}
              {itemForm.itemId && itemForm.isPurchase ? <label>Unit cost (KSh)<input className="input-field" type="number" min="0" step="any" value={existingItemCost} onChange={(event) => setExistingItemCost(event.target.value)} required /></label> : null}
              <button className="primary-btn" type="submit">{itemForm.itemId ? "Record receipt" : "Save item and receipt"}</button>
          </form>
        </section> : null}
        {itemError || itemMessage ? <p role={itemError ? "alert" : "status"}>{itemError || itemMessage}</p> : null}
        {cableSettingsOpen && canManageStock ? <CableConfiguration onClose={() => setCableSettingsOpen(false)} /> : null}
        {hasOrderReceipt ? <p className="panel-copy no-print">Purchase-order receipts cannot be edited or deleted independently of their order; their category can still be changed.</p> : null}
        {canManageStock && categoriesOpen ? <section className="no-print inventory-stock__tool">
          <div className="panel-heading"><h3 className="panel-title">Manage categories</h3><button className="secondary-btn" type="button" onClick={() => setCategoriesOpen(false)}>Close categories</button></div>
          <CategoryManager selectedCount={selected.length}
            onAssign={(name) => { setStockMovementCategory(selected[0].id, name); setSelectedIds([]); }}
            onCategoryChange={(oldName, name) => {
              if (category.toLowerCase() === oldName.toLowerCase()) setCategory(name);
              if (itemForm.category.toLowerCase() === oldName.toLowerCase()) setItemForm((current) => ({ ...current, category: name }));
              if (editing?.category.toLowerCase() === oldName.toLowerCase()) setEditing((current) => ({ ...current, category: name }));
            }} />
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
            <option value="">All categories</option>{inventoryCategories.map((value) => <option key={value} value={value}>{value}</option>)}
          </select></label>
          <label className="inventory-stock__search">Search receipts<input className="input-field" type="search" value={search} onChange={(event) => changeFilter(setSearch, event.target.value)} placeholder="Item, SKU, supplier or category" /></label>
        </div>
        <p className="inventory-stock__report-meta">
          {year}{month ? ` · ${MONTHS[Number(month) - 1]}` : " · All months"}
          {type !== "all" ? ` · ${type === "purchase" ? "Purchases" : "Other receipts"}` : ""}
          <span className="no-print">{category ? ` · ${category}` : ""}</span>{search.trim() ? ` · Search: ${search.trim()}` : ""}
          {" · "}{records.length} receipt line(s) · Purchased value {formatKsh(purchaseTotal, true)}
        </p>
        <div className="inventory-stock__table" role="region" aria-label="Inventory receipt table" tabIndex={0}>
          <table className="data-table">
            <thead><tr><th scope="col" className="no-print inventory-stock__select"><input type="checkbox" aria-label="Select all displayed stock in records" checked={records.length > 0 && records.every((movement) => selectedIds.includes(movement.id))} onChange={(event) => setSelectedIds(event.target.checked ? records.map((movement) => movement.id) : [])} disabled={!records.length} /></th><th scope="col" className="inventory-stock__date">Date</th><th scope="col">Item</th><th scope="col" className="no-print">Category</th><th scope="col" className="inventory-stock__number inventory-stock__quantity"><span className="inventory-stock__quantity-label">Quantity</span></th><th scope="col" className="inventory-stock__uom">UOM</th><th scope="col">Supplier</th><th scope="col" className="inventory-stock__number inventory-stock__money">Unit cost</th><th scope="col" className="inventory-stock__number inventory-stock__money">Total</th></tr></thead>
            <tbody>
              {records.map((movement) => (
                <tr key={movement.id} className={selectedIds.includes(movement.id) ? "inventory-stock__row--selected" : undefined}>
                  <td className="no-print inventory-stock__select"><input type="checkbox" aria-label={`Select stock in ${movement.id}`} checked={selectedIds.includes(movement.id)} onChange={() => setSelectedIds((ids) => ids.includes(movement.id) ? ids.filter((id) => id !== movement.id) : [...ids, movement.id])} /></td>
                  <td className="inventory-stock__date">{movement.date}</td>
                  <td className="inventory-stock__item">{movement.item}</td>
                  <td className="no-print">{movement.category}</td>
                  <td className="inventory-stock__number inventory-stock__quantity">{movement.quantity}</td>
                  <td className="inventory-stock__uom">{movement.uom}</td>
                  <td className="inventory-stock__supplier">{movement.isPurchase ? movement.supplier : "—"}</td>
                  <td className="inventory-stock__number">{movement.isPurchase ? formatKsh(movement.unitCost, true) : "—"}</td>
                  <td className="inventory-stock__number inventory-stock__total">{movement.isPurchase ? formatKsh(movement.quantity * movement.unitCost, true) : "—"}</td>
                </tr>
              ))}
              {!records.length ? <>
                <tr className="no-print"><td className="inventory-stock__empty" colSpan="9">No stock received matches these filters.</td></tr>
                <tr className="print-only-row"><td className="inventory-stock__empty" colSpan="7">No stock received matches these filters.</td></tr>
              </> : null}
            </tbody>
            <tfoot>
              <tr className="inventory-stock__total-all">
                <td className="no-print"></td>
                <td className="no-print" colSpan="7">Total purchased value</td>
                <td className="print-only" colSpan="6">Total purchased value</td>
                <td className="inventory-stock__number inventory-stock__total">{formatKsh(purchaseTotal, true)}</td>
              </tr>
              <tr className="inventory-stock__total-selected">
                <td className="no-print"></td>
                <td className="no-print" colSpan="7">Selected purchased value</td>
                <td className="print-only" colSpan="6">Selected purchased value</td>
                <td className="inventory-stock__number inventory-stock__total">{formatKsh(selectedPurchaseTotal, true)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
