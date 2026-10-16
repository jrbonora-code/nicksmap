import { FLORIDA_COUNTIES } from "./counties.ts";
import { dollarsToCents } from "./money.ts";
import { WorkspaceValidationError } from "./errors.ts";
import { STRATEGIES, DEAL_STAGES } from "./types.ts";

export const SCREENING_MONEY_FIELDS = ["grossPotentialRent", "vacancyLoss", "concessions", "creditLoss", "otherIncome",
  "operatingExpenses", "replacementReserves", "annualDebtService", "loanBalance", "purchasePrice", "totalCost"] as const;

export function validUuid(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

class FormReader {
  readonly fields: Record<string,string> = {};
  private readonly data: FormData;
  constructor(data: FormData) {
    if (!(data instanceof FormData)) throw new WorkspaceValidationError("A form submission is required.");
    this.data = data;
  }
  text(name: string, max: number, required = false): string {
    const values = this.data.getAll(name);
    if (values.length > 1 || (values[0] !== undefined && typeof values[0] !== "string")) {
      this.fields[name] = "Supply one text value; files are not accepted.";
      return "";
    }
    const value = typeof values[0] === "string" ? values[0].trim() : "";
    if (value.length > max || (required && !value)) this.fields[name] = required ? `Enter a value up to ${max} characters.` : `Use at most ${max} characters.`;
    return value;
  }
  uuid(name: string) {
    const value = this.text(name, 36, true);
    if (!validUuid(value)) this.fields[name] = "A valid record identifier is required.";
    return value;
  }
  choice<const T extends readonly string[]>(name: string, choices: T): T[number] {
    const value = this.text(name, 50, true);
    if (!choices.includes(value)) this.fields[name] = "Choose a supported value.";
    return value as T[number];
  }
  date(name: string, required = false): string | null {
    const value = this.text(name, 10, required);
    if (!value && !required) return null;
    const timestamp = /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith("0000-") ? Date.parse(`${value}T00:00:00Z`) : NaN;
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0,10) !== value) this.fields[name] = "Enter a real calendar date as YYYY-MM-DD.";
    return value;
  }
  integer(name: string, required = false): number | null {
    const value = this.text(name, 10, required);
    if (!value && !required) return null;
    if (!/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) this.fields[name] = "Enter a positive whole number no larger than 2,147,483,647.";
    return Number(value);
  }
  coordinate(name: string, min: number, max: number): number | null {
    const value = this.text(name, 30);
    if (!value) return null;
    if (!/^-?\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max) this.fields[name] = `Enter a Florida coordinate between ${min} and ${max}.`;
    return Number(value);
  }
  money(name: string, required = false): number | null {
    const value = this.text(name, 30, required);
    try {
      const result = dollarsToCents(value);
      if (required && result === null) this.fields[name] = "Enter dollars explicitly; unknown values cannot be treated as zero.";
      return result;
    } catch { this.fields[name] = "Enter nonnegative dollars with at most two decimal places, within the safe-cent limit."; return null; }
  }
  ids(name: string): string[] {
    const values = this.data.getAll(name);
    if (values.length < 1 || values.length > 100 || values.some(value => typeof value !== "string" || !validUuid(value)) || new Set(values).size !== values.length) {
      this.fields[name] = "Select between 1 and 100 distinct evidence records for this deal.";
      return [];
    }
    return values as string[];
  }
  finish() { if (Object.keys(this.fields).length) throw new WorkspaceValidationError("Review the highlighted fields.", this.fields); }
}

export function parseDealForm(data: FormData, update = false) {
  const form = new FormReader(data);
  const requestId = form.uuid("requestId");
  const id = update ? form.uuid("id") : undefined;
  const expectedUpdatedAt = update ? form.text("expectedUpdatedAt",30,true) : undefined;
  if (update && (!expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt)) || new Date(expectedUpdatedAt).toISOString() !== expectedUpdatedAt)) form.fields.expectedUpdatedAt = "Reload the deal before editing so its current version is known.";
  const name = form.text("name", 180, true);
  const address = form.text("address", 500);
  const countyFips = form.text("countyFips", 5, true);
  if (!FLORIDA_COUNTIES.some(county => county.fips === countyFips)) form.fields.countyFips = "Select one of Florida's 67 counties.";
  const strategy = form.choice("strategy", STRATEGIES);
  const stage = form.choice("stage", DEAL_STAGES);
  const unitCount = form.integer("unitCount");
  const latitude = form.coordinate("latitude",24,31.1);
  const longitude = form.coordinate("longitude",-87.8,-79.8);
  if ((latitude === null) !== (longitude === null)) form.fields.latitude = "Provide both coordinates, or leave both unknown.";
  const askingPriceCents = form.money("askingPrice");
  const notes = form.text("notes",20000);
  const nextAction = form.text("nextAction",1000);
  const nextActionDue = form.date("nextActionDue");
  form.finish();
  return {requestId,id,expectedUpdatedAt,name,address,countyFips,strategy,stage,unitCount,latitude,longitude,askingPriceCents,notes,nextAction,nextActionDue};
}

