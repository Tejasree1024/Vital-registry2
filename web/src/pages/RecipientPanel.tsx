import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, OrganRequest, User } from "../api";

const BLOOD_TYPES = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
const ORGANS = [
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

export default function RecipientPanel({ user }: { user: User | null }) {
  const [params] = useSearchParams();
  const [requests, setRequests] = useState<OrganRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  // Request form state
  const [formData, setFormData] = useState({
    recipient_name: user?.full_name || "",
    recipient_email: user?.email || "",
    recipient_phone: "",
    blood_group: params.get("blood") || "O+",
    organ: params.get("organ") || "Kidneys",
    urgency: "standard" as "immediate" | "high" | "standard",
    hospital_name: "",
    doctor_name: "",
    medical_notes: "",
    donor_id: params.get("donorId") || "",
  });

  // Automatically open the form if query parameters are present
  useEffect(() => {
    if (params.get("organ") || params.get("donorId") || params.get("blood")) {
      setShowForm(true);
    }
  }, [params]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const data = await api<OrganRequest[]>("/recipient/requests");
      setRequests(data || []);
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user) {
      loadRequests();
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api<OrganRequest>("/recipient/requests", "POST", formData);
      setSuccess("Your organ request has been submitted successfully and dispatched for Administrator Approval.");
      setShowForm(false);
      loadRequests();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  };

  const setField = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [field]: e.target.value });
  };

  if (!user) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40 }}>
        <h2>Sign in to Access the Recipient Panel</h2>
        <p style={{ color: "var(--muted)", maxWidth: 440, margin: "10px auto 20px" }}>
          You must be logged in to submit organ requests, track clinical approval status, and coordinate with hospital teams.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <Link to="/login"><button>Login</button></Link>
          <Link to="/register?role=recipient"><button className="secondary">Register as Recipient</button></Link>
        </div>
      </div>
    );
  }

  const counts = {
    total: requests.length,
    pending: requests.filter((r) => r.status === "pending").length,
    approved: requests.filter((r) => r.status === "approved").length,
    fulfilled: requests.filter((r) => r.status === "fulfilled").length,
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: "0 0 6px 0" }}>Recipient Organ Management Portal</h1>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Submit patient clinical requirements and monitor real-time administration review and allocation.
          </p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setError(""); setSuccess(""); }}>
          {showForm ? "Cancel Request Form" : "+ Submit New Organ Request"}
        </button>
      </div>

      {success && <div className="notice" style={{ marginBottom: 20 }}>{success}</div>}
      {error && <div className="error" style={{ marginBottom: 20 }}>{error}</div>}

      {/* Overview Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
        <div className="stat">
          <b>{counts.total}</b>
          <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Total Requests</span>
        </div>
        <div className="stat" style={{ borderTop: "3px solid #eab308" }}>
          <b style={{ color: "#ca8a04" }}>{counts.pending}</b>
          <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Pending Review</span>
        </div>
        <div className="stat" style={{ borderTop: "3px solid #16a34a" }}>
          <b style={{ color: "#16a34a" }}>{counts.approved}</b>
          <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Approved by Admin</span>
        </div>
        <div className="stat" style={{ borderTop: "3px solid #0284c7" }}>
          <b style={{ color: "#0284c7" }}>{counts.fulfilled}</b>
          <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Fulfilled / Matched</span>
        </div>
      </div>

      {/* New Request Form Modal/Card */}
      {showForm && (
        <div className="card" style={{ border: "2px solid var(--red)", padding: 24, marginBottom: 28 }}>
          <h2 style={{ margin: "0 0 4px 0" }}>Clinical Organ Request Form</h2>
          <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginBottom: 18 }}>
            Upon submission, this request is immediately queued for Administrator review. Emergency contacts and physicians will be notified upon approval.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="grid">
              <div>
                <label>Recipient Patient Full Name *</label>
                <input required value={formData.recipient_name} onChange={setField("recipient_name")} placeholder="Full legal name" />
              </div>
              <div>
                <label>Recipient Contact Email *</label>
                <input required type="email" value={formData.recipient_email} onChange={setField("recipient_email")} placeholder="email@hospital.org" />
              </div>
              <div>
                <label>Phone Number</label>
                <input type="tel" value={formData.recipient_phone} onChange={setField("recipient_phone")} placeholder="+1 (555) 000-0000" />
              </div>
              <div>
                <label>Blood Group *</label>
                <select value={formData.blood_group} onChange={setField("blood_group")}>
                  {BLOOD_TYPES.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Organ / Tissue Required *</label>
                <select value={formData.organ} onChange={setField("organ")}>
                  {ORGANS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Clinical Urgency Level *</label>
                <select value={formData.urgency} onChange={setField("urgency")}>
                  <option value="standard">Standard Priority (Elective / Stable)</option>
                  <option value="high">High Priority (Urgent Clinical Deterioration)</option>
                  <option value="immediate">IMMEDIATE / CRITICAL (Acute Life Threat)</option>
                </select>
              </div>
              <div>
                <label>Hospital / Transplant Center Name *</label>
                <input required value={formData.hospital_name} onChange={setField("hospital_name")} placeholder="e.g. Memorial General Hospital" />
              </div>
              <div>
                <label>Attending Physician / Surgeon *</label>
                <input required value={formData.doctor_name} onChange={setField("doctor_name")} placeholder="e.g. Dr. Sarah Jenkins, MD" />
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label>Preferred Candidate Donor ID (Optional)</label>
              <input
                value={formData.donor_id}
                onChange={setField("donor_id")}
                placeholder="e.g. VR-2026-F4B1 (Leave blank if not matched yet)"
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <label>Diagnosis & Clinical Medical Summary</label>
              <textarea
                value={formData.medical_notes}
                onChange={setField("medical_notes")}
                placeholder="Medical history, dialysis status, MELD/UNOS score, or any relevant clinical notes..."
                rows={3}
              />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button disabled={busy} type="submit" style={{ flex: 1 }}>
                {busy ? "Submitting Request…" : "Submit Request to Administrator"}
              </button>
              <button type="button" className="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Requests List */}
      <div className="card">
        <h2 style={{ margin: "0 0 16px 0", fontSize: "1.2rem" }}>My Organ Requests</h2>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading your organ requests…</p>
        ) : requests.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 16px" }}>
            <p style={{ color: "var(--muted)", margin: "0 0 14px 0" }}>
              You have not submitted any organ requests yet.
            </p>
            <button onClick={() => setShowForm(true)}>+ Create First Organ Request</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {requests.map((r) => (
              <div
                key={r.id}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  padding: 18,
                  background: r.status === "approved" ? "#f0fdf4" : r.status === "rejected" ? "#fef2f2" : "#fff",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <h3 style={{ margin: 0, fontSize: "1.15rem" }}>
                        {r.organ} Request for {r.recipient_name}
                      </h3>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 999,
                          color: "#fff",
                          background:
                            r.urgency === "immediate"
                              ? "#dc2626"
                              : r.urgency === "high"
                              ? "#ea580c"
                              : "#64748b",
                        }}
                      >
                        {r.urgency.toUpperCase()}
                      </span>
                    </div>

                    <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                      Blood: <b>{r.blood_group}</b> · Hospital: <b>{r.hospital_name}</b> · Physician: <b>{r.doctor_name}</b>
                    </div>
                  </div>

                  <div>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 12px",
                        borderRadius: 999,
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        color:
                          r.status === "approved"
                            ? "#15803d"
                            : r.status === "pending"
                            ? "#854d0e"
                            : r.status === "fulfilled"
                            ? "#0369a1"
                            : "#991b1b",
                        background:
                          r.status === "approved"
                            ? "#dcfce7"
                            : r.status === "pending"
                            ? "#fef9c3"
                            : r.status === "fulfilled"
                            ? "#e0f2fe"
                            : "#fee2e2",
                      }}
                    >
                      {r.status === "pending"
                        ? "🟡 PENDING ADMIN APPROVAL"
                        : r.status === "approved"
                        ? "🟢 APPROVED BY ADMIN"
                        : r.status === "fulfilled"
                        ? "🔵 MATCHED / FULFILLED"
                        : "🔴 REJECTED"}
                    </span>
                  </div>
                </div>

                {r.donor_id && (
                  <div style={{ fontSize: "0.85rem", background: "#f8fafc", padding: "6px 10px", borderRadius: 6 }}>
                    🎯 <b>Matched Donor Reference:</b> <span style={{ fontFamily: "monospace" }}>{r.donor_id}</span>
                  </div>
                )}

                {r.admin_notes && (
                  <div style={{ fontSize: "0.85rem", background: r.status === "approved" ? "#dcfce7" : "#fef2f2", padding: "8px 12px", borderRadius: 8 }}>
                    <b>Administrator Clinical Notes:</b> {r.admin_notes}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", color: "var(--muted)", borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 4 }}>
                  <span>Request ID: {r.id.slice(0, 8)}</span>
                  <span>Submitted: {new Date(r.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
