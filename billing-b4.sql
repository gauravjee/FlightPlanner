-- billing-b4.sql (2026-10-22) — billing phase B4a: receipts, GST invoices and credit notes.
-- See claude/billing-design-2026-10-20.md, "B4 plan".
--
-- ADDITIVE ONLY (new tables, new nullable columns, new settings, new functions; no existing value changes):
--   billing_documents / billing_document_lines   issued receipts, invoices and credit notes, with seller and buyer
--                                                snapshots. Never edited; a credit note corrects an invoice.
--   billing_doc_counters                         last number per document type and financial year (April-March).
--   ledger_entries.invoice_id / credit_note_id   which invoice / credit note an entry is on.
--   students.billing_state                       2-digit GST state code (place of supply); blank = school's state.
--   fto_settings                                 legal name, GSTIN, address, SAC (blank until entered) and the three
--                                                number prefixes (INV, RCT, CN).
--   billing_record_payment / billing_void_entry  service-role functions: a payment with its receipt and invoice, and a
--                                                void with its credit note, each in one transaction.
--
-- All in one transaction. Reversible while no document has been issued: drop the 2 functions, 3 tables and 3 columns
-- and delete the 7 settings (the drops delete the new data - only with approval).

begin;

create table public.billing_documents (
  id bigint generated always as identity primary key,
  doc_type text not null constraint billing_documents_type_check check (doc_type in ('RECEIPT', 'INVOICE', 'CREDIT_NOTE')),
  doc_number text not null constraint billing_documents_number_key unique,
  doc_date date not null,
  student_id uuid not null constraint billing_documents_student_fk references public.students(id) on delete restrict,
  payment_entry_id bigint constraint billing_documents_payment_fk references public.ledger_entries(id) on delete restrict,
  against_document_id bigint constraint billing_documents_against_fk references public.billing_documents(id) on delete restrict,
  seller jsonb not null,
  buyer jsonb not null,
  igst boolean not null default false,
  taxable numeric(12,2) not null default 0,
  cgst numeric(12,2) not null default 0,
  sgst numeric(12,2) not null default 0,
  igst_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  created_by text,
  created_at timestamptz not null default now()
);
alter table public.billing_documents enable row level security;
create index billing_documents_student_idx on public.billing_documents (student_id, doc_date);
create unique index billing_documents_one_receipt on public.billing_documents (payment_entry_id) where doc_type = 'RECEIPT';

create table public.billing_document_lines (
  id bigint generated always as identity primary key,
  document_id bigint not null constraint billing_document_lines_doc_fk references public.billing_documents(id) on delete restrict,
  ledger_entry_id bigint not null constraint billing_document_lines_entry_fk references public.ledger_entries(id) on delete restrict,
  description text not null,
  sac text,
  taxable numeric(12,2) not null,
  gst_rate numeric(5,2),
  gst_amount numeric(12,2) not null,
  total numeric(12,2) not null
);
alter table public.billing_document_lines enable row level security;
create index billing_document_lines_doc_idx on public.billing_document_lines (document_id);

create table public.billing_doc_counters (
  doc_type text not null,
  fy text not null,
  last_no integer not null,
  primary key (doc_type, fy)
);
alter table public.billing_doc_counters enable row level security;

alter table public.ledger_entries add column invoice_id bigint constraint ledger_entries_invoice_fk references public.billing_documents(id) on delete restrict;
alter table public.ledger_entries add column credit_note_id bigint constraint ledger_entries_credit_note_fk references public.billing_documents(id) on delete restrict;
alter table public.students add column billing_state text constraint students_billing_state_check check (billing_state is null or billing_state ~ '^[0-9]{2}$');

