import React from "react";
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Pie, Bar, Line } from "react-chartjs-2";

ChartJS.register(
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

export default function Dashboard({ user, suppliers = [], orders = [], inventory = [], purchases = [] }) {
  if (!user) {
    return (
      <div style={{ padding: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <h2>Please sign in to view the dashboard</h2>
        <p>If you don't have an account, open <a href="/users">Users</a> to create one.</p>
        <a href="/login" style={{ marginTop: 12, padding: '10px 16px', background: '#36A2EB', color: '#fff', borderRadius: 6, textDecoration: 'none' }}>Go to Login</a>
      </div>
    );
  }

  const displayName = user?.name?.split(" ")?.[0] || "Guest";
  const profilePic = user?.profilePic || "/images/default-avatar.svg";
  const roleName = user?.role || "Guest";

  const overviewCards = [
    { title: "Active Suppliers", value: suppliers.length, icon: "🏭", color: "#E8F8F4" },
    { title: "Pending Orders", value: orders.filter(o => o.status === "Pending").length, icon: "🛒", color: "#E8F4F8" },
    { title: "Inventory Items", value: inventory.reduce((sum, item) => sum + (item.quantity || 0), 0), icon: "📦", color: "#F8F4E8" },
    { title: "Approvals Today", value: orders.filter(o => o.approvedDate === new Date().toDateString()).length, icon: "✅", color: "#F8E8E8" }
  ];

  const supplierData = { labels: suppliers.map(s => s.name), datasets: [{ label: "Delivery Score", data: suppliers.map(s => s.deliveryScore || 0), backgroundColor: "#4CAF50" }] };
  const departments = ["IT", "Finance", "HR", "Operations"];
  const deptRequestsData = { labels: departments, datasets: [{ label: "Approved", data: departments.map(d => orders.filter(o => o.department === d && o.status === "Approved").length), backgroundColor: "#36A2EB" }, { label: "Pending", data: departments.map(d => orders.filter(o => o.department === d && o.status === "Pending").length), backgroundColor: "#FF9800" }] };
  const purchaseTrendsData = { labels: (purchases || []).map(p => p.month), datasets: [{ label: "Purchases", data: (purchases || []).map(p => p.total || 0), borderColor: "#36A2EB", fill: false }, { label: "Requests", data: (purchases || []).map(p => p.requests || 0), borderColor: "#FF6384", fill: false }] };
  const inventoryData = { labels: ["In Stock", "Out of Stock"], datasets: [{ data: [(inventory || []).filter(i => i.quantity > 0).length, (inventory || []).filter(i => i.quantity === 0).length], backgroundColor: ["#4CAF50", "#FF6384"] }] };
  const orderPipelineData = { labels: ["Pending", "Approved", "Fulfilled"], datasets: [{ label: "Orders", data: [(orders || []).filter(o => o.status === "Pending").length, (orders || []).filter(o => o.status === "Approved").length, (orders || []).filter(o => o.status === "Fulfilled").length], backgroundColor: ["#FF9800", "#36A2EB", "#4CAF50"] }] };
  const budgetData = { labels: (purchases || []).map(p => p.month), datasets: [{ type: "line", label: "Expenses", data: (purchases || []).map(p => p.expense || 0), borderColor: "#FF6384" }, { type: "bar", label: "Budget", data: (purchases || []).map(p => p.budget || 0), backgroundColor: "#36A2EB" }] };

  const cardStyle = (bgColor) => ({ padding: "20px", borderRadius: "8px", backgroundColor: bgColor, border: "1px solid #ddd", display: "flex", alignItems: "center", gap: "15px", flex: "1", minWidth: "200px" });
  const chartContainerStyle = { backgroundColor: "#fff", padding: "20px", borderRadius: "8px", border: "1px solid #ddd", marginTop: "20px" };

  return (
    <div style={{ padding: "40px", backgroundColor: "#f5f5f5", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "20px" }}>
        <button onClick={() => window.print()} style={{ padding: "10px 20px", backgroundColor: "#16a34a", color: "#fff", border: "none", borderRadius: "5px", cursor: "pointer", fontWeight: 600 }}>📄 Print Dashboard</button>
      </div>

      <div style={{ marginBottom: "40px" }}>
        <h1 style={{ fontSize: "28px", color: "#333", margin: 0 }}>Hi, {displayName} 👋</h1>
        <img src={profilePic} alt="Profile" style={{ width: "80px", height: "80px", borderRadius: "50%", marginTop: "10px" }} />
        <p style={{ color: "#999", marginTop: "5px", fontSize: "14px" }}>Role: {roleName}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px", marginBottom: "40px" }}>
        {overviewCards.map((card, idx) => (
          <div key={idx} style={cardStyle(card.color)}>
            <div style={{ fontSize: "32px" }}>{card.icon}</div>
            <div>
              <div style={{ color: "#999", fontSize: "12px" }}>{card.title}</div>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#333" }}>{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={chartContainerStyle}><h3>Supplier Performance</h3><Bar data={supplierData} /></div>
      <div style={chartContainerStyle}><h3>Departmental Requests</h3><Bar data={deptRequestsData} options={{ plugins: { legend: { position: "bottom" } }, responsive: true }} /></div>
      <div style={chartContainerStyle}><h3>Purchase Trends</h3><Line data={purchaseTrendsData} /></div>
      <div style={chartContainerStyle}><h3>Inventory Status</h3><Pie data={inventoryData} /></div>
      <div style={chartContainerStyle}><h3>Order Pipeline</h3><Bar data={orderPipelineData} options={{ indexAxis: "y" }} /></div>
    </div>
  );
}