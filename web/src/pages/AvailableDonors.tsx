import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, AvailableDonor } from "../api";

const BLOOD_GROUPS = ["All", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const ORGANS = [
  "All",
  "Heart",
  "Kidneys",
  "Liver",
  "Lungs",
  "Pancreas",
  "Intestines",
  "Corneas",
  "Skin",
  "Bone",
  "Heart Valves",
];

export default function AvailableDonors() {
  const [donors, setDonors] = useState<AvailableDonor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedBlood, setSelectedBlood] = useState("All");
  const [selectedOrgan, setSelectedOrgan] = useState("All");
  const [citySearch, setCitySearch] = useState("");

  const loadDonors = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (selectedBlood !== "All") params.append("blood_group", selectedBlood);
      if (selectedOrgan !== "All") params.append("organ", selectedOrgan);
      if (citySearch.trim()) params.append("city", citySearch.trim());

      const data = await api<AvailableDonor[]>(`/donors/available?${params.toString()}`);
      setDonors(data || []);
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadDonors();
  }, [selectedBlood, selectedOrgan]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadDonors();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: "0 0 6px 0" }}>Available Organ Donors</h1>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Verified and accredited organ donors active in the national donation network.
          </p>
        </div>
        <Link to="/recipient-panel">
          <button>🏥 Request Organ as Recipient</button>
        </Link>
      </div>

      {/* Filters Card */}
      <div className="card" style={{ marginBottom: 24, padding: "18px 20px" }}>
        <form onSubmit={handleSearchSubmit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, alignItems: "end" }}>
          <div>
            <label style={{ margin: "0 0 6px 0", fontSize: "0.82rem" }}>Blood Group</label>
            <select value={selectedBlood} onChange={(e) => setSelectedBlood(e.target.value)}>
              {BLOOD_GROUPS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ margin: "0 0 6px 0", fontSize: "0.82rem" }}>Organ / Tissue</label>
            <select value={selectedOrgan} onChange={(e) => setSelectedOrgan(e.target.value)}>
              {ORGANS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ margin: "0 0 6px 0", fontSize: "0.82rem" }}>City or State</label>
            <input
              type="text"
              placeholder="Search by city/state..."
              value={citySearch}
              onChange={(e) => setCitySearch(e.target.value)}
            />
          </div>

          <div>
            <button type="submit" style={{ width: "100%", height: 42 }}>
              Apply Filters
            </button>
          </div>
        </form>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Donors Grid */}
      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
          Loading available donors…
        </div>
      ) : donors.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <h3>No matching donors found</h3>
          <p style={{ color: "var(--muted)", maxWidth: 440, margin: "8px auto 20px" }}>
            No registered donors currently match the selected blood group and organ filter. You can still submit an organ request for prioritization.
          </p>
          <Link to="/recipient-panel">
            <button>Submit Urgent Organ Request →</button>
          </Link>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 18 }}>
          {donors.map((d) => (
            <div
              key={d.id}
              className="card"
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: 20,
                borderTop: "4px solid var(--red)",
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontWeight: 700,
                      background: "#f1f5f9",
                      padding: "3px 8px",
                      borderRadius: 6,
                      fontSize: "0.82rem",
                      color: "#334155",
                    }}
                  >
                    {d.donor_id || "VR-PENDING"}
                  </span>
                  <span className="badge active">VERIFIED</span>
                </div>

                <h3 style={{ margin: "0 0 6px 0", fontSize: "1.15rem" }}>{d.full_name}</h3>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span
                    style={{
                      display: "inline-block",
                      background: "#fee2e2",
                      color: "#991b1b",
                      padding: "2px 8px",
                      borderRadius: 6,
                      fontWeight: 800,
                      fontSize: "0.85rem",
                    }}
                  >
                    {d.blood_group || "Unknown"}
                  </span>
                  <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                    {d.city && d.state ? `${d.city}, ${d.state}` : d.city || d.state || "Location on record"}
                  </span>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>
                    Pledged Organs
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {(d.organs || []).map((org) => (
                      <span
                        key={org}
                        style={{
                          background: "#f3f4f6",
                          color: "#1f2937",
                          fontSize: "0.75rem",
                          padding: "2px 6px",
                          borderRadius: 4,
                        }}
                      >
                        {org}
                      </span>
                    ))}
                  </div>
                </div>

                {d.donation_type && (
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: 12 }}>
                    Type: <b style={{ color: "#374151" }}>{d.donation_type.replace("_", " ")}</b>
                  </div>
                )}
              </div>

              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 10 }}>
                <Link
                  to={`/recipient-panel?donorId=${encodeURIComponent(d.donor_id || "")}&blood=${encodeURIComponent(
                    d.blood_group || ""
                  )}`}
                  style={{ textDecoration: "none" }}
                >
                  <button className="secondary" style={{ width: "100%", fontSize: "0.85rem" }}>
                    Request Allocation →
                  </button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
