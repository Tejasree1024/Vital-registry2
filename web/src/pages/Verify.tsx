import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";

interface V { valid: boolean; status: string; donorId: string; name: string; bloodGroup: string; organs: string[] }

export default function Verify() {
  const { donorId } = useParams();
  const [v, setV] = useState<V | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => { api<V>(`/verify/${donorId}`).then(setV).catch(() => setMissing(true)); }, [donorId]);

  if (missing) return <div className="card"><h2>❌ Donor not found</h2><p>This ID is not in the Vital Registry.</p></div>;
  if (!v) return <div className="card">Verifying…</div>;
  return (
    <div className="card">
      <h2>{v.valid ? "✅ Verified registered donor" : "⚠️ Pledge not active"}</h2>
      <p><span className={`badge ${v.status}`}>{v.status.toUpperCase()}</span></p>
      <table><tbody>
        <tr><th>Donor ID</th><td>{v.donorId}</td></tr>
        <tr><th>Name</th><td>{v.name}</td></tr>
        <tr><th>Blood group</th><td>{v.bloodGroup}</td></tr>
        <tr><th>Organs</th><td>{v.organs.join(", ") || "—"}</td></tr>
      </tbody></table>
    </div>
  );
}
