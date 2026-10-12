import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, CompatibilityResult } from "../api";

const BLOOD_LIST = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"];
const ORGANS_LIST = [
  "Kidneys",
  "Liver",
  "Heart",
  "Lungs",
  "Pancreas",
  "Intestines",
  "Corneas",
  "Skin",
  "Bone",
  "Heart Valves",
];

export default function Compatibility() {
  const [recipientBlood, setRecipientBlood] = useState("O+");
  const [organ, setOrgan] = useState("Kidneys");
  const [donorBlood, setDonorBlood] = useState("O-");
  const [result, setResult] = useState<CompatibilityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const check = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<CompatibilityResult>(
        `/compatibility/check?recipient_blood=${encodeURIComponent(recipientBlood)}&organ=${encodeURIComponent(
          organ
        )}&donor_blood=${encodeURIComponent(donorBlood)}`
      );
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  };

  useEffect(() => {
    check();
  }, [recipientBlood, organ, donorBlood]);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: "0 0 8px 0" }}>Organ & Blood Compatibility Checker</h1>
        <p style={{ color: "var(--muted)", margin: 0 }}>
          Verify ABO and Rh immunologic match criteria and locate compatible registered donors in real-time.
        </p>
      </div>

      {/* Calculator Controls */}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18 }}>
          <div>
            <label style={{ margin: "0 0 6px 0", fontWeight: 700 }}>Recipient Blood Group</label>
            <select value={recipientBlood} onChange={(e) => setRecipientBlood(e.target.value)}>
              {BLOOD_LIST.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ margin: "0 0 6px 0", fontWeight: 700 }}>Organ / Tissue Needed</label>
            <select value={organ} onChange={(e) => setOrgan(e.target.value)}>
              {ORGANS_LIST.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ margin: "0 0 6px 0", fontWeight: 700 }}>Candidate Donor Blood Group</label>
            <select value={donorBlood} onChange={(e) => setDonorBlood(e.target.value)}>
              {BLOOD_LIST.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Result Card */}
      {result?.pairCheck && (
        <div
          className="card"
          style={{
            borderLeft: `6px solid ${
              result.pairCheck.compatible ? (result.pairCheck.score === 100 ? "#16a34a" : "#0284c7") : "#dc2626"
            }`,
            marginBottom: 28,
            padding: 24,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: 800,
                    padding: "4px 12px",
                    borderRadius: 999,
                    color: "#fff",
                    background: result.pairCheck.compatible
                      ? result.pairCheck.score === 100
                        ? "#16a34a"
                        : "#0284c7"
                      : "#dc2626",
                  }}
                >
                  {result.pairCheck.compatible ? "✓ COMPATIBLE MATCH" : "✕ INCOMPATIBLE"}
                </span>
                <span style={{ fontWeight: 700, fontSize: "1.05rem" }}>
                  Match Score: {result.pairCheck.score}%
                </span>
              </div>

              <h2 style={{ margin: "8px 0 6px 0", fontSize: "1.25rem" }}>
                Donor ({donorBlood}) → Recipient ({recipientBlood}) for {organ}
              </h2>
              <p style={{ color: "#374151", margin: 0, fontSize: "0.95rem", lineHeight: 1.5 }}>
                {result.pairCheck.reason}
              </p>
            </div>

            <Link
              to={`/recipient-panel?organ=${encodeURIComponent(organ)}&blood=${encodeURIComponent(recipientBlood)}`}
            >
              <button>Request {organ} Now →</button>
            </Link>
          </div>

          <div style={{ display: "flex", gap: 16, marginTop: 18, flexWrap: "wrap" }}>
            <div style={{ background: "#f8fafc", padding: "10px 16px", borderRadius: 8, fontSize: "0.85rem" }}>
              <b>Acceptable Donor Blood Types for {recipientBlood}:</b>{" "}
              {result.allowedBloodGroups.join(", ")}
            </div>
            {result.recipientBlood === "AB+" && (
              <div style={{ background: "#ecfdf5", color: "#065f46", padding: "10px 16px", borderRadius: 8, fontSize: "0.85rem", fontWeight: 600 }}>
                ⭐ AB+ is a Universal Recipient (can safely receive from any blood group)
              </div>
            )}
            {donorBlood === "O-" && (
              <div style={{ background: "#eff6ff", color: "#1e40af", padding: "10px 16px", borderRadius: 8, fontSize: "0.85rem", fontWeight: 600 }}>
                ⭐ O- is a Universal Donor (can safely donate to any blood group)
              </div>
            )}
          </div>
        </div>
      )}

      {/* Real Matching Registered Donors in System */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: "1.2rem" }}>
            Currently Available Matching Donors for {organ} ({recipientBlood})
          </h2>
          <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
            {result?.compatibleDonors?.length || 0} active match(es) in registry
          </span>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Searching registered donor network…</p>
        ) : !result?.compatibleDonors || result.compatibleDonors.length === 0 ? (
          <div style={{ padding: "20px 0", color: "var(--muted)" }}>
            No registered active donors with {organ} currently match blood groups {result?.allowedBloodGroups.join(", ")}.
            You can submit a recipient request to be notified immediately when a match registers.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 16 }}>
            {result.compatibleDonors.map((d) => (
              <div
                key={d.id}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  padding: 16,
                  background: "#fff",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: "0.85rem" }}>
                      {d.donor_id}
                    </span>
                    <span
                      style={{
                        background: "#dcfce7",
                        color: "#15803d",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: "0.75rem",
                        fontWeight: 700,
                      }}
                    >
                      {d.matchScore}% Match
                    </span>
                  </div>

                  <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: 4 }}>
                    {d.full_name}
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontWeight: 800, color: "var(--red)", fontSize: "0.88rem" }}>
                      Blood: {d.blood_group}
                    </span>
                    <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                      {d.city || d.state || "Location on record"}
                    </span>
                  </div>

                  <div style={{ fontSize: "0.78rem", color: "#475569", marginBottom: 12 }}>
                    Pledged: {(d.organs || []).join(", ")}
                  </div>
                </div>

                <Link
                  to={`/recipient-panel?donorId=${encodeURIComponent(d.donor_id)}&organ=${encodeURIComponent(
                    organ
                  )}&blood=${encodeURIComponent(recipientBlood)}`}
                >
                  <button className="secondary" style={{ width: "100%", fontSize: "0.82rem" }}>
                    Select This Donor →
                  </button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reference Compatibility Chart */}
      <div className="card" style={{ marginTop: 24 }}>
        <h3 style={{ margin: "0 0 12px 0" }}>Reference ABO Organ Compatibility Matrix</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: 10 }}>Recipient Blood Group</th>
                <th style={{ padding: 10 }}>Compatible Donor Blood Groups</th>
                <th style={{ padding: 10 }}>Compatibility Profile</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: 10 }}><b>O-</b></td>
                <td style={{ padding: 10 }}>O-</td>
                <td style={{ padding: 10 }}>Can only receive from O- (Universal Donor)</td>
              </tr>
              <tr>
                <td style={{ padding: 10 }}><b>O+</b></td>
                <td style={{ padding: 10 }}>O+, O-</td>
                <td style={{ padding: 10 }}>Can receive from O+ or O-</td>
              </tr>
              <tr>
                <td style={{ padding: 10 }}><b>A-</b></td>
                <td style={{ padding: 10 }}>A-, O-</td>
                <td style={{ padding: 10 }}>Can receive from A- or O-</td>
              </tr>
              <tr>
                <td style={{ padding: 10 }}><b>A+</b></td>
                <td style={{ padding: 10 }}>A+, A-, O+, O-</td>
                <td style={{ padding: 10 }}>Can receive from A and O types</td>
              </tr>
              <tr>
                <td style={{ padding: 10 }}><b>B-</b></td>
                <td style={{ padding: 10 }}>B-, O-</td>
                <td style={{ padding: 10 }}>Can receive from B- or O-</td>
              </tr>
              <tr>
                <td style={{ padding: 10 }}><b>B+</b></td>
                <td style={{ padding: 10 }}>B+, B-, O+, O-</td>
                <td style={{ padding: 10 }}>Can receive from B and O types</td>
              </tr>
              <tr>
                <td style={{ padding: 10 }}><b>AB-</b></td>
                <td style={{ padding: 10 }}>AB-, A-, B-, O-</td>
                <td style={{ padding: 10 }}>Can receive from all Rh- negative types</td>
              </tr>
              <tr>
                <td style={{ padding: 10 }}><b>AB+</b></td>
                <td style={{ padding: 10 }}>All (AB+, AB-, A+, A-, B+, B-, O+, O-)</td>
                <td style={{ padding: 10 }}><b>Universal Recipient</b> (can receive from any donor)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
