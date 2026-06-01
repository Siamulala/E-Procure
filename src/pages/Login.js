import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Login({ onLogin }) {
  const [users, setUsers] = useState(() => JSON.parse(localStorage.getItem("users") || "[]"));
  const [selected, setSelected] = useState(() => {
    const s = JSON.parse(localStorage.getItem("users") || "[]");
    return s.length ? s[0].email : "";
  });
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("users") || "[]");
    setUsers(stored);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const user = users.find((u) => u.email === selected);
    if (!user) return alert("User not found");
    if (user.password && user.password !== password) return alert("Invalid password");
    onLogin(user);
    navigate("/dashboard");
  };

  return (
    <div style={{ padding: 40 }}>
      <h1>Login</h1>
      <form onSubmit={handleSubmit} style={{ maxWidth: 420 }}>
        <label>
          User:
          <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ marginLeft: 10 }}>
            {users.map((u) => (
              <option key={u.email} value={u.email}>{u.name} — {u.role}</option>
            ))}
          </select>
        </label>
        <br />
        <label>
          Password:
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ marginLeft: 10 }} />
        </label>
        <br />
        <button type="submit" style={{ marginTop: 10 }}>Login</button>
      </form>
      <p style={{ marginTop: 10 }}>If no users exist, go to <a href="/settings">Settings</a> and create an Admin user in Users.</p>
    </div>
  );
}
