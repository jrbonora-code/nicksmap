"use client";

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, LoaderCircle, Plus, Save } from "lucide-react";
import { createDealAction, updateDealAction, addEvidenceAction, saveMandateAction } from "../../app/(workspace)/actions";
import { DEAL_STAGES, STRATEGIES, type ActionResult, type Deal, type WorkspaceSettings } from "../../lib/workspace/types";
import { centsInput, STAGE_LABELS, STRATEGY_LABELS } from "./ui";

export function useWorkspaceForm(action: (form: FormData) => Promise<ActionResult>, options: { redirectToDeal?: boolean; reset?: boolean } = {}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const requestId = useRef<string | null>(null);
  const router = useRouter();
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    requestId.current ??= crypto.randomUUID();
    data.set("requestId", requestId.current);
    busy.current = true;
    setResult(null);
    startTransition(async () => {
      try {
        const next = await action(data);
        setResult(next);
        if (next.ok) {
          requestId.current = null;
          if (options.reset) form.reset();
          if (options.redirectToDeal && next.id) router.push(`/deals/${encodeURIComponent(next.id)}`);
          router.refresh();
        }
      } catch {
        setResult({ ok: false, message: "The response was interrupted. Reload the records to check whether the change saved before trying again." });
      } finally { busy.current = false; }
    });
  }
  return { onSubmit, result, pending, errors: result && !result.ok ? result.fields ?? {} : {} };
}

