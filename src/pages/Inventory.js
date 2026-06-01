// src/pages/Inventory.js
import React, { useState } from "react";

export default function Inventory({ inventory, setInventory, user }) {
  const [newItem, setNewItem] = useState({
    item: "",
    description: "",
    quantity: "",
    uom: "",
    amount: "",
    supplier: "",
    date: ""
  });

  const [selectedItems, setSelectedItems] = useState(new Set());
  const [editingIndex, setEditingIndex] = useState(null);
  const [editValues, setEditValues] = useState({});

  // Handle input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setNewItem((prev) => ({ ...prev, [name]: value }));
  };

  // Add new item to inventory
  const handleAddItem = (e) => {
    e.preventDefault();
    if (!newItem.item || !newItem.quantity || !newItem.uom || !newItem.amount || !newItem.supplier || !newItem.date) {
      alert("Please fill all required fields");
      return;
    }

    const total = parseFloat(newItem.quantity) * parseFloat(newItem.amount);

    setInventory((prev) => [
      ...prev,
      {
        ...newItem,
        quantity: parseInt(newItem.quantity),
        amount: parseFloat(newItem.amount),
        total
      }
    ]);

    // Reset form
    setNewItem({
      item: "",
      description: "",
      quantity: "",
      uom: "",
      amount: "",
      supplier: "",
      date: ""
    });
  };

  const toggleSelectItem = (index) => {
    const updated = new Set(selectedItems);
    if (updated.has(index)) {
      updated.delete(index);
    } else {
      updated.add(index);
    }
    setSelectedItems(updated);
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === inventory.length && inventory.length > 0) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(inventory.map((_, i) => i)));
    }
  };

  const startEdit = (i) => {
    setEditingIndex(i);
    setEditValues(inventory[i]);
  };

  const saveEdit = (i) => {
    const next = inventory.map((o, idx) => (idx === i ? editValues : o));
    setInventory(next);
    setEditingIndex(null);
    setSelectedItems(new Set());
  };

  const deleteSelected = () => {
    if (!window.confirm(`Delete ${selectedItems.size} item(s)?`)) return;
    const next = inventory.filter((_, idx) => !selectedItems.has(idx));
    setInventory(next);
    setSelectedItems(new Set());
  };

  const exportSelected = () => {
    if (selectedItems.size === 0) return;
    const rows = inventory.filter((_, i) => selectedItems.has(i));
    const csv = [
      Object.keys(inventory[0]).join(","),
      ...rows.map(r => Object.values(r).join(","))
    ].join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-export-${Date.now()}.csv`;
    a.click();
  };

    const printInventory = () => {
      const w = window.open("", "_blank");
      const itemsToPrint = selectedItems.size > 0 ? Array.from(selectedItems).map(i => inventory[i]) : inventory;
      const totalValue = itemsToPrint.reduce((sum, i) => sum + ((parseFloat(i.amount) || 0) * i.quantity), 0);
      w.document.write(`
        <html><head><title>Inventory Report</title><style>body{font-family:Arial;margin:20px}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #ddd;padding:10px}th{background:#f0f0f0}</style></head><body>
        <h1>Inventory Report</h1>
        <p>Generated: ${new Date().toLocaleString()}</p>
        <table><tr><th>Item</th><th>Qty</th><th>UoM</th><th>Unit Price</th><th>Total Value</th><th>Supplier</th><th>Date</th></tr>
        ${itemsToPrint.map(i => `<tr><td>${i.item}</td><td>${i.quantity}</td><td>${i.uom}</td><td>$${(parseFloat(i.amount) || 0).toFixed(2)}</td><td>$${((parseFloat(i.amount) || 0) * i.quantity).toFixed(2)}</td><td>${i.supplier}</td><td>${i.date}</td></tr>`).join("")}
        <tr><td colspan="4" style="font-weight:bold">TOTAL</td><td style="font-weight:bold">$${totalValue.toFixed(2)}</td><td></td><td></td></tr>
        </table><button onclick="window.print()" style="margin-top:20px;padding:10px 20px">Print</button></body></html>
      `);
    };

  return (
    <div style={{ padding: "30px" }}>
      <h1>Inventory</h1>

      {/* Add Item Form */}
      <form onSubmit={handleAddItem} style={{ marginBottom: "20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px" }}>
        <input type="text" name="item" placeholder="Item" value={newItem.item} onChange={handleChange} />
        <input type="text" name="description" placeholder="Description" value={newItem.description} onChange={handleChange} />
        <input type="number" name="quantity" placeholder="Quantity" value={newItem.quantity} onChange={handleChange} />
        <input type="text" name="uom" placeholder="UOM" value={newItem.uom} onChange={handleChange} />
        <input type="number" name="amount" placeholder="Amount" value={newItem.amount} onChange={handleChange} />
        <input type="text" name="supplier" placeholder="Supplier" value={newItem.supplier} onChange={handleChange} />
        <input type="date" name="date" value={newItem.date} onChange={handleChange} />
        <button type="submit" style={{ gridColumn: "span 2", padding: "10px", backgroundColor: "#36A2EB", color: "#fff", border: "none", borderRadius: "5px" }}>
          Add Item
        </button>
      </form>

      {/* Action Bar */}
      {selectedItems.size > 0 && (
        <div style={{ background: "#f0f7ff", padding: "15px", marginBottom: "20px", borderRadius: "8px", display: "flex", gap: "10px", alignItems: "center" }}>
          <span style={{ fontWeight: 700 }}>{selectedItems.size} item(s) selected</span>
          {editingIndex === null ? (
            <>
              <button onClick={() => startEdit(Array.from(selectedItems)[0])} style={{ padding: "8px 16px", backgroundColor: "#4CAF50", color: "#fff", border: "none", borderRadius: "5px" }}>
                Edit
              </button>
              <button onClick={exportSelected} style={{ padding: "8px 16px", backgroundColor: "#2196F3", color: "#fff", border: "none", borderRadius: "5px" }}>
                Export
              </button>
              <button onClick={printInventory} style={{ padding: "8px 16px", backgroundColor: "#16a34a", color: "#fff", border: "none", borderRadius: "5px" }}>
                📄 Print
              </button>
              <button onClick={deleteSelected} style={{ padding: "8px 16px", backgroundColor: "#f44336", color: "#fff", border: "none", borderRadius: "5px" }}>
                Delete
              </button>
            </>
          ) : (
            <>
              <button onClick={() => saveEdit(Array.from(selectedItems)[0])} style={{ padding: "8px 16px", backgroundColor: "#4CAF50", color: "#fff", border: "none", borderRadius: "5px" }}>
                Save
              </button>
              <button onClick={() => setEditingIndex(null)} style={{ padding: "8px 16px", backgroundColor: "#999", color: "#fff", border: "none", borderRadius: "5px" }}>
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      {/* Inventory Table */}
      <table border="1" cellPadding="10" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead style={{ backgroundColor: "#f0f0f0" }}>
          <tr>
            <th style={{ width: "40px" }}>
              <input type="checkbox" checked={selectedItems.size === inventory.length && inventory.length > 0} onChange={toggleSelectAll} />
            </th>
            <th>No.</th>
            <th>Item</th>
            <th>Description</th>
            <th>Quantity</th>
            <th>UOM</th>
            <th>Amount</th>
            <th>Total</th>
            <th>Supplier</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {inventory.map((s, i) => (
            <tr key={i} style={{ backgroundColor: selectedItems.has(i) ? "#e3f2fd" : "white" }}>
              <td>
                <input type="checkbox" checked={selectedItems.has(i)} onChange={() => toggleSelectItem(i)} />
              </td>
              <td>{i + 1}</td>
              <td>{editingIndex === i ? <input value={editValues.item || ""} onChange={(e) => setEditValues({ ...editValues, item: e.target.value })} /> : s.item}</td>
              <td>{editingIndex === i ? <input value={editValues.description || ""} onChange={(e) => setEditValues({ ...editValues, description: e.target.value })} /> : s.description}</td>
              <td>{editingIndex === i ? <input value={editValues.quantity || ""} onChange={(e) => setEditValues({ ...editValues, quantity: e.target.value })} /> : s.quantity}</td>
              <td>{editingIndex === i ? <input value={editValues.uom || ""} onChange={(e) => setEditValues({ ...editValues, uom: e.target.value })} /> : s.uom}</td>
              <td>{editingIndex === i ? <input value={editValues.amount || ""} onChange={(e) => setEditValues({ ...editValues, amount: e.target.value })} /> : (parseFloat(s.amount) || 0).toFixed(2)}</td>
              <td>{editingIndex === i ? ((parseFloat(editValues.quantity) || 0) * (parseFloat(editValues.amount) || 0)).toFixed(2) : ((parseFloat(s.quantity) || 0) * (parseFloat(s.amount) || 0)).toFixed(2)}</td>
              <td>{editingIndex === i ? <input value={editValues.supplier || ""} onChange={(e) => setEditValues({ ...editValues, supplier: e.target.value })} /> : s.supplier}</td>
              <td>{editingIndex === i ? <input type="date" value={editValues.date || ""} onChange={(e) => setEditValues({ ...editValues, date: e.target.value })} /> : s.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
