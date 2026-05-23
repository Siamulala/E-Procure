// src/App.js
import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import Inventory from "./pages/Inventory";
import Purchase from "./pages/Purchase";
import Reporting from "./pages/Reporting";
import Support from "./pages/Support";
import Settings from "./pages/Settings";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";

// Initial user object
const initialUser = {
  email: "lucas@easyprocure.com",
  name: "Lucas Mwangi",
  role: "Procurement Lead",
  profilePic: "/images/lucas.jpg" // place your image in public/images
};

function App() {
  const [user, setUser] = useState(initialUser);

  // ✅ Global state for data
  const [suppliers, setSuppliers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [purchases, setPurchases] = useState([]);

  // ✅ Load user from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  // ✅ Save user to localStorage
  useEffect(() => {
    localStorage.setItem("user", JSON.stringify(user));
  }, [user]);

  return (
    <Router>
      <div style={{ display: "flex" }}>
        <Sidebar />
        <div
          style={{
            flex: 1,
            marginLeft: "260px",
            padding: "100px 30px 30px 30px",
            minHeight: "100vh"
          }}
        >
          <Navbar />
          <Routes>
            {/* Dashboard gets live data */}
            <Route
              path="/dashboard"
              element={
                <Dashboard
                  user={user}
                  suppliers={suppliers}
                  orders={orders}
                  inventory={inventory}
                  purchases={purchases}
                />
              }
            />

            {/* Orders page updates global orders */}
            <Route
              path="/orders"
              element={<Orders orders={orders} setOrders={setOrders} />}
            />

            {/* Inventory page updates global inventory */}
            <Route
              path="/inventory"
              element={<Inventory inventory={inventory} setInventory={setInventory} />}
            />

            {/* Other pages */}
            <Route path="/purchase" element={<Purchase />} />
            <Route path="/reporting" element={<Reporting />} />
            <Route path="/support" element={<Support />} />

            {/* Settings updates user profile */}
            <Route
              path="/settings"
              element={<Settings user={user} setUser={setUser} />}
            />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
