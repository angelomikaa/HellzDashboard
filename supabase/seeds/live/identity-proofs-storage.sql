-- identity-proofs storage (Phase 8, plan 08-01 task 2):
-- private Supabase Storage bucket holding the claim/application identity
-- screenshots (basic character screen: in-game ID, nickname, job).
--
-- UNNUMBERED live apply via scripts/apply-seed.mjs (storage-only change —
-- migration 0014 stays the ONLY numbered file, 07.2 card-photos precedent).
--
-- Trust model (T-08-07 / D-05 / D-15):
--   * proofs are uploaded ONLY by Edge Functions running with the service
--     role (setup-pin / request-access) — there is NO insert or update policy
--     for anon/authenticated, so a client can never plant a proof;
--   * reads and deletes are STAFF-ONLY: officer/owner guild role AND a live
--     active membership row (the 0008 is_active_staff_member primitive), so
--     deactivation revokes proof access instantly;
--   * the bucket is private (never a public URL) and capped at 2 MB JPEG,
--     mirroring the live card-photos bucket;
--   * path scheme: claims/<member_id>/<uuid>.jpg and
--     requests/<request_id>/<uuid>.jpg — composed server-side only;
--   * after a decision the deciding RPC clears proof_path and the staff client
--     deletes the object (D-15: images are transient, identity text is the
--     retained staff-only history).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('identity-proofs', 'identity-proofs', false, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- READ: active staff only (officers review claim/application proofs).
drop policy if exists "identity-proofs: staff read" on storage.objects;
create policy "identity-proofs: staff read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'identity-proofs'
    and auth.jwt()->>'member_role' in ('officer', 'owner')
    and public.is_active_staff_member()
  );

-- DELETE: active staff only (client purge after Confirmar / Não confere /
-- approve / reject, D-15).
drop policy if exists "identity-proofs: staff delete" on storage.objects;
create policy "identity-proofs: staff delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'identity-proofs'
    and auth.jwt()->>'member_role' in ('officer', 'owner')
    and public.is_active_staff_member()
  );

-- NO insert/update policies for anon/authenticated: writes are service-role
-- only (Edge Functions). Adding one here would let a client plant or replace
-- an identity proof.
