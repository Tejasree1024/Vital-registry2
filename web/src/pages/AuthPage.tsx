import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, User } from "../api";

export default function AuthPage({
  onAuth,
  register,
}: {
  onAuth: (t: string, u: User) => void;
  register?: boolean;
}) {
  const [params] = useSearchParams();
  const initialRoleParam = params.get("role") || "";
  const initialPortalParam = params.get("portal") || "";
  const isAdminInitial = initialRoleParam === "admin" || initialPortalParam === "admin";

  const [portal, setPortal] = useState<"user" | "admin">(isAdminInitial ? "admin" : "user");
  const [authMode, setAuthMode] = useState<"password" | "otp">("password");
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    otp: "",
    role: (isAdminInitial
      ? "admin"
      : initialRoleParam === "recipient"
      ? "recipient"
      : "donor") as "donor" | "recipient" | "admin",
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [registeredData, setRegisteredData] = useState<{ token: string; user: User; otp?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const urlOtp = params.get("otp");
    const urlEmail = params.get("email");
    const urlToken = params.get("token");
    const urlRole = params.get("role");
    const urlPortal = params.get("portal");

    if (urlRole === "admin" || urlPortal === "admin") {
      setPortal("admin");
      setForm((prev) => ({ ...prev, role: "admin" }));
    } else if (urlRole === "recipient" || urlRole === "donor") {
      setPortal("user");
      setForm((prev) => ({ ...prev, role: urlRole }));
    }

    if (urlEmail) {
      setForm((prev) => ({ ...prev, email: urlEmail }));
    }

    if (urlOtp) {
      setAuthMode("otp");
      setForm((prev) => ({ ...prev, otp: urlOtp, email: urlEmail || prev.email }));
      setBusy(true);
      setError("");
      api<{ token: string; user: User }>("/auth/verify-otp", "POST", { otp: urlOtp, email: urlEmail })
        .then((r) => onAuth(r.token, r.user))
        .catch((err) => {
          setError(`OTP verification failed: ${(err as Error).message}`);
          setBusy(false);
        });
    } else if (urlToken) {
      setBusy(true);
      setError("");
      api<{ token: string; user: User }>("/auth/verify-token", "POST", { token: urlToken })
        .then((r) => onAuth(r.token, r.user))
        .catch((err) => {
          setError(`Token verification failed: ${(err as Error).message}`);
          setBusy(false);
        });
    }
  }, [params, onAuth]);

  // When portal mode changes, align the role
  const switchPortal = (p: "user" | "admin") => {
    setPortal(p);
    setError("");
    setNotice("");
    if (p === "admin") {
      setForm((prev) => ({ ...prev, role: "admin" }));
    } else {
      setForm((prev) => ({ ...prev, role: prev.role === "admin" ? "donor" : prev.role }));
    }
  };

  const fillDemoAdmin = () => {
    setForm((prev) => ({
      ...prev,
      email: "admin@vitalregistry.org",
      password: "AdminSecure123!",
      role: "admin",
    }));
    setNotice("Demo Admin credentials auto-filled. Click 'Sign In' below.");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (authMode === "otp") {
        if (!form.otp || form.otp.length !== 6) {
          throw new Error("Please enter a valid 6-digit OTP code");
        }
        const r = await api<{ token: string; user: User }>("/auth/verify-otp", "POST", {
          email: form.email,
          otp: form.otp,
        });
        onAuth(r.token, r.user);
      } else if (register) {
        const payload = {
          fullName: form.fullName,
          email: form.email,
          password: form.password,
          role: form.role,
        };
        const r = await api<{ token: string; user: User; otp?: string }>("/auth/register", "POST", payload);
        setRegisteredData(r);
        setNotice(`Account registered! Your 6-digit OTP code has been delivered to ${form.email}.`);
      } else {
        const r = await api<{ token: string; user: User }>("/auth/login", "POST", {
          email: form.email,
          password: form.password,
        });
        onAuth(r.token, r.user);
      }
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  };

  const requestOtp = async () => {
    if (!form.email) {
      setError("Please enter your registered email address first.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await api<{ message: string; otp?: string }>("/auth/request-otp", "POST", { email: form.email });
      setNotice(res.message || "A 6-digit OTP verification code has been dispatched to your email.");
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  };

  const copyOtp = () => {
    const code = registeredData?.otp;
    if (code) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  // Registration Success / 6-digit OTP Screen
  if (registeredData) {
    const roleLabel =
      registeredData.user.role === "admin"
        ? "Medical Administrator"
        : registeredData.user.role === "recipient"
        ? "Organ Recipient"
        : "Organ Donor";

    return (
      <div className="card" style={{ maxWidth: 480, margin: "40px auto", textAlign: "center" }}>
        <h1>🎉 Registration Successful</h1>
        <div className="notice" style={{ textAlign: "left", marginBottom: 14 }}>
          Your account is active as <b>{roleLabel}</b>! A 6-digit verification OTP code has been dispatched to{" "}
          <b>{registeredData.user.email}</b>.
        </div>
        <p style={{ color: "var(--muted)", fontSize: "0.95rem" }}>
          Your 6-Digit Authentication OTP Code:
        </p>

        {registeredData.otp && (
          <div
            style={{
              padding: "16px 20px",
              background: "#fff1f2",
              border: "2px dashed var(--red)",
              borderRadius: 12,
              fontSize: "2.2rem",
              fontWeight: 800,
              letterSpacing: "8px",
              color: "var(--red)",
              fontFamily: "monospace",
              margin: "14px 0",
            }}
          >
            {registeredData.otp}
          </div>
        )}

        <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
          Valid for 15 minutes. You can enter this 6-digit OTP code or your password to sign in anytime.
        </p>

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          {registeredData.otp && (
            <button type="button" className="secondary" onClick={copyOtp} style={{ flex: 1 }}>
              {copied ? "✓ Copied OTP" : "Copy 6-Digit OTP"}
            </button>
          )}
          <button
            type="button"
            onClick={() => onAuth(registeredData.token, registeredData.user)}
            style={{ flex: 1.6 }}
          >
            {registeredData.user.role === "admin"
              ? "Open Admin Approval Panel →"
              : registeredData.user.role === "recipient"
              ? "Open Recipient Panel →"
              : "Open Donor Panel →"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 480, margin: "40px auto" }}>
      {/* Top Portal Switcher Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--line)",
          marginBottom: 20,
          gap: 4,
          paddingBottom: 4,
        }}
      >
        <button
          type="button"
          className={portal === "user" ? "" : "secondary"}
          onClick={() => switchPortal("user")}
          style={{
            flex: 1,
            padding: "8px 12px",
            fontSize: "0.86rem",
            background: portal === "user" ? "var(--red)" : "transparent",
            color: portal === "user" ? "#fff" : "var(--muted)",
            border: "none",
            borderRadius: 6,
          }}
        >
          👥 Member Portal
        </button>
        <button
          type="button"
          className={portal === "admin" ? "" : "secondary"}
          onClick={() => switchPortal("admin")}
          style={{
            flex: 1,
            padding: "8px 12px",
            fontSize: "0.86rem",
            background: portal === "admin" ? "#4c0519" : "transparent",
            color: portal === "admin" ? "#fff" : "var(--muted)",
            border: "none",
            borderRadius: 6,
            fontWeight: 700,
          }}
        >
          🛡 Admin Portal
        </button>
      </div>

      {portal === "admin" && (
        <div
          style={{
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            borderRadius: 8,
            padding: "8px 12px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "0.82rem",
            color: "#9f1239",
          }}
        >
          <span><b>Admin Mode:</b> Review & approve recipient requests</span>
          {!register && (
            <button
              type="button"
              onClick={fillDemoAdmin}
              style={{
                padding: "3px 8px",
                fontSize: "0.74rem",
                background: "#9f1239",
                color: "#fff",
                border: 0,
                borderRadius: 4,
              }}
            >
              Fill Demo Admin
            </button>
          )}
        </div>
      )}

      <h1 style={{ marginBottom: 6 }}>
        {portal === "admin"
          ? register
            ? "Register as Administrator"
            : "Administrator Sign In"
          : register
          ? "Create Your Account"
          : "Welcome Back"}
      </h1>

      <p style={{ color: "var(--muted)", margin: "0 0 16px 0", fontSize: "0.92rem" }}>
        {portal === "admin"
          ? "Medical authority console to oversee matching, audit logs, and approve recipient organ requests."
          : register
          ? "Join Vital Registry to pledge life-saving organs or submit transplant requests."
          : "Secure national registry. Always protected and in your control."}
      </p>

      {/* Role Selection on Register */}
      {register && (
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 700 }}>Choose your role:</label>
          <div style={{ display: "grid", gridTemplateColumns: portal === "admin" ? "1fr" : "1fr 1fr", gap: 8 }}>
            {portal === "admin" ? (
              <div
                style={{
                  padding: "12px",
                  background: "#4c0519",
                  color: "#fff",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span style={{ fontSize: "1.8rem" }}>🛡</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: "0.95rem" }}>Medical Administrator</div>
                  <div style={{ fontSize: "0.75rem", opacity: 0.85 }}>
                    Clinical approval authority & organ allocation management
                  </div>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className={form.role === "donor" ? "" : "secondary"}
                  style={{
                    padding: "10px 8px",
                    fontSize: "0.88rem",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    border: form.role === "donor" ? "2px solid var(--red)" : "1px solid var(--border)",
                  }}
                  onClick={() => setForm((p) => ({ ...p, role: "donor" }))}
                >
                  <span style={{ fontSize: "1.2rem" }}>❤</span>
                  <b>Organ Donor</b>
                  <span style={{ fontSize: "0.72rem", opacity: 0.8 }}>Pledge & digital card</span>
                </button>
                <button
                  type="button"
                  className={form.role === "recipient" ? "" : "secondary"}
                  style={{
                    padding: "10px 8px",
                    fontSize: "0.88rem",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    border: form.role === "recipient" ? "2px solid var(--red)" : "1px solid var(--border)",
                  }}
                  onClick={() => setForm((p) => ({ ...p, role: "recipient" }))}
                >
                  <span style={{ fontSize: "1.2rem" }}>🏥</span>
                  <b>Organ Recipient</b>
                  <span style={{ fontSize: "0.72rem", opacity: 0.8 }}>Request organ & match</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Password vs OTP switch for login */}
      {!register && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            className={authMode === "password" ? "" : "secondary"}
            style={{ flex: 1, padding: "8px 12px", fontSize: "0.85rem" }}
            onClick={() => {
              setAuthMode("password");
              setError("");
              setNotice("");
            }}
          >
            Password
          </button>
          <button
            type="button"
            className={authMode === "otp" ? "" : "secondary"}
            style={{ flex: 1, padding: "8px 12px", fontSize: "0.85rem" }}
            onClick={() => {
              setAuthMode("otp");
              setError("");
              setNotice("");
            }}
          >
            6-Digit OTP
          </button>
        </div>
      )}

      {notice && <div className="notice">{notice}</div>}
      {error && <div className="error">{error}</div>}

      <form onSubmit={submit}>
        {register && (
          <>
            <label>Full name / Medical Officer Title</label>
            <input
              required
              value={form.fullName}
              onChange={set("fullName")}
              placeholder={portal === "admin" ? "e.g. Dr. Julian Vance (CMO)" : "e.g. Alex Morgan"}
            />
          </>
        )}

        <label>{portal === "admin" ? "Official Admin Email" : "Email Address"}</label>
        <input
          required
          type="email"
          value={form.email}
          onChange={set("email")}
          placeholder={portal === "admin" ? "admin@vitalregistry.org" : "user@example.com"}
        />

        {authMode === "password" && (
          <>
            <label>Password</label>
            <input
              required
              type="password"
              minLength={8}
              value={form.password}
              onChange={set("password")}
              placeholder="••••••••"
            />
          </>
        )}

        {authMode === "otp" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
              <label style={{ margin: 0 }}>6-Digit OTP Code</label>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={requestOtp}
                style={{ padding: "4px 8px", fontSize: "0.75rem" }}
              >
                Send OTP to Email
              </button>
            </div>
            <input
              required
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={form.otp}
              onChange={(e) => setForm({ ...form, otp: e.target.value.replace(/\D/g, "") })}
              placeholder="123456"
              style={{
                marginTop: 6,
                fontSize: "1.4rem",
                letterSpacing: "6px",
                textAlign: "center",
                fontWeight: 700,
                fontFamily: "monospace",
              }}
            />
            <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 4 }}>
              Check your inbox for the 6-digit verification code.
            </div>
          </>
        )}

        <p style={{ marginTop: 20 }}>
          <button
            disabled={busy}
            style={{
              width: "100%",
              background: portal === "admin" ? "#881337" : "var(--red)",
            }}
          >
            {busy
              ? "Verifying…"
              : register
              ? portal === "admin"
                ? "Register Administrator & Get OTP"
                : "Register & Get 6-Digit OTP"
              : authMode === "otp"
              ? "Verify OTP & Sign In"
              : portal === "admin"
              ? "Sign In as Administrator"
              : "Login"}
          </button>
        </p>
      </form>

      <div style={{ marginTop: 18, fontSize: "0.88rem", textAlign: "center", display: "flex", flexDirection: "column", gap: 8 }}>
        {register ? (
          <Link to={portal === "admin" ? "/login?portal=admin" : "/login"}>
            Already registered? Sign In
          </Link>
        ) : (
          <Link to={portal === "admin" ? "/register?portal=admin&role=admin" : "/register"}>
            Need an account? Register here
          </Link>
        )}

        {portal === "user" ? (
          <button
            type="button"
            className="secondary"
            onClick={() => switchPortal("admin")}
            style={{ padding: "6px 12px", fontSize: "0.8rem", marginTop: 4 }}
          >
            Switch to Administrator Portal →
          </button>
        ) : (
          <button
            type="button"
            className="secondary"
            onClick={() => switchPortal("user")}
            style={{ padding: "6px 12px", fontSize: "0.8rem", marginTop: 4 }}
          >
            ← Return to Member Portal (Donor / Recipient)
          </button>
        )}
      </div>
    </div>
  );
}
