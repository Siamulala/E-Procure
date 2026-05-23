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

const initialUser = {
  email: "lucas@easyprocure.com",
  name: "Lucas Obadoh",
  role: "Procurement Officer",
  profilePic: "/images/lucas.jpg"
};


function App() {
  const [user, setUser] = useState(initialUser);

  // ✅ Global state for data
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [purchases, setPurchases] = useState([]);

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  useEffect(() => {
    localStorage.setItem("user", JSON.stringify(user));
  }, [user]);

  return (
    <Router>
      <div style={{ display: "flex" }}>
        <Sidebar />
        <div style={{ flex: 1, marginLeft: "260px", padding: "100px 30px 30px 30px", minHeight: "100vh" }}>
          <Navbar />
          <Routes>
            <Route
              path="/dashboard"
              element={
                <Dashboard
                  user={user}
                  orders={orders}
                  inventory={inventory}
                  purchases={purchases}
                />
              }
            />
            <Route path="/orders" element={<Orders orders={orders} setOrders={setOrders} />} />
            <Route path="/inventory" element={<Inventory inventory={inventory} setInventory={setInventory} />} />
            <Route
              path="/purchase"
              element={
                <Purchase
                  orders={orders}
                  setOrders={setOrders}
                  setInventory={setInventory}
                  purchases={purchases}
                  setPurchases={setPurchases}
                />
              }
            />
            <Route path="/reporting" element={<Reporting />} />
            <Route path="/support" element={<Support />} />
            <Route path="/settings" element={<Settings user={user} setUser={setUser} />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}
export default App;
