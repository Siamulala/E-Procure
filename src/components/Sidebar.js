import React from "react";
import { Link } from "react-router-dom";
import "../styles/Sidebar.css";

export default function Sidebar() {
    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <h2 className="sidebar-title">Easy-Procure</h2>
            </div>
            <nav className="sidebar-nav">
                <ul className="nav-list">
                    <li><Link to="/" className="nav-link">📊 Dashboard</Link></li>
                    <li><Link to="/inventory" className="nav-link">📦 Inventory</Link></li>
                    <li><Link to="/orders" className="nav-link">📝 Orders</Link></li>
                    <li><Link to="/purchase" className="nav-link">🛒 Purchase</Link></li>
                    <li><Link to="/reporting" className="nav-link">📈 Reporting</Link></li>
                    <li><Link to="/support" className="nav-link">💬 Support</Link></li>
                    <li><Link to="/settings" className="nav-link">⚙️ Settings</Link></li>
                </ul>
            </nav>
        </div>
    );
}   

