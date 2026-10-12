-- Vital Registry: run this in the Supabase SQL editor.
create extension if not exists "pgcrypto";

-- Allow recipient role on users table
alter table if exists users drop constraint if exists users_role_check;
alter table if exists users add constraint users_role_check check (role in ('donor','recipient','admin'));

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  full_name text not null,
  role text not null default 'donor' check (role in ('donor','recipient','admin')),
  created_at timestamptz not null default now()
);

create table if not exists donors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references users(id) on delete cascade,
  donor_id text unique,
  -- personal
  full_name text,
  date_of_birth date,
  gender text,
  phone text,
  address text,
  city text,
  state text,
  national_id text,
  -- medical
  height_cm numeric,
  weight_kg numeric,
  medical_conditions text,
  medications text,
  allergies text,
  blood_group text check (blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  donation_type text check (donation_type in ('after_death','living','both')),
  organs text[] not null default '{}',
  -- consent
  consent_given boolean not null default false,
  consent_at timestamptz,
  consent_signature text,
  -- emergency / family contact
  emergency_name text,
  emergency_relation text,
  emergency_phone text,
  emergency_email text,
  -- lifecycle
  status text not null default 'draft' check (status in ('draft','active','withdrawn','expired')),
  network_status text not null default 'not_linked' check (network_status in ('not_linked','linked')),
  verified_at timestamptz,
  pledge_date timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organ_requests (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid references users(id) on delete set null,
  recipient_name text not null,
  recipient_email text not null,
  recipient_phone text,
  blood_group text check (blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  organ text not null,
  urgency text not null default 'standard' check (urgency in ('immediate','high','standard')),
  hospital_name text,
  doctor_name text,
  medical_notes text,
  donor_id text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','fulfilled')),
  admin_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

-- Only the backend (service-role key) touches the data; block direct anon access.
alter table users enable row level security;
alter table donors enable row level security;
alter table organ_requests enable row level security;
alter table notifications enable row level security;
alter table audit_log enable row level security;
