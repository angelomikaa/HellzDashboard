-- NeoFoot hotfix: review_identity() (0014 §6.7, superseded 0020 §7) sets
-- storage_path = NULL on EVERY decision ("clears storage_path so the client
-- can purge the object"), but the identity_proofs column was created
-- NOT NULL (0014 create table) — so both Confirmar and Não confere raised
-- 23502 and the Identidades surface showed "Falha ao salvar — tente
-- novamente." Proven live: the exact UPDATE errors with
-- 'null value in column "storage_path" violates not-null constraint'.
--
-- Fix: drop the NOT NULL. Pending rows are always inserted WITH a path
-- (claim_pin, service-role only); NULL after a decision is the designed
-- terminal state (the proof object is purged client-side, nothing references
-- it). staff_identity_queue reads status='pending' rows only, so no reader
-- can see a NULL path.
-- Append-only: 0001-0026 are never edited in place.

alter table identity_proofs alter column storage_path drop not null;