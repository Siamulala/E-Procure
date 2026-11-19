import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import "./App.css";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import InventoryDashboard from "./pages/InventoryDashboard";
import InventorySubmenu from "./pages/InventorySubmenu";
import InventoryStock from "./pages/InventoryStock";
import PurchaseRequests from "./pages/PurchaseRequests";
import Quotations from "./pages/Quotations";
import SupplierInvoices from "./pages/SupplierInvoices";
import Purchase from "./pages/Purchase";
import Reporting from "./pages/Reporting";
import Support from "./pages/Support";
import Settings from "./pages/Settings";
import Orders from "./pages/Orders";
import CompanyLogin from "./pages/CompanyLogin";
import Users from "./pages/Users";
import TestFlows from "./pages/TestFlows";
import AlwenOperations from "./pages/alwen/AlwenOperations";
import AlwenFeatures from "./pages/alwen/AlwenFeatures";
import AlwenAnalytics from "./pages/alwen/AlwenAnalytics";
import { InventoryProvider, useInventory } from "./contexts/InventoryContext";
import { canRoleViewMenu } from "./utils/menuAccess";
import { alwenApiRequest, isAlwenApiConfigured } from "./services/alwenApi";

function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    const storedUsers = JSON.parse(localStorage.getItem("users") || "[]");
    if (!isAlwenApiConfigured() && storedUsers.length === 0) {
      const defaultUsers = [
        { name: "Admin", email: "admin@easyprocure.com", role: "Admin", password: "admin" },
        { name: "Lucas Obadoh", email: "lucas.Obadoh@easyproure.com", role: "Admin", password: "lucas1234" }
      ];
      localStorage.setItem("users", JSON.stringify(defaultUsers));
    } else if (!isAlwenApiConfigured()) {
      const hasLucas = storedUsers.some((u) => u.email === "lucas.Obadoh@easyproure.com");
      if (!hasLucas) {
        storedUsers.push({ name: "Lucas Obadoh", email: "lucas.Obadoh@easyproure.com", role: "Admin", password: "lucas1234" });
        localStorage.setItem("users", JSON.stringify(storedUsers));
      }
    }
    if (savedUser) {
      const restoredUser = JSON.parse(savedUser);
      if (restoredUser?.apiAuthenticated && !sessionStorage.getItem("alwenApiToken")) {
        localStorage.removeItem("user");
      } else {
        setUser(restoredUser);
      }
    }
    setAuthReady(true);
    setOrders(JSON.parse(localStorage.getItem("orders") || "[]"));
    setInventory(JSON.parse(localStorage.getItem("inventory") || "[]"));
    setPurchases(JSON.parse(localStorage.getItem("purchases") || "[]"));
    setNotifications(JSON.parse(localStorage.getItem("notifications") || "[]"));
  }, []);

  useEffect(() => {
    if (user) localStorage.setItem("user", JSON.stringify(user));
    else localStorage.removeItem("user");
  }, [user]);

  useEffect(() => {
    const expireApiSession = () => {
      sessionStorage.removeItem("alwenApiToken");
      localStorage.removeItem("user");
      setUser(null);
    };
    window.addEventListener("alwen:session-expired", expireApiSession);
    return () => window.removeEventListener("alwen:session-expired", expireApiSession);
  }, []);

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
    if (u.apiToken) {
      const { apiToken, ...profile } = u;
      sessionStorage.setItem("alwenApiToken", apiToken);
      setUser(profile);
      localStorage.setItem("user", JSON.stringify(profile));
      return;
    }
    setUser(u);
    localStorage.setItem("user", JSON.stringify(u));
  };

  const handleLogout = async () => {
    if (sessionStorage.getItem("alwenApiToken")) {
      try {
        await alwenApiRequest("/auth/logout", { method: "POST" });
      } catch (error) {
        console.error("Could not revoke the Alwen API session during logout.", error);
      }
    }
    sessionStorage.removeItem("alwenApiToken");
    setUser(null);
    localStorage.removeItem("user");
  };

  const pushNotification = (msg) => {
    const next = [{ id: Date.now(), message: msg, date: new Date().toISOString() }, ...notifications];
    setNotifications(next);
  };

  const RequireAuth = ({ user }) => {
    const { pathname } = useLocation();
    const { roleMenuPermissions } = useInventory();
    if (!authReady) return null;
    if (!user) return <Navigate to="/login" replace />;
    if (!canRoleViewMenu(user.role, pathname, roleMenuPermissions)) {
      return (
        <div className="page-card" role="alert">
          <h1 className="page-title">Access restricted</h1>
          <p className="page-subtitle">Your role does not have permission to view this menu. Contact an administrator if access is needed.</p>
        </div>
      );
    }
    return <Outlet />;
  };

  return (
    <InventoryProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <div className="app-shell">
          {user && <Sidebar user={user} />}
          <div className={`main-shell ${user ? "main-shell--with-sidebar" : ""}`}>
            {user && <Navbar user={user} onLogout={handleLogout} notifications={notifications} />}
            <main className={`main-content ${user ? "main-content--with-nav" : "main-content--auth"}`}>
              <Routes>
                <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <CompanyLogin onLogin={handleLogin} />} />
                <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <CompanyLogin onLogin={handleLogin} />} />
                <Route path="/company-login" element={user ? <Navigate to="/dashboard" replace /> : <CompanyLogin onLogin={handleLogin} />} />

                <Route element={<RequireAuth user={user} />}>
                  <Route path="/dashboard" element={<Navigate to="/inventory/dashboard" replace />} />
                  <Route path="/alwen/reports" element={user?.apiAuthenticated ? <AlwenAnalytics user={user} /> : <Navigate to="/dashboard" replace />} />
                  <Route path="/alwen/:section" element={user?.apiAuthenticated ? <AlwenFeatures user={user} /> : <Navigate to="/dashboard" replace />} />
                  <Route path="/orders" element={user?.apiAuthenticated ? <AlwenOperations user={user} initialTab="orders" /> : <Orders orders={orders} setOrders={setOrders} user={user} />} />
                  <Route path="/inventory" element={user?.apiAuthenticated ? <AlwenOperations user={user} initialTab="stock" /> : <InventoryStock user={user} />} />
                  <Route path="/inventory/dashboard" element={user?.apiAuthenticated ? <AlwenAnalytics user={user} compact /> : <InventoryDashboard />} />
                  <Route path="/inventory/suppliers" element={user?.apiAuthenticated ? <AlwenFeatures user={user} /> : <InventorySubmenu section="suppliers" />} />
                  <Route path="/inventory/supplier-invoices" element={user?.apiAuthenticated ? <AlwenFeatures user={user} initialSection="invoices" /> : <SupplierInvoices />} />
                  <Route path="/inventory/items" element={user?.apiAuthenticated ? <AlwenOperations user={user} initialTab="master" /> : <InventorySubmenu section="items" />} />
                  <Route path="/inventory/purchase-requests" element={user?.apiAuthenticated ? <AlwenOperations user={user} initialTab="requests" /> : <PurchaseRequests />} />
                  <Route path="/inventory/quotations" element={user?.apiAuthenticated ? <AlwenOperations user={user} initialTab="requests" /> : <Quotations />} />
                  <Route path="/inventory/purchase-orders" element={user?.apiAuthenticated ? <AlwenOperations user={user} initialTab="orders" /> : <InventorySubmenu section="purchase-orders" />} />
                  <Route path="/inventory/stock-in" element={user?.apiAuthenticated ? <AlwenOperations user={user} initialTab="orders" /> : <InventorySubmenu section="stock-in" />} />
                  <Route path="/inventory/stock-out" element={user?.apiAuthenticated ? <AlwenOperations user={user} initialTab="stock" /> : <InventorySubmenu section="stock-out" />} />
                  <Route path="/purchase" element={user?.apiAuthenticated ? <AlwenOperations user={user} initialTab="requests" /> : <Purchase orders={orders} setOrders={setOrders} setInventory={setInventory} purchases={purchases} setPurchases={setPurchases} user={user} pushNotification={pushNotification} />} />
                  <Route path="/test" element={<TestFlows user={user} setUser={setUser} orders={orders} setOrders={setOrders} purchases={purchases} setPurchases={setPurchases} inventory={inventory} setInventory={setInventory} pushNotification={pushNotification} />} />
                  <Route path="/reporting" element={user?.apiAuthenticated ? <Navigate to="/alwen/reports" replace /> : <Reporting />} />
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
    </InventoryProvider>
  );
}

export default App;
