import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Donor, OrganRequest, User } from "../api";

export default function Profile({
  user,
  onUserUpdate,
}: {
  user: User | null;
  onUserUpdate: (u: User) => void;
}) {
  const [profile, setProfile] = useState<{ user: User; donor: Donor | null; requestsCount: number } | null>(null);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"donor" | "recipient" | "admin">("donor");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name);
      setRole(user.role);
      api<{ user: User; donor: Donor | null; requestsCount: number }>("/profile")
        .then((data) => {
          setProfile(data);
          if (data.user) {
            setFullName(data.user.full_name);
            setRole(data.user.role);
          }
        })
        .catch(() => {});
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const updated = await api<User>("/profile", "PUT", { full_name: fullName, role });
      onUserUpdate(updated);
      setMsg("Profile and active role updated successfully.");
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  };

  if (!user) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40 }}>
        <h2>Sign in to view your profile</h2>
        <Link to="/login"><button style={{ marginTop: 16 }}>Go to Login</button></Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 8px 0" }}>My Profile & Settings</h1>
      <p style={{ color: "var(--muted)", marginBottom: 24 }}>
        Manage your registry account, contact information, and active registry persona.
      </p>

      {msg && <div className="notice" style={{ marginBottom: 16 }}>{msg}</div>}
      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ marginBottom: 24 }}>
        <form onSubmit={handleSave}>
          <label>Registered Email Address</label>
          <input disabled value={user.email} style={{ background: "#f8fafc", color: "#64748b" }} />

          <label style={{ marginTop: 14 }}>Full Name</label>
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} />

          <label style={{ marginTop: 14 }}>Active Registry Role</label>
          <select
            value={role}
            disabled={user.role === "admin"}
            onChange={(e) => setRole(e.target.value as any)}
          >
            <option value="donor">Organ Donor (Pledge organs, carry digital QR card)</option>
            <option value="recipient">Organ Recipient (Request organs, track clinical approval)</option>
            {user.role === "admin" && <option value="admin">Registry Administrator</option>}
          </select>
          <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 4 }}>
            Switching your role customizes your default navigation panel and features.
          </div>

          <div style={{ marginTop: 20 }}>
            <button disabled={busy} type="submit">
              {busy ? "Saving Changes…" : "Save Profile Settings"}
            </button>
          </div>
        </form>
      </div>

      {/* Role-specific summary card */}
      <div className="card">
        <h3>Registry Status Summary</h3>
        {user.role === "donor" ? (
          <div>
            <p style={{ color: "var(--muted)", margin: "0 0 14px 0" }}>
              You are currently registered as an <b>Organ Donor</b>.
            </p>
            {profile?.donor?.donor_id ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", padding: 14, borderRadius: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontFamily: "monospace" }}>{profile.donor.donor_id}</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                    Blood Group: <b>{profile.donor.blood_group}</b> · Status: <b>{profile.donor.status.toUpperCase()}</b>
                  </div>
                </div>
                <Link to="/dashboard"><button className="secondary">Open Donor Card →</button></Link>
              </div>
            ) : (
              <div>
                <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                  You have not completed your donor pledge details yet.
                </p>
                <Link to="/register-donor"><button>Complete Donor Pledge Form</button></Link>
              </div>
            )}
          </div>
        ) : user.role === "recipient" ? (
          <div>
            <p style={{ color: "var(--muted)", margin: "0 0 14px 0" }}>
              You are currently registered as an <b>Organ Recipient</b>.
            </p>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", padding: 14, borderRadius: 10 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{profile?.requestsCount || 0} Organ Request(s) Logged</div>
                <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                  Monitor administrator clinical review and matching status.
                </div>
              </div>
              <Link to="/recipient-panel"><button className="secondary">Open Recipient Portal →</button></Link>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ color: "var(--muted)", margin: "0 0 14px 0" }}>
              You are logged in as a <b>Registry Administrator</b> with national approval authority.
            </p>
            <Link to="/admin"><button>Open Admin Approval Console →</button></Link>
          </div>
        )}
      </div>
    </div>
  );
}
