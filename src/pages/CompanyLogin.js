import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const styles = `
  *, *::before, *::after { box-sizing: border-box; }
  .login-shell {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: linear-gradient(135deg, #f8fbff 0%, #eef4ff 100%);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .card {
    width: min(100%, 760px);
    display: flex;
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 18px 50px rgba(15, 23, 42, 0.14);
    background: #fff;
  }
  .sidebar {
    width: 240px;
    background: #111827;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 20px;
    gap: 18px;
    color: #e5e7eb;
  }
  .shield svg { width: 92px; height: 92px; }
  .sidebar-label { font-size: 15px; font-weight: 600; letter-spacing: 0.02em; }
  .form-side {
    flex: 1;
    padding: 46px 42px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 22px;
  }
  .brand-bars { display: flex; gap: 3px; align-items: flex-end; height: 24px; }
  .brand-bars div { width: 5px; border-radius: 2px; }
  .brand-wordmark { font-size: 24px; font-weight: 700; color: #111827; letter-spacing: -0.02em; }
  .brand-wordmark span { color: #22c55e; }
  .title { font-size: 18px; font-weight: 600; color: #111827; margin-bottom: 24px; }
  .login-form { width: 100%; max-width: 320px; }
  .form-group { width: 100%; margin-bottom: 16px; }
  .form-group label { display: block; font-size: 13px; color: #6b7280; margin-bottom: 6px; }
  .input-wrap { position: relative; }
  .input-wrap input {
    width: 100%;
    height: 42px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    background: #f9fafb;
    padding: 0 40px 0 14px;
    font-size: 14px;
    color: #111827;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  }
  .input-wrap input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, .14);
    background: #fff;
  }
  .eye-btn {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    border: none;
    background: transparent;
    color: #9ca3af;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
  }
  .eye-btn:hover { color: #6b7280; }
  .error-message {
    width: 100%; max-width: 320px;
    margin-bottom: 14px;
    padding: 10px 12px;
    border-radius: 8px;
    background: #fef2f2;
    color: #b91c1c;
    font-size: 13px;
    border: 1px solid #fecaca;
  }
  .success-message {
    width: 100%; max-width: 320px;
    margin-bottom: 14px;
    padding: 10px 12px;
    border-radius: 8px;
    background: #ecfdf3;
    color: #166534;
    font-size: 13px;
    border: 1px solid #a7f3d0;
  }
  .form-footer {
    width: 100%; max-width: 320px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 10px;
  }
  .forgot {
    border: none;
    background: none;
    color: #9ca3af;
    font-size: 13px;
    cursor: pointer;
    padding: 0;
  }
  .forgot:hover { color: #6b7280; text-decoration: underline; }
  .sign-in-btn {
    height: 40px;
    padding: 0 22px;
    border: none;
    border-radius: 8px;
    background: #3b82f6;
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.1s ease;
  }
  .sign-in-btn:hover { background: #2563eb; }
  .sign-in-btn:active { transform: scale(0.98); }
  .sign-in-btn:disabled { opacity: 0.7; cursor: not-allowed; }
  @media (max-width: 640px) {
    .card { flex-direction: column; }
    .sidebar { width: 100%; padding: 26px 20px; }
    .form-side { padding: 30px 22px; }
  }
`;

