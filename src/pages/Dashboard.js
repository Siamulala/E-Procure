import React, { useMemo, useState } from "react";
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
import "../styles/Pages.css";

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
  const [selectedSupplier, setSelectedSupplier] = useState(suppliers[0]?.name || "");
  const [selectedCategory, setSelectedCategory] = useState("Tools");

  const displayName = user?.name?.split(" ")?.[0] || "Guest";
  const roleName = user?.role || "Guest";

  const categories = React.useMemo(() => ["Tools", "ADSS Cables", "Drop Cables", "Accessories", "PPEs"], []);

  const categorySpend = useMemo(() => {
    return categories.map((category) => {
      const matching = (inventory || []).filter((item) => {
        const itemText = `${item.category || ""} ${item.item || ""}`.toLowerCase();
        return itemText.includes(category.toLowerCase()) || category.toLowerCase().includes(itemText);
      });
      const total = matching.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.amount) || 0)), 0);
      return { category, total };
    });
  }, [categories, inventory]);

  const monthlyExpenditure = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months.map((month) => {
      const monthValue = (inventory || []).reduce((sum, item) => {
        const matchesMonth = (item.date || "").includes(month.slice(0, 3)) || (item.month || "").toLowerCase() === month.toLowerCase();
        return sum + (matchesMonth ? ((Number(item.quantity) || 0) * (Number(item.amount) || 0)) : 0);
      }, 0);
      return { month, value: monthValue };
    });
  }, [inventory]);

  const annualExpenditure = monthlyExpenditure.reduce((sum, item) => sum + item.value, 0);
  const lowStockItems = (inventory || []).filter((item) => Number(item.quantity) <= 5).length;
  const activeSuppliers = suppliers.length;
  const pendingOrders = orders.filter((order) => order.status === "Pending").length;

  const overviewCards = [
    { title: "Monthly Expenditure", value: `$${monthlyExpenditure[0]?.value.toFixed(2) || "0.00"}`, icon: "📅", accent: "#ecfdf5" },
    { title: "Annual Expenditure", value: `$${annualExpenditure.toFixed(2)}`, icon: "🧾", accent: "#eff6ff" },
    { title: "Low Stock Items", value: lowStockItems, icon: "⚠️", accent: "#fff7ed" },
    { title: "Pending Orders", value: pendingOrders, icon: "🛒", accent: "#fdf2f8" }
  ];

  const inventoryTrendData = {
    labels: monthlyExpenditure.map((entry) => entry.month),
    datasets: [{
      label: "Monthly spend",
      data: monthlyExpenditure.map((entry) => entry.value),
      borderColor: "#2563eb",
      backgroundColor: "rgba(37, 99, 235, 0.2)",
      tension: 0.45,
      fill: true,
      pointRadius: 4,
      pointHoverRadius: 6,
    }]
  };

  const categorySpendData = {
    labels: categorySpend.map((entry) => entry.category),
    datasets: [{
      label: "Expenditure",
      data: categorySpend.map((entry) => entry.total),
      backgroundColor: ["#2563eb", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444"],
      borderWidth: 1,
    }]
  };

  const supplierSpendData = {
    labels: suppliers.map((supplier) => supplier.name),
    datasets: [{
      label: "Supplier spend",
      data: suppliers.map((supplier) => (supplier.totalSpend || 0)),
      backgroundColor: "#0f766e",
    }]
  };

  const selectedSupplierSpend = suppliers.find((supplier) => supplier.name === selectedSupplier);
  const selectedCategorySpend = categorySpend.find((entry) => entry.category === selectedCategory);
  const supplierScoreData = {
    labels: ["Delivery", "Cost", "Reliability", "Service"],
    datasets: [{
      label: selectedSupplier || "Supplier score",
      data: [
        selectedSupplierSpend?.deliveryScore || 0,
        selectedSupplierSpend?.costScore || 0,
        selectedSupplierSpend?.reliabilityScore || 0,
        selectedSupplierSpend?.serviceScore || 0,
      ],
      backgroundColor: "rgba(37, 99, 235, 0.2)",
      borderColor: "#2563eb",
      borderWidth: 2,
      fill: true,
    }]
  };

  const categoryScoreData = {
    labels: ["Demand", "Availability", "Risk", "Margin"],
    datasets: [{
      label: selectedCategory || "Category score",
      data: [
        selectedCategorySpend?.total ? Math.min(100, selectedCategorySpend.total / 100) : 0,
        selectedCategorySpend?.total ? Math.min(100, selectedCategorySpend.total / 120) : 0,
        selectedCategorySpend?.total ? Math.max(0, 100 - selectedCategorySpend.total / 200) : 0,
        selectedCategorySpend?.total ? Math.min(100, 70 + selectedCategorySpend.total / 1000) : 0,
      ],
      backgroundColor: "rgba(34, 197, 94, 0.2)",
      borderColor: "#22c55e",
      borderWidth: 2,
      fill: true,
    }]
  };

  if (!user) {
    return (
      <div className="page-shell">
        <div className="page-card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <p className="page-eyebrow">Secure access</p>
          <h2 className="page-title">Please sign in to view the dashboard</h2>
          <p className="page-subtitle">If you do not have an account, visit the users screen to create one.</p>
          <a className="primary-btn" href="/login" style={{ display: "inline-block", marginTop: "12px" }}>Go to Login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Procurement intelligence</p>
          <h1 className="page-title">Hi, {displayName}</h1>
          <p className="page-subtitle">{roleName} • {inventory.length} stock entries • {activeSuppliers} active suppliers</p>
        </div>
        <button onClick={() => window.print()} className="secondary-btn">📄 Print dashboard</button>
      </div>

      <div className="page-grid page-grid--cards">
        {overviewCards.map((card, idx) => (
          <div key={idx} className="page-card stat-card" style={{ background: card.accent }}>
            <div className="stat-icon">{card.icon}</div>
            <div>
              <p className="stat-title">{card.title}</p>
              <p className="stat-value">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="page-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div className="page-card">
          <div className="panel-heading">
            <h3 className="panel-title">Monthly spend</h3>
            <span className="soft-pill">Live trend</span>
          </div>
          <Line data={inventoryTrendData} options={{ responsive: true, plugins: { legend: { display: true } }, scales: { y: { beginAtZero: true } } }} />
        </div>
        <div className="page-card">
          <div className="panel-heading">
            <h3 className="panel-title">Category spend</h3>
            <span className="soft-pill">By category</span>
          </div>
          <Pie data={categorySpendData} options={{ responsive: true, plugins: { legend: { position: "bottom" } } }} />
        </div>
        <div className="page-card">
          <div className="panel-heading">
            <h3 className="panel-title">Supplier spend</h3>
            <span className="soft-pill">Performance</span>
          </div>
          <Bar data={supplierSpendData} options={{ responsive: true }} />
        </div>
        <div className="page-card">
          <div className="panel-heading">
            <h3 className="panel-title">Stock status</h3>
            <span className="soft-pill">Inventory health</span>
          </div>
          <Pie data={{
            labels: ["In Stock", "Low Stock", "Out of Stock"],
            datasets: [{
              data: [
                (inventory || []).filter((item) => Number(item.quantity) > 5).length,
                (inventory || []).filter((item) => Number(item.quantity) > 0 && Number(item.quantity) <= 5).length,
                (inventory || []).filter((item) => Number(item.quantity) === 0).length,
              ],
              backgroundColor: ["#22c55e", "#f59e0b", "#ef4444"]
            }]
          }} options={{ responsive: true, plugins: { legend: { position: "bottom" } } }} />
        </div>
      </div>

      <div className="page-card">
        <div className="panel-heading">
          <h3 className="panel-title">Supplier scorecard</h3>
          <select id="supplier-select" value={selectedSupplier} onChange={(event) => setSelectedSupplier(event.target.value)} className="input-field" style={{ maxWidth: 200 }}>
            {suppliers.map((supplier) => <option key={supplier.name} value={supplier.name}>{supplier.name}</option>)}
          </select>
        </div>
        <Bar data={supplierScoreData} options={{ responsive: true, scales: { r: { suggestedMin: 0, suggestedMax: 100 } } }} />
      </div>

      <div className="page-card">
        <div className="panel-heading">
          <h3 className="panel-title">Category scorecard</h3>
          <select id="category-select" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className="input-field" style={{ maxWidth: 200 }}>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </div>
        <Line data={categoryScoreData} options={{ responsive: true, scales: { y: { suggestedMin: 0, suggestedMax: 100 } } }} />
      </div>

      <div className="page-card">
        <h3 className="panel-title">Procurement summary</h3>
        <p className="panel-copy" style={{ marginTop: "6px" }}>
          You have {activeSuppliers} active supplier(s), {pendingOrders} pending order(s), and {lowStockItems} low-stock item(s) to review. The current annual spend is ${annualExpenditure.toFixed(2)} across the major categories.
        </p>
      </div>
    </div>
  );
}
