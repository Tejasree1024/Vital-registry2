import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import QRCode from "qrcode";
import { z } from "zod";
import { env, supabase, notify, sendDirectNotification, audit } from "./config";
import {
  createOrganRequest,
  getOrganRequests,
  getOrganRequestById,
  updateOrganRequestStatus,
  checkCompatibility,
  getCompatibleBloodGroups,
  COMPATIBILITY_RULES
} from "./requestsStore";

export type Role = "donor" | "recipient" | "admin";
interface AuthedRequest extends express.Request {
  user?: { id: string; email: string; role: Role };
}

const app = express();
app.use(helmet());
app.use(cors({ origin: env.corsOrigins }));
app.use(express.json({ limit: "100kb" }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 }));

const wrap =
  (fn: (req: AuthedRequest, res: express.Response) => Promise<unknown>) =>
  (req: express.Request, res: express.Response, next: express.NextFunction) =>
    fn(req as AuthedRequest, res).catch(next);

const sign = (u: { id: string; email: string; role: Role }, expiresIn: string | number = "7d") =>
  jwt.sign(u, env.jwtSecret, { expiresIn } as jwt.SignOptions);

/** 6-digit numeric OTP generator and in-memory store */
function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

interface OtpRecord {
  code: string;
  email: string;
  userId: string;
  expiresAt: number;
}
const otpStore = new Map<string, OtpRecord>();

// Periodic cleanup of expired OTPs
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of otpStore.entries()) {
    if (record.expiresAt < now) otpStore.delete(key);
  }
}, 5 * 60 * 1000);

/** Extract token from Authorization header, x-auth-token header, or query string */
function extractToken(req: express.Request): string {
  const h = req.headers.authorization;
  if (h && h.startsWith("Bearer ")) return h.slice(7).trim();
  if (h) return h.trim();
  const headerToken = req.headers["x-auth-token"];
  if (typeof headerToken === "string" && headerToken) return headerToken.trim();
  const queryToken = req.query.token;
  if (typeof queryToken === "string" && queryToken) return queryToken.trim();
  return "";
}

function auth(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  const rawToken = extractToken(req);
  if (!rawToken) {
    return res.status(401).json({ error: "Unauthorized: Missing authentication token" });
  }
  try {
    req.user = jwt.verify(rawToken, env.jwtSecret) as AuthedRequest["user"];
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
  }
}

function adminOnly(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin only" });
  next();
}

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "Vital Registry API", resendConfigured: !!env.resendApiKey }));

/* ---------- Auth: Register / Login / Token Auth / Magic Link ---------- */
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  role: z.enum(["donor", "recipient", "admin"]).optional(),
});

app.post("/api/auth/register", wrap(async (req, res) => {
  const p = registerSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Valid name, email and 8+ char password required" });
  const email = p.data.email.toLowerCase();
  const { data: exists } = await supabase.from("users").select("id").eq("email", email).maybeSingle();
  if (exists) return res.status(409).json({ error: "Email already registered" });

  const chosenRole: Role =
    p.data.role === "admin" || email === env.adminEmail
      ? "admin"
      : p.data.role === "recipient"
      ? "recipient"
      : "donor";

  let user: any = null;
  // Attempt direct insert with chosen role
  const { data: directUser, error: directErr } = await supabase
    .from("users")
    .insert({
      email,
      password_hash: await bcrypt.hash(p.data.password, 12),
      full_name: p.data.fullName,
      role: chosenRole,
    })
    .select("id,email,full_name,role")
    .maybeSingle();

  if (!directErr && directUser) {
    user = directUser;
  } else {
    // If table constraint does not yet allow 'recipient', insert as 'donor' in DB but keep recipient in app
    const { data: fallbackUser, error: fbErr } = await supabase
      .from("users")
      .insert({
        email,
        password_hash: await bcrypt.hash(p.data.password, 12),
        full_name: p.data.fullName,
        role: "donor",
      })
      .select("id,email,full_name,role")
      .single();
    if (fbErr) throw fbErr;
    user = { ...fallbackUser, role: chosenRole };
  }

  if (chosenRole === "donor") {
    // Create Donor Profile
    await supabase.from("donors").insert({ user_id: user.id, full_name: user.full_name });
  }
  await audit(user.id, "register", chosenRole);

  const role = chosenRole;

  const token = sign({ id: user.id, email: user.email, role });
  const otp = generateOtp();
  otpStore.set(user.email, {
    code: otp,
    email: user.email,
    userId: user.id,
    expiresAt: Date.now() + 15 * 60 * 1000,
  });

  const authUrl = `${env.publicWebUrl}/login?otp=${otp}&email=${encodeURIComponent(user.email)}`;

  // Send registration confirmation and 6-digit OTP email via Resend
  await notify(
    user.id,
    user.email,
    `Welcome to Vital Registry – Verification OTP: ${otp}`,
    `Hello ${user.full_name},\n\n` +
      `Welcome to Vital Registry, the secure national organ and tissue donation registry.\n\n` +
      `Your account has been created with email: ${user.email}.\n\n` +
      `Your 6-Digit Verification Code:\n${otp}\n\n` +
      `This code is valid for 15 minutes. You can use this 6-digit OTP or your password to sign in anytime.`,
    { otpCode: otp, actionUrl: authUrl, actionText: "Sign In with OTP" }
  );

  res.status(201).json({ token, user, otp });
}));

