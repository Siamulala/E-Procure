import React from "react";
import { Link, useLocation } from "react-router-dom";
import "../styles/Sidebar.css";

const links = [
  { to: "/dashboard", label: "Dashboard", icon: "◉" },
  { to: "/inventory", label: "Inventory", icon: "▣" },
  { to: "/orders", label: "Orders", icon: "☰" },
  { to: "/purchase", label: "Purchase", icon: "🛒" },
  { to: "/reporting", label: "Reporting", icon: "◌" },
  { to: "/support", label: "Support", icon: "✉" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

export default function Sidebar({ user }) {
  const location = useLocation();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand-badge">EP</div>
        <div>
          <p className="sidebar-eyebrow">Procurement control</p>
          <h2 className="sidebar-title">Easy-Procure</h2>
        </div>
      </div>

      <div className="sidebar-section">
        <p className="sidebar-section-label">Core modules</p>
        <nav className="sidebar-nav">
          <ul className="nav-list">
            {[...links, ...(user?.apiAuthenticated ? [
              { to: "/alwen/suppliers", label: "Suppliers", icon: "◇" },
              { to: "/alwen/contracts", label: "Contracts", icon: "▤" },
              { to: "/alwen/invoices", label: "Invoices", icon: "▧" },
              { to: "/alwen/reports", label: "Procurement reports", icon: "◌" },
              { to: "/alwen/notifications", label: "Notifications", icon: "◉" },
              ...(user.role === "Admin" ? [{ to: "/alwen/qbo", label: "QuickBooks", icon: "↔" }] : [])
            ] : [])].map((link) => {
              const isActive = location.pathname === link.to;
              return (
                <li key={link.to}>
                  <Link to={link.to} className={`nav-link ${isActive ? "active" : ""}`}>
                    <span className="nav-icon">{link.icon}</span>
                    <span>{link.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-footer-card">
          <strong>Procurement flow</strong>
          <span>Track demand, suppliers, and stock in one place.</span>
        </div>
      </div>
    </aside>
  );
}

