import React, { useState } from "react";
import "../styles/Pages.css";

const buttonStyle = {
  padding: "10px 20px",
  margin: "0 4px",
  border: "none",
  borderRadius: "6px",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "13px",
  transition: "opacity 0.2s"
};

const primaryBtn = { ...buttonStyle, backgroundColor: "#1d4ed8" };
const successBtn = { ...buttonStyle, backgroundColor: "#16a34a" };
const dangerBtn = { ...buttonStyle, backgroundColor: "#dc2626" };

export default function Purchase({ purchases = [], setPurchases = () => {}, setInventory = () => {}, user, pushNotification }) {
  const [newReq, setNewReq] = useState({ item: "", description: "", quantity: 0, suppliers: [], status: "Pending", date: "" });
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [showQuotation, setShowQuotation] = useState(null);
  const [newSupplier, setNewSupplier] = useState({ name: "", price: "", delivery: "" });

  const handleChange = (e) => setNewReq({ ...newReq, [e.target.name]: e.target.value });

  const addSupplierToRequest = () => {
    if (!newSupplier.name || !newSupplier.price) return alert("Supplier name and price required");
    const suppliers = newReq.suppliers || [];
    setNewReq({ ...newReq, suppliers: [...suppliers, newSupplier] });
    setNewSupplier({ name: "", price: "", delivery: "" });
  };

  const removeSupplier = (idx) => {
    const suppliers = (newReq.suppliers || []).filter((_, i) => i !== idx);
    setNewReq({ ...newReq, suppliers });
  };

  const addRequest = (e) => {
    e.preventDefault();
    if (!newReq.item || !newReq.quantity) return alert("Please add item and quantity");
    if (!newReq.suppliers || newReq.suppliers.length === 0) return alert("Please add at least one supplier");
    const next = [...purchases, { ...newReq, quantity: parseInt(newReq.quantity, 10), status: "Pending" }];
    setPurchases(next);
    setNewReq({ item: "", description: "", quantity: 0, suppliers: [], status: "Pending", date: "" });
    alert("Purchase request created successfully!");
  };

  const toggleSelectRow = (i) => {
    const updated = new Set(selectedRows);
    if (updated.has(i)) updated.delete(i);
    else updated.add(i);
    setSelectedRows(updated);
  };

  const approve = () => {
    if (user?.role !== "Director") return alert("Only Director can approve");
    const updatedArr = purchases.map((p, idx) => selectedRows.has(idx) ? { ...p, status: "Approved" } : p);
    setPurchases(updatedArr);
    selectedRows.forEach(idx => {
      pushNotification && pushNotification(`Purchase request approved: ${purchases[idx]?.item || ''}`);
    });
    setSelectedRows(new Set());
  };

  const markPurchased = () => {
    const updatedArr = purchases.map((p, idx) => {
      if (!selectedRows.has(idx)) return p;
      setInventory((prev) => [...prev, {
        item: p.item,
        description: p.description || "",
        quantity: p.quantity,
        uom: "pcs",
        amount: p.suppliers?.[0]?.price || 0,
        total: (parseFloat(p.suppliers?.[0]?.price || 0)) * p.quantity,
        supplier: p.suppliers?.[0]?.name || "",
        date: new Date().toISOString().slice(0, 10)
      }]);
      pushNotification && pushNotification(`Purchased: ${p.item}`);
      return { ...p, status: "Purchased" };
    });
    setPurchases(updatedArr);
    setSelectedRows(new Set());
  };

  const deleteSelected = () => {
    if (!window.confirm(`Delete ${selectedRows.size} request(s)?`)) return;
    const next = purchases.filter((_, idx) => !selectedRows.has(idx));
    setPurchases(next);
    setSelectedRows(new Set());
  };

  const printRequest = (req, idx) => {
    const w = window.open("", "_blank");
    w.document.write(`
      <html><head><title>Purchase Request #${idx + 1}</title></head><body style="font-family:Arial;margin:20px">
      <h2>Purchase Request #${idx + 1}</h2>
      <p><strong>Item:</strong> ${req.item}</p>
      <p><strong>Description:</strong> ${req.description}</p>
      <p><strong>Quantity:</strong> ${req.quantity}</p>
      <p><strong>Status:</strong> ${req.status}</p>
      <p><strong>Date:</strong> ${req.date}</p>
      <h3>Quotations:</h3>
      <table border="1" cellpadding="8" style="width:100%"><tr><th>Supplier</th><th>Price</th><th>Delivery</th></tr>
      ${(req.suppliers || []).map(s => `<tr><td>${s.name}</td><td>${s.price}</td><td>${s.delivery}</td></tr>`).join("")}
      </table>
      <button onclick="window.print()" style="margin-top:20px;padding:10px 20px">Print</button>
      </body></html>
    `);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Purchase Requests & Quotations</h1>
        <p>Create and manage purchase requests with multiple supplier quotations.</p>
      </div>

      <div className="card" style={{ background: "#fff", marginBottom: "20px" }}>
        <div className="card-title">Create New Request</div>
        <div className="card-content">
          <form onSubmit={addRequest} style={{ display: "grid", gap: "12px" }}>
            <input name="item" placeholder="Item" value={newReq.item} onChange={handleChange} />
            <textarea name="description" placeholder="Item Description" value={newReq.description} onChange={handleChange} style={{ padding: "10px", border: "1px solid #ddd", borderRadius: "5px", minHeight: "60px" }} />
            <input name="quantity" type="number" placeholder="Quantity" value={newReq.quantity} onChange={handleChange} />
            <input name="date" type="date" value={newReq.date} onChange={handleChange} />

            <div style={{ background: "#f5f5f5", padding: "15px", borderRadius: "5px" }}>
              <h4>Add Suppliers & Quotations</h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "10px" }}>
                <input placeholder="Supplier Name" value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} style={{ padding: "8px", border: "1px solid #ddd", borderRadius: "5px" }} />
                <input placeholder="Price" type="number" value={newSupplier.price} onChange={(e) => setNewSupplier({ ...newSupplier, price: e.target.value })} style={{ padding: "8px", border: "1px solid #ddd", borderRadius: "5px" }} />
                <input placeholder="Delivery Days" type="number" value={newSupplier.delivery} onChange={(e) => setNewSupplier({ ...newSupplier, delivery: e.target.value })} style={{ padding: "8px", border: "1px solid #ddd", borderRadius: "5px" }} />
                <button type="button" onClick={addSupplierToRequest} style={{ ...primaryBtn, padding: "8px 16px" }}>Add</button>
              </div>

              {newReq.suppliers && newReq.suppliers.length > 0 && (
                <div style={{ marginTop: "12px" }}>
                  <h5>Selected Suppliers:</h5>
                  {newReq.suppliers.map((s, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px", background: "#fff", margin: "4px 0", borderRadius: "4px" }}>
                      <span>{s.name} - ${s.price} ({s.delivery} days)</span>
                      <button type="button" onClick={() => removeSupplier(i)} style={{ ...dangerBtn, padding: "4px 12px", fontSize: "11px" }}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button type="submit" style={{ ...primaryBtn, padding: "12px", fontSize: "14px" }}>Create Request</button>
          </form>
        </div>
      </div>

      {selectedRows.size > 0 && (
        <div style={{ background: "#e3f2fd", padding: "15px", marginBottom: "15px", borderRadius: "8px", display: "flex", gap: "10px", alignItems: "center" }}>
          <strong>{selectedRows.size} request(s) selected</strong>
          <button onClick={approve} style={successBtn}>Approve</button>
          <button onClick={markPurchased} style={primaryBtn}>Mark Purchased</button>
          <button onClick={deleteSelected} style={dangerBtn}>Delete</button>
        </div>
      )}

      <table border="1" cellPadding="10" style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
        <thead style={{ backgroundColor: "#f0f0f0" }}>
          <tr>
            <th style={{ width: "40px" }}>
              <input type="checkbox" onChange={(e) => {
                if (e.target.checked) setSelectedRows(new Set(purchases.map((_, i) => i)));
                else setSelectedRows(new Set());
              }} />
            </th>
            <th>No.</th>
            <th>Item</th>
            <th>Quantity</th>
            <th>Suppliers</th>
            <th>Status</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {(purchases || []).map((p, i) => (
            <tr key={i} style={{ backgroundColor: selectedRows.has(i) ? "#e3f2fd" : "white", borderBottom: "1px solid #ddd" }}>
              <td><input type="checkbox" checked={selectedRows.has(i)} onChange={() => toggleSelectRow(i)} /></td>
              <td>{i + 1}</td>
              <td><strong>{p.item}</strong><br /><small style={{ color: "#666" }}>{p.description}</small></td>
              <td>{p.quantity}</td>
              <td><strong>{p.suppliers?.length || 0}</strong> quotations</td>
              <td><span style={{ background: p.status === "Pending" ? "#ffc107" : p.status === "Approved" ? "#4caf50" : "#2196f3", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "12px" }}>{p.status}</span></td>
              <td>{p.date}</td>
              <td>
                <button onClick={() => setShowQuotation(showQuotation === i ? null : i)} style={{ ...primaryBtn, padding: "6px 12px", fontSize: "12px" }}>View</button>
                <button onClick={() => printRequest(p, i)} style={{ ...primaryBtn, padding: "6px 12px", fontSize: "12px", backgroundColor: "#6c757d" }}>Print</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showQuotation !== null && purchases[showQuotation] && (
        <div style={{ background: "#f9f9f9", padding: "20px", marginTop: "20px", borderRadius: "8px" }}>
          <h3>Quotations for {purchases[showQuotation].item}</h3>
          <table border="1" cellPadding="10" style={{ width: "100%", background: "#fff" }}>
            <thead style={{ backgroundColor: "#f0f0f0" }}>
              <tr><th>Supplier</th><th>Price</th><th>Delivery Days</th></tr>
            </thead>
            <tbody>
              {(purchases[showQuotation].suppliers || []).map((s, i) => (
                <tr key={i}><td>{s.name}</td><td>${s.price}</td><td>{s.delivery}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
