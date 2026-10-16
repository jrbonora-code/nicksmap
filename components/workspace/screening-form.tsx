"use client";

import { useRef, useState, useTransition } from "react";
import { Calculator, FileCheck2, Info, LoaderCircle, LockKeyhole } from "lucide-react";
import { previewScreeningAction, saveScreeningAction } from "../../app/(workspace)/actions";
import type { ActionResult, Deal, Evidence } from "../../lib/workspace/types";
import { ActionStatus, Field, SubmitButton, useWorkspaceForm } from "./forms";
import { SCREENING_LABELS, ScreeningResults } from "./screening-results";
import { dateLabel } from "./ui";

export function ScreeningForm({ deal, evidence }: { deal: Deal; evidence: Evidence[] }) {
  const form = useRef<HTMLFormElement>(null);
  const { onSubmit, result, pending, errors } = useWorkspaceForm(saveScreeningAction);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [previewStatus, setPreviewStatus] = useState<ActionResult | null>(null);
  const [previewPending, startPreview] = useTransition();
  const [decision, setDecision] = useState("research");
  function calculate() {
    if (!form.current) return;
    const data = new FormData(form.current);
    setPreview(null);
    setPreviewStatus(null);
    startPreview(async () => {
      try {
        const response = await previewScreeningAction(data);
        if (response.ok && response.calculation) setPreview(response.calculation as unknown as Record<string, unknown>);
        else setPreviewStatus(response);
      } catch { setPreviewStatus({ ok: false, message: "The calculation could not be completed. Your entered inputs are still here." }); }
    });
  }
  const previewErrors = previewStatus && !previewStatus.ok ? previewStatus.fields ?? {} : {};
  const fieldErrors = { ...errors, ...previewErrors };
  function input(name: string) { return { id: name, name, inputMode: "decimal" as const, required: true, placeholder: "Enter USD", "aria-invalid": !!fieldErrors[name], "aria-describedby": fieldErrors[name] ? `${name}-error` : undefined }; }
  const busy = pending || previewPending;
  return <form ref={form} onSubmit={onSubmit} className="workspace-form screening-form"><input type="hidden" name="dealId" value={deal.id} />
    <div className="notice notice-neutral"><Info size={19} /><div><strong>Annual operating screen</strong><p>This screen uses explicit annual inputs. It does not model construction draws, lease-up, an IRR, a waterfall, or incentive approval. Evidence must support one consistent period and scope.</p></div></div>
    <fieldset disabled={busy} onChange={() => { setPreview(null); setPreviewStatus(null); }}><legend className="form-section-title">1. Enter the supported inputs</legend><div className="form-grid"><Field name="unitCount" label="Unit count" error={fieldErrors.unitCount}><input id="unitCount" name="unitCount" type="number" min={1} step={1} required defaultValue={deal.unitCount ?? ""} placeholder="Unknown" aria-invalid={!!fieldErrors.unitCount} /></Field><div className="input-convention"><span className="eyebrow">INPUT CONVENTION</span><strong>USD · Annual period</strong><p>Enter dollars, without commas. Enter zero only when it is supported.</p></div></div><h3 className="form-subheading">Operating income and expenses</h3><div className="form-grid">{["grossPotentialRent", "vacancyLoss", "concessions", "creditLoss", "otherIncome", "operatingExpenses", "replacementReserves"].map(name => <Field key={name} name={name} label={`${SCREENING_LABELS[name]} (USD / year)`} error={fieldErrors[name]} hint={name === "vacancyLoss" ? "Keep vacancy, concessions, and credit losses separate." : name === "operatingExpenses" ? "Excludes replacement reserves and debt service." : undefined}><input {...input(name)} /></Field>)}</div><h3 className="form-subheading">Acquisition basis and financing</h3><div className="form-grid">{["purchasePrice", "totalCost", "loanBalance", "annualDebtService"].map(name => <Field key={name} name={name} label={`${SCREENING_LABELS[name]} (${name === "annualDebtService" ? "USD / year" : "USD"})`} error={fieldErrors[name]} hint={name === "totalCost" ? "Includes purchase price and all acquisition costs." : undefined}><input {...input(name)} /></Field>)}</div></fieldset>
    <div className="calculation-preview"><div className="preview-heading"><div><h3>Review the arithmetic</h3><p>All required inputs must be explicit before results appear.</p></div><button className="button button-secondary" type="button" onClick={calculate} disabled={busy}>{previewPending ? <LoaderCircle size={16} className="spin" /> : <Calculator size={16} />}{previewPending ? "Calculating…" : "Calculate preview"}</button></div><ActionStatus result={previewStatus} />{preview ? <ScreeningResults result={preview} /> : <p className="preview-empty">No current calculation. Enter the inputs and calculate a preview.</p>}</div>
    <fieldset disabled={busy}><legend className="form-section-title">2. Attach the evidence</legend><p className="field-hint">Select the sources that support these inputs. Their current contents and review states are copied into the saved snapshot.</p><div id="evidenceIds" className="evidence-picker">{evidence.length ? evidence.map(item => <label className="evidence-choice" key={item.id}><input type="checkbox" name="evidenceIds" value={item.id} /><span><strong>{item.title}</strong><span>Effective {dateLabel(item.effectiveDate)} · {item.sourceType.replace("_", " ")}</span></span><span className={`badge evidence-${item.reviewStatus}`}>{item.reviewStatus === "conflict" ? "Conflict" : item.reviewStatus === "reviewed" ? "Reviewed" : "Unreviewed"}</span></label>) : <div className="small-empty"><FileCheck2 size={22} /><strong>Add evidence before saving a screen</strong><p>Open the Evidence tab to record at least one dated source.</p></div>}</div>{fieldErrors.evidenceIds && <p className="field-error">{fieldErrors.evidenceIds}</p>}</fieldset>
    <fieldset disabled={busy}><legend className="form-section-title">3. Record your judgment</legend><div className="form-grid"><Field name="label" label="Snapshot name" error={fieldErrors.label} wide><input id="label" name="label" required maxLength={180} placeholder="Name the case and source period" /></Field><Field name="decision" label="Next decision" error={fieldErrors.decision} wide><select id="decision" name="decision" value={decision} onChange={event => setDecision(event.target.value)}><option value="research">Continue research</option><option value="advance">Advance investigation</option><option value="pass">Pass on this deal</option></select></Field>{decision === "advance" && <div className="field-wide notice notice-neutral"><Info size={17} /><p>Advancing requires every linked source to be reviewed. This is your decision to investigate further; it is not an investment approval.</p></div>}<Field name="reason" label="Reason, risks, and decisive unknowns" error={fieldErrors.reason} wide><textarea id="reason" name="reason" required rows={4} maxLength={10000} placeholder="Explain the call, material warnings, capital and execution risks, and what needs to happen next." /></Field></div></fieldset>
    <ActionStatus result={result} /><div className="form-footer"><p><LockKeyhole size={14} />Saved snapshots preserve inputs, sources, policy context, and model version.</p><SubmitButton pending={pending} disabled={previewPending || evidence.length === 0 || !preview}>Save decision snapshot</SubmitButton></div>{!preview && <p className="field-hint">Calculate and review a current preview to enable saving. The server recalculates the submitted inputs when saving.</p>}
  </form>;
}
