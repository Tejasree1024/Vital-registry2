import fs from "fs";
import path from "path";
import crypto from "crypto";
import { supabase } from "./config";

export interface OrganRequest {
  id: string;
  recipient_user_id: string | null;
  recipient_name: string;
  recipient_email: string;
  recipient_phone: string | null;
  blood_group: string;
  organ: string;
  urgency: "immediate" | "high" | "standard";
  hospital_name: string;
  doctor_name: string;
  medical_notes: string;
  donor_id: string | null;
  status: "pending" | "approved" | "rejected" | "fulfilled";
  admin_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type OrganRequestInput = Omit<OrganRequest, "id" | "status" | "admin_notes" | "reviewed_at" | "created_at" | "updated_at">;

const DATA_FILE = path.join(__dirname, "../data/organ_requests.json");

function readLocalRequests(): OrganRequest[] {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const content = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(content || "[]");
  } catch (err) {
    console.error("Failed to read local organ requests:", err);
    return [];
  }
}

function writeLocalRequests(items: OrganRequest[]) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write local organ requests:", err);
  }
}

let supabaseTableAvailable: boolean | null = null;

async function checkSupabaseTable(): Promise<boolean> {
  if (supabaseTableAvailable !== null) return supabaseTableAvailable;
  try {
    const { error } = await supabase.from("organ_requests").select("id").limit(1);
    supabaseTableAvailable = !error;
    return supabaseTableAvailable;
  } catch {
    supabaseTableAvailable = false;
    return false;
  }
}

export async function createOrganRequest(input: OrganRequestInput): Promise<OrganRequest> {
  const now = new Date().toISOString();
  const newRecord: OrganRequest = {
    ...input,
    id: crypto.randomUUID(),
    status: "pending",
    admin_notes: null,
    reviewed_at: null,
    created_at: now,
    updated_at: now,
  };

  const hasSupabase = await checkSupabaseTable();
  if (hasSupabase) {
    try {
      const { data, error } = await supabase.from("organ_requests").insert(newRecord).select().single();
      if (!error && data) return data as OrganRequest;
    } catch (err) {
      console.warn("Supabase insert organ_request failed, using local fallback:", err);
    }
  }

  // Local fallback
  const list = readLocalRequests();
  list.unshift(newRecord);
  writeLocalRequests(list);
  return newRecord;
}

export async function getOrganRequests(filter?: {
  recipient_user_id?: string;
  status?: string;
  organ?: string;
}): Promise<OrganRequest[]> {
  const hasSupabase = await checkSupabaseTable();
  if (hasSupabase) {
    try {
      let query = supabase.from("organ_requests").select("*").order("created_at", { ascending: false });
      if (filter?.recipient_user_id) query = query.eq("recipient_user_id", filter.recipient_user_id);
      if (filter?.status) query = query.eq("status", filter.status);
      if (filter?.organ) query = query.eq("organ", filter.organ);
      const { data, error } = await query;
      if (!error && data) return data as OrganRequest[];
    } catch (err) {
      console.warn("Supabase select organ_requests failed, using local fallback:", err);
    }
  }

  // Local fallback
  let list = readLocalRequests();
  if (filter?.recipient_user_id) {
    list = list.filter((r) => r.recipient_user_id === filter.recipient_user_id);
  }
  if (filter?.status) {
    list = list.filter((r) => r.status === filter.status);
  }
  if (filter?.organ) {
    list = list.filter((r) => r.organ === filter.organ);
  }
  return list;
}

export async function getOrganRequestById(id: string): Promise<OrganRequest | null> {
  const hasSupabase = await checkSupabaseTable();
  if (hasSupabase) {
    try {
      const { data, error } = await supabase.from("organ_requests").select("*").eq("id", id).maybeSingle();
      if (!error && data) return data as OrganRequest;
    } catch (err) {
      console.warn("Supabase select by id failed:", err);
    }
  }

  const list = readLocalRequests();
  return list.find((r) => r.id === id) || null;
}

export async function updateOrganRequestStatus(
  id: string,
  status: "approved" | "rejected" | "fulfilled",
  adminNotes?: string,
  donorId?: string
): Promise<OrganRequest | null> {
  const now = new Date().toISOString();
  const updatePayload: Partial<OrganRequest> = {
    status,
    admin_notes: adminNotes || null,
    reviewed_at: now,
    updated_at: now,
  };
  if (donorId) updatePayload.donor_id = donorId;

  const hasSupabase = await checkSupabaseTable();
  if (hasSupabase) {
    try {
      const { data, error } = await supabase
        .from("organ_requests")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .maybeSingle();
      if (!error && data) return data as OrganRequest;
    } catch (err) {
      console.warn("Supabase update organ_request failed:", err);
    }
  }

  // Local fallback
  const list = readLocalRequests();
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) return null;

  list[idx] = {
    ...list[idx],
    ...updatePayload,
  };
  writeLocalRequests(list);
  return list[idx];
}

/* ================= Compatibility Medical Engine ================= */
export const COMPATIBILITY_RULES: Record<string, string[]> = {
  // Recipient blood group -> Allowed Donor blood groups
  "O-": ["O-"],
  "O+": ["O+", "O-"],
  "A-": ["A-", "O-"],
  "A+": ["A+", "A-", "O+", "O-"],
  "B-": ["B-", "O-"],
  "B+": ["B+", "B-", "O+", "O-"],
  "AB-": ["AB-", "A-", "B-", "O-"],
  "AB+": ["AB+", "AB-", "A+", "A-", "B+", "B-", "O+", "O-"], // Universal recipient
};

export function getCompatibleBloodGroups(recipientBlood: string): string[] {
  return COMPATIBILITY_RULES[recipientBlood] || [recipientBlood];
}

export function checkCompatibility(recipientBlood: string, donorBlood: string) {
  const allowed = COMPATIBILITY_RULES[recipientBlood] || [];
  const compatible = allowed.includes(donorBlood);

  const isUniversalDonor = donorBlood === "O-";
  const isUniversalRecipient = recipientBlood === "AB+";

  let score = 0;
  let reason = "";

  if (recipientBlood === donorBlood) {
    score = 100;
    reason = "Exact ABO and Rh factor identical match. Highest immunologic compatibility.";
  } else if (compatible) {
    score = 85;
    reason = `Compatible donor. Blood group ${donorBlood} can donate safely to ${recipientBlood}.`;
  } else {
    score = 0;
    reason = `Incompatible. Recipient ${recipientBlood} has antibodies against blood group ${donorBlood} antigens.`;
  }

  return {
    compatible,
    score,
    recipientBlood,
    donorBlood,
    reason,
    isUniversalDonor,
    isUniversalRecipient,
    allowedDonors: allowed,
  };
}
