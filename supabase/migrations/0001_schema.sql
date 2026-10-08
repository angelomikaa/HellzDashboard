-- NeoFoot Phase 1 schema: members, catalog, append-only EAV submissions, key-stat config, PIN lockout
create table members (
  id uuid primary key default gen_random_uuid(),
  discord_handle text not null unique,          -- D-01/D-04: identity key, unique at DB level
  display_name text not null,                   -- in-game nickname
  pin_hash text not null,                       -- D-03: bcrypt hash, never plaintext
  role text not null default 'member' check (role in ('member','officer','owner')),
  active boolean not null default true,         -- Phase 6 removal revokes access via active=false
  created_at timestamptz not null default now()
);

create table stat_catalog (
  stat_key text primary key,                    -- e.g. 'crit'
  label text not null,                          -- e.g. 'CRIT'
  group_name text not null check (group_name in ('general','quasi','special')),
  value_type text not null check (value_type in ('flat','percentual'))
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id),
  status text not null default 'pending' check (status in ('pending','validated','rejected')),
  submitted_at timestamptz not null default now()
);

create table submission_stats (
  id bigserial primary key,
  submission_id uuid not null references submissions(id) on delete cascade,
  stat_key text not null references stat_catalog(stat_key),
  value numeric not null,
  unique (submission_id, stat_key)              -- EAV: one row per stat per submission
);

create table class_key_stats (
  class_name text not null,
  stat_key text not null references stat_catalog(stat_key),
  primary key (class_name, stat_key)            -- Phase 2/3 populate; exactly-6-per-class enforced in Phase 3 logic
);

create table pin_login_attempts (
  discord_handle text primary key,
  failed_count int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index idx_submissions_member on submissions(member_id);
create index idx_submission_stats_submission on submission_stats(submission_id);

-- RLS enabled from day one (AGENTS.md: non-whitelisted access blocked at the server).
-- No policies yet => deny-all for anon/authenticated until 0002_rls.sql adds them.
-- service_role bypasses RLS; table owner (postgres) bypasses RLS for seeding.
alter table members enable row level security;
alter table stat_catalog enable row level security;
alter table submissions enable row level security;
alter table submission_stats enable row level security;
alter table class_key_stats enable row level security;
alter table pin_login_attempts enable row level security;
