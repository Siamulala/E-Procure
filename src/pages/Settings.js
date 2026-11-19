// src/pages/Settings.js
import React, { useState, useEffect, useMemo } from "react";
import { useInventory } from "../contexts/InventoryContext";
import { MENU_ACCESS_ITEMS } from "../utils/menuAccess";

export default function Settings({ user, setUser }) {
  const { roleMenuPermissions, setRoleMenuPermissions } = useInventory();
  const [profile, setProfile] = useState({
    name: user?.name || "",
    role: user?.role || "",
    profilePic: user?.profilePic || ""
  });

  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [newRole, setNewRole] = useState("");
  const [selectedRoleForEdit, setSelectedRoleForEdit] = useState(null);
  const [rolePermissions, setRolePermissions] = useState({});
  const [newUserForm, setNewUserForm] = useState({ name: "", email: "", role: "Staff", password: "" });
  const [editingUserEmail, setEditingUserEmail] = useState(null);
  const [editingUserForm, setEditingUserForm] = useState({ name: "", email: "", role: "Staff" });
  const [selectedUserEmail, setSelectedUserEmail] = useState(null);

  const availablePermissions = useMemo(() => [
    "view_dashboard",
    "view_inventory",
    "edit_inventory",
    "delete_inventory",
    "view_orders",
    "edit_orders",
    "view_purchase",
    "approve_purchase",
    "view_reporting",
    "manage_users",
    "manage_roles"
  ], []);

  useEffect(() => {
    // Load roles and permissions from localStorage
    const storedRoles = JSON.parse(localStorage.getItem("roles") || "[]");
    const storedUsers = JSON.parse(localStorage.getItem("users") || "[]");
    const storedPermissions = JSON.parse(localStorage.getItem("rolePermissions") || "{}");

    if (storedRoles.length === 0) {
      const defaultRoles = ["Admin", "Director", "Manager", "Staff"];
      const defaultPermissions = {
        Admin: availablePermissions,
        Director: ["view_dashboard", "view_inventory", "view_orders", "approve_purchase", "view_purchase", "view_reporting"],
        Manager: ["view_dashboard", "view_inventory", "edit_inventory", "view_orders", "view_purchase"],
        Staff: ["view_dashboard", "view_inventory"]
      };
      localStorage.setItem("roles", JSON.stringify(defaultRoles));
      localStorage.setItem("rolePermissions", JSON.stringify(defaultPermissions));
      setRoles(defaultRoles);
      setRolePermissions(defaultPermissions);
    } else {
      setRoles(storedRoles);
      setRolePermissions(storedPermissions);
    }
    setUsers(storedUsers);
  }, [availablePermissions]);

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfile((current) => ({ ...current, [name]: value }));
  };

  const handleProfilePicUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      setProfile((current) => ({ ...current, profilePic: imageUrl }));
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    setUser(profile);
    alert("Profile updated successfully!");
  };

  const handleAddRole = () => {
    if (!newRole.trim()) {
      alert("Please enter a role name");
      return;
    }
    if (roles.includes(newRole)) {
      alert("Role already exists");
      return;
    }
    const updatedRoles = [...roles, newRole];
    setRoles(updatedRoles);
    const updatedPermissions = { ...rolePermissions, [newRole]: [] };
    const updatedMenuPermissions = {
      ...roleMenuPermissions,
      [newRole]: MENU_ACCESS_ITEMS.map((menu) => menu.path),
    };
    setRolePermissions(updatedPermissions);
    setRoleMenuPermissions(updatedMenuPermissions);
    localStorage.setItem("roles", JSON.stringify(updatedRoles));
    localStorage.setItem("rolePermissions", JSON.stringify(updatedPermissions));
    localStorage.setItem("roleMenuPermissions", JSON.stringify(updatedMenuPermissions));
    setNewRole("");
  };

  const handlePermissionToggle = (permission) => {
    if (!selectedRoleForEdit) return;
    const perms = rolePermissions[selectedRoleForEdit] || [];
    const updated = perms.includes(permission)
      ? perms.filter(p => p !== permission)
      : [...perms, permission];
    const updatedPermissions = { ...rolePermissions, [selectedRoleForEdit]: updated };
    setRolePermissions(updatedPermissions);
    localStorage.setItem("rolePermissions", JSON.stringify(updatedPermissions));
  };

  const handleMenuPermissionToggle = (menuPath) => {
    if (!selectedRoleForEdit || selectedRoleForEdit === "Admin") return;
    const roleMenus = roleMenuPermissions[selectedRoleForEdit]
      || MENU_ACCESS_ITEMS.map((menu) => menu.path);
    const updatedRoleMenus = roleMenus.includes(menuPath)
      ? roleMenus.filter((path) => path !== menuPath)
      : [...roleMenus, menuPath];
    const updatedMenuPermissions = {
      ...roleMenuPermissions,
      [selectedRoleForEdit]: updatedRoleMenus,
    };
    setRoleMenuPermissions(updatedMenuPermissions);
    localStorage.setItem("roleMenuPermissions", JSON.stringify(updatedMenuPermissions));
  };

  const handleDeleteRole = (roleName) => {
    if (["Admin", "Director"].includes(roleName)) {
      alert("Cannot delete system roles");
      return;
    }
    if (window.confirm(`Delete role "${roleName}"?`)) {
      const updatedRoles = roles.filter(r => r !== roleName);
      const updatedPermissions = { ...rolePermissions };
      const updatedMenuPermissions = { ...roleMenuPermissions };
      delete updatedPermissions[roleName];
      delete updatedMenuPermissions[roleName];
      setRoles(updatedRoles);
      setRolePermissions(updatedPermissions);
      setRoleMenuPermissions(updatedMenuPermissions);
      localStorage.setItem("roles", JSON.stringify(updatedRoles));
      localStorage.setItem("rolePermissions", JSON.stringify(updatedPermissions));
      localStorage.setItem("roleMenuPermissions", JSON.stringify(updatedMenuPermissions));
      setSelectedRoleForEdit(null);
    }
  };

  const handleAddNewUser = (e) => {
    e.preventDefault();
    if (!newUserForm.email || !newUserForm.name) {
      alert("Name and email required");
      return;
    }
    if (users.find((u) => u.email === newUserForm.email)) {
      alert("User already exists");
      return;
    }
    const newUser = { ...newUserForm, password: newUserForm.password || "tempPassword123" };
    const updatedUsers = [...users, newUser];
    setUsers(updatedUsers);
    localStorage.setItem("users", JSON.stringify(updatedUsers));
    setNewUserForm({ name: "", email: "", role: "Staff", password: "" });
    alert("User added successfully!");
  };

  const handleEditUser = (userEmail) => {
    const userToEdit = users.find(u => u.email === userEmail);
    if (userToEdit) {
      setSelectedUserEmail(userEmail);
      setEditingUserEmail(userEmail);
      setEditingUserForm({ name: userToEdit.name, email: userToEdit.email, role: userToEdit.role });
    }
  };

  const selectUser = (userEmail) => {
    setSelectedUserEmail((current) => (current === userEmail ? null : userEmail));
  };

  const handleSaveEditUser = () => {
    if (!editingUserForm.name || !editingUserForm.email) {
      alert("Name and email required");
      return;
    }
    // Check if new email already exists (but allow same email)
    if (editingUserForm.email !== editingUserEmail && users.find(u => u.email === editingUserForm.email)) {
      alert("Email already in use");
      return;
    }
    const updatedUsers = users.map(u =>
      u.email === editingUserEmail
        ? { ...u, name: editingUserForm.name, email: editingUserForm.email, role: editingUserForm.role }
        : u
    );
    setUsers(updatedUsers);
    localStorage.setItem("users", JSON.stringify(updatedUsers));
    setEditingUserEmail(null);
    setEditingUserForm({ name: "", email: "", role: "Staff" });
    alert("User updated successfully!");
  };

  const handleDeleteUser = (userEmail) => {
    if (userEmail === user?.email) {
      alert("Cannot delete your own account");
      return;
    }
    if (window.confirm("Are you sure you want to delete this user?")) {
      const updatedUsers = users.filter(u => u.email !== userEmail);
      setUsers(updatedUsers);
      localStorage.setItem("users", JSON.stringify(updatedUsers));
      if (editingUserEmail === userEmail) {
        setEditingUserEmail(null);
      }
      if (selectedUserEmail === userEmail) {
        setSelectedUserEmail(null);
      }
    }
  };

  const handleResetUserPassword = (userEmail) => {
    const tempPassword = "TempPass" + Math.random().toString(36).slice(-6);
    const updatedUsers = users.map(u =>
      u.email === userEmail ? { ...u, password: tempPassword } : u
    );
    setUsers(updatedUsers);
    localStorage.setItem("users", JSON.stringify(updatedUsers));
    alert(`Password reset to: ${tempPassword}`);
  };

  const isAdmin = user?.role === "Admin";

  return (
    <div style={{ background: "#fff", padding: "30px", borderRadius: "12px", boxShadow: "0 4px 16px rgba(0,0,0,0.05)" }}>
      <h1>Settings</h1>
      <h2>{user?.name || "Guest"}</h2>

      {/* Profile Section */}
      <form onSubmit={handleSave} style={{ marginTop: "20px", marginBottom: "40px", paddingBottom: "20px", borderBottom: "1px solid #ddd" }}>
        <h2>Profile Information</h2>
        <label>
          Name:
          <input
            type="text"
            name="name"
            value={profile.name}
            onChange={handleProfileChange}
            style={{ marginLeft: "10px" }}
          />
        </label>
        <br />
        <label>
          Role:
          <input
            type="text"
            name="role"
            value={profile.role}
            onChange={handleProfileChange}
            style={{ marginLeft: "10px" }}
            disabled
          />
        </label>
        <br />
        <label>
          Profile Picture:
          <input
            type="file"
            accept="image/*"
            onChange={handleProfilePicUpload}
            style={{ marginLeft: "10px" }}
          />
        </label>
        <br />
        {profile.profilePic && (
          <img
            src={profile.profilePic}
            alt="Profile Preview"
            style={{ width: "80px", height: "80px", borderRadius: "50%", marginTop: "10px" }}
          />
        )}
        <br />
        <button type="submit" style={{ marginTop: "10px", padding: "10px 20px", backgroundColor: "#f0f0f0", color: "#0A0A0A", border: "none", borderRadius: "5px" }}>
          Save Profile
        </button>
      </form>

      {/* Admin Only: Role Management Section */}
      {isAdmin && (
        <>
          <h2>Role Management (Admin Only)</h2>

          {/* Create New Role */}
          <div style={{ marginBottom: "30px", padding: "20px", background: "#f9f9f9", borderRadius: "8px" }}>
            <h3>Create New Role</h3>
            <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
              <input
                type="text"
                placeholder="Role name (e.g., Supervisor)"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                style={{ padding: "8px", flex: 1, borderRadius: "5px", border: "1px solid #ddd" }}
              />
              <button onClick={handleAddRole} style={{ padding: "8px 20px", backgroundColor: "#f0f0f0", color: "#0A0A0A", border: "none", borderRadius: "5px" }}>
                Add Role
              </button>
            </div>
          </div>

          {/* Add New User */}
          <div style={{ marginBottom: "30px", padding: "20px", background: "#f9f9f9", borderRadius: "8px" }}>
            <h3>Add New User</h3>
            <form onSubmit={handleAddNewUser} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
              <input
                type="text"
                placeholder="Full Name"
                value={newUserForm.name}
                onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                style={{ padding: "10px", border: "1px solid #ddd", borderRadius: "5px" }}
              />
              <input
                type="email"
                placeholder="Email Address"
                value={newUserForm.email}
                onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                style={{ padding: "10px", border: "1px solid #ddd", borderRadius: "5px" }}
              />
              <select
                value={newUserForm.role}
                onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                style={{ padding: "10px", border: "1px solid #ddd", borderRadius: "5px" }}
              >
                {roles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <input
                type="text"
                placeholder="Password"
                value={newUserForm.password}
                onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                style={{ padding: "10px", border: "1px solid #ddd", borderRadius: "5px" }}
              />
              <button type="submit" style={{ gridColumn: "span 1", padding: "12px", backgroundColor: "#fff", color: "#0A0A0A", border: "none", borderRadius: "5px", fontWeight: 700, cursor: "pointer" }}>
                Add User
              </button>
            </form>
          </div>

          {/* Manage Roles & Permissions */}
          <div style={{ marginBottom: "30px", padding: "20px", background: "#f9f9f9", borderRadius: "8px" }}>
            <h3>Manage Roles & Permissions</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "20px" }}>
              <div>
                <h4>Roles</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {roles.map((role) => (
                    <div key={role} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button
                        onClick={() => setSelectedRoleForEdit(selectedRoleForEdit === role ? null : role)}
                        style={{
                          flex: 1,
                          padding: "10px",
                          backgroundColor: selectedRoleForEdit === role ? "#4169E1" : "#f0f0f0",
                          color: selectedRoleForEdit === role ? "#000" : "#0A0A0A",
                          border: "none",
                          borderRadius: "5px",
                          cursor: "pointer"
                        }}
                      >
                        {role}
                      </button>
                      {!["Admin", "Director"].includes(role) && (
                        <button
                          onClick={() => handleDeleteRole(role)}
                          style={{ padding: "8px 12px", backgroundColor: "#b71111", color: "#f0f0f0", border: "none", borderRadius: "5px" }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4>Permissions for {selectedRoleForEdit || "Select a role"}</h4>
                {selectedRoleForEdit && (
                  <>
                    <h5>Feature permissions</h5>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      {availablePermissions.map((perm) => (
                        <label key={perm} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <input
                            type="checkbox"
                            checked={(rolePermissions[selectedRoleForEdit] || []).includes(perm)}
                            onChange={() => handlePermissionToggle(perm)}
                          />
                          {perm.replace(/_/g, " ")}
                        </label>
                      ))}
                    </div>
                    <h4 style={{ marginTop: 24 }}>Menu access</h4>
                    <p className="panel-copy">Unchecked menus are hidden from this role and direct navigation is blocked. Admin access stays unrestricted.</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", marginTop: 12 }}>
                      {MENU_ACCESS_ITEMS.map((menu) => (
                        <label key={menu.path} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <input
                            type="checkbox"
                            checked={selectedRoleForEdit === "Admin"
                              || (roleMenuPermissions[selectedRoleForEdit]
                                || MENU_ACCESS_ITEMS.map((entry) => entry.path)).includes(menu.path)}
                            disabled={selectedRoleForEdit === "Admin"}
                            onChange={() => handleMenuPermissionToggle(menu.path)}
                          />
                          {menu.label}
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Manage Users */}
          <div style={{ marginBottom: "30px", padding: "20px", background: "#f9f9f9", borderRadius: "8px" }}>
            <h3>Manage Users</h3>
            <table border="1" cellPadding="10" style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
              <thead style={{ backgroundColor: "#f0f0f0" }}>
                <tr>
                  <th style={{ width: "90px" }}>Select</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.email}
                    onClick={() => selectUser(u.email)}
                    style={{
                      backgroundColor: selectedUserEmail === u.email ? "#e3f2fd" : "#fff",
                      cursor: "pointer"
                    }}
                  >
                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectUser(u.email);
                        }}
                        style={{
                          padding: "6px 12px",
                          backgroundColor: selectedUserEmail === u.email ? "#999" : "#e0e0e0",
                          color: selectedUserEmail === u.email ? "#fff" : "#000",
                          border: "none",
                          borderRadius: "5px",
                          cursor: "pointer",
                          fontSize: "12px"
                        }}
                      >
                        {selectedUserEmail === u.email ? "Selected" : "Select"}
                      </button>
                    </td>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{u.role || "Not assigned"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {selectedUserEmail && (
              <div style={{ marginTop: "20px", padding: "20px", background: "#fff", borderRadius: "8px", border: "1px solid #ddd" }}>
                <h4>Selected User Actions</h4>
                <p style={{ margin: "8px 0 16px" }}>
                  Selected user: <strong>{users.find((u) => u.email === selectedUserEmail)?.name}</strong> ({users.find((u) => u.email === selectedUserEmail)?.role})
                </p>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    onClick={() => handleEditUser(selectedUserEmail)}
                    style={{ padding: "10px 18px", backgroundColor: "#f0f0f0", color: "#0A0A0A", border: "none", borderRadius: "5px", cursor: "pointer" }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleResetUserPassword(selectedUserEmail)}
                    style={{ padding: "10px 18px", backgroundColor: "#f0f0f0", color: "#0A0A0A", border: "none", borderRadius: "5px", cursor: "pointer" }}
                  >
                    Reset Password
                  </button>
                  {selectedUserEmail !== user?.email ? (
                    <button
                      onClick={() => handleDeleteUser(selectedUserEmail)}
                      style={{ padding: "10px 18px", backgroundColor: "#f0f0f0", color: "#0A0A0A", border: "none", borderRadius: "5px", cursor: "pointer" }}
                    >
                      Delete
                    </button>
                  ) : (
                    <button
                      disabled
                      style={{ padding: "10px 18px", backgroundColor: "#ccc", color: "#666", border: "none", borderRadius: "5px" }}
                    >
                      Cannot delete self
                    </button>
                  )}
                </div>
              </div>
            )}

            {editingUserEmail && (
              <div style={{ padding: "20px", background: "#fff", borderRadius: "8px", border: "2px solid #2196F3", marginBottom: "20px" }}>
                <h4>Edit User: {editingUserEmail}</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={editingUserForm.name}
                    onChange={(e) => setEditingUserForm({ ...editingUserForm, name: e.target.value })}
                    style={{ padding: "10px", border: "1px solid #ddd", borderRadius: "5px" }}
                  />
                  <input
                    type="email"
                    placeholder="Email Address"
                    value={editingUserForm.email}
                    onChange={(e) => setEditingUserForm({ ...editingUserForm, email: e.target.value })}
                    style={{ padding: "10px", border: "1px solid #ddd", borderRadius: "5px" }}
                  />
                  <select
                    value={editingUserForm.role}
                    onChange={(e) => setEditingUserForm({ ...editingUserForm, role: e.target.value })}
                    style={{ padding: "10px", border: "1px solid #ddd", borderRadius: "5px" }}
                  >
                    {roles.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                  <button
                    onClick={handleSaveEditUser}
                    style={{
                      padding: "10px 20px",
                      backgroundColor: "#f0f0f0",
                      color: "#0A0A0A",
                      border: "none",
                      borderRadius: "5px",
                      fontWeight: 700,
                      cursor: "pointer"
                    }}
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => {
                      setEditingUserEmail(null);
                      setEditingUserForm({ name: "", email: "", role: "Staff" });
                    }}
                    style={{
                      padding: "10px 20px",
                      backgroundColor: "#fff",
                      color: "#0A0A0A",
                      border: "none",
                      borderRadius: "5px",
                      cursor: "pointer"
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
