import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dollarsToCents } from "../../lib/workspace/money.ts";
import { parseDealForm, parseEvidenceForm, parseScreeningForm, parseMandateForm } from "../../lib/workspace/validation.ts";
import { FLORIDA_COUNTIES } from "../../lib/workspace/counties.ts";
import { databaseOptions } from "../../db/connection.mjs";

function form(fields: Record<string,string>) {
  const data = new FormData();
  data.set("requestId",randomUUID());
  for (const [key,value] of Object.entries(fields)) data.set(key,value);
  return data;
}

test("USD adapter preserves decimal cents exactly, including the supported integer boundary", () => {
  for (const [input,expected] of [["0",0],["0.01",1],["0.29",29],["1.1",110],["1000000.99",100000099],["90071992547409.91",Number.MAX_SAFE_INTEGER]] as const) assert.equal(dollarsToCents(input),expected);
  assert.equal(dollarsToCents(" "),null);
  for (const bad of ["1e6","0x100","1,000.00","$10.00","1.001","-1","+1",".5","1.","00.10","Infinity","NaN","90071992547409.92"]) assert.throws(()=>dollarsToCents(bad));
});
test("USD parsing matches independently assembled integer cents across 400 decimal examples", () => {
  for (let whole = 0n; whole < 40n; whole++) for(let cent = 0n; cent < 100n; cent+=11n) {
    assert.equal(dollarsToCents(`${whole}.${cent.toString().padStart(2,"0")}`),Number(whole*100n+cent));
  }
});
test("missing optional property values stay null and invalid county/coordinates are rejected", () => {
  const data = form({name:"Synthetic case",countyFips:"12071",strategy:"acquisition",stage:"research"});
  const result = parseDealForm(data);
  for(const key of ["unitCount","askingPriceCents","latitude","longitude","nextActionDue"] as const) assert.equal(result[key],null);
  data.set("countyFips","12025"); assert.throws(()=>parseDealForm(data)); // obsolete Dade FIPS is not current Miami-Dade
  data.set("countyFips","12071"); data.set("latitude","26.5"); assert.throws(()=>parseDealForm(data));
  data.set("longitude","-81.8"); assert.equal(parseDealForm(data).latitude,26.5);
  data.set("unitCount","10.5"); assert.throws(()=>parseDealForm(data));
});
test("forms reject duplicate scalar fields, file values, impossible dates and unsafe links", () => {
  const data = form({name:"Synthetic",countyFips:"12071",strategy:"land",stage:"research"});
  data.append("name","ambiguous"); assert.throws(()=>parseDealForm(data));
  data.delete("name"); data.set("name",new Blob(["not a document upload"]),"facts.txt"); assert.throws(()=>parseDealForm(data));
  const evidence = form({dealId:randomUUID(),title:"Source",sourceType:"public_record",effectiveDate:"2026-02-30",retrievedAt:"2026-09-01",notes:"Synthetic source observation",reviewStatus:"unreviewed"});
  assert.throws(()=>parseEvidenceForm(evidence));
  evidence.set("effectiveDate","2024-02-29"); evidence.set("sourceUrl","javascript:alert(1)"); assert.throws(()=>parseEvidenceForm(evidence));
  evidence.set("sourceUrl","https://user:secret@example.com/"); assert.throws(()=>parseEvidenceForm(evidence));
  evidence.set("sourceUrl","https://example.com/record"); assert.equal(parseEvidenceForm(evidence).effectiveDate,"2024-02-29");
});
test("all screening money fields must be explicit; omitted values never become zero", () => {
  const data = form({dealId:randomUUID(),label:"Scenario",unitCount:"10",decision:"research",reason:"Synthetic reference case"});
  data.append("evidenceIds",randomUUID());
  assert.throws(()=>parseScreeningForm(data),error => error instanceof Error && error.message.includes("highlighted"));
  for (const key of ["grossPotentialRent","vacancyLoss","concessions","creditLoss","otherIncome","operatingExpenses","replacementReserves","annualDebtService","loanBalance","purchasePrice","totalCost"]) data.set(key,"0");
  data.set("purchasePrice","1"); data.set("totalCost","1");
  const parsed = parseScreeningForm(data); assert.equal(parsed.inputs.grossPotentialRentCents,0);
  data.delete("creditLoss"); assert.throws(()=>parseScreeningForm(data));
});
test("mandate status is not accepted from the browser", () => {
  const parsed = parseMandateForm(form({notes:"Draft capital limits",status:"reviewed",expectedUpdatedAt:""}));
  assert.equal("status" in parsed,false);
});
test("mandate version is explicit, allows the initial null version, and rejects malformed timestamps",()=>{
  const initial=form({notes:"First draft",expectedUpdatedAt:""});
  assert.equal(parseMandateForm(initial).expectedUpdatedAt,null);
  initial.set("expectedUpdatedAt","2026-09-12T05:00:00.123Z");
  assert.equal(parseMandateForm(initial).expectedUpdatedAt,"2026-09-12T05:00:00.123Z");
  for(const invalid of ["2026-09-12","not-a-date","2026-02-30T05:00:00.123Z"]) {
    initial.set("expectedUpdatedAt",invalid);
    assert.throws(()=>parseMandateForm(initial));
  }
  initial.delete("expectedUpdatedAt");
  assert.throws(()=>parseMandateForm(initial));
});
test("Census geometry and administrative catalogue contain exactly the 67 current Florida identifiers", () => {
  const geo = JSON.parse(readFileSync(new URL("../../public/data/florida-counties.geojson",import.meta.url),"utf8"));
  const expected = Array.from({length:67},(_,index)=>String(12001+index*2)).filter(fips=>fips!=="12025" && fips!=="12085");
  expected.push("12085","12086"); // Miami-Dade is 12086, not the obsolete 12025.
  assert.equal(FLORIDA_COUNTIES.length,67);
  assert.deepEqual(FLORIDA_COUNTIES.map(c=>c.fips).sort(),expected.sort());
  assert.equal(geo.features.length,67);
  assert.deepEqual(geo.features.map((f:{properties:{fips:string,name:string}})=>f.properties).sort((a:{fips:string},b:{fips:string})=>a.fips.localeCompare(b.fips)),[...FLORIDA_COUNTIES].sort((a,b)=>a.fips.localeCompare(b.fips)));
  assert.equal(FLORIDA_COUNTIES.find(c=>c.fips==="12086")?.name,"Miami-Dade");
  assert.equal(FLORIDA_COUNTIES.find(c=>c.fips==="12027")?.name,"DeSoto");
  for(const feature of geo.features) {
    assert.ok(["Polygon","MultiPolygon"].includes(feature.geometry.type));
    const points = feature.geometry.type === "Polygon" ? feature.geometry.coordinates.flat(1) : feature.geometry.coordinates.flat(2);
    assert.ok(points.length>3);
    for(const [longitude,latitude] of points) { assert.ok(longitude>=-88 && longitude<=-79); assert.ok(latitude>=24 && latitude<=32); }
  }
});
test("remote database TLS cannot be disabled or downgraded by URL ssl flags", () => {
  assert.throws(()=>databaseOptions({DATABASE_URL:"postgres://user@example.com/radar?sslmode=disable"}));
  const verified = databaseOptions({DATABASE_URL:"postgres://user@example.com/radar?sslmode=require&sslrejectunauthorized=false"});
  assert.deepEqual(verified.ssl,{rejectUnauthorized:true});
  assert.equal(new URL(verified.connectionString).search,"");
  assert.equal(databaseOptions({DATABASE_URL:"postgres://user@127.0.0.1/radar"}).ssl,false);
  assert.equal(databaseOptions({DATABASE_URL:"postgres://user@postgres.railway.internal/radar",DATABASE_SSL_MODE:"disable"}).ssl,false);
});
