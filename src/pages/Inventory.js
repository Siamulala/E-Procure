// src/pages/Inventory.js
import React, { useState } from "react";

export default function Inventory({ inventory, setInventory }) {
  const [newItem, setNewItem] = useState({
    item: "",
    description: "",
    quantity: "",
    uom: "",
    amount: "",
    supplier: "",
    date: ""
  });

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

      {/* Inventory Table */}
      <table border="1" cellPadding="10" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead style={{ backgroundColor: "#f0f0f0" }}>
          <tr>
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
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{s.item}</td>
              <td>{s.description}</td>
              <td>{s.quantity}</td>
              <td>{s.uom}</td>
              <td>{s.amount.toFixed(2)}</td>
              <td>{s.total.toFixed(2)}</td>
              <td>{s.supplier}</td>
              <td>{s.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
