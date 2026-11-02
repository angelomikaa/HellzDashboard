-- NeoFoot migration 0065: append-only validation audit trail.
--
-- WHY: set_submission_status() only flipped status pending -> validated/rejected
-- and nothing recorded WHO decided, WHEN, or with what note. The anti-cheat
-- panel can prove a value is suspicious but not who cleared it — and the owner
-- has validated buffed batches by hand. This is the missing accountability
-- layer for every officer decision.
--
-- WHAT:
--   1. submission_reviews: append-only (submission_id, officer_id, decision,
--      note, created_at). RLS on with NO policies and no client grants — the
--      table is reachable only through definer RPCs.
--   2. set_submission_status v3: the LIVE body byte-for-byte + one insert after
--      the not_pending check (never before `get diagnostics`, which reads the
--      UPDATE's row_count). A failed identity promotion rolls the audit row
--      back with the rest of the transaction.
--   3. recent_submission_reviews(p_limit): staff-only read surface for the
--      Validações "Histórico" tab.
--
-- Append-only: 0011 is not edited; this is the new definition.
--
-- Apply:
--   node scripts/apply-seed.mjs supabase/migrations/0065_submission_review_audit.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. The audit table (append-only, deny-all to clients)
-- ---------------------------------------------------------------------------
create table if not exists public.submission_reviews (
  id bigserial primary key,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  officer_id uuid references public.members(id),
  decision text not null check (decision in ('validated', 'rejected', 'reopened')),
  note text,
  created_at timestamptz not null default now()
);

alter table public.submission_reviews enable row level security;
revoke all on public.submission_reviews from public, anon, authenticated;

create index if not exists idx_submission_reviews_created
  on public.submission_reviews (created_at desc, id desc);
create index if not exists idx_submission_reviews_submission
  on public.submission_reviews (submission_id);

comment on table public.submission_reviews is
  'Append-only audit trail of officer decisions on submissions (0065). No client grants, RLS with no policies: readable only through recent_submission_reviews().';

-- ---------------------------------------------------------------------------
-- 2. set_submission_status v3 — LIVE body + the audit insert
-- ---------------------------------------------------------------------------
create or replace function public.set_submission_status(p_submission uuid, p_status text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_member uuid;
  v_char_id text;
  v_nickname text;
  v_char_class text;
  v_char_function text;
begin
  -- Staff gate verbatim (0009:62-68).
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  if p_status not in ('validated', 'rejected') then
    raise exception 'invalid_status';
  end if;

  update submissions set status = p_status
  where id = p_submission and status = 'pending'
  returning member_id, char_id, nickname, char_class, char_function
  into v_member, v_char_id, v_nickname, v_char_class, v_char_function;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'not_pending';
  end if;

  -- 0065: the audit row is written AFTER the row_count check (an insert here
  -- would otherwise change `get diagnostics`). The transaction keeps it atomic
  -- with the status change and with the identity promotion below.
  insert into public.submission_reviews (submission_id, officer_id, decision)
  values (p_submission, (auth.jwt()->>'member_id')::uuid, p_status);

  -- IDEN-02/D-20: a validated identity is promoted to the append-only history
  -- and becomes the member's identity pointer. char_function stays staff-only.
  if p_status = 'validated' and v_char_id is not null and v_nickname is not null then
    perform public.assert_char_id_available(v_char_id, v_member, null);

    insert into member_identity_history
      (member_id, submission_id, char_id, nickname, char_class, char_function, source, created_by)
    values
      (v_member, p_submission, v_char_id, v_nickname, v_char_class, v_char_function, 'submission',
       (auth.jwt()->>'member_id')::uuid);

    update members
       set char_id = v_char_id,
           display_name = v_nickname,
           char_class = coalesce(v_char_class, char_class),
           char_function = coalesce(v_char_function, char_function)
     where id = v_member;
  end if;

  return v_count;
end;
$$;

comment on function public.set_submission_status(uuid, text) is
  'Officer validate/reject (AUTH-05) + append-only audit row (0065). The UPDATE is scoped to status=pending and 0 rows raise not_pending; the decision is recorded with the caller officer id in submission_reviews. Internal gate: member_role in (officer,owner) AND caller active.';

-- ---------------------------------------------------------------------------
-- 3. Staff read surface for the audit trail
-- ---------------------------------------------------------------------------
create or replace function public.recent_submission_reviews(p_limit int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  -- Staff gate verbatim (0009:62-68).
  if coalesce(auth.jwt()->>'member_role', '') not in ('officer', 'owner')
     or not exists (
       select 1 from members m
       where m.id::text = auth.jwt()->>'member_id' and m.active
     ) then
    raise exception 'forbidden';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'review_id', r.id,
        'submission_id', r.submission_id,
        'decision', r.decision,
        'note', r.note,
        'created_at', r.created_at,
        'officer_name', public.identity_display_name(r.officer_id),
        'member_name', public.identity_display_name(s.member_id),
        'char_class', coalesce(s.char_class, m.char_class)
      )
      order by r.created_at desc, r.id desc
    )
    from (
      select *
      from public.submission_reviews
      order by created_at desc, id desc
      limit v_limit
    ) r
    join public.submissions s on s.id = r.submission_id
    join public.members m on m.id = s.member_id
  ), '[]'::jsonb);
end;
$$;

comment on function public.recent_submission_reviews(int) is
  'Staff-only recent validation decisions (0065): officer, member, decision, class and timestamp, newest first, capped at 200.';

revoke all on function public.recent_submission_reviews(int) from public, anon;
grant execute on function public.recent_submission_reviews(int) to authenticated;

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('0065', 'submission_review_audit', null)
on conflict (version) do nothing;

notify pgrst, 'reload schema';

commit;
