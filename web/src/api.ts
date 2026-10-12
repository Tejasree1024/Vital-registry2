const BASE = import.meta.env.VITE_API_URL || "";

export interface Donor {
  id: string; donor_id: string | null; full_name: string | null; date_of_birth: string | null;
  gender: string | null; phone: string | null; address: string | null; city: string | null;
  state: string | null; national_id: string | null; height_cm: number | null; weight_kg: number | null;
  medical_conditions: string | null; medications: string | null; allergies: string | null;
  blood_group: string | null; donation_type: string | null; organs: string[];
  consent_given: boolean; consent_at: string | null; consent_signature: string | null;
  emergency_name: string | null; emergency_relation: string | null; emergency_phone: string | null;
  emergency_email: string | null; status: "draft" | "active" | "withdrawn" | "expired";
  network_status: string; pledge_date: string | null; expires_at: string | null; verified_at: string | null;
}

export interface Card {
  donorId: string; fullName: string; bloodGroup: string; organs: string[]; donationType: string;
  status: string; pledgeDate: string; expiresAt: string; networkStatus: string; verifyUrl: string; qr: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: "donor" | "recipient" | "admin";
}

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

export interface AvailableDonor {
  id: string;
  donor_id: string;
  full_name: string;
  blood_group: string;
  donation_type: string;
  organs: string[];
  city: string | null;
  state: string | null;
  verified_at: string | null;
  status: string;
  isAvailable: boolean;
  matchScore?: number;
  matchReason?: string;
}

export interface CompatibilityResult {
  recipientBlood: string;
  organ: string;
  allowedBloodGroups: string[];
  pairCheck?: {
    compatible: boolean;
    score: number;
    reason: string;
    isUniversalDonor: boolean;
    isUniversalRecipient: boolean;
  } | null;
  compatibleDonors: AvailableDonor[];
  compatibilityMatrix: Record<string, string[]>;
}

export const token = {
  get: () => localStorage.getItem("vr_token"),
  set: (t: string) => localStorage.setItem("vr_token", t),
  clear: () => { localStorage.removeItem("vr_token"); localStorage.removeItem("vr_user"); },
};

export async function api<T = any>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(BASE + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token.get() ? { Authorization: `Bearer ${token.get()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}
