import React, { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useInventory } from "../contexts/InventoryContext";
import { canRoleViewMenu } from "../utils/menuAccess";
import "../styles/Sidebar.css";

const links = [
  { to: "/reporting", label: "Reporting", icon: "◌" },
  { to: "/support", label: "Support", icon: "✉" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

const groups = [
  { name: "Purchase", icon: "▣", links: [
    { to: "/inventory/purchase-orders", label: "Purchase Orders" },
    { to: "/inventory/purchase-requests", label: "Purchase Requests" },
    { to: "/inventory/quotations", label: "Purchase Quotation" },
  ] },
  { name: "Supplier", icon: "◇", links: [
    { to: "/inventory/suppliers", label: "Supplier Details" },
    { to: "/inventory/supplier-invoices", label: "Supplier Invoice" },
  ] },
  { name: "Stock", icon: "▤", links: [
    { to: "/inventory/stock-in", label: "Stock In" },
    { to: "/inventory/stock-out", label: "Stock Out" },
  ] },
];

export default function Sidebar({ user }) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    currentRole,
    setCurrentRole,
    notifications,
    markNotificationRead,
    roleMenuPermissions,
  } = useInventory();
  const canViewDashboard = canRoleViewMenu(user?.role, "/inventory/dashboard", roleMenuPermissions);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => Object.fromEntries(groups.map((group) => [group.name, false])));
  const [showNotifications, setShowNotifications] = useState(false);
  const visibleNotifications = notifications.filter((notification) => notification.targetRoles.includes(currentRole));
  const unreadCount = visibleNotifications.filter((notification) => !notification.read).length;
  const canViewInventory = canRoleViewMenu(user?.role, "/inventory", roleMenuPermissions);
  const hasInventoryChildren = canViewInventory || groups.some((group) => (
    group.links.some((link) => canRoleViewMenu(user?.role, link.to, roleMenuPermissions))
  ));
  const visibleCoreLinks = [...links, ...(user?.apiAuthenticated ? [
    { to: "/alwen/contracts", label: "Contracts", icon: "▤" },
    { to: "/alwen/reports", label: "Procurement reports", icon: "◌" },
    { to: "/alwen/notifications", label: "Notifications", icon: "◉" },
    ...(user.role === "Admin" ? [{ to: "/alwen/qbo", label: "QuickBooks", icon: "↔" }] : [])
  ] : [])].filter((link) => canRoleViewMenu(user?.role, link.to, roleMenuPermissions));

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="brand-badge">EP</div>
          <div>
            <p className="sidebar-eyebrow">Procurement control</p>
            <h2 className="sidebar-title">Easy-Procure</h2>
          </div>
        </div>
        {!user?.apiAuthenticated ? (
          <button
            type="button"
            className="sidebar-notification-toggle"
            aria-label={`Notifications, ${unreadCount} unread`}
            aria-expanded={showNotifications}
            aria-controls="sidebar-notifications"
            onClick={() => setShowNotifications((isOpen) => !isOpen)}
          >
            <span aria-hidden="true">🔔</span>
            {unreadCount > 0 ? <span className="sidebar-notification-count">{unreadCount}</span> : null}
          </button>
        ) : null}
      </div>

      {!user?.apiAuthenticated && showNotifications ? (
        <section id="sidebar-notifications" className="sidebar-notifications">
          <strong>Alerts for {currentRole} ({unreadCount} unread)</strong>
          {visibleNotifications.length ? visibleNotifications.map((notification) => (
            <button
              type="button"
              key={notification.id}
              className={`sidebar-notification-item ${notification.read ? "" : "unread"}`}
              onClick={() => {
                markNotificationRead(notification.id);
                setShowNotifications(false);
                navigate(notification.link);
              }}
            >
              <span>{notification.title}</span>
              <small>{notification.message}</small>
              <small>{notification.timestamp}</small>
            </button>
          )) : <p>No alerts for this role.</p>}
        </section>
      ) : null}

      {!user?.apiAuthenticated ? (
        <label className="sidebar-role-switcher" htmlFor="inventory-role">
          <span>Active role view</span>
          <select id="inventory-role" value={currentRole} onChange={(event) => setCurrentRole(event.target.value)}>
            <option value="Director">Director (Approver)</option>
            <option value="Procurement">Procurement Team</option>
            <option value="Requester">Department Staff</option>
          </select>
        </label>
      ) : null}

      <div className="sidebar-section">
        <p className="sidebar-section-label">Core modules</p>
        <nav className="sidebar-nav">
          <ul className="nav-list">
            {canViewDashboard ? (
              <li>
                <NavLink
                  to="/inventory/dashboard"
                  end
                  className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                >
                  <span className="nav-icon" aria-hidden="true">▦</span>
                  <span>Dashboard</span>
                </NavLink>
              </li>
            ) : null}
            {hasInventoryChildren ? <li className="nav-group">
              <button
                type="button"
                className={`nav-group-title ${location.pathname.startsWith("/inventory") && location.pathname !== "/inventory/dashboard" ? "active" : ""}`}
                aria-expanded={inventoryOpen}
                aria-controls="inventory-submenu"
                onClick={() => {
                  if (inventoryOpen) {
                    setOpenGroups(Object.fromEntries(groups.map((group) => [group.name, false])));
                  }
                  setInventoryOpen((current) => !current);
                }}
              >
                <span className="nav-icon" aria-hidden="true">▣</span>
                <span>Inventory</span>
                <span className="nav-group-arrow" aria-hidden="true">{inventoryOpen ? "▲" : "▼"}</span>
              </button>
              <ul id="inventory-submenu" className="nav-sublist" hidden={!inventoryOpen}>
                {canViewInventory ? (
                  <li><NavLink to="/inventory" end className={({ isActive }) => `nav-link nav-link--nested ${isActive ? "active" : ""}`}>
                    Inventory Stock
                  </NavLink></li>
                ) : null}
                {groups.map((group) => {
              const visibleLinks = group.links.filter((link) => canRoleViewMenu(user?.role, link.to, roleMenuPermissions));
              if (!visibleLinks.length) return null;
              const menuId = `${group.name.toLowerCase()}-submenu`;
              return (
                <li className="nav-group" key={group.name}>
                  <button
                    type="button"
                    className={`nav-group-title ${visibleLinks.some((link) => location.pathname === link.to) ? "active" : ""}`}
                    aria-expanded={openGroups[group.name]}
                    aria-controls={menuId}
                    onClick={() => setOpenGroups((current) => ({ ...current, [group.name]: !current[group.name] }))}
                  >
                    <span className="nav-icon" aria-hidden="true">{group.icon}</span>
                    <span>{group.name}</span>
                    <span className="nav-group-arrow" aria-hidden="true">{openGroups[group.name] ? "▲" : "▼"}</span>
                  </button>
                  <ul id={menuId} className="nav-sublist" hidden={!openGroups[group.name]}>
                    {visibleLinks.map((link) => (
                      <li key={link.to}>
                        <NavLink to={link.to} end className={({ isActive }) => `nav-link nav-link--nested ${isActive ? "active" : ""}`}>
                          {link.label}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </li>
              );
                })}
              </ul>
            </li> : null}
            {visibleCoreLinks.map((link) => {
              const isActive = location.pathname === link.to;
              return (
                <li key={link.to}>
                  <NavLink to={link.to} end className={`nav-link ${isActive ? "active" : ""}`}>
                    <span className="nav-icon">{link.icon}</span>
                    <span>{link.label}</span>
                  </NavLink>
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

