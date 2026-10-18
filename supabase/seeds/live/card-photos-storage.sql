-- card-photos storage (07.2-05 checkpoint round 3, owner decision 2):
-- private Supabase Storage bucket holding each member's character
-- screenshot, clipped into the photo-crop layer of their crest card.
--
-- UNNUMBERED live apply via scripts/apply-seed.mjs (storage-only change —
-- migration 0014 is RESERVED for Phase 8 per the phase gate; no numbered
-- migration file is consumed here, so the reservation stands untouched).
--
-- Trust boundary (T-072 storage): members write ONLY their own path —
-- the object key is `<member_id>/card.jpg` and the policies pin the
-- top-level folder to the JWT member_id claim. Every ACTIVE member reads
-- every photo: screenshots appear on showcase cards in Destaques (owner
-- decision 1) — that visibility IS the feature. The active-membership
-- subquery is the 0004 discipline: a deactivated member's stale token
-- loses access instantly. Key-stat/config data has no representation on
-- this surface (identity comes from the JWT server-side).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-photos', 'card-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- READ: active members only, whole bucket (showcase visibility).
drop policy if exists "card-photos: active members read" on storage.objects;
create policy "card-photos: active members read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'card-photos'
    and exists (
      select 1 from public.members m
      where m.id::text = auth.jwt()->>'member_id' and m.active
    )
  );

-- INSERT: ONLY the caller's own folder (top-level path segment = member_id
-- claim) — a member can never write, overwrite or plant another member's
-- photo. The client derives the path from session.member_id; RLS is what
-- actually enforces it.
drop policy if exists "card-photos: member inserts own" on storage.objects;
create policy "card-photos: member inserts own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'card-photos'
    and (storage.foldername(name))[1] = auth.jwt()->>'member_id'
    and exists (
      select 1 from public.members m
      where m.id::text = auth.jwt()->>'member_id' and m.active
    )
  );

-- UPDATE: own folder only (the client uploads with x-upsert; the storage
-- upsert performs an UPDATE on key conflict, so this policy is what makes
-- "Alterar foto" work for the owner of the path and nobody else).
drop policy if exists "card-photos: member updates own" on storage.objects;
create policy "card-photos: member updates own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'card-photos'
    and (storage.foldername(name))[1] = auth.jwt()->>'member_id'
    and exists (
      select 1 from public.members m
      where m.id::text = auth.jwt()->>'member_id' and m.active
    )
  )
  with check (
    bucket_id = 'card-photos'
    and (storage.foldername(name))[1] = auth.jwt()->>'member_id'
    and exists (
      select 1 from public.members m
      where m.id::text = auth.jwt()->>'member_id' and m.active
    )
  );

-- DELETE: own folder only ("Remover" flow).
drop policy if exists "card-photos: member deletes own" on storage.objects;
create policy "card-photos: member deletes own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'card-photos'
    and (storage.foldername(name))[1] = auth.jwt()->>'member_id'
    and exists (
      select 1 from public.members m
      where m.id::text = auth.jwt()->>'member_id' and m.active
    )
  );
