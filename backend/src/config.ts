import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const env = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "",
  adminEmail: (process.env.ADMIN_EMAIL || "").toLowerCase(),
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:5173").split(",").map((s) => s.trim()),
  publicWebUrl: process.env.PUBLIC_WEB_URL || "http://localhost:5173",
  resendApiKey: process.env.RESEND_API_KEY || process.env.RESEND_URL || "",
  resendFrom: process.env.RESEND_FROM || process.env.SMTP_FROM || "Vital Registry <onboarding@resend.dev>",
};

if (!env.jwtSecret || env.jwtSecret.startsWith("change-me")) {
  console.warn("[warn] JWT_SECRET is not set to a strong value.");
}

const rawUrl = process.env.SUPABASE_URL || "http://localhost";
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "missing";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

/** Generates clean, responsive HTML for transaction and notification emails. */
export function buildHtmlEmail(
  subject: string,
  bodyText: string,
  actionUrl?: string,
  actionText?: string,
  otpCode?: string
): string {
  const paragraphs = bodyText
    .split("\n\n")
    .map((p) => `<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #374151;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");

  const otpHtml = otpCode
    ? `
      <div style="margin: 28px 0; text-align: center;">
        <div style="display: inline-block; background-color: #fff1f2; border: 2px dashed #e11d48; border-radius: 12px; padding: 14px 28px; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #be123c; font-family: monospace;">
          ${otpCode}
        </div>
        <div style="font-size: 12px; color: #64748b; margin-top: 8px;">Valid for 10 minutes · Do not share this code with anyone</div>
      </div>
    `
    : "";

  const buttonHtml = actionUrl && actionText
    ? `
      <div style="margin: 24px 0; text-align: center;">
        <a href="${actionUrl}" style="background-color: #e11d48; color: #ffffff; padding: 12px 24px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block; box-shadow: 0 2px 4px rgba(225, 29, 72, 0.2);">
          ${actionText}
        </a>
      </div>
    `
    : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #0f172a; padding: 24px 32px; border-bottom: 3px solid #e11d48;">
              <span style="color: #ffffff; font-size: 18px; font-weight: 700; letter-spacing: -0.5px;">❤ Vital Registry</span>
              <span style="color: #94a3b8; font-size: 12px; margin-left: 10px;">National Organ Donation Registry</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 20px; font-size: 20px; font-weight: 600; color: #0f172a;">${subject}</h2>
              ${paragraphs}
              ${otpHtml}
              ${buttonHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f1f5f9; padding: 20px 32px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 6px;">Vital Registry · Secure, accredited organ & tissue donation network.</p>
              <p style="margin: 0;">You received this email regarding your registry status or an authentication request.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/** Sends an email using Resend API (or SMTP fallback). */
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  options?: { html?: string; actionUrl?: string; actionText?: string; otpCode?: string }
): Promise<boolean> {
  const html = options?.html || buildHtmlEmail(subject, text, options?.actionUrl, options?.actionText, options?.otpCode);

  if (env.resendApiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.resendFrom,
          to: [to],
          subject,
          text,
          html,
        }),
      });

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as any;
        console.warn(`[resend] delivery failed to ${to}:`, errorData);

        // In Resend testing mode, outward emails to unverified domains are restricted
        // to the verified account owner (e.g. bashaips91619@gmail.com).
        if (
          errorData?.statusCode === 403 &&
          typeof errorData?.message === "string" &&
          errorData.message.includes("You can only send testing emails to your own email address")
        ) {
          const match = errorData.message.match(/\(([^)]+)\)/);
          const ownerEmail = match ? match[1] : "bashaips91619@gmail.com";
          if (to.toLowerCase() !== ownerEmail.toLowerCase()) {
            console.log(`[resend] Rerouting testing email for ${to} to verified inbox ${ownerEmail}`);
            const testHeader = `[Vital Registry Testing Mode Notice: This token was generated for registered email ${to}. Due to Resend test restrictions, it has been delivered to your verified inbox: ${ownerEmail}]\n\n`;
            const reroutedText = testHeader + text;
            const reroutedSubject = `[Vital Registry for ${to}] ${subject}`;
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${env.resendApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: env.resendFrom,
                to: [ownerEmail],
                subject: reroutedSubject,
                text: reroutedText,
                html: buildHtmlEmail(reroutedSubject, reroutedText, options?.actionUrl, options?.actionText),
              }),
            })
              .then((r) => r.json())
              .then((d) => console.log(`[resend] successfully delivered test email to ${ownerEmail} (id: ${d.id})`))
              .catch((err) => console.error("[resend] reroute failed:", err));
          }
        }

        if (transporter) {
          await transporter.sendMail({ from: env.resendFrom, to, subject, text, html });
        }
        return false;
      }
      const data = (await res.json().catch(() => ({}))) as any;
      console.log(`[resend] email delivered directly to ${to} (id: ${data.id})`);
      return true;
    } catch (e) {
      console.error(`[resend] error sending to ${to}:`, e);
      if (transporter) {
        try {
          await transporter.sendMail({ from: env.resendFrom, to, subject, text, html });
          return true;
        } catch (err) {
          console.error("transporter fallback also failed", err);
        }
      }
      return false;
    }
  }

  if (transporter) {
    try {
      await transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, text, html });
      return true;
    } catch (e) {
      console.error("smtp email failed", e);
      return false;
    }
  }

  return false;
}

/** Stores an in-app notification in Supabase and emails the user via Resend. */
export async function notify(
  userId: string,
  email: string,
  subject: string,
  body: string,
  options?: { actionUrl?: string; actionText?: string; otpCode?: string }
) {
  try {
    await supabase.from("notifications").insert({ user_id: userId, subject, body });
  } catch (err) {
    console.error("in-app notification insert error:", err);
  }

  if (email) {
    await sendEmail(email, subject, body, options);
  }
}

/** Sends direct notification email to non-user recipients (e.g. emergency contact). */
export async function sendDirectNotification(
  email: string,
  subject: string,
  body: string,
  options?: { actionUrl?: string; actionText?: string }
) {
  if (email) {
    await sendEmail(email, subject, body, options);
  }
}

export async function audit(userId: string | null, action: string, detail?: string) {
  try {
    await supabase.from("audit_log").insert({ user_id: userId, action, detail });
  } catch (err) {
    console.error("audit insert error:", err);
  }
}
