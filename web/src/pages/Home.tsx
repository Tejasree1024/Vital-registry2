import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, User } from "../api";

export default function Home({ user }: { user: User | null }) {
  const [stats, setStats] = useState<{ totalDonors: number; organsCount: number }>({ totalDonors: 0, organsCount: 10 });

  useEffect(() => {
    api<{ total?: number }>("/donors/available")
      .then((res: any) => {
        if (Array.isArray(res)) {
          setStats((prev) => ({ ...prev, totalDonors: res.length }));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div>
      {/* Hero Section */}
      <div
        className="card"
        style={{
          background: "linear-gradient(135deg, #be123c 0%, #881337 60%, #4c0519 100%)",
          color: "#fff",
          padding: "48px 36px",
          borderRadius: 20,
          marginBottom: 32,
          boxShadow: "0 10px 25px -5px rgba(190, 18, 60, 0.25)",
        }}
      >
        <div style={{ maxWidth: 640 }}>
          <div
            style={{
              display: "inline-block",
              background: "rgba(255, 255, 255, 0.15)",
              backdropFilter: "blur(8px)",
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: "0.82rem",
              fontWeight: 600,
              letterSpacing: 0.5,
              marginBottom: 16,
            }}
          >
            NATIONAL DONOR & RECIPIENT REGISTRY
          </div>
          <h1 style={{ fontSize: "2.4rem", lineHeight: 1.2, margin: "0 0 16px 0", color: "#fff" }}>
            Connecting Life-Saving Donors with Critical Recipients
          </h1>
          <p style={{ fontSize: "1.1rem", lineHeight: 1.6, opacity: 0.9, margin: "0 0 28px 0" }}>
            A verified platform where donors create digital pledges, patients in need request vital organs,
            and medical administrators ensure ethical, expedited clinical approval.
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {!user ? (
              <>
                <Link to="/register?role=donor">
                  <button style={{ background: "#fff", color: "#be123c", fontWeight: 700, padding: "12px 22px" }}>
                    ❤️ Register as Donor
                  </button>
                </Link>
                <Link to="/register?role=recipient">
                  <button
                    style={{
                      background: "rgba(255, 255, 255, 0.2)",
                      border: "1px solid rgba(255, 255, 255, 0.5)",
                      color: "#fff",
                      fontWeight: 600,
                      padding: "12px 22px",
                    }}
                  >
                    🏥 Request Organ as Recipient
                  </button>
                </Link>
              </>
            ) : user.role === "recipient" ? (
              <Link to="/recipient-panel">
                <button style={{ background: "#fff", color: "#be123c", fontWeight: 700, padding: "12px 22px" }}>
                  Open Recipient Portal →
                </button>
              </Link>
            ) : user.role === "admin" ? (
              <Link to="/admin">
                <button style={{ background: "#fff", color: "#be123c", fontWeight: 700, padding: "12px 22px" }}>
                  Open Admin Command Console →
                </button>
              </Link>
            ) : (
              <Link to="/dashboard">
                <button style={{ background: "#fff", color: "#be123c", fontWeight: 700, padding: "12px 22px" }}>
                  View My Donor Card →
                </button>
              </Link>
            )}

            <Link to="/compatibility">
              <button
                className="secondary"
                style={{
                  background: "transparent",
                  borderColor: "rgba(255, 255, 255, 0.6)",
                  color: "#fff",
                  padding: "12px 20px",
                }}
              >
                🧬 Check Compatibility
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* Feature Navigation Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18, marginBottom: 32 }}>
        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "2rem", marginBottom: 10 }}>🔍</div>
            <h3 style={{ margin: "0 0 8px 0" }}>Available Donors</h3>
            <p style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.5, margin: 0 }}>
              Search accredited active donors filtered by blood group, organ, and state with protected privacy.
            </p>
          </div>
          <Link to="/donors" style={{ marginTop: 16 }}>
            <button className="secondary" style={{ width: "100%" }}>Browse Donors →</button>
          </Link>
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "2rem", marginBottom: 10 }}>🧬</div>
            <h3 style={{ margin: "0 0 8px 0" }}>Compatibility Checker</h3>
            <p style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.5, margin: 0 }}>
              Interactive medical ABO and Rh factor tool calculating compatibility scores and matching donors.
            </p>
          </div>
          <Link to="/compatibility" style={{ marginTop: 16 }}>
            <button className="secondary" style={{ width: "100%" }}>Check Match →</button>
          </Link>
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "2rem", marginBottom: 10 }}>🏥</div>
            <h3 style={{ margin: "0 0 8px 0" }}>Recipient Panel</h3>
            <p style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.5, margin: 0 }}>
              Submit emergency or standard organ requests for your hospital and track clinical admin approval.
            </p>
          </div>
          <Link to="/recipient-panel" style={{ marginTop: 16 }}>
            <button className="secondary" style={{ width: "100%" }}>Recipient Portal →</button>
          </Link>
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "2rem", marginBottom: 10 }}>❤️</div>
            <h3 style={{ margin: "0 0 8px 0" }}>Donor Panel</h3>
            <p style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.5, margin: 0 }}>
              Manage your personal donation pledge, view your official digital donor card, and scan your QR badge.
            </p>
          </div>
          <Link to="/dashboard" style={{ marginTop: 16 }}>
            <button className="secondary" style={{ width: "100%" }}>Donor Portal →</button>
          </Link>
        </div>
      </div>

      {/* How the Process Works */}
      <div className="card">
        <h2 style={{ marginBottom: 20 }}>How Vital Registry Coordinates Life Saving Care</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
          <div style={{ borderLeft: "3px solid var(--red)", paddingLeft: 14 }}>
            <div style={{ fontWeight: 700, color: "var(--red)", marginBottom: 4 }}>1. Donor Pledges</div>
            <p style={{ fontSize: "0.88rem", color: "var(--muted)", margin: 0 }}>
              Individuals record digital legal consent, specify organs & blood type, and obtain verified QR donor cards.
            </p>
          </div>

          <div style={{ borderLeft: "3px solid #0284c7", paddingLeft: 14 }}>
            <div style={{ fontWeight: 700, color: "#0284c7", marginBottom: 4 }}>2. Recipient Requests</div>
            <p style={{ fontSize: "0.88rem", color: "var(--muted)", margin: 0 }}>
              Patients and attending transplant physicians submit clinical requests indicating hospital urgency.
            </p>
          </div>

          <div style={{ borderLeft: "3px solid #16a34a", paddingLeft: 14 }}>
            <div style={{ fontWeight: 700, color: "#16a34a", marginBottom: 4 }}>3. Admin Clinical Approval</div>
            <p style={{ fontSize: "0.88rem", color: "var(--muted)", margin: 0 }}>
              Registry administrators review medical records, match compatible donors, and approve allocation with automated notification.
            </p>
          </div>

          <div style={{ borderLeft: "3px solid #7c3aed", paddingLeft: 14 }}>
            <div style={{ fontWeight: 700, color: "#7c3aed", marginBottom: 4 }}>4. Expedited Transport</div>
            <p style={{ fontSize: "0.88rem", color: "var(--muted)", margin: 0 }}>
              Coordinators liaise with regional hospital teams for crossmatching and organ retrieval.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
