import React, { useState, useEffect } from "react";

export default function Users() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", role: "Staff", password: "" });

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("users") || "[]");
    if (!stored || stored.length === 0) {
      const admin = { name: "Admin", email: "admin@easyprocure.com", role: "Admin", password: "admin" };
      localStorage.setItem("users", JSON.stringify([admin]));
      setUsers([admin]);
    } else setUsers(stored);

    const storedRoles = JSON.parse(localStorage.getItem("roles") || "[]");
    if (!storedRoles || storedRoles.length === 0) {
      const defaultRoles = ["Admin", "Director", "Manager", "Staff"];
      setRoles(defaultRoles);
      localStorage.setItem("roles", JSON.stringify(defaultRoles));
    } else {
      setRoles(storedRoles);
    }
  }, []);

  const save = (next) => {
    localStorage.setItem("users", JSON.stringify(next));
    setUsers(next);
  };

  const handleAdd = (e) => {
    e.preventDefault();
    if (!form.email || !form.name) return alert("Name and email required");
    if (users.find((u) => u.email === form.email)) return alert("User exists");
    const newUser = { ...form, password: form.password || "tempPassword123" };
    const next = [...users, newUser];
    save(next);
    setForm({ name: "", email: "", role: "Staff", password: "" });
  };

  const handleDelete = (email) => {
    if (!window.confirm("Delete user?")) return;
    const next = users.filter((u) => u.email !== email);
    save(next);
  };

  const handleResetPassword = (email) => {
    const tempPassword = "TempPass" + Math.random().toString(36).slice(-6);
    const next = users.map(u => u.email === email ? { ...u, password: tempPassword } : u);
    save(next);
    alert(`Password reset to: ${tempPassword}`);
  };

  const handleUpdateRole = (email, newRole) => {
    const next = users.map(u => u.email === email ? { ...u, role: newRole } : u);
    save(next);
  };

  return (
    <div style={{ padding: 30 }}>
      <div style={{ background: "#fff", borderRadius: 8, padding: 20, boxShadow: "0 4px 12px rgba(0,0,0,0.04)" }}>
        <h1>Users</h1>
        <div style={{ marginBottom: 20 }}>
          <h3>Add New User</h3>
          <form onSubmit={handleAdd} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <input placeholder="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ padding: 10, border: "1px solid #ddd", borderRadius: 5 }} />
            <input placeholder="Email Address" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ padding: 10, border: "1px solid #ddd", borderRadius: 5 }} />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={{ padding: 10, border: "1px solid #ddd", borderRadius: 5 }}>
              {roles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <input placeholder="Password (optional)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={{ padding: 10, border: "1px solid #ddd", borderRadius: 5 }} />
            <button type="submit" style={{ gridColumn: "span 2", padding: 12, backgroundColor: "#1d4ed8", color: "#fff", border: "none", borderRadius: 5, fontWeight: 700, cursor: "pointer" }}>Add User</button>
          </form>
        </div>

        <div>
          <h3>Existing Users</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }} border="1" cellPadding="12">
            <thead style={{ backgroundColor: "#f0f0f0" }}>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users && users.length > 0 ? users.map(u => (
                <tr key={u.email} style={{ borderBottom: "1px solid #eee" }}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <select value={u.role} onChange={(e) => handleUpdateRole(u.email, e.target.value)} style={{ padding: 6, borderRadius: 5 }}>
                      {roles.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => handleResetPassword(u.email)} style={{ padding: "6px 12px", backgroundColor: "#2196F3", color: "#fff", border: "none", borderRadius: 5 }}>Reset Password</button>
                    <button onClick={() => handleDelete(u.email)} style={{ padding: "6px 12px", backgroundColor: "#f44336", color: "#fff", border: "none", borderRadius: 5 }}>Delete</button>
                  </td>
                </tr>
              )) : <tr><td colSpan={4}>No users found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
