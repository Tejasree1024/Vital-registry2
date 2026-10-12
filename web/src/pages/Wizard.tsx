import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Donor } from "../api";

const STEPS = ["Personal", "Medical", "Blood & Preferences", "Organs", "Consent", "Emergency Contact", "Verify"];

const CONSENT_TEXT = `ORGAN & TISSUE DONATION INFORMATION
• Organ donation can save up to 8 lives; tissue donation can improve many more.
• Most organs are donated after death is certified by a medical team that is independent of the transplant team.
• Registering does not affect the medical care you receive. Doctors always work to save your life first.
• Donation is voluntary. You can modify, renew, or withdraw your pledge at any time from this app.
• Your family will be informed of your pledge; please discuss your decision with them.
• Your information is stored securely and shared only with authorized organ donation networks.

CONSENT
I voluntarily pledge to donate the organs and tissues I have selected. I confirm the information I provided is accurate and that I understand I can withdraw this consent at any time.`;

const GENDERS = ["Male", "Female", "Other"];
const RELATIONS = ["Spouse", "Parent", "Child", "Sibling", "Friend", "Other"];

export default function Wizard() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Donor | null>(null);
  const [meta, setMeta] = useState<{ bloodGroups: string[]; organs: string[] }>({ bloodGroups: [], organs: [] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  const [signature, setSignature] = useState("");

  useEffect(() => {
    Promise.all([api<Donor>("/donor"), api("/meta")]).then(([donor, m]) => {
      if (donor.status !== "draft") return nav("/dashboard");
      setD(donor); setMeta(m);
    }).catch((e) => setError(e.message));
  }, [nav]);

  if (!d) return <div className="card">{error || "Loading…"}</div>;

  const set = (k: keyof Donor, v: unknown) => setD({ ...d, [k]: v } as Donor);
  const text = (k: keyof Donor, label: string, type = "text") => (
    <div><label>{label}</label>
      <input type={type} value={(d[k] as string | number | null) ?? ""} onChange={(e) => set(k, e.target.value)} /></div>
  );

  const FIELDS: (keyof Donor)[][] = [
    ["full_name", "date_of_birth", "gender", "phone", "address", "city", "state", "national_id"],
    ["height_cm", "weight_kg", "medical_conditions", "medications", "allergies"],
    ["blood_group", "donation_type"],
    ["organs"],
    [],
    ["emergency_name", "emergency_relation", "emergency_phone", "emergency_email"],
    [],
  ];

  const next = async () => {
    setBusy(true); setError("");
    try {
      if (step === 4) {
        if (!d.consent_given) setD(await api<Donor>("/donor/consent", "POST", { agree, signature }));
      } else if (step === 6) {
        await api("/donor/submit", "POST");
        return nav("/dashboard");
      } else {
        const body: Record<string, unknown> = {};
        FIELDS[step].forEach((k) => (body[k] = d[k]));
        setD(await api<Donor>("/donor", "PUT", body));
      }
      setStep(step + 1);
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  const toggleOrgan = (o: string) =>
    set("organs", d.organs.includes(o) ? d.organs.filter((x) => x !== o) : [...d.organs, o]);

  return (
    <>
      <div className="steps">
        {STEPS.map((s, i) => <div key={s} className={`step ${i === step ? "on" : i < step ? "done" : ""}`}>{i + 1}. {s}</div>)}
      </div>
      <div className="card">
        <h2>{STEPS[step]}</h2>

        {step === 0 && <div className="grid">
          {text("full_name", "Full name")}{text("date_of_birth", "Date of birth", "date")}
          <div><label>Gender</label>
            <select value={d.gender ?? ""} onChange={(e) => set("gender", e.target.value)}>
              <option value="">Select</option>{GENDERS.map((g) => <option key={g}>{g}</option>)}</select></div>
          {text("phone", "Phone")}{text("address", "Address")}{text("city", "City")}{text("state", "State")}{text("national_id", "National ID (optional)")}
        </div>}

        {step === 1 && <>
          <div className="grid">{text("height_cm", "Height (cm)", "number")}{text("weight_kg", "Weight (kg)", "number")}</div>
          <label>Medical conditions (e.g. diabetes, hypertension)</label>
          <textarea value={d.medical_conditions ?? ""} onChange={(e) => set("medical_conditions", e.target.value)} />
          <label>Current medications</label>
          <textarea value={d.medications ?? ""} onChange={(e) => set("medications", e.target.value)} />
          <label>Allergies</label>
          <textarea value={d.allergies ?? ""} onChange={(e) => set("allergies", e.target.value)} />
        </>}

        {step === 2 && <>
          <label>Blood group</label>
          <div className="chips">{meta.bloodGroups.map((b) =>
            <span key={b} className={`chip ${d.blood_group === b ? "on" : ""}`} onClick={() => set("blood_group", b)}>{b}</span>)}</div>
          <label>Donation preference</label>
          <select value={d.donation_type ?? ""} onChange={(e) => set("donation_type", e.target.value)}>
            <option value="">Select</option>
            <option value="after_death">After death only</option>
            <option value="living">Living donation only</option>
            <option value="both">Both</option>
          </select>
        </>}

        {step === 3 && <>
          <p>Select the organs and tissues you wish to donate.</p>
          <div className="chips">{meta.organs.map((o) =>
            <span key={o} className={`chip ${d.organs.includes(o) ? "on" : ""}`} onClick={() => toggleOrgan(o)}>{o}</span>)}</div>
          <p><button className="secondary" onClick={() => set("organs", meta.organs)}>Select all</button></p>
        </>}

        {step === 4 && <>
          <div className="consent">{CONSENT_TEXT.split("\n").map((l, i) => <div key={i}>{l || "\u00a0"}</div>)}</div>
          {d.consent_given ? <div className="notice">Consent recorded on {new Date(d.consent_at!).toLocaleString()} by {d.consent_signature}.</div> : <>
            <label><input type="checkbox" style={{ width: "auto" }} checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I have read the information and give my consent.</label>
            <label>Digital signature (type your full name)</label>
            <input value={signature} onChange={(e) => setSignature(e.target.value)} />
          </>}
        </>}

        {step === 5 && <div className="grid">
          {text("emergency_name", "Contact name")}
          <div><label>Relationship</label>
            <select value={d.emergency_relation ?? ""} onChange={(e) => set("emergency_relation", e.target.value)}>
              <option value="">Select</option>{RELATIONS.map((r) => <option key={r}>{r}</option>)}</select></div>
          {text("emergency_phone", "Contact phone")}{text("emergency_email", "Contact email", "email")}
        </div>}

        {step === 6 && <>
          <p>Please review your details. Submitting will generate your Donor ID, digital donor card and QR code.</p>
          <table><tbody>
            {([["Name", d.full_name], ["Date of birth", d.date_of_birth], ["Phone", d.phone], ["Blood group", d.blood_group],
              ["Preference", d.donation_type], ["Organs", d.organs.join(", ")], ["Consent", d.consent_given ? "Given" : "Missing"],
              ["Emergency contact", `${d.emergency_name ?? ""} (${d.emergency_relation ?? ""}) ${d.emergency_phone ?? ""}`]] as [string, string | null][])
              .map(([k, v]) => <tr key={k}><th>{k}</th><td>{v || "—"}</td></tr>)}
          </tbody></table>
        </>}

        {error && <div className="error">{error}</div>}
        <div className="row" style={{ marginTop: 16 }}>
          {step > 0 && <button className="secondary" onClick={() => setStep(step - 1)}>Back</button>}
          <button disabled={busy || (step === 4 && !d.consent_given && (!agree || signature.trim().length < 2))} onClick={next}>
            {step === 6 ? "Confirm & Generate Donor Card" : "Save & Continue"}
          </button>
        </div>
      </div>
    </>
  );
}
