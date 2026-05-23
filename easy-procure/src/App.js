import { useState } from "react";
import "./App.css";

const users = {
  "lucas@easyprocure.com": {
    name: "Lucas",
    password: "Procure123!",
    role: "Procurement Lead",
  },
};

function App() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [error, setError] = useState("");
  const [view, setView] = useState("login");

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const user = users[form.email.toLowerCase()];

    if (user && user.password === form.password) {
      setLoggedInUser(user);
      setError("");
      setForm({ email: "", password: "" });
      setView("welcome");
      return;
    }

    setError("Invalid email or password. Use lucas@easyprocure.com / Procure123!");
  };

  const handleLogout = () => {
    setLoggedInUser(null);
    setView("login");
    setError("");
  };

  return (
    <div className="app-shell">
      {!loggedInUser ? (
        <div className="login-card">
          <div className="login-brand">
            <div className="brand-mark">EP</div>
            <div>
              <h1>Easy Procure</h1>
              <p>Sign in to access your procurement dashboard.</p>
            </div>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <label>
              Email
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="lucas@easyprocure.com"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Enter your password"
                required
              />
            </label>

            {error && <div className="login-error">{error}</div>}

            <button type="submit" className="login-button">
              Sign in
            </button>

            <p className="login-note">
              Use <strong>lucas@easyprocure.com</strong> and <strong>Procure123!</strong>
            </p>
          </form>
        </div>
      ) : view === "welcome" ? (
        <main className="welcome-page">
          <div className="welcome-panel">
            <div className="welcome-header">
              <div>
                <span className="welcome-badge">Welcome back</span>
                <h1>Hi, {loggedInUser.name} 👋</h1>
                <p>
                  Great to see you again, {loggedInUser.name}. Your procurement dashboard is ready.
                </p>
              </div>
              <button className="logout-button" onClick={handleLogout}>
                Log out
              </button>
            </div>

            <div className="welcome-metrics">
              <div className="metric-card">
                <span>📦</span>
                <div>
                  <p>Inventory Items</p>
                  <h2>1,248</h2>
                </div>
              </div>
              <div className="metric-card">
                <span>🛒</span>
                <div>
                  <p>Pending Orders</p>
                  <h2>18</h2>
                </div>
              </div>
              <div className="metric-card">
                <span>✅</span>
                <div>
                  <p>Approvals Today</p>
                  <h2>5</h2>
                </div>
              </div>
            </div>

            <section className="welcome-summary">
              <div>
                <h2>Your focus for today</h2>
                <p>
                  Review supplier quotes, approve purchase requests, and keep your inventory levels optimized.
                </p>
              </div>
              <div className="summary-actions">
                <button onClick={() => setView("dashboard")}>View dashboard</button>
                <button className="secondary">Contact support</button>
              </div>
            </section>
          </div>
        </main>
      ) : (
        <main className="dashboard-page">
          <div className="dashboard-shell">
            <header className="dashboard-header">
              <div>
                <span className="welcome-badge">Procurement Dashboard</span>
                <h1>Welcome, {loggedInUser.name}</h1>
                <p>{loggedInUser.role} • easy-procure</p>
              </div>
              <button className="logout-button" onClick={handleLogout}>
                Log out
              </button>
            </header>

            <div className="dashboard-grid">
              <article className="dashboard-card">
                <h2>Current spend</h2>
                <p className="metric-large">$92,400</p>
                <p className="metric-note">Up 12% from last month</p>
              </article>
              <article className="dashboard-card">
                <h2>Active suppliers</h2>
                <p className="metric-large">42</p>
                <p className="metric-note">Highest vendor quality score</p>
              </article>
              <article className="dashboard-card">
                <h2>Open requests</h2>
                <p className="metric-large">14</p>
                <p className="metric-note">Action needed before Friday</p>
              </article>
            </div>

            <section className="dashboard-insight">
              <div>
                <h2>Today’s priorities</h2>
                <ul>
                  <li>Approve the new supplier onboarding request.</li>
                  <li>Review purchase order #4579 status.</li>
                  <li>Check inventory levels for warehouse B.</li>
                </ul>
              </div>
            </section>
          </div>
        </main>
      )}
    </div>
  );
}

export default App;
