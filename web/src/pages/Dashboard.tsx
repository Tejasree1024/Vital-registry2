import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Card, Donor } from "../api";

interface Note { id: string; subject: string; body: string; created_at: string }

export default function Dashboard() {
  const [d, setD] = useState<Donor | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<Partial<Donor>>({});

  const load = useCallback(async () => {
    try {
      const donor = await api<Donor>("/donor");
      setD(donor);
      setCard(donor.donor_id ? await api<Card>("/donor/card") : null);
      setNotes(await api<Note[]>("/notifications"));
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (path: string, ok: string) => {
    setError(""); setMsg("");
    try { await api(path, "POST"); setMsg(ok); await load(); } catch (e) { setError((e as Error).message); }
  };
  const save = async () => {
    try { await api("/donor", "PUT", edit); setEditing(false); setMsg("Details updated."); await load(); }
    catch (e) { setError((e as Error).message); }
  };

  if (!d) return <div className="card">{error || "Loading…"}</div>;
  if (d.status === "draft") return (
    <div className="card">
      <h1>Become a registered organ donor</h1>
      <p>Complete a short registration to create your donor pledge, digital donor card and QR code.</p>
      <Link to="/register-donor"><button>Start / Continue Registration</button></Link>
    </div>
  );

  const field = (k: keyof Donor, label: string) => (
    <div><label>{label}</label>
      <input defaultValue={(d[k] as string) ?? ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></div>
  );

  return (
    <>
      {msg && <div className="notice">{msg}</div>}
      {error && <div className="error">{error}</div>}
      {card && (
        <div className="donor-card">
          <img src={card.qr} alt="Donor verification QR code" />
          <div>
            <div style={{ opacity: 0.8, fontSize: "0.8rem" }}>VITAL REGISTRY · DIGITAL DONOR CARD</div>
            <h2 style={{ margin: "6px 0" }}>{card.fullName}</h2>
            <div className="id">{card.donorId}</div>
            <p>Blood group <b>{card.bloodGroup}</b><br />Organs: {card.organs.join(", ")}<br />
              Valid until {new Date(card.expiresAt).toLocaleDateString()}</p>
            <span className={`badge ${card.status}`}>{card.status.toUpperCase()}</span>{" "}
            <span className="badge">{card.networkStatus === "linked" ? "Connected to donation network" : "Not connected"}</span>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Manage pledge</h3>
        <div className="row">
          <button onClick={() => act("/donor/renew", "Pledge renewed for one year.")}>
            {d.status === "withdrawn" ? "Re-activate pledge" : "Renew pledge"}</button>
          {d.status !== "withdrawn" && (
            <button className="danger" onClick={() => confirm("Withdraw your donation pledge?") && act("/donor/withdraw", "Pledge withdrawn.")}>Withdraw pledge</button>)}
          {d.status !== "withdrawn" && <button className="secondary" onClick={() => { setEditing(!editing); setEdit({}); }}>{editing ? "Cancel edit" : "Update details"}</button>}
          {card && <a href={card.verifyUrl} target="_blank" rel="noreferrer">Open public verification page</a>}
        </div>
        {editing && <>
          <div className="grid">{field("full_name", "Full name")}{field("phone", "Phone")}{field("address", "Address")}{field("city", "City")}
            {field("medical_conditions", "Medical conditions")}{field("medications", "Medications")}
            {field("emergency_name", "Emergency contact name")}{field("emergency_phone", "Emergency contact phone")}</div>
          <p><button onClick={save}>Save changes</button></p>
        </>}
      </div>

      <div className="card">
        <h3>Notifications</h3>
        {notes.length === 0 ? <p>No notifications yet.</p> : notes.map((n) => (
          <div key={n.id} style={{ borderBottom: "1px solid var(--line)", padding: "8px 0" }}>
            <b>{n.subject}</b> <small>{new Date(n.created_at).toLocaleString()}</small>
            <div style={{ whiteSpace: "pre-line", color: "var(--muted)" }}>{n.body}</div>
          </div>))}
      </div>
    </>
  );
}