insert into public.fto_settings (setting_key, setting_value, description) values
  ('billing_legal_name', '', 'Billing: legal name on GST invoices. Invoices start once legal name, GSTIN and address are set.'),
  ('billing_gstin', '', 'Billing: the school''s GSTIN (its first 2 digits are the school''s state).'),
  ('billing_address', '', 'Billing: registered address printed on receipts, invoices and credit notes.'),
  ('billing_sac', '', 'Billing: SAC code printed on invoice lines (confirm with the CA).'),
  ('billing_invoice_prefix', 'INV', 'Billing: invoice number prefix (INV/2026-27/0001).'),
  ('billing_receipt_prefix', 'RCT', 'Billing: receipt number prefix (RCT/2026-27/0001).'),
  ('billing_credit_note_prefix', 'CN', 'Billing: credit note number prefix (CN/2026-27/0001).')
on conflict (setting_key) do nothing;

-- The next number in a document series: PREFIX/2026-27/0001, one series per type and financial year.
create or replace function public.billing_next_number(p_type text, p_prefix text, p_date date)
returns text language plpgsql as $$
declare
  y int := extract(year from p_date)::int - case when extract(month from p_date) < 4 then 1 else 0 end;
  v_fy text := y || '-' || lpad(((y + 1) % 100)::text, 2, '0');
  n int;
begin
  insert into public.billing_doc_counters as c (doc_type, fy, last_no) values (p_type, v_fy, 1)
  on conflict (doc_type, fy) do update set last_no = c.last_no + 1
  returning last_no into n;
  return coalesce(nullif(trim(p_prefix), ''), p_type) || '/' || v_fy || '/' || lpad(n::text, 4, '0');
end $$;

-- A payment, its receipt, and (when p_seller is given) an invoice for every live charge not yet invoiced.
-- p_prefixes: {"receipt": "RCT", "invoice": "INV"}. Returns {"payment": id, "receipt": no, "invoice": no | null}.
create or replace function public.billing_record_payment(
  p_student uuid, p_date date, p_amount numeric, p_method text, p_reference text, p_description text, p_by text,
  p_today date, p_receipt_seller jsonb, p_seller jsonb, p_buyer jsonb, p_igst boolean, p_sac text, p_prefixes jsonb
) returns jsonb language plpgsql as $$
declare
  v_payment bigint; v_receipt text; v_invoice text; v_doc bigint; v_gst numeric; v_cgst numeric;
begin
  insert into public.ledger_entries (student_id, entry_date, kind, source, credit, method, reference, description, created_by)
  values (p_student, p_date, 'PAYMENT', 'MANUAL', p_amount, p_method, p_reference, p_description, p_by)
  returning id into v_payment;

  v_receipt := public.billing_next_number('RECEIPT', p_prefixes->>'receipt', p_date);
  insert into public.billing_documents (doc_type, doc_number, doc_date, student_id, payment_entry_id, seller, buyer, total, created_by)
  values ('RECEIPT', v_receipt, p_date, p_student, v_payment, p_receipt_seller, p_buyer, p_amount, p_by);

  if p_seller is not null then
    perform 1 from public.ledger_entries
      where student_id = p_student and kind = 'CHARGE' and voided_at is null and invoice_id is null and debit > 0
      for update;
    if found then
      v_invoice := public.billing_next_number('INVOICE', p_prefixes->>'invoice', p_today);
      insert into public.billing_documents (doc_type, doc_number, doc_date, student_id, payment_entry_id, seller, buyer, igst, created_by)
      values ('INVOICE', v_invoice, p_today, p_student, v_payment, p_seller, p_buyer, p_igst, p_by)
      returning id into v_doc;
      insert into public.billing_document_lines (document_id, ledger_entry_id, description, sac, taxable, gst_rate, gst_amount, total)
      select v_doc, id, description, nullif(p_sac, ''), debit - gst_amount, gst_rate, gst_amount, debit
      from public.ledger_entries
      where student_id = p_student and kind = 'CHARGE' and voided_at is null and invoice_id is null and debit > 0
      order by entry_date, id;
      update public.ledger_entries set invoice_id = v_doc
      where student_id = p_student and kind = 'CHARGE' and voided_at is null and invoice_id is null and debit > 0;
      select coalesce(sum(gst_amount), 0) into v_gst from public.billing_document_lines where document_id = v_doc;
      v_cgst := case when p_igst then 0 else round(v_gst / 2, 2) end;
      update public.billing_documents d set
        taxable = l.taxable, total = l.total,
        igst_amount = case when p_igst then v_gst else 0 end, cgst = v_cgst, sgst = case when p_igst then 0 else v_gst - v_cgst end
      from (select sum(taxable) as taxable, sum(total) as total from public.billing_document_lines where document_id = v_doc) l
      where d.id = v_doc;
    end if;
  end if;

  return jsonb_build_object('payment', v_payment, 'receipt', v_receipt, 'invoice', v_invoice);
