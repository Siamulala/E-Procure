import React, { useState } from "react";
import "../styles/Pages.css";

export default function Reporting({ orders = [], purchases = [], inventory = [] }) {
  const [reportType, setReportType] = useState("summary");

  const purchaseStats = {
    total: purchases.length,
    pending: purchases.filter(p => p.status === "Pending").length,
    approved: purchases.filter(p => p.status === "Approved").length,
    purchased: purchases.filter(p => p.status === "Purchased").length
  };

  const orderStats = {
    total: orders.length,
    pending: orders.filter(o => o.status === "Pending").length,
    approved: orders.filter(o => o.status === "Approved").length,
    fulfilled: orders.filter(o => o.status === "Fulfilled").length
  };

  const inventoryStats = {
    totalItems: inventory.length,
    totalValue: inventory.reduce((sum, i) => sum + ((parseFloat(i.amount) || 0) * i.quantity), 0)
  };

  const printReport = () => {
    const w = window.open("", "_blank");
    const html = `
      <html><head><title>Operations Report</title><style>body{font-family:Arial;margin:20px}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #ddd;padding:10px;text-align:left}th{background:#f0f0f0}.summary{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin:20px 0}.stat{background:#f5f5f5;padding:15px;border-radius:5px;text-align:center}h2{margin-top:30px}</style></head><body>
      <h1>Operations Report</h1>
      <p>Generated: ${new Date().toLocaleString()}</p>
      <div class="summary">
        <div class="stat"><h3>${purchaseStats.total}</h3><p>Total Purchases</p></div>
        <div class="stat"><h3>${orderStats.total}</h3><p>Total Orders</p></div>
        <div class="stat"><h3>${inventory.length}</h3><p>Items</p></div>
        <div class="stat"><h3>$${inventoryStats.totalValue.toFixed(2)}</h3><p>Inventory Value</p></div>
      </div>
      <h2>Details</h2>
      <p>See below for detailed statistics and information.</p>
      <button onclick="window.print()" style="margin-top:20px;padding:10px 20px">Print</button>
      </body></html>
    `;
    w.document.write(html);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Reporting & Analytics</h1>
        <p>Comprehensive insights on purchases, orders, and inventory.</p>
      </div>

      <div style={{ marginBottom: "20px", display: "flex", gap: "10px" }}>
        <button onClick={() => setReportType("summary")} style={{ padding: "10px 20px", backgroundColor: reportType === "summary" ? "#1d4ed8" : "#ddd", color: reportType === "summary" ? "#fff" : "#000", border: "none", borderRadius: "5px", cursor: "pointer" }}>Summary</button>
        <button onClick={() => setReportType("purchases")} style={{ padding: "10px 20px", backgroundColor: reportType === "purchases" ? "#1d4ed8" : "#ddd", color: reportType === "purchases" ? "#fff" : "#000", border: "none", borderRadius: "5px", cursor: "pointer" }}>Purchases</button>
        <button onClick={() => setReportType("orders")} style={{ padding: "10px 20px", backgroundColor: reportType === "orders" ? "#1d4ed8" : "#ddd", color: reportType === "orders" ? "#fff" : "#000", border: "none", borderRadius: "5px", cursor: "pointer" }}>Orders</button>
        <button onClick={() => setReportType("inventory")} style={{ padding: "10px 20px", backgroundColor: reportType === "inventory" ? "#1d4ed8" : "#ddd", color: reportType === "inventory" ? "#fff" : "#000", border: "none", borderRadius: "5px", cursor: "pointer" }}>Inventory</button>
        <button onClick={printReport} style={{ padding: "10px 20px", backgroundColor: "#16a34a", color: "#fff", border: "none", borderRadius: "5px", cursor: "pointer", marginLeft: "auto" }}>📄 Print</button>
      </div>

      {reportType === "summary" && (
        <div>
          <h2 style={{ marginBottom: "20px" }}>Operations Summary</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "15px", marginBottom: "30px" }}>
            <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", textAlign: "center" }}>
              <h3 style={{ color: "#1d4ed8", marginBottom: "10px" }}>{purchaseStats.total}</h3>
              <p>Total Purchases</p>
            </div>
            <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", textAlign: "center" }}>
              <h3 style={{ color: "#16a34a", marginBottom: "10px" }}>{purchaseStats.approved}</h3>
              <p>Approved</p>
            </div>
            <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", textAlign: "center" }}>
              <h3 style={{ color: "#2196f3", marginBottom: "10px" }}>{orderStats.total}</h3>
              <p>Total Orders</p>
            </div>
            <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", textAlign: "center" }}>
              <h3 style={{ color: "#ff9800", marginBottom: "10px" }}>${inventoryStats.totalValue.toFixed(2)}</h3>
              <p>Inventory Value</p>
            </div>
          </div>
          <h3>Purchase Distribution</h3>
          <table border="1" cellPadding="10" style={{ width: "100%", background: "#fff", marginBottom: "20px" }}>
            <thead style={{ backgroundColor: "#f0f0f0" }}><tr><th>Status</th><th>Count</th><th>%</th></tr></thead>
            <tbody>
              <tr><td>Pending</td><td>{purchaseStats.pending}</td><td>{((purchaseStats.pending / (purchaseStats.total || 1)) * 100).toFixed(1)}%</td></tr>
              <tr><td>Approved</td><td>{purchaseStats.approved}</td><td>{((purchaseStats.approved / (purchaseStats.total || 1)) * 100).toFixed(1)}%</td></tr>
              <tr><td>Purchased</td><td>{purchaseStats.purchased}</td><td>{((purchaseStats.purchased / (purchaseStats.total || 1)) * 100).toFixed(1)}%</td></tr>
            </tbody>
          </table>
          <h3>Order Distribution</h3>
          <table border="1" cellPadding="10" style={{ width: "100%", background: "#fff" }}>
            <thead style={{ backgroundColor: "#f0f0f0" }}><tr><th>Status</th><th>Count</th><th>%</th></tr></thead>
            <tbody>
              <tr><td>Pending</td><td>{orderStats.pending}</td><td>{((orderStats.pending / (orderStats.total || 1)) * 100).toFixed(1)}%</td></tr>
              <tr><td>Approved</td><td>{orderStats.approved}</td><td>{((orderStats.approved / (orderStats.total || 1)) * 100).toFixed(1)}%</td></tr>
              <tr><td>Fulfilled</td><td>{orderStats.fulfilled}</td><td>{((orderStats.fulfilled / (orderStats.total || 1)) * 100).toFixed(1)}%</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {reportType === "purchases" && (
        <div>
          <h2>Purchase Requests</h2>
          <table border="1" cellPadding="10" style={{ width: "100%", background: "#fff" }}>
            <thead style={{ backgroundColor: "#f0f0f0" }}><tr><th>Item</th><th>Qty</th><th>Suppliers</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {purchases.length > 0 ? purchases.map((p, i) => <tr key={i}><td>{p.item}</td><td>{p.quantity}</td><td>{p.suppliers?.length || 0}</td><td>{p.status}</td><td>{p.date}</td></tr>) : <tr><td colSpan="5">No data</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {reportType === "orders" && (
        <div>
          <h2>Orders</h2>
          <table border="1" cellPadding="10" style={{ width: "100%", background: "#fff" }}>
            <thead style={{ backgroundColor: "#f0f0f0" }}><tr><th>Department</th><th>Item</th><th>Qty</th><th>Supplier</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {orders.length > 0 ? orders.map((o, i) => <tr key={i}><td>{o.department}</td><td>{o.item}</td><td>{o.quantity}</td><td>{o.supplier}</td><td>{o.status}</td><td>{o.date}</td></tr>) : <tr><td colSpan="6">No data</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {reportType === "inventory" && (
        <div>
          <h2>Inventory - Top 20 by Value</h2>
          <table border="1" cellPadding="10" style={{ width: "100%", background: "#fff" }}>
            <thead style={{ backgroundColor: "#f0f0f0" }}><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th><th>Supplier</th></tr></thead>
            <tbody>
              {inventory.length > 0 ? inventory.sort((a, b) => ((parseFloat(b.amount) || 0) * b.quantity) - ((parseFloat(a.amount) || 0) * a.quantity)).slice(0, 20).map((i, idx) => <tr key={idx}><td>{i.item}</td><td>{i.quantity}</td><td>${(parseFloat(i.amount) || 0).toFixed(2)}</td><td>${((parseFloat(i.amount) || 0) * i.quantity).toFixed(2)}</td><td>{i.supplier}</td></tr>) : <tr><td colSpan="5">No data</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