export default function CompanyLogin({ onLogin }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [users, setUsers] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const storedUsers = JSON.parse(localStorage.getItem("users") || "[]");
    const defaultUsers = [
      { name: "Admin", email: "admin@easyprocure.com", role: "Admin", password: "admin" },
      { name: "Lucas Obadoh", email: "lucas.obadoh@easyprocure.com", role: "Admin", password: "lucas1234" }
    ];

    const mergedUsers = [...(storedUsers.length ? storedUsers : defaultUsers)];
    if (!mergedUsers.some((user) => user.email?.toLowerCase() === "admin@easyprocure.com")) {
      mergedUsers.push(defaultUsers[0]);
    }
    if (!mergedUsers.some((user) => user.email?.toLowerCase() === "lucas.obadoh@easyprocure.com")) {
      mergedUsers.push(defaultUsers[1]);
    }

    localStorage.setItem("users", JSON.stringify(mergedUsers));
    setUsers(mergedUsers);
  }, []);

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmedLogin = login.trim();
    const trimmedPassword = password.trim();

    if (!trimmedLogin || !trimmedPassword) {
      setErrorMessage("Please enter both login and password.");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setIsLoading(true);

    const normalizedLogin = trimmedLogin.toLowerCase();
    const user = users.find((entry) => {
      const emailMatch = entry.email?.toLowerCase() === normalizedLogin;
      const nameMatch = entry.name?.toLowerCase() === normalizedLogin;
      const usernameMatch = entry.username?.toLowerCase() === normalizedLogin;
      return emailMatch || nameMatch || usernameMatch;
    });

    if (!user) {
      setIsLoading(false);
      setErrorMessage("User not found. Please check the login details.");
      return;
    }

    if (user.password !== trimmedPassword) {
      setIsLoading(false);
      setErrorMessage("Invalid password. Please try again.");
      return;
    }

    if (onLogin) onLogin(user);
    navigate("/dashboard");
  };

  const handleForgotPassword = (event) => {
    event.preventDefault();
    const trimmedEmail = resetEmail.trim().toLowerCase();

    if (!trimmedEmail) {
      setErrorMessage("Please enter your account email.");
      setSuccessMessage("");
      return;
    }

    const user = users.find((entry) => entry.email?.toLowerCase() === trimmedEmail);
    if (!user) {
      setErrorMessage("No account found for that email.");
      setSuccessMessage("");
      return;
    }

    const updatedUsers = users.map((entry) =>
      entry.email?.toLowerCase() === trimmedEmail ? { ...entry, password: "password123" } : entry
    );
    localStorage.setItem("users", JSON.stringify(updatedUsers));
    setUsers(updatedUsers);
    setSuccessMessage(`Password reset complete. Your new temporary password is password123. Please sign in and change it.`);
    setErrorMessage("");
    setResetEmail("");
    setIsForgotPassword(false);
  };

  return (
    <div className="login-shell">
      <style>{styles}</style>
      <div className="card">
        <aside className="sidebar">
          <div className="shield" aria-hidden="true">
            <svg viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M44 8L14 20V42C14 59.2 27.1 75.3 44 80C60.9 75.3 74 59.2 74 42V20L44 8Z" fill="none" stroke="url(#sg)" strokeWidth="3.5" strokeLinejoin="round" />
              <circle cx="44" cy="40" r="9" fill="none" stroke="url(#sg)" strokeWidth="3" />
              <line x1="44" y1="49" x2="44" y2="58" stroke="url(#sg)" strokeWidth="3" strokeLinecap="round" />
              <defs>
                <linearGradient id="sg" x1="14" y1="8" x2="74" y2="80" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <p className="sidebar-label">Admin portal</p>
        </aside>

        <section className="form-side">
          <div className="brand">
            <div className="brand-bars" aria-hidden="true">
              <div style={{ height: 12, background: "#22c55e" }} />
              <div style={{ height: 20, background: "#22c55e" }} />
              <div style={{ height: 14, background: "#38bdf8" }} />
            </div>
            <div className="brand-wordmark">
              Fibr<span>/</span>/<span>Connect</span>
            </div>
          </div>

          <h1 className="title">{isForgotPassword ? "Reset password" : "Administrator login"}</h1>

          {errorMessage ? <div className="error-message">{errorMessage}</div> : null}
          {successMessage ? <div className="success-message">{successMessage}</div> : null}

          {isForgotPassword ? (
            <form className="login-form" onSubmit={handleForgotPassword}>
              <div className="form-group">
                <label htmlFor="reset-email">Email address</label>
                <div className="input-wrap">
                  <input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={(event) => setResetEmail(event.target.value)}
                    placeholder="Enter your email"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="form-footer">
                <button type="button" className="forgot" onClick={() => { setIsForgotPassword(false); setErrorMessage(""); setSuccessMessage(""); }}>
                  Back to login
                </button>
                <button type="submit" className="sign-in-btn">
                  Reset password
                </button>
              </div>
            </form>
          ) : (
            <form className="login-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="login-input">Login</label>
                <div className="input-wrap">
                  <input
                    id="login-input"
                    type="text"
                    value={login}
                    onChange={(event) => setLogin(event.target.value)}
                    placeholder="Enter your username"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="pw-input">Password</label>
                <div className="input-wrap">
                  <input
                    id="pw-input"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="eye-btn"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              <div className="form-footer">
                <button type="button" className="forgot" onClick={() => { setIsForgotPassword(true); setErrorMessage(""); setSuccessMessage(""); }}>
                  Forgot your password?
                </button>
                <button type="submit" className="sign-in-btn" disabled={isLoading}>
                  {isLoading ? "Signing in…" : "Sign in"}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