app.post("/api/auth/login", wrap(async (req, res) => {
  const email = String(req.body?.email || "").toLowerCase();
  const { data: user } = await supabase.from("users").select("*").eq("email", email).maybeSingle();
  if (!user || !(await bcrypt.compare(String(req.body?.password || ""), user.password_hash)))
    return res.status(401).json({ error: "Invalid email or password" });
  await audit(user.id, "login");
  res.json({
    token: sign({ id: user.id, email: user.email, role: user.role }),
    user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
  });
}));

/** Current authenticated user validation */
app.get("/api/auth/me", auth, wrap(async (req, res) => {
  const { data: user } = await supabase
    .from("users")
    .select("id,email,full_name,role")
    .eq("id", req.user!.id)
    .maybeSingle();
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
}));

/** Request 6-digit OTP sent directly to registered email */
const handleRequestOtp = async (req: express.Request, res: express.Response) => {
  const email = String(req.body?.email || "").toLowerCase().trim();
  if (!email) return res.status(400).json({ error: "Email is required" });

  const { data: user } = await supabase
    .from("users")
    .select("id,email,full_name,role")
    .eq("email", email)
    .maybeSingle();

  if (!user) {
    // Return generic message to prevent email enumeration
    return res.json({ message: "If your email is registered, a 6-digit OTP code has been sent." });
  }

  const otp = generateOtp();
  otpStore.set(user.email, {
    code: otp,
    email: user.email,
    userId: user.id,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  });

  const authUrl = `${env.publicWebUrl}/login?otp=${otp}&email=${encodeURIComponent(user.email)}`;

  await notify(
    user.id,
    user.email,
    `Vital Registry – Your 6-Digit OTP: ${otp}`,
    `Hello ${user.full_name},\n\n` +
      `Your 6-digit authentication OTP is:\n\n` +
      `${otp}\n\n` +
      `This code is valid for 10 minutes. Enter this 6-digit OTP on the login screen to sign in instantly.`,
    { otpCode: otp, actionUrl: authUrl, actionText: "Sign In with OTP" }
  );

  await audit(user.id, "request_otp");
  res.json({ message: "A 6-digit OTP has been sent to your email.", email: user.email, otp });
};

app.post("/api/auth/request-otp", wrap(handleRequestOtp));
app.post("/api/auth/request-token", wrap(handleRequestOtp));

/** Verify 6-digit OTP or token */
const handleVerifyOtpOrToken = async (req: express.Request, res: express.Response) => {
  const inputCode = String(req.body?.otp || req.body?.token || req.query?.otp || req.query?.token || "").trim();
  const inputEmail = String(req.body?.email || req.query?.email || "").toLowerCase().trim();

  if (!inputCode) return res.status(400).json({ error: "6-digit OTP or token is required" });

  // 1. Check if inputCode is a 6-digit OTP
  if (/^\d{6}$/.test(inputCode)) {
    let matchedEmail = "";
    let record: OtpRecord | undefined;

    if (inputEmail && otpStore.has(inputEmail)) {
      matchedEmail = inputEmail;
      record = otpStore.get(inputEmail);
    } else {
      // Find matching OTP in store across records
      for (const [em, rec] of otpStore.entries()) {
        if (rec.code === inputCode) {
          matchedEmail = em;
          record = rec;
          break;
        }
      }
    }

    if (!record || record.code !== inputCode) {
      return res.status(401).json({ error: "Invalid 6-digit OTP code." });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(matchedEmail);
      return res.status(401).json({ error: "The 6-digit OTP has expired. Please request a new one." });
    }

    // OTP is valid! Consume it
    otpStore.delete(matchedEmail);

    const { data: user } = await supabase
      .from("users")
      .select("id,email,full_name,role")
      .eq("id", record.userId)
      .maybeSingle();

    if (!user) return res.status(404).json({ error: "User not found" });

    const sessionToken = sign({ id: user.id, email: user.email, role: user.role });
    await audit(user.id, "otp_login");
    return res.json({ token: sessionToken, user });
  }

  // 2. Fallback to JWT token verification
  try {
    const payload = jwt.verify(inputCode, env.jwtSecret) as { id: string; email: string; role: Role };
    const { data: user } = await supabase
      .from("users")
      .select("id,email,full_name,role")
      .eq("id", payload.id)
      .maybeSingle();
    if (!user) return res.status(404).json({ error: "User not found" });
    const sessionToken = sign({ id: user.id, email: user.email, role: user.role });
    await audit(user.id, "token_login");
    return res.json({ token: sessionToken, user });
  } catch {
    return res.status(401).json({ error: "Invalid or expired authentication code/token" });
  }
};

