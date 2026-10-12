import { useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { token, User } from "./api";
import Home from "./pages/Home";
import AvailableDonors from "./pages/AvailableDonors";
import Compatibility from "./pages/Compatibility";
import RecipientPanel from "./pages/RecipientPanel";
import Profile from "./pages/Profile";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import AuthPage from "./pages/AuthPage";
import Wizard from "./pages/Wizard";
import Verify from "./pages/Verify";

const loadUser = (): User | null => {
  try {
    return JSON.parse(localStorage.getItem("vr_user") || "null");
  } catch {
    return null;
  }
};

export default function App() {
  const [user, setUser] = useState<User | null>(token.get() ? loadUser() : null);
  const nav = useNavigate();

  const handleUserUpdate = (updated: User) => {
    localStorage.setItem("vr_user", JSON.stringify(updated));
    setUser(updated);
  };

  const login = (t: string, u: User) => {
    token.set(t);
    handleUserUpdate(u);
    if (u.role === "admin") {
      nav("/admin");
    } else if (u.role === "recipient") {
      nav("/recipient-panel");
    } else {
      nav("/donor-panel");
    }
  };

  const logout = () => {
    token.clear();
    localStorage.removeItem("vr_user");
    setUser(null);
    nav("/login");
  };

  return (
    <>
      <header className="nav">
        <Link to="/" className="brand">
          <span style={{ fontSize: "1.3rem" }}>❤</span> Vital Registry
        </Link>

        <nav className="nav-links">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            Home
          </NavLink>
          <NavLink
            to="/donors"
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            Donors Availability
          </NavLink>
          <NavLink
            to="/compatibility"
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            Compatibility Check
          </NavLink>
          <NavLink
            to="/donor-panel"
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            Donor Panel
          </NavLink>
          <NavLink
            to="/recipient-panel"
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            Recipient Panel
          </NavLink>
          <NavLink
            to="/admin"
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            Admin Panel
          </NavLink>
        </nav>

        <span className="spacer" />

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {user ? (
            <>
              <span
                style={{
                  background:
                    user.role === "admin"
                      ? "#4c0519"
                      : user.role === "recipient"
                      ? "#0284c7"
                      : "#059669",
                  color: "#fff",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "3px 8px",
                  borderRadius: 6,
                  letterSpacing: "0.5px",
                }}
              >
                {user.role}
              </span>
              <NavLink
                to="/profile"
                className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                style={{ padding: "5px 10px" }}
              >
                👤 Profile
              </NavLink>
              <span style={{ fontWeight: 600, fontSize: "0.88rem", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.full_name}
              </span>
              <button
                className="secondary"
                onClick={logout}
                style={{ padding: "6px 12px", fontSize: "0.82rem" }}
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login?portal=admin&role=admin"
                className="nav-link"
                style={{
                  background: "#4c0519",
                  color: "#fff",
                  fontSize: "0.82rem",
                  padding: "6px 12px",
                  borderRadius: 6,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                🛡 Admin Sign In
              </Link>
              <Link to="/login" className="nav-link">
                Login
              </Link>
              <Link to="/register">
                <button style={{ padding: "7px 14px", fontSize: "0.85rem" }}>
                  Register
                </button>
              </Link>
            </>
          )}
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Home user={user} />} />
          <Route path="/donors" element={<AvailableDonors />} />
          <Route path="/compatibility" element={<Compatibility />} />
          <Route path="/recipient-panel" element={<RecipientPanel user={user} />} />
          <Route path="/donor-panel" element={user ? <Dashboard /> : <Navigate to="/login" />} />
          <Route path="/dashboard" element={<Navigate to="/donor-panel" />} />
          <Route
            path="/profile"
            element={user ? <Profile user={user} onUserUpdate={handleUserUpdate} /> : <Navigate to="/login" />}
          />
          <Route path="/admin" element={<Admin user={user} onUserUpdate={handleUserUpdate} />} />
          <Route path="/register-donor" element={user ? <Wizard /> : <Navigate to="/login" />} />
          <Route path="/verify/:donorId" element={<Verify />} />
          <Route path="/login" element={<AuthPage onAuth={login} />} />
          <Route path="/register" element={<AuthPage onAuth={login} register />} />
          <Route path="/auth-token" element={<AuthPage onAuth={login} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </>
  );
}
