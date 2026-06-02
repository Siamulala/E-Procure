import React, { useState, useEffect } from "react";
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
const neutralBtn = { ...buttonStyle, backgroundColor: "#6c757d" };

const defaultCompany = {
  name: "Easy Procure Ltd.",
  address: "221 B Procurement Avenue, Commerce City",
  phone: "(555) 123-4567",
  email: "info@easyprocure.com"
};

export default function Purchase({ purchases = [], setPurchases = () => {}, setInventory = () => {}, user, pushNotification }) {
  const [activeTab, setActiveTab] = useState("requests");
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [purchaseQuotations, setPurchaseQuotations] = useState([]);
  const [newReq, setNewReq] = useState({ item: "", description: "", quantity: "", suppliers: [], status: "Pending", date: "" });
  const [newSupplier, setNewSupplier] = useState({ name: "", price: "", delivery: "" });
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({ item: "", description: "", quantity: "", date: "", suppliers: [], status: "Pending" });
  const [companyDetails, setCompanyDetails] = useState(defaultCompany);

  useEffect(() => {
    const storedOrders = JSON.parse(localStorage.getItem("purchaseOrders") || "[]");
    const storedQuotations = JSON.parse(localStorage.getItem("purchaseQuotations") || "[]");
    const storedCompany = JSON.parse(localStorage.getItem("companyDetails") || "null");
    setPurchaseOrders(storedOrders);
    setPurchaseQuotations(storedQuotations);
    if (storedCompany) setCompanyDetails(storedCompany);
  }, []);

  useEffect(() => {
    localStorage.setItem("purchaseOrders", JSON.stringify(purchaseOrders));
  }, [purchaseOrders]);

  useEffect(() => {
    localStorage.setItem("purchaseQuotations", JSON.stringify(purchaseQuotations));
  }, [purchaseQuotations]);

  useEffect(() => {
    localStorage.setItem("companyDetails", JSON.stringify(companyDetails));
  }, [companyDetails]);

  const currentData = activeTab === "requests" ? purchases : activeTab === "orders" ? purchaseOrders : purchaseQuotations;
  const setCurrentData = (next) => {
    if (activeTab === "requests") setPurchases(next);
    if (activeTab === "orders") setPurchaseOrders(next);
    if (activeTab === "quotations") setPurchaseQuotations(next);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedRows(new Set());
    setEditingItem(null);
    setEditForm({ item: "", description: "", quantity: "", date: "", suppliers: [], status: "Pending" });
  };

  const handleChange = (e) => setNewReq({ ...newReq, [e.target.name]: e.target.value });
  const handleCompanyChange = (e) => setCompanyDetails({ ...companyDetails, [e.target.name]: e.target.value });

  const addSupplierToRequest = () => {
    if (!newSupplier.name || !newSupplier.price) return alert("Supplier name and price required");
    setNewReq({ ...newReq, suppliers: [...newReq.suppliers, newSupplier] });
    setNewSupplier({ name: "", price: "", delivery: "" });
  };

  const removeSupplier = (idx) => {
    setNewReq({ ...newReq, suppliers: newReq.suppliers.filter((_, i) => i !== idx) });
  };

  const addRequest = (e) => {
    e.preventDefault();
    if (!newReq.item || !newReq.quantity) return alert("Please add item and quantity");
    if (!newReq.suppliers || newReq.suppliers.length === 0) return alert("Please add at least one supplier");
    const next = [...purchases, { ...newReq, quantity: parseInt(newReq.quantity, 10), status: "Pending" }];
    setPurchases(next);
    setNewReq({ item: "", description: "", quantity: "", suppliers: [], status: "Pending", date: "" });
    alert("Purchase request created successfully!");
  };

  const toggleSelectRow = (index) => {
    const updated = new Set(selectedRows);
    if (updated.has(index)) updated.delete(index);
    else updated.add(index);
    setSelectedRows(updated);
  };

  const clearSelection = () => {
    setSelectedRows(new Set());
    setEditingItem(null);
  };

  const selectedIndices = Array.from(selectedRows).sort((a, b) => a - b);
  const selectedIndex = selectedIndices.length === 1 ? selectedIndices[0] : null;
  const selectedItems = currentData.filter((_, idx) => selectedRows.has(idx));

  const getDisplaySupplier = (item) => item.suppliers?.[0]?.name || "-";

  const previewPrintDocument = (items, type) => {
    if (!items.length) return alert("Select an item to print.");
    const contentRows = items.map((item, idx) => {
      const suppliersHtml = (item.suppliers || [])
        .map((s) => `<tr><td>${s.name}</td><td>${s.price}</td><td>${s.delivery}</td></tr>`)
        .join("");
      return `
        <section style="margin-top:24px;">
          <h2 style="margin-bottom:8px">${type === "requests" ? "Request" : type === "orders" ? "Purchase Order" : "Quotation"} #${idx + 1}</h2>
          <p><strong>Item:</strong> ${item.item}</p>
          <p><strong>Description:</strong> ${item.description || "-"}</p>
          <p><strong>Quantity:</strong> ${item.quantity}</p>
          <p><strong>Status:</strong> ${item.status || "Pending"}</p>
          <p><strong>Date:</strong> ${item.date || item.createdDate || new Date().toISOString().slice(0, 10)}</p>
          <p><strong>Supplier:</strong> ${getDisplaySupplier(item)}</p>
          <table border="1" cellpadding="8" cellspacing="0" style="width:100%; margin-top:12px; border-collapse:collapse;">
            <thead style="background:#f0f0f0;"><tr><th>Supplier</th><th>Price</th><th>Delivery</th></tr></thead>
            <tbody>${suppliersHtml}</tbody>
          </table>
        </section>
      `;
    }).join("");

    const w = window.open("", "_blank");
    w.document.write(`
      <html>
        <head>
          <title>${type === "requests" ? "Purchase Request" : type === "orders" ? "Purchase Order" : "Purchase Quotation"}</title>
        </head>
        <body style="font-family:Arial, sans-serif; margin:24px; color:#1f2937;">
          <header style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px;">
            <div>
              <h1 style="margin:0;">${companyDetails.name}</h1>
              <p style="margin:6px 0 0;">${companyDetails.address}</p>
              <p style="margin:4px 0 0;">${companyDetails.phone} | ${companyDetails.email}</p>
            </div>
            <div style="text-align:right;">
              <p style="margin:0; font-weight:700;">${type === "requests" ? "Purchase Request" : type === "orders" ? "Purchase Order" : "Quotation"}</p>
              <p style="margin:6px 0 0;">Generated: ${new Date().toLocaleDateString()}</p>
            </div>
          </header>
          ${contentRows}
          <footer style="margin-top:32px; border-top:1px solid #d1d5db; padding-top:16px; font-size:13px; color:#6b7280;">
            <p>Prepared by: ${user?.name || "Procurement Team"}</p>
            <p>Company: ${companyDetails.name}</p>
          </footer>
          <button onclick="window.print()" style="margin-top:20px; padding:10px 20px; background:#1d4ed8; color:#fff; border:none; border-radius:6px; cursor:pointer;">Print</button>
        </body>
      </html>
    `);
  };

  const applyEditChanges = () => {
    if (!editingItem) return;
    const next = currentData.map((row, idx) => {
      if (idx !== editingItem.index) return row;
      return {
        ...row,
        ...editForm,
        quantity: parseInt(editForm.quantity, 10) || 0,
        suppliers: editForm.suppliers || row.suppliers || []
      };
    });
    setCurrentData(next);
    setEditingItem(null);
    setSelectedRows(new Set());
    alert("Changes saved successfully.");
  };

  const deleteSelectedAction = () => {
    if (!selectedItems.length) return;
    if (!window.confirm(`Delete ${selectedItems.length} item(s)?`)) return;
    const next = currentData.filter((_, idx) => !selectedRows.has(idx));
    setCurrentData(next);
    clearSelection();
  };

  const beginEdit = () => {
    if (selectedIndices.length !== 1) {
      return alert("Please select a single item to edit.");
    }
    const item = currentData[selectedIndex];
    setEditingItem({ index: selectedIndex });
    setEditForm({
      item: item.item || "",
      description: item.description || "",
      quantity: item.quantity || "",
      date: item.date || item.createdDate || "",
      suppliers: item.suppliers || [],
      status: item.status || "Pending"
    });
  };

  const convertToOrder = () => {
    if (activeTab !== "requests") return;
    if (!selectedItems.length) return alert("Select at least one request to convert to a purchase order.");
    const nextOrders = selectedItems.map((item, index) => ({
      ...item,
      orderNumber: `PO-${Date.now()}-${index + 1}`,
      status: "Order Created",
      createdDate: item.date || new Date().toISOString().slice(0, 10)
    }));
    setPurchaseOrders([...purchaseOrders, ...nextOrders]);
    clearSelection();
    alert("Selected requests converted to purchase orders.");
  };

  const convertToQuotation = () => {
    if (activeTab !== "requests") return;
    if (!selectedItems.length) return alert("Select at least one request to convert to a quotation.");
    const nextQuotations = selectedItems.map((item, index) => ({
      ...item,
      quoteNumber: `Q-${Date.now()}-${index + 1}`,
      status: "Quotation Prepared",
      createdDate: item.date || new Date().toISOString().slice(0, 10)
    }));
    setPurchaseQuotations([...purchaseQuotations, ...nextQuotations]);
    clearSelection();
    alert("Selected requests converted to quotations.");
  };

  const renderTableRow = (item, idx) => (
    <tr key={idx} style={{ backgroundColor: selectedRows.has(idx) ? "#e3f2fd" : "white", borderBottom: "1px solid #ddd" }}>
      <td><input type="checkbox" checked={selectedRows.has(idx)} onChange={() => toggleSelectRow(idx)} /></td>
      <td>{idx + 1}</td>
      <td>
        <strong>{item.item}</strong>
        <br />
        <small style={{ color: "#666" }}>{item.description || "No description"}</small>
      </td>
      <td>{item.quantity}</td>
      <td>{item.suppliers?.length || 0}</td>
      <td>{getDisplaySupplier(item)}</td>
      <td>{item.status || "Pending"}</td>
      <td>{item.date || item.createdDate || "-"}</td>
    </tr>
  );

  const tabLabels = [
    { key: "requests", label: "Purchase Requests" },
    { key: "orders", label: "Purchase Orders" },
    { key: "quotations", label: "Purchase Quotations" }
  ];

  const renderTableData = () => {
    if (!currentData.length) {
      return (
        <tr>
          <td colSpan="8" style={{ textAlign: "center", padding: "24px", color: "#6b7280" }}>
            No items available in this section.
          </td>
        </tr>
      );
    }
    return currentData.map(renderTableRow);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Purchase Management</h1>
        <p>Manage purchase requests, orders, and quotations from one shared workflow.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
        <div className="card" style={{ background: "#fff" }}>
          <div className="card-title">Company Details</div>
          <div className="card-content" style={{ display: "grid", gap: "10px" }}>
            <input name="name" placeholder="Company Name" value={companyDetails.name} onChange={handleCompanyChange} />
            <input name="address" placeholder="Company Address" value={companyDetails.address} onChange={handleCompanyChange} />
            <input name="phone" placeholder="Phone" value={companyDetails.phone} onChange={handleCompanyChange} />
            <input name="email" placeholder="Email" value={companyDetails.email} onChange={handleCompanyChange} />
          </div>
        </div>

        <div className="card" style={{ background: "#fff" }}>
          <div className="card-title">Create New Request</div>
          <div className="card-content">
            <form onSubmit={addRequest} style={{ display: "grid", gap: "12px" }}>
              <input name="item" placeholder="Item" value={newReq.item} onChange={handleChange} />
              <textarea name="description" placeholder="Item Description" value={newReq.description} onChange={handleChange} style={{ padding: "10px", border: "1px solid #ddd", borderRadius: "5px", minHeight: "60px" }} />
              <input name="quantity" type="number" placeholder="Quantity" value={newReq.quantity} onChange={handleChange} />
              <input name="date" type="date" value={newReq.date} onChange={handleChange} />

              <div style={{ background: "#f5f5f5", padding: "15px", borderRadius: "5px" }}>
                <h4>Add Supplier Details</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "10px" }}>
                  <input placeholder="Supplier Name" value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} />
                  <input placeholder="Price" type="number" value={newSupplier.price} onChange={(e) => setNewSupplier({ ...newSupplier, price: e.target.value })} />
                  <input placeholder="Delivery Days" type="number" value={newSupplier.delivery} onChange={(e) => setNewSupplier({ ...newSupplier, delivery: e.target.value })} />
                  <button type="button" onClick={addSupplierToRequest} style={{ ...primaryBtn, padding: "8px 16px" }}>Add</button>
                </div>

                {newReq.suppliers.length > 0 && (
                  <div style={{ marginTop: "12px" }}>
                    <h5>Current supplier quote list</h5>
                    {newReq.suppliers.map((supplier, idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px", background: "#fff", marginTop: "8px", borderRadius: "4px", border: "1px solid #e5e7eb" }}>
                        <div>
                          <div><strong>{supplier.name}</strong></div>
                          <div>${supplier.price} · {supplier.delivery} days</div>
                        </div>
                        <button type="button" onClick={() => removeSupplier(idx)} style={{ ...dangerBtn, padding: "6px 12px", fontSize: "12px" }}>Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button type="submit" style={{ ...primaryBtn, padding: "12px", fontSize: "14px" }}>Create Request</button>
            </form>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px" }}>
        {tabLabels.map((tab) => (
          <button key={tab.key} onClick={() => handleTabChange(tab.key)} style={{
            ...buttonStyle,
            backgroundColor: activeTab === tab.key ? "#1d4ed8" : "#e5e7eb",
            color: activeTab === tab.key ? "#fff" : "#111"
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {selectedRows.size > 0 && (
        <div style={{ background: "#e7f5ff", padding: "18px", borderRadius: "10px", display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", marginBottom: "20px" }}>
          <strong>{selectedRows.size} item(s) selected</strong>
          <button onClick={beginEdit} style={primaryBtn}>Edit</button>
          <button onClick={applyEditChanges} style={successBtn} disabled={!editingItem}>Save</button>
          <button onClick={deleteSelectedAction} style={dangerBtn}>Delete</button>
          <button onClick={() => previewPrintDocument(selectedItems, activeTab)} style={neutralBtn}>Print</button>
          {activeTab === "requests" && <button onClick={convertToOrder} style={successBtn}>Convert to Order</button>}
          {activeTab === "requests" && <button onClick={convertToQuotation} style={primaryBtn}>Convert to Quotation</button>}
          <button onClick={clearSelection} style={{ ...buttonStyle, backgroundColor: "#9ca3af" }}>Clear Selection</button>
        </div>
      )}

      <div style={{ overflowX: "auto", background: "#fff", borderRadius: "12px", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
        <table border="1" cellPadding="10" style={{ width: "100%", minWidth: "900px", borderCollapse: "collapse" }}>
          <thead style={{ backgroundColor: "#f8fafc" }}>
            <tr>
              <th style={{ width: "40px" }}>
                <input type="checkbox" onChange={(e) => {
                  if (e.target.checked) setSelectedRows(new Set(currentData.map((_, idx) => idx)));
                  else setSelectedRows(new Set());
                }} />
              </th>
              <th style={{ width: "40px" }}>#</th>
              <th>Item</th>
              <th>Quantity</th>
              <th>Quotes</th>
              <th>Primary Supplier</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {renderTableData()}
          </tbody>
        </table>
      </div>

      {editingItem && (
        <div style={{ marginTop: "24px", padding: "20px", background: "#fff", borderRadius: "12px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
          <h2>Edit Selected {activeTab === "requests" ? "Request" : activeTab === "orders" ? "Order" : "Quotation"}</h2>
          <div style={{ display: "grid", gap: "16px", marginTop: "16px" }}>
            <input value={editForm.item} onChange={(e) => setEditForm({ ...editForm, item: e.target.value })} placeholder="Item" />
            <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Description" style={{ minHeight: "80px", padding: "10px", borderRadius: "8px", border: "1px solid #d1d5db" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <input value={editForm.quantity} onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} placeholder="Quantity" type="number" />
              <input value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} placeholder="Date" type="date" />
            </div>
            <input value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} placeholder="Status" />
            <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px" }}>
              <h4>Supplier details</h4>
              {editForm.suppliers.length ? editForm.suppliers.map((supplier, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "10px", alignItems: "center", marginTop: "10px" }}>
                  <input value={supplier.name} onChange={(e) => {
                    const updated = [...editForm.suppliers];
                    updated[idx] = { ...updated[idx], name: e.target.value };
                    setEditForm({ ...editForm, suppliers: updated });
                  }} placeholder="Supplier name" />
                  <input value={supplier.price} onChange={(e) => {
                    const updated = [...editForm.suppliers];
                    updated[idx] = { ...updated[idx], price: e.target.value };
                    setEditForm({ ...editForm, suppliers: updated });
                  }} placeholder="Price" type="number" />
                  <input value={supplier.delivery} onChange={(e) => {
                    const updated = [...editForm.suppliers];
                    updated[idx] = { ...updated[idx], delivery: e.target.value };
                    setEditForm({ ...editForm, suppliers: updated });
                  }} placeholder="Delivery days" type="number" />
                  <button type="button" onClick={() => {
                    const updated = [...editForm.suppliers];
                    updated.splice(idx, 1);
                    setEditForm({ ...editForm, suppliers: updated });
                  }} style={{ ...dangerBtn, padding: "8px 12px", fontSize: "12px" }}>Remove</button>
                </div>
              )) : <p style={{ color: "#6b7280" }}>No supplier quotes attached.</p>}
            </div>
            <button onClick={applyEditChanges} style={{ ...successBtn, width: "fit-content" }}>Save changes</button>
          </div>
        </div>
      )}
    </div>
  );
}