export function parseEvidenceForm(data: FormData) {
  const form = new FormReader(data);
  const requestId = form.uuid("requestId");
  const dealId = form.uuid("dealId");
  const title = form.text("title",200,true);
  const rawUrl = form.text("sourceUrl",2000);
  let sourceUrl: string | null = null;
  if (rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (!["http:","https:"].includes(url.protocol) || url.username || url.password) throw new Error();
      sourceUrl = url.toString();
    } catch { form.fields.sourceUrl = "Use a complete HTTP or HTTPS source URL without embedded credentials."; }
  }
  const sourceType = form.choice("sourceType",["public_record","broker","owner","estimate","other"] as const);
  const effectiveDate = form.date("effectiveDate",true)!;
  const retrievedDate = form.date("retrievedAt",true)!;
  if (retrievedDate && retrievedDate > new Date().toISOString().slice(0,10)) form.fields.retrievedAt = "The retrieval date cannot be in the future.";
  const notes = form.text("notes",20000,true);
  const reviewStatus = form.choice("reviewStatus",["unreviewed","reviewed","conflict"] as const);
  form.finish();
  return {requestId,dealId,title,sourceUrl,sourceType,effectiveDate,retrievedAt:`${retrievedDate}T00:00:00.000Z`,notes,reviewStatus};
}

export function parseScreeningForm(data: FormData) {
  const form = new FormReader(data);
  const requestId = form.uuid("requestId");
  const dealId = form.uuid("dealId");
  const label = form.text("label",180,true);
  const inputs: Record<string,unknown> = {currency:"USD",period:"annual",unitCount:form.integer("unitCount",true)};
  for (const field of SCREENING_MONEY_FIELDS) inputs[`${field}Cents`] = form.money(field,true);
  const evidenceIds = form.ids("evidenceIds");
  const decision = form.choice("decision",["research","advance","pass"] as const);
  const reason = form.text("reason",10000,true);
  form.finish();
  return {requestId,dealId,label,inputs,evidenceIds,decision,reason};
}

export function parseScreeningPreviewForm(data: FormData) {
  const form = new FormReader(data);
  const dealId = form.uuid("dealId");
  const inputs: Record<string,unknown> = {currency:"USD",period:"annual",unitCount:form.integer("unitCount",true)};
  for (const field of SCREENING_MONEY_FIELDS) inputs[`${field}Cents`] = form.money(field,true);
  form.finish();
  return {dealId,inputs};
}

export function parseResearchDecisionForm(data: FormData) {
  const form = new FormReader(data);
  const requestId = form.uuid("requestId");
  const dealId = form.uuid("dealId");
  const label = form.text("label",180,true);
  const evidenceIds = form.ids("evidenceIds");
  const decision = form.choice("decision",["research","pass"] as const);
  const reason = form.text("reason",10000,true);
  form.finish();
  return {requestId,dealId,label,evidenceIds,decision,reason};
}

export function parseMandateForm(data: FormData) {
  const form = new FormReader(data);
  const requestId = form.uuid("requestId");
  const version = form.text("expectedUpdatedAt",30);
  if (!data.has("expectedUpdatedAt") || (version && (!Number.isFinite(Date.parse(version)) || new Date(version).toISOString() !== version))) {
    form.fields.expectedUpdatedAt = "Reload the mandate before editing so its current version is known.";
  }
  const expectedUpdatedAt = version || null;
  const notes = form.text("notes",20000,true);
  form.finish();
  return {requestId,expectedUpdatedAt,notes};
}