app.post("/api/auth/verify-otp", wrap(handleVerifyOtpOrToken));
app.post("/api/auth/verify-token", wrap(handleVerifyOtpOrToken));

/* ---------- Donor profile ---------- */
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
const ORGANS = ["Heart", "Kidneys", "Liver", "Lungs", "Pancreas", "Intestines", "Corneas", "Skin", "Bone", "Heart Valves"];
const emptyToNull = (v: unknown) => (v === "" ? null : v);

const profileSchema = z.object({
  full_name: z.string().min(2).optional(),
  date_of_birth: z.preprocess(emptyToNull, z.string().nullable().optional()),
  gender: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  national_id: z.string().nullable().optional(),
  height_cm: z.preprocess(emptyToNull, z.coerce.number().positive().nullable().optional()),
  weight_kg: z.preprocess(emptyToNull, z.coerce.number().positive().nullable().optional()),
  medical_conditions: z.string().nullable().optional(),
  medications: z.string().nullable().optional(),
  allergies: z.string().nullable().optional(),
  blood_group: z.preprocess(emptyToNull, z.enum(BLOOD).nullable().optional()),
  donation_type: z.preprocess(emptyToNull, z.enum(["after_death", "living", "both"]).nullable().optional()),
  organs: z.array(z.enum(ORGANS as [string, ...string[]])).optional(),
  emergency_name: z.string().nullable().optional(),
  emergency_relation: z.string().nullable().optional(),
  emergency_phone: z.string().nullable().optional(),
  emergency_email: z.preprocess(emptyToNull, z.string().email().nullable().optional()),
});

async function getDonor(userId: string) {
  const { data } = await supabase.from("donors").select("*").eq("user_id", userId).maybeSingle();
  return data;
}

app.get("/api/meta", (_req, res) => res.json({ bloodGroups: BLOOD, organs: ORGANS }));

app.get("/api/donor", auth, wrap(async (req, res) => {
  const donor = await getDonor(req.user!.id);
  if (!donor) return res.status(404).json({ error: "No donor profile" });
  res.json(donor);
}));

// Used for every step: personal, medical, blood group, preferences, organs, emergency contact, and later edits.
app.put("/api/donor", auth, wrap(async (req, res) => {
  const p = profileSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid data", details: p.error.flatten().fieldErrors });
  const donor = await getDonor(req.user!.id);
  if (!donor) return res.status(404).json({ error: "No donor profile" });
  if (donor.status === "withdrawn") return res.status(409).json({ error: "Pledge withdrawn. Renew it to edit." });
  const { data, error } = await supabase
    .from("donors")
    .update({ ...p.data, updated_at: new Date().toISOString() })
    .eq("id", donor.id)
    .select("*")
    .single();
  if (error) throw error;
  await audit(req.user!.id, "update_profile");

  // Send update notification if profile is already active or in progress
  if (data.status === "active") {
    await notify(
      req.user!.id,
      req.user!.email,
      "Vital Registry – Donor profile updated",
      `Hello ${data.full_name || "Donor"},\n\n` +
        `Your organ donor registry record and medical preferences have been updated.\n\n` +
        `Blood Group: ${data.blood_group || "Unchanged"}\n` +
        `Organs Pledged: ${(data.organs || []).join(", ") || "None"}\n\n` +
        `If you did not make this change, please inspect your Vital Registry account immediately.`,
      { actionUrl: `${env.publicWebUrl}/dashboard`, actionText: "View Dashboard" }
    );
  }

  res.json(data);
}));

