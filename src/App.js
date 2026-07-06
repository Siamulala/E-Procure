import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from "react-router-dom";
import "./App.css";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import Inventory from "./pages/Inventory";
import Purchase from "./pages/Purchase";
import Reporting from "./pages/Reporting";
import Support from "./pages/Support";
import Settings from "./pages/Settings";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import CompanyLogin from "./pages/CompanyLogin";
import Users from "./pages/Users";
import TestFlows from "./pages/TestFlows";

function App() {
  const [user, setUser] = useState(null);

  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [inventorySearch, setInventorySearch] = useState("");

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    const storedUsers = JSON.parse(localStorage.getItem("users") || "[]");
    if (storedUsers.length === 0) {
      const defaultUsers = [
        { name: "Admin", email: "admin@easyprocure.com", role: "Admin", password: "admin" },
        { name: "Lucas Obadoh", email: "lucas.Obadoh@easyproure.com", role: "Admin", password: "lucas1234" }
      ];
      localStorage.setItem("users", JSON.stringify(defaultUsers));
    } else {
      const hasLucas = storedUsers.some((u) => u.email === "lucas.Obadoh@easyproure.com");
      if (!hasLucas) {
        storedUsers.push({ name: "Lucas Obadoh", email: "lucas.Obadoh@easyproure.com", role: "Admin", password: "lucas1234" });
        localStorage.setItem("users", JSON.stringify(storedUsers));
      }
    }
    if (savedUser) setUser(JSON.parse(savedUser));
    setOrders(JSON.parse(localStorage.getItem("orders") || "[]"));
    setInventory(JSON.parse(localStorage.getItem("inventory") || "[]"));
    setPurchases(JSON.parse(localStorage.getItem("purchases") || "[]"));
    setNotifications(JSON.parse(localStorage.getItem("notifications") || "[]"));
  }, []);

  useEffect(() => {
    localStorage.setItem("user", JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    localStorage.setItem("orders", JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem("inventory", JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    localStorage.setItem("purchases", JSON.stringify(purchases));
  }, [purchases]);

  useEffect(() => {
    localStorage.setItem("notifications", JSON.stringify(notifications));
  }, [notifications]);

  const handleLogin = (u) => {
    setUser(u);
    localStorage.setItem("user", JSON.stringify(u));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("user");
  };

  const pushNotification = (msg) => {
    const next = [{ id: Date.now(), message: msg, date: new Date().toISOString() }, ...notifications];
    setNotifications(next);
  };

  const RequireAuth = ({ user }) => {
    if (!user) return <Navigate to="/login" replace />;
    return <Outlet />;
  };

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="app-shell">
        {user && <Sidebar user={user} />}
        <div className={`main-shell ${user ? "main-shell--with-sidebar" : ""}`}>
          {user && <Navbar user={user} onLogout={handleLogout} notifications={notifications} onSearch={setInventorySearch} />}
          <main className={`main-content ${user ? "main-content--with-nav" : "main-content--auth"}`}>
            <Routes>
              <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <CompanyLogin onLogin={handleLogin} />} />
              <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <CompanyLogin onLogin={handleLogin} />} />
              <Route path="/company-login" element={user ? <Navigate to="/dashboard" replace /> : <CompanyLogin onLogin={handleLogin} />} />

              <Route element={<RequireAuth user={user} />}>
                <Route path="/dashboard" element={<Dashboard user={user} orders={orders} inventory={inventory} purchases={purchases} />} />
                <Route path="/orders" element={<Orders orders={orders} setOrders={setOrders} user={user} />} />
                <Route path="/inventory" element={<Inventory inventory={inventory} setInventory={setInventory} user={user} searchTerm={inventorySearch} />} />
                <Route path="/purchase" element={<Purchase orders={orders} setOrders={setOrders} setInventory={setInventory} purchases={purchases} setPurchases={setPurchases} user={user} pushNotification={pushNotification} />} />
                <Route path="/test" element={<TestFlows user={user} setUser={setUser} orders={orders} setOrders={setOrders} purchases={purchases} setPurchases={setPurchases} inventory={inventory} setInventory={setInventory} pushNotification={pushNotification} />} />
                <Route path="/reporting" element={<Reporting orders={orders} purchases={purchases} inventory={inventory} />} />
                <Route path="/support" element={<Support />} />
                <Route path="/settings" element={<Settings user={user} setUser={setUser} />} />
                <Route path="/users" element={<Users />} />
              </Route>

              <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;
