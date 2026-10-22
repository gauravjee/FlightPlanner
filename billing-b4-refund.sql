-- billing-b4-refund.sql (2026-10-22) — refund all or part of an invoiced charge with a credit note.
-- Operator, 22 Oct: "Yes, add it". See claude/billing-design-2026-10-20.md, "B4 plan".
--
-- ADDITIVE ONLY: one new function, billing_refund_entry (service role only). No table or existing value changes.
-- Reversible: drop the function.
--
-- One transaction: checks the charge is live and invoiced, that the amount (incl. GST) is not more than what is still
-- un-credited, issues a credit note against the charge's invoice (GST split pro rata, CGST/SGST or IGST as on the
-- invoice), and adds a credit ADJUSTMENT to the student's ledger linked to that credit note.

begin;

create or replace function public.billing_refund_entry(
  p_entry bigint, p_student uuid, p_amount numeric, p_reason text, p_by text, p_today date, p_prefix text
) returns jsonb language plpgsql as $$
declare
  e public.ledger_entries; inv public.billing_documents; v_left numeric; v_gst numeric; v_cgst numeric;
  v_doc bigint; v_cn text; v_sac text;
begin
  select * into e from public.ledger_entries where id = p_entry and student_id = p_student and voided_at is null for update;
  if not found then raise exception 'BILLING: No live entry with that id for this student.'; end if;
  if e.kind <> 'CHARGE' or e.invoice_id is null then
    raise exception 'BILLING: Only an invoiced charge can be refunded with a credit note. Use an adjustment for anything else.';
  end if;
  select e.debit - coalesce(sum(l.total), 0) into v_left
  from public.billing_document_lines l join public.billing_documents d on d.id = l.document_id
  where d.doc_type = 'CREDIT_NOTE' and l.ledger_entry_id = e.id;
  if p_amount <= 0 or p_amount > v_left then
    raise exception 'BILLING: At most Rs. % of this charge can still be refunded.', v_left;
  end if;

  select * into inv from public.billing_documents where id = e.invoice_id;
  select sac into v_sac from public.billing_document_lines where document_id = inv.id and ledger_entry_id = e.id;
  v_gst := case when e.debit > 0 then round(p_amount * e.gst_amount / e.debit, 2) else 0 end;
  v_cgst := case when inv.igst then 0 else round(v_gst / 2, 2) end;
  v_cn := public.billing_next_number('CREDIT_NOTE', p_prefix, p_today);

  insert into public.billing_documents (doc_type, doc_number, doc_date, student_id, against_document_id, seller, buyer, igst,
    taxable, cgst, sgst, igst_amount, total, created_by)
  values ('CREDIT_NOTE', v_cn, p_today, p_student, inv.id, inv.seller, inv.buyer, inv.igst,
    p_amount - v_gst, v_cgst, case when inv.igst then 0 else v_gst - v_cgst end, case when inv.igst then v_gst else 0 end, p_amount, p_by)
  returning id into v_doc;
  insert into public.billing_document_lines (document_id, ledger_entry_id, description, sac, taxable, gst_rate, gst_amount, total)
  values (v_doc, e.id, 'Refund: ' || e.description || ' (' || p_reason || ')', v_sac, p_amount - v_gst, e.gst_rate, v_gst, p_amount);
  insert into public.ledger_entries (student_id, entry_date, kind, source, description, credit, credit_note_id, created_by)
  values (p_student, p_today, 'ADJUSTMENT', 'MANUAL', 'Refund, credit note ' || v_cn || ': ' || p_reason, p_amount, v_doc, p_by);

  return jsonb_build_object('credit_note', v_cn);
end $$;

revoke execute on function public.billing_refund_entry(bigint, uuid, numeric, text, text, date, text) from public, anon, authenticated;
grant execute on function public.billing_refund_entry(bigint, uuid, numeric, text, text, date, text) to service_role;

commit;

-- Check (read-only)
select count(*) as refund_function from pg_proc where proname = 'billing_refund_entry';
