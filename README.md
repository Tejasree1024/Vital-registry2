# ❤ Vital Registry

Smart organ donation registry. One shared backend and database serve both clients.

```
React + TS (web/) ──┐
                    ├─► Node.js + Express (backend/) ─► Supabase (Postgres)
Kotlin (android/) ──┘
```

## Donor journey implemented
Register/Login → donor profile → personal & medical details → blood group & preference → organs/tissues →
donation info & digital consent (typed signature) → emergency contact → verify → **Donor ID + digital card + QR** →
confirmation (in-app + optional email) → track pledge → update details → renew / withdraw →
connected to the donation network (admin console lists/filters/activates/unlinks linked donors).
The QR encodes `/verify/<donorId>`, a public page showing only masked name, blood group, organs and validity.

## Setup
1. Create a Supabase project, run [supabase/schema.sql](supabase/schema.sql) in the SQL editor.
2. Backend: `cd backend && copy .env.example .env` → fill `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `ADMIN_EMAIL`.
   `npm install && npm run dev` (port 4000). Registering with `ADMIN_EMAIL` creates the admin account.
3. Web: `cd web && npm install && npm run dev` → http://localhost:5173 (proxies `/api` to the backend; set `VITE_API_URL` in production).
4. Android: open `android/` in Android Studio, run on an emulator (uses `http://10.0.2.2:4000/api/`;
   change `API_URL` in `app/build.gradle.kts` for a real server; use HTTPS in production and remove `usesCleartextTraffic`).

## Notes
- The service-role key lives only in the backend; clients talk only to the API (RLS blocks direct access).
- Data syncs automatically: both clients read/write the same API. For push-style live updates add Socket.io to the backend.
- Medical/identity data is sensitive: deploy over HTTPS and review local legal requirements (e.g. consent rules, HIPAA/GDPR/THOTA) before real use.
