import React, { useEffect, useState } from "react";
import "../styles/Pages.css";

const readStoredList = (key, fallback = []) => {
  if (typeof window === "undefined") return fallback;
  try {
    const item = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(item) ? item.filter(Boolean) : fallback;
  } catch {
    return fallback;
  }
};

export default function Inventory({ inventory, setInventory, user, searchTerm = "" }) {
  const [newItem, setNewItem] = useState({
    date: "",
    item: "",
    description: "",
    quantity: "",
    uom: "",
    amount: "",
    supplier: "",
    category: ""
  });
  const [feedback, setFeedback] = useState("");
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [editingIndex, setEditingIndex] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [showActionsMenu, setShowActionsMenu] = useState(false);

  const [suppliersList, setSuppliersList] = useState(() => readStoredList("inventory-suppliers", ["Nexcom", "Airtel", "Gadgets Ltd"]));
  const [categoriesList, setCategoriesList] = useState(() => readStoredList("inventory-categories", ["ADSS Cables", "Drop Cables", "Accessories", "PPEs", "Tools"]));
  const [materialsList, setMaterialsList] = useState(() => readStoredList("inventory-materials", ["ADSS Cable", "Drop Cable", "PPE", "Accessory", "Tool"]));
  const [newSupplier, setNewSupplier] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newMaterial, setNewMaterial] = useState("");
  const [activeModule, setActiveModule] = useState("inventory");

  useEffect(() => {
    localStorage.setItem("inventory-suppliers", JSON.stringify(suppliersList));
  }, [suppliersList]);

  useEffect(() => {
    localStorage.setItem("inventory-categories", JSON.stringify(categoriesList));
  }, [categoriesList]);

  useEffect(() => {
    localStorage.setItem("inventory-materials", JSON.stringify(materialsList));
  }, [materialsList]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFeedback("");
    setNewItem((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddItem = (e) => {
    e.preventDefault();
    const requiredFields = ["date", "item", "quantity", "uom", "amount", "supplier"];
    const missing = requiredFields.filter((field) => !String(newItem[field]).trim());

    if (missing.length > 0) {
      setFeedback("Please fill all required fields before adding an item.");
      return;
    }

    const quantity = Number(newItem.quantity);
    const amount = Number(newItem.amount);
    const total = quantity * amount;
    const normalizedItem = {
      ...newItem,
      item: newItem.item.trim(),
      description: newItem.description.trim(),
      quantity,
      uom: newItem.uom.trim(),
      amount,
      supplier: newItem.supplier.trim(),
      category: newItem.category.trim(),
      total
    };

    if (!materialsList.includes(normalizedItem.item)) {
      setMaterialsList((prev) => [normalizedItem.item, ...prev]);
    }
    if (!suppliersList.includes(normalizedItem.supplier)) {
      setSuppliersList((prev) => [normalizedItem.supplier, ...prev]);
    }
    if (normalizedItem.category && !categoriesList.includes(normalizedItem.category)) {
      setCategoriesList((prev) => [normalizedItem.category, ...prev]);
    }

    setInventory((prev) => [normalizedItem, ...prev]);
    setFeedback(`Added ${normalizedItem.item} to inventory.`);
    setNewItem({ date: "", item: "", description: "", quantity: "", uom: "", amount: "", supplier: "", category: "" });
  };

  const addListEntry = (type, value) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (type === "supplier") {
      setSuppliersList((prev) => (prev.includes(trimmed) ? prev : [trimmed, ...prev]));
      setNewSupplier("");
    }
    if (type === "category") {
      setCategoriesList((prev) => (prev.includes(trimmed) ? prev : [trimmed, ...prev]));
      setNewCategory("");
    }
    if (type === "material") {
      setMaterialsList((prev) => (prev.includes(trimmed) ? prev : [trimmed, ...prev]));
      setNewMaterial("");
    }
    setFeedback(`${trimmed} added to ${type} list.`);
  };

  const removeListEntry = (type, entry) => {
    if (type === "supplier") setSuppliersList((prev) => prev.filter((item) => item !== entry));
    if (type === "category") setCategoriesList((prev) => prev.filter((item) => item !== entry));
    if (type === "material") setMaterialsList((prev) => prev.filter((item) => item !== entry));
    setFeedback(`${entry} removed from ${type} list.`);
  };

  const toggleSelectItem = (index) => {
    const updated = new Set(selectedItems);
    if (updated.has(index)) updated.delete(index); else updated.add(index);
    setSelectedItems(updated);
    setShowActionsMenu(false);
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === inventory.length && inventory.length > 0) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(inventory.map((_, i) => i)));
    }
    setShowActionsMenu(false);
  };

  const startEdit = (i) => {
    setEditingIndex(i);
    setEditValues(inventory[i]);
    setShowActionsMenu(false);
  };

  const saveEdit = (i) => {
    const next = inventory.map((o, idx) => (idx === i ? { ...editValues, quantity: Number(editValues.quantity || 0), amount: Number(editValues.amount || 0), total: (Number(editValues.quantity || 0) * Number(editValues.amount || 0)) } : o));
    setInventory(next);
    setEditingIndex(null);
    setSelectedItems(new Set());
    setShowActionsMenu(false);
    setFeedback("Changes saved.");
  };

  const deleteSelected = () => {
    if (!window.confirm(`Delete ${selectedItems.size} item(s)?`)) return;
    const next = inventory.filter((_, idx) => !selectedItems.has(idx));
    setInventory(next);
    setSelectedItems(new Set());
    setShowActionsMenu(false);
    setFeedback("Selected items deleted.");
  };

  const exportSelected = () => {
    if (selectedItems.size === 0) return;
    const rows = inventory.filter((_, i) => selectedItems.has(i));
    const csv = [Object.keys(inventory[0] || {}).join(","), ...rows.map((r) => Object.values(r).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-export-${Date.now()}.csv`;
    a.click();
    setShowActionsMenu(false);
    setFeedback("Inventory export created.");
  };

  const shareSelected = async () => {
    const rows = inventory.filter((_, i) => selectedItems.has(i));
    const shareText = rows.map((row) => `${row.item} (${row.quantity} ${row.uom})`).join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ title: "Inventory selection", text: shareText });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
      }
      setFeedback("Selection shared.");
    } catch {
      setFeedback("Sharing cancelled.");
    }
    setShowActionsMenu(false);
  };

  const filteredInventory = inventory.filter((item) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    const haystack = [item.item, item.description, item.supplier, item.uom, item.date, item.category].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(term);
  });

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Inventory workspace</p>
          <h1 className="page-title">Inventory</h1>
          <p className="page-subtitle">Manage stock entries, suppliers, categories, and materials from one place.</p>
        </div>
        <div className="soft-pill">{inventory.length} active items</div>
      </div>

      <div className="page-card" style={{ marginBottom: "16px" }}>
        <div className="panel-heading" style={{ marginBottom: "10px" }}>
          <h2 className="panel-title">Inventory modules</h2>
          <span style={{ color: feedback.includes("Added") ? "#15803d" : feedback ? "#b91c1c" : "#64748b" }}>{feedback || "Switch between inventory and its supporting reference modules."}</span>
        </div>
        <div className="form-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginBottom: "12px" }}>
          {[
            { key: "inventory", label: "Inventory" },
            { key: "suppliers", label: "Suppliers" },
            { key: "categories", label: "Categories" },
            { key: "materials", label: "Materials" }
          ].map((module) => (
            <button
              key={module.key}
              type="button"
              className={activeModule === module.key ? "primary-btn" : "secondary-btn"}
              onClick={() => setActiveModule(module.key)}
            >
              {module.label}
            </button>
          ))}
        </div>

        {activeModule === "inventory" ? (
          <>
            <div className="panel-heading">
              <h3 className="panel-title">Add material entry</h3>
            </div>
            <form onSubmit={handleAddItem} className="form-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <input className="input-field" type="date" name="date" value={newItem.date} onChange={handleChange} required />
              <input className="input-field" type="text" name="item" placeholder="Item" value={newItem.item} onChange={handleChange} required list="material-options" />
              <input className="input-field" type="text" name="description" placeholder="Description" value={newItem.description} onChange={handleChange} />
              <input className="input-field" type="number" name="quantity" placeholder="Quantity" value={newItem.quantity} onChange={handleChange} required min="1" />
              <input className="input-field" type="text" name="uom" placeholder="UOM" value={newItem.uom} onChange={handleChange} required />
              <input className="input-field" type="number" name="amount" placeholder="Amount" value={newItem.amount} onChange={handleChange} required min="0" step="0.01" />
              <input className="input-field" type="text" name="supplier" placeholder="Supplier" value={newItem.supplier} onChange={handleChange} required list="supplier-options" />
              <input className="input-field" type="text" name="category" placeholder="Category" value={newItem.category} onChange={handleChange} list="category-options" />
              <button className="primary-btn" type="submit" style={{ gridColumn: "span 2" }}>+ Add Item</button>
            </form>
            <datalist id="material-options">{materialsList.map((item) => <option key={item} value={item} />)}</datalist>
            <datalist id="supplier-options">{suppliersList.map((item) => <option key={item} value={item} />)}</datalist>
            <datalist id="category-options">{categoriesList.map((item) => <option key={item} value={item} />)}</datalist>
          </>
        ) : (
          <div className="page-card" style={{ padding: "16px", marginTop: "8px", border: "1px solid #e2e8f0" }}>
            <div className="panel-heading">
              <h3 className="panel-title">{activeModule === "suppliers" ? "Supplier list" : activeModule === "categories" ? "Category list" : "Material list"}</h3>
              <button
                className="secondary-btn"
                onClick={() => {
                  const value = activeModule === "suppliers" ? newSupplier : activeModule === "categories" ? newCategory : newMaterial;
                  addListEntry(activeModule === "suppliers" ? "supplier" : activeModule === "categories" ? "category" : "material", value);
                }}
              >
                Add
              </button>
            </div>
            <input
              className="input-field"
              value={activeModule === "suppliers" ? newSupplier : activeModule === "categories" ? newCategory : newMaterial}
              onChange={(e) => {
                if (activeModule === "suppliers") setNewSupplier(e.target.value);
                if (activeModule === "categories") setNewCategory(e.target.value);
                if (activeModule === "materials") setNewMaterial(e.target.value);
              }}
              placeholder={`Add ${activeModule === "suppliers" ? "supplier" : activeModule === "categories" ? "category" : "material"}`}
              style={{ marginBottom: "10px" }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {(activeModule === "suppliers" ? suppliersList : activeModule === "categories" ? categoriesList : materialsList).map((entry) => (
                <span key={entry} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 10px", borderRadius: "999px", background: "#f1f5f9", color: "#334155" }}>
                  {entry}
                  <button
                    type="button"
                    onClick={() => removeListEntry(activeModule === "suppliers" ? "supplier" : activeModule === "categories" ? "category" : "material", entry)}
                    style={{ border: "none", background: "transparent", cursor: "pointer", color: "#ef4444" }}
                  >×</button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="page-header" style={{ marginBottom: "10px" }}>
        <div className="panel-copy">{selectedItems.size > 0 ? `${selectedItems.size} item(s) selected` : "Select one or more rows to act on them."}</div>
        {selectedItems.size > 0 && (
          <div style={{ position: "relative" }}>
            <button aria-label="Actions" onClick={() => setShowActionsMenu((value) => !value)} className="secondary-btn">⋯ Actions</button>
            {showActionsMenu && (
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "8px", boxShadow: "0 10px 24px rgba(15, 23, 42, 0.12)", zIndex: 5, minWidth: "140px" }}>
                <button onClick={() => startEdit(Array.from(selectedItems)[0])} className="secondary-btn" style={{ display: "block", width: "100%", textAlign: "left", marginBottom: "6px" }}>Edit</button>
                <button onClick={() => saveEdit(Array.from(selectedItems)[0])} className="secondary-btn" style={{ display: "block", width: "100%", textAlign: "left", marginBottom: "6px" }}>Save</button>
                <button onClick={exportSelected} className="secondary-btn" style={{ display: "block", width: "100%", textAlign: "left", marginBottom: "6px" }}>Export</button>
                <button onClick={shareSelected} className="secondary-btn" style={{ display: "block", width: "100%", textAlign: "left", marginBottom: "6px" }}>Share</button>
                <button onClick={deleteSelected} className="secondary-btn" style={{ display: "block", width: "100%", textAlign: "left", color: "#dc2626" }}>Delete</button>
              </div>
            )}
          </div>
        )}
      </div>

      {searchTerm ? <p className="panel-copy" style={{ marginBottom: "12px", color: "#2563eb" }}>Showing {filteredInventory.length} matching material(s) for "{searchTerm}".</p> : null}

      <div className="page-card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ backgroundColor: "#f8fafc" }}>
            <tr>
              <th style={{ width: "40px", textAlign: "left", padding: "10px" }}><input type="checkbox" checked={selectedItems.size === inventory.length && inventory.length > 0} onChange={toggleSelectAll} /></th>
              <th style={{ textAlign: "left", padding: "10px" }}>No.</th>
              <th style={{ textAlign: "left", padding: "10px" }}>Date</th>
              <th style={{ textAlign: "left", padding: "10px" }}>Item</th>
              <th style={{ textAlign: "left", padding: "10px" }}>Description</th>
              <th style={{ textAlign: "left", padding: "10px" }}>Quantity</th>
              <th style={{ textAlign: "left", padding: "10px" }}>UOM</th>
              <th style={{ textAlign: "left", padding: "10px" }}>Amount</th>
              <th style={{ textAlign: "left", padding: "10px" }}>Total</th>
              <th style={{ textAlign: "left", padding: "10px" }}>Supplier</th>
              <th style={{ textAlign: "left", padding: "10px" }}>Category</th>
            </tr>
          </thead>
          <tbody>
            {filteredInventory.map((s, i) => (
              <tr key={i} style={{ backgroundColor: selectedItems.has(i) ? "#eff6ff" : "white", borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "10px" }}><input type="checkbox" checked={selectedItems.has(i)} onChange={() => toggleSelectItem(i)} /></td>
                <td style={{ padding: "10px" }}>{i + 1}</td>
                <td style={{ padding: "10px" }}>{editingIndex === i ? <input className="input-field" type="date" value={editValues.date || ""} onChange={(e) => setEditValues({ ...editValues, date: e.target.value })} /> : s.date}</td>
                <td style={{ padding: "10px" }}>{editingIndex === i ? <input className="input-field" value={editValues.item || ""} onChange={(e) => setEditValues({ ...editValues, item: e.target.value })} list="material-options" /> : s.item}</td>
                <td style={{ padding: "10px" }}>{editingIndex === i ? <input className="input-field" value={editValues.description || ""} onChange={(e) => setEditValues({ ...editValues, description: e.target.value })} /> : s.description}</td>
                <td style={{ padding: "10px" }}>{editingIndex === i ? <input className="input-field" value={editValues.quantity || ""} onChange={(e) => setEditValues({ ...editValues, quantity: e.target.value })} /> : s.quantity}</td>
                <td style={{ padding: "10px" }}>{editingIndex === i ? <input className="input-field" value={editValues.uom || ""} onChange={(e) => setEditValues({ ...editValues, uom: e.target.value })} /> : s.uom}</td>
                <td style={{ padding: "10px" }}>{editingIndex === i ? <input className="input-field" value={editValues.amount || ""} onChange={(e) => setEditValues({ ...editValues, amount: e.target.value })} /> : (parseFloat(s.amount) || 0).toFixed(2)}</td>
                <td style={{ padding: "10px" }}>{editingIndex === i ? ((parseFloat(editValues.quantity) || 0) * (parseFloat(editValues.amount) || 0)).toFixed(2) : ((parseFloat(s.quantity) || 0) * (parseFloat(s.amount) || 0)).toFixed(2)}</td>
                <td style={{ padding: "10px" }}>{editingIndex === i ? <input className="input-field" value={editValues.supplier || ""} onChange={(e) => setEditValues({ ...editValues, supplier: e.target.value })} list="supplier-options" /> : s.supplier}</td>
                <td style={{ padding: "10px" }}>{editingIndex === i ? <input className="input-field" value={editValues.category || ""} onChange={(e) => setEditValues({ ...editValues, category: e.target.value })} list="category-options" /> : s.category}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
