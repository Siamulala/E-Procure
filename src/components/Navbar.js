import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Navbar.css";

export default function Navbar({ user, onLogout, notifications = [], onSearch }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [draftName, setDraftName] = useState(user?.name || "");
  const [draftPassword, setDraftPassword] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const filteredNotifications = useMemo(() => {
    if (!search.trim()) return notifications;
    const term = search.toLowerCase();
    return notifications.filter((item) => (item.message || "").toLowerCase().includes(term));
  }, [notifications, search]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    onSearch?.(search.trim());
    if (!search.trim()) return;
    alert(`Showing ${filteredNotifications.length} matching notification(s) for "${search}".`);
  };

  const handleNameSave = () => {
    if (!draftName.trim()) return;
    const storedUsers = JSON.parse(localStorage.getItem("users") || "[]");
    const updatedUsers = storedUsers.map((entry) =>
      entry.email === user?.email ? { ...entry, name: draftName.trim() } : entry
    );
    localStorage.setItem("users", JSON.stringify(updatedUsers));
    const updatedUser = { ...user, name: draftName.trim() };
    localStorage.setItem("user", JSON.stringify(updatedUser));
    setIsEditingName(false);
    window.location.reload();
  };

  const handlePasswordSave = () => {
    if (!draftPassword.trim()) return;
    const storedUsers = JSON.parse(localStorage.getItem("users") || "[]");
    const updatedUsers = storedUsers.map((entry) =>
      entry.email === user?.email ? { ...entry, password: draftPassword.trim() } : entry
    );
    localStorage.setItem("users", JSON.stringify(updatedUsers));
    setIsChangingPassword(false);
    setDraftPassword("");
    alert("Password updated successfully.");
  };

  const handleSignOut = () => {
    onLogout?.();
    navigate("/login");
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-brand">
          <h1>Inventory Management</h1>
        </div>

        <form className="navbar-search" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            placeholder="Search notifications..."
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <span className="search-icon">🔍</span>
        </form>

        <div className="navbar-menu">
          <button className="icon-btn" type="button" onClick={() => setShowNotifications((value) => !value)}>
            🔔
          </button>
          <div className="navbar-user" onClick={() => setShowMenu((value) => !value)}>
            <span className="user-avatar">👤</span>
            <span className="user-name">{user?.name || "Guest"}</span>
          </div>
          <button className="navbar-toggle" type="button" aria-label="Open profile menu" onClick={() => setShowMenu((value) => !value)}>
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </div>

      {showNotifications ? (
        <div className="navbar-dropdown">
          <div className="dropdown-title">Notifications</div>
          {filteredNotifications.length ? filteredNotifications.map((item) => (
            <div key={item.id} className="dropdown-item">
              <div>{item.message}</div>
              <small>{new Date(item.date).toLocaleString()}</small>
            </div>
          )) : <div className="dropdown-item">No matching notifications.</div>}
        </div>
      ) : null}

      {showMenu ? (
        <div className="navbar-dropdown profile-menu">
          <div className="dropdown-title">Profile</div>
          {isEditingName ? (
            <div className="dropdown-item">
              <input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
              <div className="dropdown-actions">
                <button type="button" onClick={handleNameSave}>Save</button>
                <button type="button" onClick={() => setIsEditingName(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" className="dropdown-link" onClick={() => setIsEditingName(true)}>
              Edit name
            </button>
          )}

          {isChangingPassword ? (
            <div className="dropdown-item">
              <input type="password" value={draftPassword} onChange={(event) => setDraftPassword(event.target.value)} placeholder="New password" />
              <div className="dropdown-actions">
                <button type="button" onClick={handlePasswordSave}>Save</button>
                <button type="button" onClick={() => setIsChangingPassword(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" className="dropdown-link" onClick={() => setIsChangingPassword(true)}>
              Change password
            </button>
          )}

          <button type="button" className="dropdown-link danger" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      ) : null}
    </nav>
  );
}