/* ---------- Digital consent ---------- */
app.post("/api/donor/consent", auth, wrap(async (req, res) => {
  const signature = String(req.body?.signature || "").trim();
  if (req.body?.agree !== true || signature.length < 2)
    return res.status(400).json({ error: "You must agree and type your full name as digital signature" });
  const donor = await getDonor(req.user!.id);
  if (!donor) return res.status(404).json({ error: "No donor profile" });
  const { data, error } = await supabase
    .from("donors")
    .update({ consent_given: true, consent_at: new Date().toISOString(), consent_signature: signature })
    .eq("id", donor.id)
    .select("*")
    .single();
  if (error) throw error;
  await audit(req.user!.id, "consent_given");

  await notify(
    req.user!.id,
    req.user!.email,
    "Vital Registry – Digital Consent Recorded",
    `Hello ${data.full_name || "Donor"},\n\n` +
      `Your legal digital consent for organ and tissue donation was successfully recorded with electronic signature: "${signature}".\n\n` +
      `Recorded At: ${new Date().toUTCString()}`
  );

  res.json(data);
}));

/* ---------- Verify details -> Donor ID + QR + confirmation ---------- */
function missingFields(d: any): string[] {
  const m: string[] = [];
  if (!d.full_name) m.push("full name");
  if (!d.date_of_birth) m.push("date of birth");
  if (!d.phone) m.push("phone");
  if (!d.blood_group) m.push("blood group");
  if (!d.donation_type) m.push("donation preference");
  if (!d.organs?.length) m.push("organs/tissues");
  if (!d.consent_given) m.push("digital consent");
  if (!d.emergency_name || !d.emergency_phone) m.push("emergency contact");
  return m;
}

function newDonorId() {
  return `VR-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

app.post("/api/donor/submit", auth, wrap(async (req, res) => {
  const donor = await getDonor(req.user!.id);
  if (!donor) return res.status(404).json({ error: "No donor profile" });
  const missing = missingFields(donor);
  if (missing.length) return res.status(400).json({ error: `Incomplete: ${missing.join(", ")}`, missing });
  const now = new Date();
  const expires = new Date(now);
  expires.setFullYear(expires.getFullYear() + 1);
  const donorId = donor.donor_id || newDonorId();
  const { data, error } = await supabase
    .from("donors")
    .update({
      donor_id: donorId,
      status: "active",
      network_status: "linked",
      verified_at: now.toISOString(),
      pledge_date: donor.pledge_date || now.toISOString(),
      expires_at: expires.toISOString(),
    })
    .eq("id", donor.id)
    .select("*")
    .single();
  if (error) throw error;

  // Confirmation email to donor via Resend + in-app notification
  await notify(
    req.user!.id,
    req.user!.email,
    "Vital Registry – Registration confirmed",
    `Hello ${data.full_name},\n\n` +
      `Thank you for pledging to save lives. Your official Donor ID is ${donorId}.\n\n` +
      `Blood Group: ${data.blood_group}\n` +
      `Organs/Tissues Pledged: ${(data.organs || []).join(", ")}\n` +
      `Pledge Validity: Until ${expires.toDateString()}.\n\n` +
      `Your digital donor card and verification QR code are now available in your portal and connected to the national registry.`,
    { actionUrl: `${env.publicWebUrl}/dashboard`, actionText: "View Your Digital Donor Card" }
  );

  // If emergency contact provided an email, notify them via Resend
  if (data.emergency_email) {
    await sendDirectNotification(
      data.emergency_email,
      `Vital Registry – Designated Emergency Contact Notification for ${data.full_name}`,
      `Hello ${data.emergency_name || "Emergency Contact"},\n\n` +
        `This is an official notice from Vital Registry that ${data.full_name} has designated you as their trusted emergency contact for their organ and tissue donation pledge.\n\n` +
        `Donor ID: ${donorId}\n` +
        `Blood Group: ${data.blood_group}\n` +
        `Organs Pledged: ${(data.organs || []).join(", ")}\n` +
        `Relationship: ${data.emergency_relation || "Designated Contact"}\n\n` +
        `In an emergency care scenario, knowing their registered pledge empowers medical teams to honor their life-saving wishes.\n\n` +
        `Public Verification Record:\n${env.publicWebUrl}/verify/${donorId}`,
      { actionUrl: `${env.publicWebUrl}/verify/${donorId}`, actionText: "View Verification Record" }
    );
  }

  await audit(req.user!.id, "submit_pledge", donorId);
  res.json(data);
}));

/* ---------- Digital donor card + QR ---------- */
app.get("/api/donor/card", auth, wrap(async (req, res) => {
  const d = await getDonor(req.user!.id);
  if (!d?.donor_id) return res.status(404).json({ error: "Donor ID not generated yet" });
  const verifyUrl = `${env.publicWebUrl}/verify/${d.donor_id}`;
  const qr = await QRCode.toDataURL(verifyUrl, { width: 300, margin: 1 });
  res.json({
    donorId: d.donor_id, fullName: d.full_name, bloodGroup: d.blood_group, organs: d.organs,
    donationType: d.donation_type, status: d.status, pledgeDate: d.pledge_date,
    expiresAt: d.expires_at, networkStatus: d.network_status, verifyUrl, qr,
  });
}));

/* ---------- Pledge management ---------- */
app.post("/api/donor/renew", auth, wrap(async (req, res) => {
  const d = await getDonor(req.user!.id);
  if (!d?.donor_id) return res.status(400).json({ error: "Complete registration first" });
  if (!d.consent_given) return res.status(400).json({ error: "Consent required" });
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  const { data, error } = await supabase
    .from("donors")
    .update({ status: "active", network_status: "linked", expires_at: expires.toISOString() })
    .eq("id", d.id).select("*").single();
  if (error) throw error;

  await notify(
    req.user!.id,
    req.user!.email,
    "Vital Registry – Pledge renewed",
    `Hello ${data.full_name},\n\nYour organ donation pledge ${d.donor_id} is renewed until ${expires.toDateString()} and remains active on the donation network.`,
    { actionUrl: `${env.publicWebUrl}/dashboard`, actionText: "View Digital Card" }
  );

  if (d.emergency_email) {
    await sendDirectNotification(
      d.emergency_email,
      `Vital Registry – Pledge Renewal Notification for ${d.full_name}`,
      `Hello ${d.emergency_name || "Emergency Contact"},\n\n` +
        `This is to inform you that ${d.full_name}'s organ donation pledge (${d.donor_id}) has been renewed and remains active until ${expires.toDateString()}.`
    );
  }

  await audit(req.user!.id, "renew_pledge");
  res.json(data);
}));

