import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const defaultCompanies = [
  { name: "Easy Procure", logo: "📦", color: "#4361ee" },
  { name: "Global Supply", logo: "🌐", color: "#2d6a4f" },
  { name: "Acme Logistics", logo: "🚚", color: "#f59f00" }
];

export default function CompanyLogin({ onLogin }) {
  const [company, setCompany] = useState(defaultCompanies[0]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [users, setUsers] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const storedUsers = JSON.parse(localStorage.getItem("users") || "[]");
    const defaultUsers = [
      { name: "Admin", email: "admin@easyprocure.com", role: "Admin", password: "admin" },
      { name: "Lucas Obadoh", email: "lucas.Obadoh@easyproure.com", role: "Admin", password: "lucas1234" }
    ];
    if (storedUsers.length === 0) {
      localStorage.setItem("users", JSON.stringify(defaultUsers));
      setUsers(defaultUsers);
    } else {
      const existing = [...storedUsers];
      if (!existing.some((u) => u.email.toLowerCase() === "lucas.obadoh@easyproure.com")) {
        existing.push({ name: "Lucas Obadoh", email: "lucas.Obadoh@easyproure.com", role: "Admin", password: "lucas1234" });
      }
      if (!existing.some((u) => u.email.toLowerCase() === "admin@easyprocure.com")) {
        existing.push({ name: "Admin", email: "admin@easyprocure.com", role: "Admin", password: "admin" });
      }
      localStorage.setItem("users", JSON.stringify(existing));
      setUsers(existing);
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    const user = users.find((u) => u.email.toLowerCase() === normalizedEmail);
    if (!user) {
      alert("User not found. Please check the email.");
      return;
    }
    if (user.password !== password) {
      alert("Invalid password");
      return;
    }
    onLogin(user);
    navigate("/dashboard");
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f4f6fc", padding: "20px" }}>
      <div style={{ width: "100%", maxWidth: "420px", background: "#fff", borderRadius: "20px", boxShadow: "0 20px 40px rgba(0,0,0,0.08)", padding: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "28px" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "18px", background: company.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px" }}>
            {company.logo}
          </div>
          <div>
            <div style={{ color: "#333", fontSize: "18px", fontWeight: 700 }}>{company.name}</div>
            <div style={{ color: "#666", fontSize: "14px" }}>Secure company login</div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", marginBottom: "8px", color: "#555" }}>Company</label>
          <select value={company.name} onChange={(e) => {
            const selected = defaultCompanies.find((c) => c.name === e.target.value);
            setCompany(selected || defaultCompanies[0]);
          }} style={{ width: "100%", padding: "12px 14px", marginBottom: "20px", borderRadius: "12px", border: "1px solid #dfe3ee", background: "#fff" }}>
            {defaultCompanies.map((companyOption) => (
              <option key={companyOption.name} value={companyOption.name}>{companyOption.name}</option>
            ))}
          </select>

          <label style={{ display: "block", marginBottom: "8px", color: "#555" }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            style={{ width: "100%", padding: "12px 14px", marginBottom: "20px", borderRadius: "12px", border: "1px solid #dfe3ee" }}
          />

          <label style={{ display: "block", marginBottom: "8px", color: "#555" }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            style={{ width: "100%", padding: "12px 14px", marginBottom: "24px", borderRadius: "12px", border: "1px solid #dfe3ee" }}
          />

          <button type="submit" style={{ width: "100%", padding: "14px", borderRadius: "14px", border: "none", background: "#1d4ed8", color: "white", fontWeight: 700, cursor: "pointer" }}>
            Sign in
          </button>
        </form>

        <div style={{ marginTop: "18px", color: "#666", fontSize: "14px" }}>
          Admin login: <strong>lucas.Obadoh@easyproure.com</strong>
          <br />
          Temporary password: <strong>lucas1234</strong>
        </div>
      </div>
    </div>
  );
}
