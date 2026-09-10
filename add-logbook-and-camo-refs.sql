-- add-logbook-and-camo-refs.sql (2026-09-10)
-- Item 5 — the two identifiers the DGCA maintenance-log template's header
-- block wants and that existed nowhere in the schema.
--
-- ⚠️ PLACEHOLDERS, DELIBERATELY OPTIONAL. Nobody has yet checked these
-- against a real DGCA log book cover or a real CAMO/AMO approval
-- certificate, so neither the label wording nor the format is confirmed.
-- Both are nullable free text and NOTHING requires them: an aircraft
-- without a log book serial saves fine, and the maintenance-log report
-- simply omits the header line rather than printing an empty label. When
-- the real paperwork is in hand, the only likely changes are the display
-- labels and possibly a format check — not the storage.
--
--   Log Book Serial No.  -> aircraft.log_book_serial_no   (NEW, per aircraft)
--   CAMO / AMO Approval  -> fto_settings 'camo_approval_no' (no DDL needed;
--                           fto_settings is already key/value)
--
-- Per-aircraft vs per-FTO is not arbitrary: a log book serial identifies
-- one physical volume for one airframe and changes when that volume is
-- filled, whereas the CAMO/AMO approval number belongs to the organisation
-- and is the same on every aircraft's paperwork.

alter table aircraft add column if not exists log_book_serial_no text;

comment on column aircraft.log_book_serial_no is
  'DGCA maintenance log: serial of the physical airframe log book volume this register corresponds to. PLACEHOLDER — label and format not yet verified against a real log book cover. Optional; the report omits the line when unset.';

-- fto_settings is a flat key/value table, so the CAMO approval number needs
-- no column — this seeds an empty row so the key exists and Admin Setup ->
-- Settings renders the (blank, optional) field. Safe to re-run.
insert into fto_settings (setting_key, setting_value)
select 'camo_approval_no', ''
where not exists (select 1 from fto_settings where setting_key = 'camo_approval_no');