app.post("/api/donor/withdraw", auth, wrap(async (req, res) => {
  const d = await getDonor(req.user!.id);
  if (!d?.donor_id) return res.status(400).json({ error: "No active pledge" });
  const { data, error } = await supabase
    .from("donors")
    .update({ status: "withdrawn", network_status: "not_linked" })
    .eq("id", d.id).select("*").single();
  if (error) throw error;

  await notify(
    req.user!.id,
    req.user!.email,
    "Vital Registry – Pledge withdrawn",
    `Hello ${d.full_name},\n\n` +
      `Your organ donation pledge ${d.donor_id} has been withdrawn and unlinked from the donation network.\n\n` +
      `You may re-activate your pledge at any time by logging into your account.`,
    { actionUrl: `${env.publicWebUrl}/dashboard`, actionText: "Open Portal" }
  );

  if (d.emergency_email) {
    await sendDirectNotification(
      d.emergency_email,
      `Vital Registry – Pledge Status Notice for ${d.full_name}`,
      `Hello ${d.emergency_name || "Emergency Contact"},\n\n` +
        `This is to inform you that ${d.full_name} has withdrawn their organ donation pledge (${d.donor_id}) from the active registry.`
    );
  }

  await audit(req.user!.id, "withdraw_pledge");
  res.json(data);
}));

app.get("/api/notifications", auth, wrap(async (req, res) => {
  const { data } = await supabase.from("notifications").select("*")
    .eq("user_id", req.user!.id).order("created_at", { ascending: false }).limit(50);
  res.json(data || []);
}));

/* ---------- Public donor verification (QR target, minimal data only) ---------- */
app.get("/api/verify/:donorId", rateLimit({ windowMs: 60_000, limit: 30 }), wrap(async (req, res) => {
  const { data: d } = await supabase.from("donors")
    .select("donor_id,full_name,blood_group,organs,status,expires_at")
    .eq("donor_id", req.params.donorId).maybeSingle();
  if (!d) return res.status(404).json({ valid: false });
  const expired = d.expires_at && new Date(d.expires_at) < new Date();
  const parts = String(d.full_name).split(" ");
  const masked = parts.map((p, i) => (i === 0 ? p : p[0] + ".")).join(" ");
  res.json({
    valid: d.status === "active" && !expired,
    status: expired && d.status === "active" ? "expired" : d.status,
    donorId: d.donor_id, name: masked, bloodGroup: d.blood_group, organs: d.status === "active" ? d.organs : [],
  });
}));