end $$;

-- Void a live entry; when it is on an invoice, issue a credit note for it against that invoice (same seller, buyer
-- and GST split as the invoice). Returns {"source", "source_id", "credit_note": no | null}; null = no live entry.
create or replace function public.billing_void_entry(
  p_entry bigint, p_student uuid, p_reason text, p_by text, p_today date, p_prefix text
) returns jsonb language plpgsql as $$
declare
  e public.ledger_entries; inv public.billing_documents; v_cn text; v_doc bigint; v_cgst numeric;
begin
  update public.ledger_entries set voided_at = now(), voided_by = p_by, void_reason = p_reason
  where id = p_entry and student_id = p_student and voided_at is null
  returning * into e;
  if not found then return null; end if;

  if e.invoice_id is not null then
    select * into inv from public.billing_documents where id = e.invoice_id;
    v_cn := public.billing_next_number('CREDIT_NOTE', p_prefix, p_today);
    v_cgst := case when inv.igst then 0 else round(e.gst_amount / 2, 2) end;
    insert into public.billing_documents (doc_type, doc_number, doc_date, student_id, against_document_id, seller, buyer, igst,
      taxable, cgst, sgst, igst_amount, total, created_by)
    values ('CREDIT_NOTE', v_cn, p_today, p_student, inv.id, inv.seller, inv.buyer, inv.igst,
      e.debit - e.gst_amount, v_cgst, case when inv.igst then 0 else e.gst_amount - v_cgst end,
      case when inv.igst then e.gst_amount else 0 end, e.debit, p_by)
    returning id into v_doc;
    insert into public.billing_document_lines (document_id, ledger_entry_id, description, sac, taxable, gst_rate, gst_amount, total)
    select v_doc, e.id, 'Cancelled: ' || l.description || ' (' || p_reason || ')', l.sac, l.taxable, l.gst_rate, l.gst_amount, l.total
    from public.billing_document_lines l where l.document_id = inv.id and l.ledger_entry_id = e.id;
    update public.ledger_entries set credit_note_id = v_doc where id = e.id;
  end if;

  return jsonb_build_object('source', e.source, 'source_id', e.source_id, 'credit_note', v_cn);
end $$;

revoke execute on function public.billing_next_number(text, text, date) from public, anon, authenticated;
grant execute on function public.billing_next_number(text, text, date) to service_role;
revoke execute on function public.billing_record_payment(uuid, date, numeric, text, text, text, text, date, jsonb, jsonb, jsonb, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function public.billing_record_payment(uuid, date, numeric, text, text, text, text, date, jsonb, jsonb, jsonb, boolean, text, jsonb) to service_role;
revoke execute on function public.billing_void_entry(bigint, uuid, text, text, date, text) from public, anon, authenticated;
grant execute on function public.billing_void_entry(bigint, uuid, text, text, date, text) to service_role;

commit;

-- Check (read-only)
select (select count(*) from information_schema.tables where table_name in ('billing_documents', 'billing_document_lines', 'billing_doc_counters')) as new_tables,
       (select count(*) from information_schema.columns where (table_name, column_name) in (('ledger_entries', 'invoice_id'), ('ledger_entries', 'credit_note_id'), ('students', 'billing_state'))) as new_columns,
       (select count(*) from public.fto_settings where setting_key in ('billing_legal_name', 'billing_gstin', 'billing_address', 'billing_sac', 'billing_invoice_prefix', 'billing_receipt_prefix', 'billing_credit_note_prefix')) as new_settings,
       (select count(*) from pg_proc where proname in ('billing_next_number', 'billing_record_payment', 'billing_void_entry')) as new_functions;
