-- card labels 4–6 chars (07.2-05 checkpoint round 7, owner decision 2):
-- the owner REJECTED the 3-letter D-11 labels for the card surface ("all our
-- abbreviation labels must go from 3 letter to 4-6 chars — players are more
-- used to MATK than MTK, seamless association") and APPROVED this mapping
-- verbatim (2026-10-19). Mirrors 0013:39-102's UPDATE pattern — an UNNUMBERED
-- live apply via scripts/apply-seed.mjs (migration 0014 is RESERVED for
-- Phase 8; storage-bucket precedent, card-photos-storage.sql).
--
-- Conventions in the approved set:
--   · 6 chars are reserved for the resistance/damage-class pairs
--     (PDMG.R / MDMG.R / R.PATK / REC.HP / CT.VAR / FC.PCT / CD.GBL …);
--   · 5-char readable resistances (PVP.R / PVE.R / RCDMG / CRITD / HEALD …);
--   · HIT stays 3 chars — the owner's flagged exception;
--   · IG.PDEF / IG.MDEF run 7 chars — the longest approved labels (flagged
--     to the owner for spot-correction; the label_short UNIQUE constraint
--     from 0013:104 still holds — every value below is distinct).
-- The committed artifact carries NO secrets.

update stat_catalog set label_short = 'HP'      where stat_key = 'hp';
update stat_catalog set label_short = 'SP'      where stat_key = 'sp';
update stat_catalog set label_short = 'PATK'    where stat_key = 'patk';
update stat_catalog set label_short = 'PDEF'    where stat_key = 'pdef';
update stat_catalog set label_short = 'MATK'    where stat_key = 'matk';
update stat_catalog set label_short = 'MDEF'    where stat_key = 'mdef';
update stat_catalog set label_short = 'R.PATK'  where stat_key = 'refine_patk';
update stat_catalog set label_short = 'R.PDEF'  where stat_key = 'refine_pdef';
update stat_catalog set label_short = 'R.MATK'  where stat_key = 'refine_matk';
update stat_catalog set label_short = 'R.MDEF'  where stat_key = 'refine_mdef';
update stat_catalog set label_short = 'REC.HP'  where stat_key = 'hp_recover';
update stat_catalog set label_short = 'REC.SP'  where stat_key = 'sp_recover';
update stat_catalog set label_short = 'HIT'     where stat_key = 'hit'; -- 3-char exception (owner-flagged)
update stat_catalog set label_short = 'FLEE'    where stat_key = 'flee';
update stat_catalog set label_short = 'POWER'   where stat_key = 'combat_power';
update stat_catalog set label_short = 'ASPD'    where stat_key = 'aspd';
update stat_catalog set label_short = 'MSPD'    where stat_key = 'mspd';
update stat_catalog set label_short = 'CT.VAR'  where stat_key = 'variable_ct';
update stat_catalog set label_short = 'VC.PCT'  where stat_key = 'variable_ct_pct';
update stat_catalog set label_short = 'F.CRIT'  where stat_key = 'fixed_ct';
update stat_catalog set label_short = 'FC.PCT'  where stat_key = 'fixed_ct_pct';
update stat_catalog set label_short = 'HEALD'   where stat_key = 'healing_done';
update stat_catalog set label_short = 'HEALR'   where stat_key = 'healing_taken';
update stat_catalog set label_short = 'CRIT'    where stat_key = 'crit';
update stat_catalog set label_short = 'R.CRIT'  where stat_key = 'crit_res';
update stat_catalog set label_short = 'CRITD'   where stat_key = 'crit_dmg';
update stat_catalog set label_short = 'RCDMG'   where stat_key = 'crit_dmg_res';
update stat_catalog set label_short = 'PDMG'    where stat_key = 'pdmg';
update stat_catalog set label_short = 'PDMG.R'  where stat_key = 'pdmg_r';
update stat_catalog set label_short = 'MDMG'    where stat_key = 'mdmg';
update stat_catalog set label_short = 'MDMG.R'  where stat_key = 'mdmg_r';
update stat_catalog set label_short = 'IG.PDEF' where stat_key = 'ignore_pdef';
update stat_catalog set label_short = 'IG.PD%'  where stat_key = 'ignore_pdef_pct';
update stat_catalog set label_short = 'IG.MDEF' where stat_key = 'ignore_mdef';
update stat_catalog set label_short = 'IG.MD%'  where stat_key = 'ignore_mdef_pct';
update stat_catalog set label_short = 'PDMG.B'  where stat_key = 'pdmg_bonus';
update stat_catalog set label_short = 'MDMG.B'  where stat_key = 'mdmg_bonus';
update stat_catalog set label_short = 'PVE.R'   where stat_key = 'pve_dmg_reduction';
update stat_catalog set label_short = 'PVE.B'   where stat_key = 'pve_dmg_bonus';
update stat_catalog set label_short = 'PVP.R'   where stat_key = 'pvp_dmg_reduction';
update stat_catalog set label_short = 'PVP.B'   where stat_key = 'pvp_dmg_bonus';
update stat_catalog set label_short = 'MAXSP'   where stat_key = 'max_sp_pct';
update stat_catalog set label_short = 'EPATK'   where stat_key = 'equip_patk_pct';
update stat_catalog set label_short = 'EMATK'   where stat_key = 'equip_matk_pct';
update stat_catalog set label_short = 'EPDEF'   where stat_key = 'equip_pdef_pct';
update stat_catalog set label_short = 'EMDEF'   where stat_key = 'equip_mdef_pct';
update stat_catalog set label_short = 'CD.GBL'  where stat_key = 'global_cd_pct';
update stat_catalog set label_short = 'DMG.S'   where stat_key = 'dmg_vs_small';
update stat_catalog set label_short = 'DMG.M'   where stat_key = 'dmg_vs_medium';
update stat_catalog set label_short = 'DMG.L'   where stat_key = 'dmg_vs_large';
update stat_catalog set label_short = 'DMG.BR'  where stat_key = 'dmg_vs_brute';
update stat_catalog set label_short = 'DMG.D'   where stat_key = 'dmg_vs_demi_human';
update stat_catalog set label_short = 'RD.S'    where stat_key = 'dmg_reduction_vs_small';
update stat_catalog set label_short = 'RD.M'    where stat_key = 'dmg_reduction_vs_medium';
update stat_catalog set label_short = 'RD.L'    where stat_key = 'dmg_reduction_vs_large';
update stat_catalog set label_short = 'RD.BR'   where stat_key = 'dmg_reduction_vs_brute';
update stat_catalog set label_short = 'RD.D'    where stat_key = 'dmg_reduction_vs_demi_human';
update stat_catalog set label_short = 'RPDEF'   where stat_key = 'rpdef';
update stat_catalog set label_short = 'RMDEF'   where stat_key = 'rmdef';

-- Post-apply invariants (run after the UPDATEs in the same query batch):
-- every label 1..7 chars, all distinct (0013's UNIQUE constraint re-check).
do $$
declare
  bad_empty int;
  bad_len int;
  dupes int;
begin
  select count(*) into bad_empty from stat_catalog where label_short = '';
  select count(*) into bad_len from stat_catalog where length(label_short) > 7;
  select count(*) into dupes from (
    select label_short from stat_catalog group by label_short having count(*) > 1
  ) d;
  if bad_empty > 0 or bad_len > 0 or dupes > 0 then
    raise exception 'label mapping invariants broken: empty=%, over7=%, dupes=%', bad_empty, bad_len, dupes;
  end if;
end;
$$;