/* ---------- Admin / authorized network ---------- */
app.get("/api/admin/donors", auth, adminOnly, wrap(async (req, res) => {
  let q = supabase.from("donors").select("*").order("updated_at", { ascending: false });
  const { status, blood_group, organ } = req.query as Record<string, string>;
  if (status) q = q.eq("status", status);
  if (blood_group) q = q.eq("blood_group", blood_group);
  if (organ) q = q.contains("organs", [organ]);
  const { data, error } = await q;
  if (error) throw error;
  res.json(data);
}));

app.get("/api/admin/stats", auth, adminOnly, wrap(async (_req, res) => {
  const { data } = await supabase.from("donors").select("status,blood_group,organs");
  const rows = data || [];
  const count = (f: (r: any) => boolean) => rows.filter(f).length;
  const byBlood: Record<string, number> = {};
  const byOrgan: Record<string, number> = {};
  rows.filter((r) => r.status === "active").forEach((r) => {
    if (r.blood_group) byBlood[r.blood_group] = (byBlood[r.blood_group] || 0) + 1;
    (r.organs || []).forEach((o: string) => (byOrgan[o] = (byOrgan[o] || 0) + 1));
  });

  const allRequests = await getOrganRequests();
  const reqCount = (s: string) => allRequests.filter((r) => r.status === s).length;

  res.json({
    total: rows.length,
    active: count((r) => r.status === "active"),
    draft: count((r) => r.status === "draft"),
    withdrawn: count((r) => r.status === "withdrawn"),
    byBlood,
    byOrgan,
    requests: {
      total: allRequests.length,
      pending: reqCount("pending"),
      approved: reqCount("approved"),
      rejected: reqCount("rejected"),
      fulfilled: reqCount("fulfilled"),
    },
  });
}));

