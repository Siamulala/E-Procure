import React from "react";
import "../styles/Navbar.css";

export default function Navbar({ user }) {
  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-brand">
          <h1>Inventory Management</h1>
        </div>
        <div className="navbar-search">
          <input type="text" placeholder="Search..." className="search-input" />
          <span className="search-icon">🔍</span>
        </div>
        <div className="navbar-menu">
          <button className="icon-btn">🌙</button>
          <button className="icon-btn">🔔</button>
          <div className="navbar-user">
            <span className="user-avatar">👤</span>
            <span className="user-name">{user?.name || "Guest"}</span>
          </div>
          <button className="navbar-toggle">
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </div>
    </nav>
  );
}