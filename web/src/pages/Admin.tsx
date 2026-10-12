import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, AvailableDonor, Donor, OrganRequest, User } from "../api";

interface Stats {
  total: number;
  active: number;
  draft: number;
  withdrawn: number;
  byBlood: Record<string, number>;
  byOrgan: Record<string, number>;
  requests?: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    fulfilled: number;
  };
}

export default function Admin({
  user,
  onUserUpdate,
}: {
  user?: User | null;
  onUserUpdate?: (u: User) => void;
}) {
  const [activeTab, setActiveTab] = useState<"requests" | "donors">("requests");
  const [donors, setDonors] = useState<Donor[]>([]);
  const [requests, setRequests] = useState<OrganRequest[]>([]);
  const [availableDonors, setAvailableDonors] = useState<AvailableDonor[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [donorFilter, setDonorFilter] = useState({ status: "", blood_group: "", organ: "" });
  const [requestFilter, setRequestFilter] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [elevating, setElevating] = useState(false);

  // Approval Modal State
  const [approvingRequest, setApprovingRequest] = useState<OrganRequest | null>(null);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [assignedDonorId, setAssignedDonorId] = useState("");
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const qs = new URLSearchParams(Object.entries(donorFilter).filter(([, v]) => v)).toString();
      const [donorsData, statsData, requestsData, availDonors] = await Promise.all([
        api<Donor[]>(`/admin/donors?${qs}`),
        api<Stats>("/admin/stats"),
        api<OrganRequest[]>("/admin/requests"),
        api<AvailableDonor[]>("/donors/available"),
      ]);

      setDonors(donorsData || []);
      setStats(statsData);
      setRequests(requestsData || []);
      setAvailableDonors(availDonors || []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [donorFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const setDonorStatus = async (id: string, status: string) => {
    try {
      await api(`/admin/donors/${id}/status`, "PATCH", { status });
      setNotice(`Donor status updated to ${status}.`);
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleOpenApproveModal = (req: OrganRequest) => {
    setApprovingRequest(req);
    setApprovalNotes(`Approved for clinical transplant coordination at ${req.hospital_name}.`);
    // Preselect preferred donor if provided, otherwise find a matching donor
    if (req.donor_id) {
      setAssignedDonorId(req.donor_id);
    } else {
      const match = availableDonors.find((d) => (d.organs || []).includes(req.organ));
      setAssignedDonorId(match ? match.donor_id : "");
    }
  };

  const handleConfirmApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvingRequest) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/admin/requests/${approvingRequest.id}/approve`, "PATCH", {
        admin_notes: approvalNotes,
        donor_id: assignedDonorId || undefined,
      });
      setNotice(`Request for ${approvingRequest.recipient_name} (${approvingRequest.organ}) APPROVED! Notification email dispatched via Resend.`);
      setApprovingRequest(null);
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  };

  const handleReject = async (req: OrganRequest) => {
    const reason = prompt("Enter clinical reason for rejection:", "Does not meet current clinical criteria or lack of matching viability.");
    if (reason === null) return;
    try {
      await api(`/admin/requests/${req.id}/reject`, "PATCH", { admin_notes: reason });
      setNotice(`Request #${req.id.slice(0, 8)} set to Rejected. Recipient informed.`);
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const filteredRequests = requests.filter((r) => {
    if (requestFilter === "all") return true;
    return r.status === requestFilter;
  });

  if (!user) {
    return (
      <div className="card" style={{ maxWidth: 540, margin: "40px auto", textAlign: "center", padding: 36 }}>
        <div style={{ fontSize: "2.8rem", marginBottom: 12 }}>🛡</div>
        <h2 style={{ margin: "0 0 10px 0" }}>Administrator Sign In Required</h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.6, margin: "0 0 24px 0" }}>
          You must be signed in with an Administrator account to review, allocate, and approve recipient organ requests.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/login?portal=admin&role=admin">
            <button style={{ background: "#4c0519", padding: "10px 20px" }}>Sign In as Administrator →</button>
          </Link>
          <Link to="/register?portal=admin&role=admin">
            <button className="secondary" style={{ padding: "10px 20px" }}>Register New Admin</button>
          </Link>
        </div>
      </div>
    );
  }

  if (user && user.role !== "admin") {
    const handleElevate = async () => {
      setElevating(true);
      setError("");
      try {
        const updated = await api<User>("/profile", "PUT", { role: "admin" });
        if (onUserUpdate) onUserUpdate(updated);
        setNotice("Session successfully elevated to Administrator! Approval console unlocked.");
        loadData();
      } catch (err) {
        setError((err as Error).message);
      }
      setElevating(false);
    };

    return (
      <div className="card" style={{ maxWidth: 580, margin: "40px auto", textAlign: "center", padding: 36 }}>
        <div style={{ fontSize: "2.8rem", marginBottom: 12 }}>🔒</div>
        <h2 style={{ margin: "0 0 10px 0" }}>Administrator Authority Required</h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.6, margin: "0 0 20px 0" }}>
          You are currently signed in as <b>{user.full_name}</b> ({user.role}).
          Only registered Administrators can authorize recipient organ requests and allocate donors.
        </p>
        {notice && <div className="notice" style={{ textAlign: "left" }}>{notice}</div>}
        {error && <div className="error" style={{ textAlign: "left" }}>{error}</div>}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
          <button
            onClick={handleElevate}
            disabled={elevating}
            style={{ background: "#16a34a", padding: "11px 22px", fontWeight: 700 }}
          >
            {elevating ? "Elevating Session…" : "⚡ Switch Role to Admin & Enter Approval Console"}
          </button>
          <Link to="/login?portal=admin&role=admin">
            <button className="secondary" style={{ padding: "11px 20px" }}>
              Sign In as Dedicated Admin
            </button>
          </Link>
        </div>
      </div>
    );
  }

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedCount = requests.filter((r) => r.status === "approved").length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: "0 0 6px 0" }}>National Registry Admin Console</h1>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Review and approve clinical organ requests, allocate compatible donors, and oversee the donation network.
          </p>
        </div>
      </div>

      {notice && <div className="notice" style={{ marginBottom: 16 }}>{notice}</div>}
      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Top Stat Counters */}
      <div className="stats" style={{ marginBottom: 24 }}>
        <div className="stat" style={{ borderTop: "4px solid #eab308" }}>
          <b style={{ color: "#ca8a04" }}>{pendingCount}</b>
          Pending Approvals
        </div>
        <div className="stat" style={{ borderTop: "4px solid #16a34a" }}>
          <b style={{ color: "#16a34a" }}>{approvedCount}</b>
          Approved Requests
        </div>
        <div className="stat" style={{ borderTop: "4px solid var(--red)" }}>
          <b>{stats?.active || 0}</b>
          Active Donors
        </div>
        <div className="stat" style={{ borderTop: "4px solid #0284c7" }}>
          <b style={{ color: "#0284c7" }}>{requests.length}</b>
          Total Requests
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button
          className={activeTab === "requests" ? "" : "secondary"}
          onClick={() => setActiveTab("requests")}
          style={{ padding: "10px 18px", position: "relative" }}
        >
          🏥 Organ Requests & Approvals {pendingCount > 0 && <span style={{ background: "#dc2626", color: "#fff", padding: "1px 6px", borderRadius: 99, fontSize: "0.75rem", marginLeft: 6 }}>{pendingCount}</span>}
        </button>
        <button
          className={activeTab === "donors" ? "" : "secondary"}
          onClick={() => setActiveTab("donors")}
          style={{ padding: "10px 18px" }}
        >
          ❤️ Donor Registry ({donors.length})
        </button>
      </div>

      {/* ================= TAB 1: ORGAN REQUESTS & APPROVALS ================= */}
      {activeTab === "requests" && (
        <div>
          <div className="card" style={{ marginBottom: 20, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Filter Status:</span>
                {["all", "pending", "approved", "rejected", "fulfilled"].map((st) => (
                  <button
                    key={st}
                    className={requestFilter === st ? "" : "secondary"}
                    style={{ padding: "5px 12px", fontSize: "0.8rem", textTransform: "capitalize" }}
                    onClick={() => setRequestFilter(st)}
                  >
                    {st}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                Showing {filteredRequests.length} request(s)
              </span>
            </div>
          </div>

          {filteredRequests.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: 36, color: "var(--muted)" }}>
              No organ requests found under filter "{requestFilter}".
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {filteredRequests.map((r) => (
                <div
                  key={r.id}
                  className="card"
                  style={{
                    borderLeft: `5px solid ${
                      r.status === "approved"
                        ? "#16a34a"
                        : r.status === "pending"
                        ? "#eab308"
                        : r.status === "fulfilled"
                        ? "#0284c7"
                        : "#dc2626"
                    }`,
                    padding: 22,
                    marginBottom: 0,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: "1.25rem", fontWeight: 800 }}>
                          {r.organ} for {r.recipient_name}
                        </span>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: 6,
                            color: "#fff",
                            background:
                              r.urgency === "immediate"
                                ? "#dc2626"
                                : r.urgency === "high"
                                ? "#ea580c"
                                : "#64748b",
                          }}
                        >
                          {r.urgency.toUpperCase()} PRIORITY
                        </span>
                        <span
                          style={{
                            fontSize: "0.78rem",
                            fontWeight: 800,
                            background: "#fee2e2",
                            color: "#991b1b",
                            padding: "2px 8px",
                            borderRadius: 6,
                          }}
                        >
                          Blood: {r.blood_group}
                        </span>
                      </div>

                      <div style={{ fontSize: "0.88rem", color: "#475569", lineHeight: 1.5 }}>
                        Hospital: <b>{r.hospital_name}</b> · Attending Physician: <b>{r.doctor_name}</b>
                        <br />
                        Contact: <b>{r.recipient_email}</b> {r.recipient_phone ? `· ${r.recipient_phone}` : ""}
                      </div>

                      {r.medical_notes && (
                        <div style={{ background: "#f8fafc", padding: "8px 12px", borderRadius: 8, fontSize: "0.85rem", marginTop: 8, color: "#334155" }}>
                          <b>Clinical Diagnosis:</b> {r.medical_notes}
                        </div>
                      )}

                      {r.donor_id && (
                        <div style={{ fontSize: "0.85rem", marginTop: 6, color: "#0369a1" }}>
                          🎯 <b>Assigned Donor:</b> <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{r.donor_id}</span>
                        </div>
                      )}

                      {r.admin_notes && (
                        <div style={{ fontSize: "0.85rem", marginTop: 6, color: r.status === "approved" ? "#15803d" : "#991b1b" }}>
                          <b>Admin Clinical Notes:</b> {r.admin_notes}
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 160 }}>
                      <span
                        style={{
                          textAlign: "center",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          padding: "4px 10px",
                          borderRadius: 999,
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
                          ? "🟡 PENDING APPROVAL"
                          : r.status === "approved"
                          ? "🟢 APPROVED"
                          : r.status === "fulfilled"
                          ? "🔵 FULFILLED"
                          : "🔴 REJECTED"}
                      </span>

                      {r.status === "pending" && (
                        <>
                          <button
                            style={{ background: "#16a34a", padding: "8px 14px", fontSize: "0.85rem" }}
                            onClick={() => handleOpenApproveModal(r)}
                          >
                            ✓ Approve Request
                          </button>
                          <button
                            className="danger"
                            style={{ background: "#dc2626", padding: "6px 14px", fontSize: "0.82rem" }}
                            onClick={() => handleReject(r)}
                          >
                            ✕ Reject
                          </button>
                        </>
                      )}

                      {r.status === "approved" && (
                        <button
                          className="secondary"
                          style={{ fontSize: "0.82rem", padding: "6px 12px" }}
                          onClick={() => handleOpenApproveModal(r)}
                        >
                          Update Allocation
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 14, display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--muted)" }}>
                    <span>Request ID: {r.id}</span>
                    <span>Submitted: {new Date(r.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 2: DONOR NETWORK ================= */}
      {activeTab === "donors" && (
        <div className="card">
          <div className="row" style={{ marginBottom: 14 }}>
            <select
              value={donorFilter.status}
              onChange={(e) => setDonorFilter({ ...donorFilter, status: e.target.value })}
              style={{ width: "auto" }}
            >
              <option value="">Any status</option>
              {["active", "draft", "withdrawn", "expired"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              value={donorFilter.blood_group}
              onChange={(e) => setDonorFilter({ ...donorFilter, blood_group: e.target.value })}
              style={{ width: "auto" }}
            >
              <option value="">Any blood group</option>
              {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              value={donorFilter.organ}
              onChange={(e) => setDonorFilter({ ...donorFilter, organ: e.target.value })}
              style={{ width: "auto" }}
            >
              <option value="">Any organ</option>
              {Object.keys(stats?.byOrgan || {}).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Donor ID</th>
                  <th>Name</th>
                  <th>Blood</th>
                  <th>Organs</th>
                  <th>Status</th>
                  <th>Network</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {donors.map((d) => (
                  <tr key={d.id}>
                    <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{d.donor_id || "—"}</td>
                    <td>{d.full_name}</td>
                    <td>
                      <span style={{ fontWeight: 800, color: "var(--red)" }}>{d.blood_group}</span>
                    </td>
                    <td>{(d.organs || []).join(", ")}</td>
                    <td>
                      <span className={`badge ${d.status}`}>{d.status}</span>
                    </td>
                    <td>{d.network_status}</td>
                    <td>
                      {d.donor_id && (
                        d.status === "active" ? (
                          <button className="secondary" style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={() => setDonorStatus(d.id, "withdrawn")}>
                            Unlink
                          </button>
                        ) : (
                          <button style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={() => setDonorStatus(d.id, "active")}>
                            Activate
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= APPROVAL MODAL ================= */}
      {approvingRequest && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 540,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              border: "2px solid #16a34a",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ margin: 0, color: "#15803d" }}>✓ Approve Organ Request</h2>
              <button
                type="button"
                className="secondary"
                style={{ padding: "4px 10px", border: "none" }}
                onClick={() => setApprovingRequest(null)}
              >
                ✕
              </button>
            </div>

            <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "0 0 16px 0" }}>
              Approving will update the request status, link the matched donor, and <b>send an official confirmation email via Resend to {approvingRequest.recipient_email}</b>.
            </p>

            <form onSubmit={handleConfirmApproval}>
              <div style={{ background: "#f8fafc", padding: 14, borderRadius: 10, marginBottom: 16, fontSize: "0.88rem" }}>
                <div>Patient: <b>{approvingRequest.recipient_name}</b> (Blood: <b>{approvingRequest.blood_group}</b>)</div>
                <div>Organ Required: <b>{approvingRequest.organ}</b></div>
                <div>Urgency: <b style={{ color: "#dc2626" }}>{approvingRequest.urgency.toUpperCase()}</b></div>
                <div>Hospital: <b>{approvingRequest.hospital_name}</b></div>
              </div>

              <div>
                <label>Assign Compatible Donor from Registry</label>
                <select
                  value={assignedDonorId}
                  onChange={(e) => setAssignedDonorId(e.target.value)}
                  style={{ fontWeight: 600 }}
                >
                  <option value="">-- No Specific Donor (General Priority Allocation) --</option>
                  {availableDonors
                    .filter((d) => (d.organs || []).includes(approvingRequest.organ))
                    .map((d) => (
                      <option key={d.id} value={d.donor_id}>
                        {d.donor_id} - Blood {d.blood_group} ({d.city || "Registry"})
                      </option>
                    ))}
                </select>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 4 }}>
                  Filtered by donors who pledged {approvingRequest.organ}.
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <label>Administrator Clinical Approval Notes</label>
                <textarea
                  required
                  rows={3}
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder="Clinical approval notes dispatched to recipient and hospital..."
                />
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button
                  type="submit"
                  disabled={busy}
                  style={{ flex: 1, background: "#16a34a" }}
                >
                  {busy ? "Approving & Notifying…" : "✓ Confirm Approval & Dispatch Email"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setApprovingRequest(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