app.patch("/api/admin/donors/:id/status", auth, adminOnly, wrap(async (req, res) => {
  const status = String(req.body?.status);
  if (!["active", "withdrawn", "expired"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  const { data, error } = await supabase.from("donors").update({
    status, network_status: status === "active" ? "linked" : "not_linked",
  }).eq("id", req.params.id).select("*").single();
  if (error) throw error;
  await audit(req.user!.id, "admin_set_status", `${req.params.id}:${status}`);

  // Notify donor of status change via Resend & in-app
  if (data?.user_id) {
    const { data: userRec } = await supabase.from("users").select("email,full_name").eq("id", data.user_id).maybeSingle();
    if (userRec?.email) {
      await notify(
        data.user_id,
        userRec.email,
        "Vital Registry – Network Status Updated",
        `Hello ${userRec.full_name || "Donor"},\n\n` +
          `Your organ donor registry status has been updated to "${status}" by an administrator.\n` +
          `Donation network status: ${status === "active" ? "Linked and active" : "Unlinked"}.`,
        { actionUrl: `${env.publicWebUrl}/dashboard`, actionText: "Check Registry Status" }
      );
    }
  }

  res.json(data);
}));

/* ---------- Available Donors (Public / Recipient Search) ---------- */
app.get("/api/donors/available", wrap(async (req, res) => {
  let q = supabase
    .from("donors")
    .select("id,donor_id,full_name,blood_group,donation_type,organs,city,state,verified_at,expires_at,status")
    .eq("status", "active");

  const { blood_group, organ, city, state } = req.query as Record<string, string>;
  if (blood_group) q = q.eq("blood_group", blood_group);
  if (organ && organ !== "all") q = q.contains("organs", [organ]);
  if (city) q = q.ilike("city", `%${city}%`);
  if (state) q = q.ilike("state", `%${state}%`);

  const { data, error } = await q;
  if (error) throw error;

  // Mask full name for privacy
  const list = ((data || []) as any[]).map((d: any) => {
    const parts = String(d.full_name || "Anonymous Donor").split(" ");
    const masked = parts.map((p, i) => (i === 0 ? p : p[0] + ".")).join(" ");
    return {
      ...d,
      full_name: masked,
      isAvailable: true,
    };
  });

  res.json(list);
}));

/* ---------- Compatibility Checker Engine ---------- */
app.get("/api/compatibility/check", wrap(async (req, res) => {
  const recipientBlood = String(req.query.recipient_blood || req.query.recipientBlood || "O+");
  const organ = String(req.query.organ || "Kidneys");
  const donorBloodRaw = req.query.donor_blood || req.query.donorBlood;
  const donorBlood = donorBloodRaw ? String(donorBloodRaw) : undefined;

  let pairResult = null;
  if (donorBlood) {
    pairResult = checkCompatibility(recipientBlood, donorBlood);
  }

  const allowedBloodGroups = getCompatibleBloodGroups(recipientBlood);

  // Fetch real matching active donors from the registry
  let donorQuery = supabase
    .from("donors")
    .select("id,donor_id,full_name,blood_group,donation_type,organs,city,state,verified_at")
    .eq("status", "active")
    .in("blood_group", allowedBloodGroups);

  if (organ && organ !== "all") {
    donorQuery = donorQuery.contains("organs", [organ]);
  }

  const { data: matchedDonors } = await donorQuery.limit(20);

  const maskedMatches = ((matchedDonors || []) as any[]).map((d: any) => {
    const parts = String(d.full_name || "Donor").split(" ");
    const masked = parts.map((p, i) => (i === 0 ? p : p[0] + ".")).join(" ");
    const comp = checkCompatibility(recipientBlood, d.blood_group);
    return {
      ...d,
      full_name: masked,
      matchScore: comp.score,
      matchReason: comp.reason,
    };
  });

  res.json({
    recipientBlood,
    organ,
    allowedBloodGroups,
    pairCheck: pairResult,
    compatibleDonors: maskedMatches,
    compatibilityMatrix: COMPATIBILITY_RULES,
  });
}));

/* ---------- Recipient Organ Requests ---------- */
const organRequestSchema = z.object({
  recipient_name: z.string().min(2),
  recipient_email: z.string().email(),
  recipient_phone: z.string().optional().nullable(),
  blood_group: z.enum(BLOOD),
  organ: z.string().min(2),
  urgency: z.enum(["immediate", "high", "standard"]).default("standard"),
  hospital_name: z.string().min(2),
  doctor_name: z.string().min(2),
  medical_notes: z.string().optional().nullable(),
  donor_id: z.string().optional().nullable(),
});

app.post("/api/recipient/requests", auth, wrap(async (req, res) => {
  const p = organRequestSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid request details", details: p.error.flatten().fieldErrors });

  const record = await createOrganRequest({
    recipient_user_id: req.user!.id,
    recipient_name: p.data.recipient_name,
    recipient_email: p.data.recipient_email,
    recipient_phone: p.data.recipient_phone || null,
    blood_group: p.data.blood_group,
    organ: p.data.organ,
    urgency: p.data.urgency,
    hospital_name: p.data.hospital_name,
    doctor_name: p.data.doctor_name,
    medical_notes: p.data.medical_notes || "",
    donor_id: p.data.donor_id || null,
  });

  await audit(req.user!.id, "submit_organ_request", `${record.organ}:${record.urgency}`);

  // Notify recipient via Resend + in-app
  await notify(
    req.user!.id,
    record.recipient_email,
    `Vital Registry – Organ Request Received: ${record.organ}`,
    `Hello ${record.recipient_name},\n\n` +
      `Your organ request for ${record.organ} (Urgency: ${record.urgency.toUpperCase()}) has been received and logged under Request ID #${record.id.slice(0, 8)}.\n\n` +
      `Hospital: ${record.hospital_name}\n` +
      `Attending Physician: ${record.doctor_name}\n` +
      `Blood Group: ${record.blood_group}\n\n` +
      `The registry clinical administration team has been alerted. You will receive an email immediately once the request is reviewed and approved.`,
    { actionUrl: `${env.publicWebUrl}/recipient-panel`, actionText: "Track Request Status" }
  );

  // Alert admin
  await sendDirectNotification(
    env.adminEmail,
    `[ADMIN ALERT] New ${record.urgency.toUpperCase()} Organ Request: ${record.organ}`,
    `An urgent organ request has been submitted by ${record.recipient_name} at ${record.hospital_name}.\n\n` +
      `Organ: ${record.organ}\n` +
      `Blood Group: ${record.blood_group}\n` +
      `Urgency: ${record.urgency}\n\n` +
      `Please log into the Admin Console to review and approve the request.`,
    { actionUrl: `${env.publicWebUrl}/admin`, actionText: "Open Admin Console" }
  );

  res.status(201).json(record);
}));

app.get("/api/recipient/requests", auth, wrap(async (req, res) => {
  const requests = await getOrganRequests({ recipient_user_id: req.user!.id });
  res.json(requests);
}));

/* ---------- Admin: Organ Requests & Approvals ---------- */
app.get("/api/admin/requests", auth, adminOnly, wrap(async (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const requests = await getOrganRequests({ status });
  res.json(requests);
}));

app.patch("/api/admin/requests/:id/approve", auth, adminOnly, wrap(async (req, res) => {
  const adminNotes = String(req.body?.admin_notes || "Approved by registry administration").trim();
  const donorId = req.body?.donor_id ? String(req.body.donor_id).trim() : undefined;

  const updated = await updateOrganRequestStatus(req.params.id, "approved", adminNotes, donorId);
  if (!updated) return res.status(404).json({ error: "Organ request not found" });

  await audit(req.user!.id, "admin_approve_request", `${req.params.id}:${updated.organ}`);

  // Dispatches approval email via Resend to recipient!
  await notify(
    updated.recipient_user_id || req.user!.id,
    updated.recipient_email,
    `🎉 Vital Registry – Organ Request APPROVED: ${updated.organ}`,
    `Hello ${updated.recipient_name},\n\n` +
      `We are pleased to inform you that your organ request for ${updated.organ} has been officially APPROVED by the Vital Registry National Administration.\n\n` +
      `Clinical Details:\n` +
      `- Organ: ${updated.organ}\n` +
      `- Urgency Level: ${updated.urgency.toUpperCase()}\n` +
      `- Hospital: ${updated.hospital_name}\n` +
      `- Attending Physician: ${updated.doctor_name}\n` +
      `- Matched Donor Reference: ${donorId || "Priority Allocation in Progress"}\n` +
      `- Reviewer Clinical Notes: ${adminNotes}\n\n` +
      `Our emergency clinical logistics unit is coordinating with ${updated.hospital_name} to proceed with organ transport and pre-transplant crossmatching.`,
    { actionUrl: `${env.publicWebUrl}/recipient-panel`, actionText: "View Approved Request" }
  );

  res.json(updated);
}));

app.patch("/api/admin/requests/:id/reject", auth, adminOnly, wrap(async (req, res) => {
  const adminNotes = String(req.body?.admin_notes || "Request could not be approved at this time").trim();

  const updated = await updateOrganRequestStatus(req.params.id, "rejected", adminNotes);
  if (!updated) return res.status(404).json({ error: "Organ request not found" });

  await audit(req.user!.id, "admin_reject_request", `${req.params.id}`);

  // Dispatches rejection notification
  await notify(
    updated.recipient_user_id || req.user!.id,
    updated.recipient_email,
    `Vital Registry – Update regarding your ${updated.organ} request`,
    `Hello ${updated.recipient_name},\n\n` +
      `Your organ request for ${updated.organ} has been reviewed by the medical registry.\n\n` +
      `Status: Not Approved\n` +
      `Reviewer Notes: ${adminNotes}\n\n` +
      `If you have questions or medical updates from your attending physician, please consult your hospital transplant coordinator or re-submit with updated clinical records.`,
    { actionUrl: `${env.publicWebUrl}/recipient-panel`, actionText: "Open Recipient Portal" }
  );

  res.json(updated);
}));

/* ---------- User Profile Endpoint ---------- */
app.get("/api/profile", auth, wrap(async (req, res) => {
  const { data: user } = await supabase.from("users").select("id,email,full_name,role").eq("id", req.user!.id).maybeSingle();
  const donor = await getDonor(req.user!.id);
  const requests = await getOrganRequests({ recipient_user_id: req.user!.id });
  res.json({ user, donor, requestsCount: requests.length });
}));

app.put("/api/profile", auth, wrap(async (req, res) => {
  const fullName = String(req.body?.full_name || "").trim();
  const newRole = req.body?.role as Role | undefined;

  const updateFields: any = {};
  if (fullName) updateFields.full_name = fullName;
  if (newRole && ["donor", "recipient"].includes(newRole)) updateFields.role = newRole;

  if (Object.keys(updateFields).length > 0) {
    await supabase.from("users").update(updateFields).eq("id", req.user!.id);
  }

  const { data: updated } = await supabase.from("users").select("id,email,full_name,role").eq("id", req.user!.id).single();
  await audit(req.user!.id, "update_user_profile");
  res.json(updated);
}));

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

app.listen(env.port, () => console.log(`Vital Registry API on :${env.port}`));