export function Field({ name, label, hint, error, children, wide = false }: { name: string; label: string; hint?: string; error?: string; children: ReactNode; wide?: boolean }) {
  return <div className={`form-field ${wide ? "field-wide" : ""}`}><label htmlFor={name}>{label}</label>{children}{hint && <p id={`${name}-hint`} className="field-hint">{hint}</p>}{error && <p className="field-error" id={`${name}-error`}>{error}</p>}</div>;
}
export function ActionStatus({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return <div className={`action-status ${result.ok ? "action-success" : "action-error"}`} role={result.ok ? "status" : "alert"}>{result.ok ? <CheckCircle2 size={19} /> : <AlertCircle size={19} />}<div><strong>{result.message}</strong>{!result.ok && result.fields && <ul>{Object.entries(result.fields).map(([key, value]) => <li key={key}><a href={`#${key}`}>{value}</a></li>)}</ul>}</div></div>;
}
export function SubmitButton({ pending, children, disabled = false }: { pending: boolean; children: ReactNode; disabled?: boolean }) {
  return <button className="button button-primary" type="submit" disabled={pending || disabled}>{pending ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}{pending ? "Saving…" : children}</button>;
}

export function DealForm({ counties, deal }: { counties: { fips: string; name: string }[]; deal?: Deal }) {
  const { onSubmit, result, pending, errors } = useWorkspaceForm(deal ? updateDealAction : createDealAction, { redirectToDeal: !deal });
  function textProps(name: string) { return { id: name, name, "aria-invalid": !!errors[name], "aria-describedby": errors[name] ? `${name}-error` : undefined }; }
  return <form onSubmit={onSubmit} className="workspace-form" aria-label={deal ? "Edit deal facts" : "Add a deal"}>
    {deal && <><input type="hidden" name="id" value={deal.id} /><input type="hidden" name="expectedUpdatedAt" value={deal.updatedAt} /></>}
    <fieldset disabled={pending}><legend className="form-section-title">The opportunity</legend><div className="form-grid">
      <Field name="name" label="Opportunity name" error={errors.name} wide><input {...textProps("name")} defaultValue={deal?.name} required maxLength={180} placeholder="Property or working deal name" autoComplete="off" /></Field>
      <Field name="address" label="Street address or site description" error={errors.address} wide><input {...textProps("address")} defaultValue={deal?.address} maxLength={500} placeholder="Record the known location" autoComplete="street-address" /></Field>
      <Field name="countyFips" label="Florida county" error={errors.countyFips}><select {...textProps("countyFips")} required defaultValue={deal?.countyFips ?? ""}><option value="" disabled>Select a county</option>{counties.map(county => <option key={county.fips} value={county.fips}>{county.name}</option>)}</select></Field>
      <Field name="strategy" label="Primary strategy" error={errors.strategy}><select {...textProps("strategy")} required defaultValue={deal?.strategy ?? ""}><option value="" disabled>Select a strategy</option>{STRATEGIES.map(strategy => <option key={strategy} value={strategy}>{STRATEGY_LABELS[strategy]}</option>)}</select></Field>
      <Field name="stage" label="Pipeline stage" hint={deal ? "Diligence / closed require an advance snapshot; passed requires a pass snapshot." : "Start in research or screening. Later stages require a saved decision."} error={errors.stage}><select {...textProps("stage")} defaultValue={deal?.stage ?? "research"}>{DEAL_STAGES.filter(stage => deal || stage === "research" || stage === "screening").map(stage => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}</select></Field>
      <Field name="unitCount" label="Units, if known" error={errors.unitCount}><input {...textProps("unitCount")} type="number" min={1} step={1} defaultValue={deal?.unitCount ?? ""} placeholder="Unknown" /></Field>
      <Field name="askingPrice" label="Asking price (USD), if known" hint="A seller's asking price is not a verified value." error={errors.askingPrice} wide><input {...textProps("askingPrice")} inputMode="decimal" defaultValue={deal?.askingPriceCents != null ? centsInput(deal.askingPriceCents) : ""} placeholder="Unknown" /></Field>
    </div></fieldset>
    <fieldset disabled={pending}><legend className="form-section-title">Research and next move</legend><div className="form-grid">
      <Field name="notes" label="Why this opportunity, and why now?" error={errors.notes} wide><textarea {...textProps("notes")} rows={4} defaultValue={deal?.notes} maxLength={20000} placeholder="Record the situation, proposed transaction, key risks, and decisive unknowns." /></Field>
      <Field name="nextAction" label="Next action" error={errors.nextAction}><input {...textProps("nextAction")} defaultValue={deal?.nextAction} maxLength={1000} placeholder="What would move this investigation forward?" /></Field>
      <Field name="nextActionDue" label="Target date, if set" error={errors.nextActionDue}><input {...textProps("nextActionDue")} type="date" defaultValue={deal?.nextActionDue?.slice(0, 10) ?? ""} /></Field>
    </div></fieldset>
    <details className="form-disclosure"><summary>Optional verified map location</summary><p className="field-hint">Enter both coordinates only when the property location has been checked. A county selection does not establish a parcel location.</p><fieldset disabled={pending}><div className="form-grid">
      <Field name="latitude" label="Latitude" error={errors.latitude}><input {...textProps("latitude")} inputMode="decimal" defaultValue={deal?.latitude ?? ""} placeholder="Unknown" /></Field>
      <Field name="longitude" label="Longitude" error={errors.longitude}><input {...textProps("longitude")} inputMode="decimal" defaultValue={deal?.longitude ?? ""} placeholder="Unknown" /></Field>
    </div></fieldset></details>
    <ActionStatus result={result} /><div className="form-footer"><p>Blank optional values remain unknown.</p><SubmitButton pending={pending}>{deal ? "Save deal changes" : "Create opportunity"}</SubmitButton></div>
  </form>;
}

export function EvidenceForm({ dealId }: { dealId: string }) {
  const { onSubmit, result, pending, errors } = useWorkspaceForm(addEvidenceAction, { reset: true });
  function attrs(name: string) { return { name, id: name, "aria-invalid": !!errors[name], "aria-describedby": errors[name] ? `${name}-error` : undefined }; }
  return <form onSubmit={onSubmit} className="workspace-form"><input type="hidden" name="dealId" value={dealId} /><fieldset disabled={pending}><legend className="sr-only">Add source evidence</legend><div className="form-grid">
    <Field name="title" label="Source or observation title" error={errors.title} wide><input {...attrs("title")} required maxLength={200} placeholder="What does this record establish?" /></Field>
    <Field name="sourceType" label="Source type" error={errors.sourceType}><select {...attrs("sourceType")} required defaultValue=""><option value="" disabled>Choose source type</option><option value="public_record">Public record</option><option value="broker">Broker provided</option><option value="owner">Owner provided</option><option value="estimate">Analyst estimate</option><option value="other">Other</option></select></Field>
    <Field name="reviewStatus" label="Review status" error={errors.reviewStatus}><select {...attrs("reviewStatus")} defaultValue="unreviewed"><option value="unreviewed">Unreviewed</option><option value="reviewed">Reviewed by you</option><option value="conflict">Unresolved conflict</option></select></Field>
    <Field name="sourceUrl" label="Source URL, if available" error={errors.sourceUrl} wide><input {...attrs("sourceUrl")} type="url" placeholder="https://" maxLength={2000} /></Field>
    <Field name="effectiveDate" label="Effective / observation date" hint="The date the fact applies to." error={errors.effectiveDate}><input {...attrs("effectiveDate")} type="date" required /></Field>
    <Field name="retrievedAt" label="Date retrieved" hint="When you obtained the source." error={errors.retrievedAt}><input {...attrs("retrievedAt")} type="date" required /></Field>
    <Field name="notes" label="Findings, location in source, and limitations" error={errors.notes} wide><textarea {...attrs("notes")} required rows={4} maxLength={20000} placeholder="Record the relevant facts, page or record number, uncertainties, and what you checked." /></Field>
  </div></fieldset><ActionStatus result={result} /><div className="form-footer"><p>Source references and notes only. File uploads are not available.</p><button className="button button-primary" disabled={pending}>{pending ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}{pending ? "Adding…" : "Add evidence"}</button></div></form>;
}

export function MandateForm({ mandate, unavailable = false }: { mandate: WorkspaceSettings["mandate"]; unavailable?: boolean }) {
  const { onSubmit, result, pending, errors } = useWorkspaceForm(saveMandateAction);
  return <form onSubmit={onSubmit} className="workspace-form"><input type="hidden" name="expectedUpdatedAt" value={mandate.updatedAt ?? ""} /><fieldset disabled={pending || unavailable}><legend className="sr-only">Working investment mandate</legend><Field name="notes" label="Working mandate" error={errors.notes} hint="Include strategy priorities, unit and deal size, equity available, leverage and guarantee limits, required returns, and downside tolerances."><textarea name="notes" id="notes" required rows={9} maxLength={20000} defaultValue={mandate.notes} placeholder="Write the investment criteria you actually intend to use. No capital limits or return thresholds have been assumed." aria-invalid={!!errors.notes} /></Field></fieldset><ActionStatus result={result} />{errors.expectedUpdatedAt && <div className="notice notice-neutral" id="expectedUpdatedAt" role="status"><AlertCircle size={18} /><p>Your unsaved text remains in the field above. Copy it before reloading this page, then review and merge your changes with the latest mandate before saving again.</p></div>}<div className="form-footer"><p>Saved as a draft. This does not approve a deal or calibrate a grade.</p><SubmitButton pending={pending} disabled={unavailable}>Save mandate draft</SubmitButton></div></form>;
}
