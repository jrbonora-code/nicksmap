import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { fixture } from './import.test.ts';
import { importResearch } from '../../scripts/research-import-core.mjs';
import { importOzEb5, validateOzEb5Bundle } from '../../scripts/oz-eb5-import-core.mjs';
import { currentOzEb5Run, ozEb5AssetRows, ozEb5CbsaForCounty, ozEb5GeometryRows, ozEb5MarketRows, ozEb5TractByGeoid, ozEb5TractRows, noCbsa } from '../../lib/research/oz-eb5.ts';
import { appendCaseVersion, createCase, listCases, parseCreateCase, parseVersionInput, readCase } from '../../lib/research/case-core.ts';
import { emptyCaseContent, emptyEvidenceEntry, type CaseContent } from '../../lib/research/case-model.ts';
import { defaultScenario, financingThreshold } from '../../lib/research/finance.ts';
import { emptyQuery } from '../../lib/research/query.ts';
import { WorkspaceValidationError } from '../../lib/workspace/errors.ts';
import type { WorkspaceUser } from '../../lib/workspace/types.ts';
const url=process.env.RESEARCH_TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||!new URL(url).pathname.startsWith('/radar_test_research_'))throw new Error('An isolated research test database is required.');
function rebundle(b:ReturnType<typeof fixture>,mutate:(bundle:ReturnType<typeof fixture>)=>void){
  const changed=structuredClone(b);mutate(changed);
  changed.manifest.transformedHash=createHash('sha256').update(JSON.stringify({records:changed.records,observations:changed.observations,tracts:changed.tracts})).digest('hex');
  changed.id=createHash('sha256').update(JSON.stringify(changed.manifest)).digest('hex');return changed;
}
test('transaction rollback, replay, source retention and immutable current snapshot',async()=>{
  const pool=new pg.Pool({connectionString:url});
  try{
    const b=fixture();const imported=await importResearch(pool,b);assert.equal(imported.status,'imported');
    const replay=await importResearch(pool,b);assert.equal(replay.status,'replayed');
    assert.equal(Number((await pool.query('SELECT count(*) n FROM research_properties')).rows[0].n),1);
    assert.equal((await pool.query('SELECT content FROM research_sources')).rows[0].content,'synthetic source');
    const changed=rebundle(b,bundle=>{bundle.records[0].record.countyFips='12071';});
    await assert.rejects(importResearch(pool,changed,{failAfterProperties:true}));
    assert.equal((await pool.query('SELECT snapshot_id FROM research_current')).rows[0].snapshot_id,b.id);
    assert.equal(Number((await pool.query('SELECT count(*) n FROM research_snapshots')).rows[0].n),1);
    assert.equal(Number((await pool.query("SELECT count(*) n FROM research_import_runs WHERE status='failed'")).rows[0].n),1);
    assert.equal((await pool.query('SELECT record FROM research_snapshot_properties')).rows[0].record.countyFips,'12057');
  }finally{await pool.end();}
});
test('strategy cases: fixed origin, append-only versions, idempotent retries, stale writes, state gates and later imports',async()=>{
  const pool=new pg.Pool({connectionString:url});
  const actor:WorkspaceUser={id:randomUUID(),name:'Synthetic case analyst',login:'synthetic-case',avatarUrl:null};
  const scenario={...defaultScenario(),asOf:'2026-09-14'};
  const inTransaction=async<T>(run:(client:pg.PoolClient)=>Promise<T>)=>{const client=await pool.connect();try{await client.query('BEGIN');const out=await run(client);await client.query('COMMIT');return out;}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}};
  try{
    const b=fixture();assert.equal((await pool.query('SELECT snapshot_id FROM research_current')).rows[0].snapshot_id,b.id);
    const query={...emptyQuery,debt:'reported' as const,sort:'maturity' as const};
    const create=parseCreateCase({requestId:randomUUID(),snapshotId:b.id,propertyId:'reapi:fixture',debtId:'reapi:fixture:0',principalCents:null,scenario,query,state:'observed_lead',content:emptyCaseContent('Fixture lead'),reason:'Opened from the research record.'});
    const first=await inTransaction(client=>createCase(client,actor,create));
    assert.equal(first.version,1);
    assert.deepEqual(await inTransaction(client=>createCase(client,actor,create)),first,'identical retry returns the saved result');
    await assert.rejects(inTransaction(client=>createCase(client,actor,{...create,reason:'Different content'})),/already saved with different content/);
    await assert.rejects(inTransaction(client=>createCase(client,actor,{...create,requestId:randomUUID(),propertyId:'reapi:missing'})),WorkspaceValidationError);
    await assert.rejects(inTransaction(client=>createCase(client,actor,{...create,requestId:randomUUID(),debtId:'reapi:fixture:9'})),WorkspaceValidationError);
    await assert.rejects(inTransaction(client=>createCase(client,actor,{...create,requestId:randomUUID(),content:{...emptyCaseContent('Lead with fee'),proposedFeeCents:100}})),/Observed lead/);
    assert.equal(Number((await pool.query('SELECT count(*) n FROM research_strategy_cases')).rows[0].n),1,'rejected attempts leave no case');
    const opened=await inTransaction(client=>readCase(client,first.id));
    assert.ok(opened);assert.equal(opened.origin.principalCents,500000000);assert.equal(opened.origin.amountBasis,'original_recorded_amount');assert.deepEqual(opened.origin.threshold,financingThreshold(500000000,scenario));
    assert.equal(opened.origin.trigger.reportedMaturity,'2027-03-01');assert.equal(opened.origin.sources[0].sha256,b.sources[0].sha256);assert.equal(opened.current.state,'observed_lead');
    assert.deepEqual(opened.origin.query,query,'the research filters are fixed in the origin');
    const hypothesis:CaseContent={...emptyCaseContent('Fixture hypothesis'),lane:'financing_transition',hypothesis:'A takeout decision may be approaching.',need:'Owner needs a documented options comparison.',supportingEvidence:'Recorded maturity 2027-03-01.',contraryEvidence:'No statement yet; lender may extend.',rejectionTest:'A committed takeout or a released instrument.',payerType:'owner',operatorRole:'assess',nextAction:'Request permissioned loan statement.',missingInputs:['loan_statement','current_payoff','t12_noi']};
    const second=await inTransaction(client=>appendCaseVersion(client,actor,first.id,parseVersionInput({requestId:randomUUID(),expectedVersion:1,state:'hypothesis',content:hypothesis,reason:'Hypothesis formed from recorded maturity.'})));
    assert.equal(second.version,2);
    await assert.rejects(inTransaction(client=>appendCaseVersion(client,actor,first.id,parseVersionInput({requestId:randomUUID(),expectedVersion:1,state:'hypothesis',content:hypothesis,reason:'Stale'}))),/changed after you opened it/);
    await assert.rejects(inTransaction(client=>appendCaseVersion(client,actor,first.id,parseVersionInput({requestId:randomUUID(),expectedVersion:2,state:'hypothesis',content:{...hypothesis,cashRequiredCents:0},reason:'Fee too early'}))),/Hypothesis/);
    await assert.rejects(inTransaction(client=>appendCaseVersion(client,actor,first.id,parseVersionInput({requestId:randomUUID(),expectedVersion:2,state:'documented_case',content:hypothesis,reason:'Missing evidence'}))),/Documented case/);
    await assert.rejects(inTransaction(client=>appendCaseVersion(client,actor,first.id,parseVersionInput({requestId:randomUUID(),expectedVersion:2,state:'hypothesis',content:{...hypothesis,deadlineBasis:'confirmed_statement'},reason:'Status without evidence'}))),/Hypothesis/,'an asserted deadline basis needs an evidence entry');
    const evidence=[{...emptyEvidenceEntry('e1','2026-09-10'),claims:['deadline_basis' as const,'collateral_scope' as const],locator:'Servicer statement page 1',effectiveDate:'2026-08-31',scope:'Instrument reapi:fixture:0, whole property',observation:'Balance and maturity confirmed.',reviewer:'Analyst'},{...emptyEvidenceEntry('e2','2026-09-10'),claims:['operating_evidence' as const],locator:'T12 and rent roll',effectivePeriod:'T12 to 2026-06-30',scope:'Whole property',observation:'Twelve months of operations received.',reviewer:'Analyst'}];
    const documented:CaseContent={...hypothesis,label:'Fixture documented case',deadlineBasis:'confirmed_statement',collateralScope:'reconciled',operatingEvidence:'permissioned_current',feeStatus:'none_proposed',evidence,alternatives:[{kind:'ordinary_refinance',label:'',status:'compared',note:'Agency quote assumptions.',scenario:{...scenario,annualRate:.06,annualReserveCents:123456},result:{requiredNoiCents:1} as never},{kind:'no_action',label:'',status:'rejected',note:'Balloon unfunded.',scenario:null,result:null}]};
    const third=await inTransaction(client=>appendCaseVersion(client,actor,first.id,parseVersionInput({requestId:randomUUID(),expectedVersion:2,state:'documented_case',content:documented,reason:'Statement received.'})));
    assert.equal(third.version,3);
    const current=await inTransaction(client=>readCase(client,first.id));
    assert.equal(current?.versions.length,3);assert.equal(current?.current.state,'documented_case');
    assert.deepEqual(current?.current.content.alternatives[0].result,financingThreshold(500000000,{...scenario,annualRate:.06,annualReserveCents:123456}),'alternative thresholds are recomputed server-side');
    assert.equal(current?.versions[2].content.label,'Fixture lead','earlier versions are retained verbatim');
    assert.equal(current?.current.modelVersion,'strategy-case-2');
    const summaries=await inTransaction(client=>listCases(client));
    assert.equal(summaries.length,1);assert.equal(summaries[0].label,'Fixture documented case');assert.equal(summaries[0].version,3);assert.equal(summaries[0].address,'1 Synthetic Way');
    assert.equal(summaries[0].evidenceEntries,2);assert.equal(summaries[0].sharedPropertyCount,1);assert.equal(summaries[0].instrumentConflict,false);
    assert.equal((await inTransaction(client=>listCases(client,{propertyId:'reapi:other'}))).length,0);
    await assert.rejects(pool.query("UPDATE research_strategy_case_versions SET reason='edited' WHERE case_id=$1",[first.id]),/append-only/);
    await assert.rejects(pool.query('DELETE FROM research_strategy_cases WHERE id=$1',[first.id]),/append-only/);
    const audit=await pool.query('SELECT event,count(*)::int n FROM workspace_audit WHERE entity_id=$1 GROUP BY event ORDER BY event',[first.id]);
    assert.deepEqual(audit.rows,[{event:'case.created',n:1},{event:'case.versioned',n:2}]);
    const later=rebundle(b,bundle=>{bundle.records[0].record.mortgages[0].amountCents=1;bundle.records[0].detail.property.mortgages[0].amountCents=1;});
    assert.equal((await importResearch(pool,later)).status,'imported');
    assert.equal((await pool.query('SELECT snapshot_id FROM research_current')).rows[0].snapshot_id,later.id);
    const after=await inTransaction(client=>readCase(client,first.id));
    assert.equal(after?.snapshotId,b.id);assert.equal(after?.origin.debt?.amountCents,500000000,'a later import does not rewrite a saved origin');
  }finally{await pool.end();}
});

// ---------- migration 007: the OZ / EB-5 designated tract table ----------
const hex=(value:string)=>createHash('sha256').update(value).digest('hex');
const square=(west:number,south:number)=>({type:'Polygon',coordinates:[[[west,south],[west+.1,south],[west+.1,south+.1],[west,south+.1],[west,south]]]});
/** Every column the offline oz-eb5-tracts.csv carries; a row overrides only what the case is about. */
const ozTract=(over:Record<string,unknown>)=>({
  geoid_2010:'',state:'',county_name:'',county_fips:'',tract_type:'Low-Income Community',oz_status:'designated_2018',
  oz_authority:'CDFI Fund designated QOZ list, December 14, 2018',geoid_2010_geometry_alias:'',cbsa_code:'',cbsa_title:'',cbsa_type:'none',
  msa_basis:'OMB 2023 List 1 by county',town_basis:'',bridge_type:'same_id',tracts_2020:'',dropped_successors:'',
  iiusa_rows:1,iiusa_coverage_pct:100,iiusa_rural_tea:'TRUE',iiusa_msa:'',place_20k_names:'',place_20k_kind:'none',
  place_20k_successor_land_pct:0,eb5_rural_class:'rural_clear',class_reason:'Synthetic fixture row.',notes:'',
  // Migration 008 columns. Null is "not carried" and is what an older run reads; the fixture sets real values on a few rows.
  oz2027_eligible_land_pct:null,oz2027_status:null,oz2027_rural_land_pct:null,oz2027_rural_flag:null,oz2027_basis:'',
  lihtc_qct_2026_land_pct:null,lihtc_qct_2026:null,lihtc_qct_2026_basis:'',lihtc_dda_2026:null,lihtc_dda_2026_basis:'',
  nmtc_lic_land_pct:null,nmtc_lic_eligible:null,nmtc_poverty_rate:null,nmtc_mfi_ratio_pct:null,nmtc_basis:'',
  acs2015_poverty_rate:null,acs2015_mfi_ratio_pct:null,acs2015_poverty_universe_pop:null,acs2015_lic_eligible:null,acs2015_basis:'',
  acs2024_coverage:null,acs2024_population:null,acs2024_poverty_universe_pop:null,acs2024_poverty_rate:null,acs2024_median_family_income_usd:null,acs2024_basis:'',
  ...over,
});
/** Every column of the offline oz-eb5-assets.csv; a row overrides the identity, tract and figures the case is about. */
const ozAsset=(over:Record<string,unknown>)=>({
  source:'hud_assisted',source_object_id:'',source_property_id:'',property_name:'Synthetic Apartments',address:'1 Main Street',city:'Hardin',state_abbr:'MT',zip:'59034',
  latitude:45.73,longitude:-107.61,geoid_2010:'',tract_state:'',tract_county_name:'',eb5_rural_class:'rural_clear',cbsa_type:'micropolitan',cbsa_title:'Hardin, MT',
  total_units:null,assisted_units:null,assisted_units_basis:'TOTAL_ASSISTED_UNIT_COUNT',program_or_designation:'Section 8',program_2:'',
  contract_or_restriction_expiration_raw:'',contract_or_restriction_expiration_year:null,expiration_status:'none',second_expiration_raw:'',
  loan_maturity_year:null,effective_year:null,source_layer:'https://example.invalid/assisted/FeatureServer/0',retrieved_utc:'2026-09-17T18:17:10.587Z',...over,
});
/**
 * A synthetic screen output shaped exactly like the prepared bundle: two Montana counties (one with qualifying
 * tracts that disagree on CBSA type, which is the `mixed` market case), a Florida county holding one qualifying
 * and one failing tract, an unknown-class territory tract with no qualifying tract in its county, and Bedford,
 * the metropolitan row that carries the retired 2010 geometry alias and therefore no polygon.
 */
function ozFixture(note='baseline'){
  const tracts=[
    // The one row carrying every migration-008 value, so the round trip of each type (percent, count, verdict, basis) is pinned.
    ozTract({geoid_2010:'30003940600',state:'Montana',county_name:'Big_Horn County',county_fips:'30003',cbsa_code:'20500',cbsa_title:'Hardin, MT',cbsa_type:'micropolitan',eb5_rural_class:'rural_clear',class_reason:`Outside every 2023 OMB metropolitan area. ${note}`,
      oz2027_eligible_land_pct:100,oz2027_status:'fully_eligible',oz2027_rural_land_pct:100,oz2027_rural_flag:'rural',oz2027_basis:'IRS Rev. Proc. 2026-14 appendix (synthetic)',
      lihtc_qct_2026_land_pct:100,lihtc_qct_2026:'yes',lihtc_qct_2026_basis:'HUD QCT 2026 (synthetic)',lihtc_dda_2026:'yes',lihtc_dda_2026_basis:'HUD DDA 2026 (synthetic)',
      nmtc_lic_land_pct:100,nmtc_lic_eligible:'yes',nmtc_poverty_rate:29.4,nmtc_mfi_ratio_pct:77.2,nmtc_basis:'CDFI NMTC 2016-2020 (synthetic)',
      acs2015_poverty_rate:29.4,acs2015_mfi_ratio_pct:77.2,acs2015_poverty_universe_pop:1873,acs2015_lic_eligible:'yes',acs2015_basis:'CDFI 2011-2015 (synthetic)',
      acs2024_coverage:'whole',acs2024_population:1782,acs2024_poverty_universe_pop:1693,acs2024_poverty_rate:38.1,acs2024_median_family_income_usd:61815,acs2024_basis:'ACS 2020-2024 (synthetic)'}),
    ozTract({geoid_2010:'30003940700',state:'Montana',county_name:'Big_Horn County',county_fips:'30003',cbsa_code:'20500',cbsa_title:'Hardin, MT',cbsa_type:'micropolitan',eb5_rural_class:'rural_interpretation_dependent',class_reason:'A 20,000+ census designated place applies.'}),
    ozTract({geoid_2010:'30093000100',state:'Montana',county_name:'Silver Bow County',county_fips:'30093',cbsa_code:'15580',cbsa_title:'Butte-Silver Bow, MT',cbsa_type:'micropolitan',eb5_rural_class:'rural_interpretation_dependent',class_reason:'Consolidated city-county entry of 34,494.'}),
    ozTract({geoid_2010:'30093000200',state:'Montana',county_name:'Silver Bow County',county_fips:'30093',eb5_rural_class:'rural_interpretation_dependent',class_reason:'Unobserved remainder after a 2010 to 2020 split.'}),
    ozTract({geoid_2010:'12057013000',state:'Florida',county_name:'Hillsborough County',county_fips:'12057',eb5_rural_class:'not_rural_place_per_iiusa',place_20k_names:'Plant City (39,764)',place_20k_kind:'incorporated',class_reason:'IIUSA associates the tract with an incorporated place of 20,000 or more.'}),
    ozTract({geoid_2010:'12057013100',state:'Florida',county_name:'Hillsborough County',county_fips:'12057',eb5_rural_class:'rural_clear',class_reason:'Outside every 2023 OMB metropolitan area; no 20,000+ place.',
      lihtc_qct_2026_land_pct:0,lihtc_qct_2026:'no',lihtc_qct_2026_basis:'HUD QCT 2026 (synthetic)',lihtc_dda_2026:'no',lihtc_dda_2026_basis:'HUD DDA 2026 (synthetic)',acs2024_coverage:'partial',acs2024_basis:'ACS 2020-2024 (synthetic): nothing carried'}),
    ozTract({geoid_2010:'72001956700',state:'Puerto Rico',county_name:'Adjuntas Municipio',county_fips:'72001',eb5_rural_class:'unknown',iiusa_rows:0,iiusa_coverage_pct:0,iiusa_rural_tea:'',class_reason:'No IIUSA observation exists for the tract or its successors.'}),
    // CDFI lists 51019050100; the 2010-vintage geometry and the geocoder carry the retired Bedford city code.
    ozTract({geoid_2010:'51019050100',state:'Virginia',county_name:'Bedford County',county_fips:'51019',geoid_2010_geometry_alias:'51515050100',cbsa_code:'31340',cbsa_title:'Lynchburg, VA',cbsa_type:'metropolitan',bridge_type:'renumbered',eb5_rural_class:'not_rural_msa',class_reason:'County is in a 2023 metropolitan statistical area.',
      lihtc_qct_2026_land_pct:40,lihtc_qct_2026:'partial',lihtc_qct_2026_basis:'HUD QCT 2026 (synthetic)',lihtc_dda_2026:'metro_zcta_not_evaluated',lihtc_dda_2026_basis:'HUD DDA 2026 (synthetic): metropolitan leg not evaluated'}),
  ];
  // Layer 4: three source properties, one per source, in a rural_clear Montana tract, a rural_clear Florida
  // tract and the metropolitan Bedford tract, so the metro exclusion, the tract roll-up and the expiring
  // filter each have a row to find and a row to leave out.
  const assets=[
    ozAsset({source:'hud_assisted',source_object_id:'1',source_property_id:'800000001',property_name:'Hardin Senior Residences',geoid_2010:'30003940600',tract_state:'Montana',tract_county_name:'Big_Horn County',total_units:40,assisted_units:40,contract_or_restriction_expiration_raw:'31-MAR-29',contract_or_restriction_expiration_year:2029,expiration_status:'expires_by_2030',effective_year:2009}),
    ozAsset({source:'usda_rural',source_object_id:'7',source_property_id:'12345',property_name:'Plant City Family Apartments',address:'2 Oak Street',city:'Plant City',state_abbr:'FL',zip:'33563',latitude:28.01,longitude:-82.13,geoid_2010:'12057013100',tract_state:'Florida',tract_county_name:'Hillsborough County',cbsa_type:'none',cbsa_title:'',total_units:24,assisted_units:20,assisted_units_basis:'RA_UNITS',program_or_designation:'Family',source_layer:'https://example.invalid/usda/FeatureServer/0'}),
    ozAsset({source:'hud_lihtc',source_object_id:'3',source_property_id:'VAA20050012',property_name:'Bedford Commons',address:'3 Elm Street',city:'Bedford',state_abbr:'VA',zip:'24523',latitude:37.33,longitude:-79.52,geoid_2010:'51019050100',tract_state:'Virginia',tract_county_name:'Bedford County',eb5_rural_class:'not_rural_msa',cbsa_type:'metropolitan',cbsa_title:'Lynchburg, VA',total_units:null,assisted_units:null,assisted_units_basis:'LI_UNITS',program_or_designation:'LIHTC',contract_or_restriction_expiration_raw:'2035',contract_or_restriction_expiration_year:2035,expiration_status:'later',source_layer:'https://example.invalid/lihtc/FeatureServer/0'}),
  ];
  // Metropolitan tracts fail on the MSA leg regardless of place, so they are carried without geometry.
  const geometry:Record<string,unknown>={};let n=0;
  for(const t of tracts) if(t.eb5_rural_class!=='not_rural_msa') geometry[t.geoid_2010]=square(-108+(n++)*.3,45);
  const omb=[
    {countyFips:'30003',countyName:'Big Horn County, MT',cbsaCode:'20500',cbsaTitle:'Hardin, MT',cbsaType:'micropolitan'},
    {countyFips:'30093',countyName:'Silver Bow County, MT',cbsaCode:'15580',cbsaTitle:'Butte-Silver Bow, MT',cbsaType:'micropolitan'},
    {countyFips:'51019',countyName:'Bedford County, VA',cbsaCode:'31340',cbsaTitle:'Lynchburg, VA',cbsaType:'metropolitan'},
    // Connecticut is keyed on planning regions in OMB 2023, not on counties.
    {countyFips:'09110',countyName:'Capitol Planning Region, CT',cbsaCode:'25540',cbsaTitle:'Hartford-West Hartford-East Hartford, CT',cbsaType:'metropolitan'},
    {countyFips:'09160',countyName:'Northwest Hills Planning Region, CT',cbsaCode:'45860',cbsaTitle:'Torrington, CT',cbsaType:'micropolitan'},
  ];
  const byClass:Record<string,number>={};
  for(const t of tracts) byClass[t.eb5_rural_class]=(byClass[t.eb5_rural_class]??0)+1;
  const manifest={
    parserVersion:'oz-eb5-import-2',preparedUtc:'2026-09-16T05:30:36.760Z',prepareScriptSha256:hex('synthetic prepare script'),
    screenScriptSha256:hex('synthetic screen script'),tractsCsvSha256:hex(`synthetic tracts csv ${note}`),
    sources:{cdfi:{url:'https://example.invalid/designated-qozs.xlsx',sha256:hex('cdfi'),fetched_utc:'2026-09-16T03:02:50.344Z',note:'Synthetic CDFI list'},omb:{url:'https://example.invalid/list1_2023.xlsx',sha256:hex('omb'),fetched_utc:'2026-09-16T03:02:50.481Z',note:'Synthetic OMB List 1'}},
    counts:{tracts:tracts.length,withGeometry:Object.keys(geometry).length,withoutGeometry:tracts.length-Object.keys(geometry).length,ombCounties:omb.length,...byClass,assets:assets.length,assetsInRuralClear:assets.filter(a=>a.eb5_rural_class==='rural_clear').length},
    geometry:{tolerance:0.00008,highQuality:true},
    transformedHash:hex(JSON.stringify({tracts,geometry,omb,assets})),
    rule:'EB-5 rural area, INA 203(b)(5)(D)(ii) as amended by the EB-5 Reform and Integrity Act of 2022.',
  };
  return {id:hex(JSON.stringify(manifest)),parserVersion:'oz-eb5-import-2',manifest,tracts,geometry,omb,assets};
}

test('OZ / EB-5 import: replay without duplicates, an atomic current pointer, rollback and immutable history',async()=>{
  const pool=new pg.Pool({connectionString:url});
  try{
    const first=ozFixture();
    validateOzEb5Bundle(first);
    const imported=await importOzEb5(pool,first,{importedBy:'synthetic-operator'});
    assert.equal(imported.status,'imported');
    assert.equal(imported.runId,first.id);
    assert.deepEqual(imported.counts,{tracts:8,withGeometry:7,withoutGeometry:1,ombCounties:5,rural_clear:2,rural_interpretation_dependent:3,not_rural_place_per_iiusa:1,unknown:1,not_rural_msa:1,assets:3,assetsInRuralClear:2});
    assert.equal(Number((await pool.query('SELECT count(*) n FROM research_oz_eb5_tracts WHERE run_id=$1',[first.id])).rows[0].n),8);
    assert.equal(Number((await pool.query('SELECT count(*) n FROM research_oz_eb5_cbsa_counties WHERE run_id=$1',[first.id])).rows[0].n),5);
    assert.equal(Number((await pool.query('SELECT count(*) n FROM research_oz_eb5_assets WHERE run_id=$1',[first.id])).rows[0].n),3,'layer 4 is written in the same transaction');
    // The migration-008 columns land typed: a null stays NULL and a number is a number, on the same row.
    const carried=(await pool.query('SELECT lihtc_qct_2026, lihtc_dda_2026, acs2024_population, acs2024_median_family_income_usd, oz2027_status FROM research_oz_eb5_tracts WHERE run_id=$1 AND geoid_2010=$2',[first.id,'30003940600'])).rows[0];
    assert.deepEqual(carried,{lihtc_qct_2026:'yes',lihtc_dda_2026:'yes',acs2024_population:1782,acs2024_median_family_income_usd:61815,oz2027_status:'fully_eligible'});
    const notCarried=(await pool.query('SELECT lihtc_qct_2026, acs2024_coverage, acs2015_poverty_rate FROM research_oz_eb5_tracts WHERE run_id=$1 AND geoid_2010=$2',[first.id,'72001956700'])).rows[0];
    assert.deepEqual(notCarried,{lihtc_qct_2026:null,acs2024_coverage:null,acs2015_poverty_rate:null});
    assert.equal(Number((await pool.query('SELECT count(*) n FROM research_oz_eb5_tracts WHERE run_id=$1 AND display_geometry IS NOT NULL',[first.id])).rows[0].n),7,'the metropolitan tract is carried without geometry');
    assert.equal((await pool.query('SELECT run_id FROM research_oz_eb5_current')).rows[0].run_id,first.id);
    assert.equal((await pool.query("SELECT status FROM research_import_runs WHERE snapshot_id=$1",[first.id])).rows[0].status,'imported');

    // The run is content addressed, so importing the same bundle again replays instead of duplicating rows.
    const replay=await importOzEb5(pool,first,{importedBy:'synthetic-operator'});
    assert.equal(replay.status,'replayed');
    assert.notEqual(replay.auditId,imported.auditId,'a replay is its own audited action');
    assert.equal(Number((await pool.query('SELECT count(*) n FROM research_oz_eb5_tracts WHERE run_id=$1',[first.id])).rows[0].n),8,'a replay writes no second copy');
    assert.equal(Number((await pool.query('SELECT count(*) n FROM research_oz_eb5_runs')).rows[0].n),1);
    assert.equal((await pool.query('SELECT run_id FROM research_oz_eb5_current')).rows[0].run_id,first.id);

    // A later screen run switches the pointer; the earlier run's rows stay readable for comparison.
    const second=ozFixture('second run');
    assert.notEqual(second.id,first.id);
    assert.equal((await importOzEb5(pool,second,{importedBy:'synthetic-operator'})).status,'imported');
    assert.equal((await pool.query('SELECT run_id FROM research_oz_eb5_current')).rows[0].run_id,second.id);
    assert.equal(Number((await pool.query('SELECT count(*) n FROM research_oz_eb5_runs')).rows[0].n),2);
    assert.equal(Number((await pool.query('SELECT count(*) n FROM research_oz_eb5_tracts WHERE run_id=$1',[first.id])).rows[0].n),8,'the superseded run is retained');

    // A fault after the tract rows are written rolls the whole import back and leaves the live run alone.
    const third=ozFixture('rolled back run');
    await assert.rejects(importOzEb5(pool,third,{failAfterTracts:true}),/Controlled OZ \/ EB-5 import fault/);
    assert.equal(Number((await pool.query('SELECT count(*) n FROM research_oz_eb5_runs WHERE id=$1',[third.id])).rows[0].n),0);
    assert.equal(Number((await pool.query('SELECT count(*) n FROM research_oz_eb5_tracts WHERE run_id=$1',[third.id])).rows[0].n),0);
    assert.equal((await pool.query('SELECT run_id FROM research_oz_eb5_current')).rows[0].run_id,second.id,'the previously imported run stays live');
    assert.equal((await pool.query("SELECT status FROM research_import_runs WHERE snapshot_id=$1",[third.id])).rows[0].status,'failed');

    // An invalid bundle is refused before a single row is written, whichever guard catches it first.
    const rehash=(b:ReturnType<typeof ozFixture>)=>{b.manifest.transformedHash=hex(JSON.stringify({tracts:b.tracts,geometry:b.geometry,omb:b.omb,assets:b.assets}));b.id=hex(JSON.stringify(b.manifest));return b;};
    const tampered=structuredClone(first);tampered.tracts[0].class_reason='edited after the manifest was written';
    assert.throws(()=>validateOzEb5Bundle(tampered),/Transformed rows do not match the manifest/);
    const miscounted=structuredClone(first);miscounted.manifest.counts.tracts=99;miscounted.id=hex(JSON.stringify(miscounted.manifest));
    assert.throws(()=>validateOzEb5Bundle(miscounted),/count mismatch/);
    const relabelled=rehash(Object.assign(structuredClone(first),{}));relabelled.tracts[0].eb5_rural_class='rural';rehash(relabelled);
    assert.throws(()=>validateOzEb5Bundle(relabelled),/Unknown EB-5 rural class/);
    await assert.rejects(importOzEb5(pool,relabelled),/Unknown EB-5 rural class/);
    const renamed=structuredClone(first);renamed.id='not-a-content-address';
    assert.throws(()=>validateOzEb5Bundle(renamed),/Invalid OZ \/ EB-5 import manifest/);
    // Migration-008 guards: an undocumented flag value, an out-of-range measure, an asset in a tract the run does
    // not hold, and an asset whose class disagrees with its tract (the assets mode ran against another table).
    const badFlag=structuredClone(first);(badFlag.tracts[0] as Record<string,unknown>).lihtc_qct_2026='maybe';rehash(badFlag);
    assert.throws(()=>validateOzEb5Bundle(badFlag),/lihtc_qct_2026 carries an undocumented value/);
    const badRate=structuredClone(first);(badRate.tracts[0] as Record<string,unknown>).acs2024_poverty_rate=140;rehash(badRate);
    assert.throws(()=>validateOzEb5Bundle(badRate),/acs2024_poverty_rate is out of range/);
    const strayAsset=structuredClone(first);strayAsset.assets[0].geoid_2010='30003999999';rehash(strayAsset);
    assert.throws(()=>validateOzEb5Bundle(strayAsset),/names tract 30003999999, which is not in the table/);
    const mismatched=structuredClone(first);mismatched.assets[0].eb5_rural_class='not_rural_msa';rehash(mismatched);
    assert.throws(()=>validateOzEb5Bundle(mismatched),/class that disagrees with its tract/);
    await assert.rejects(importOzEb5(pool,mismatched),/class that disagrees with its tract/);
    const oldParser=structuredClone(first);oldParser.parserVersion='oz-eb5-import-1';
    assert.throws(()=>validateOzEb5Bundle(oldParser),/Invalid OZ \/ EB-5 import manifest/,'a bundle from the earlier parser is refused rather than half-loaded');
    assert.equal(Number((await pool.query('SELECT count(*) n FROM research_oz_eb5_runs')).rows[0].n),2,'a refused bundle writes nothing');

    // An imported run and its rows are history: ordinary SQL cannot rewrite or erase them.
    for(const statement of [
      "UPDATE research_oz_eb5_runs SET imported_by='someone else'",
      'DELETE FROM research_oz_eb5_runs',
      "UPDATE research_oz_eb5_tracts SET eb5_rural_class='rural_clear' WHERE eb5_rural_class='not_rural_msa'",
      'DELETE FROM research_oz_eb5_tracts',
      "UPDATE research_oz_eb5_cbsa_counties SET cbsa_type='micropolitan'",
      'DELETE FROM research_oz_eb5_cbsa_counties',
      "UPDATE research_oz_eb5_assets SET total_units=999",
      'DELETE FROM research_oz_eb5_assets',
    ]) await assert.rejects(pool.query(statement),/append-only/,statement);
    // The current-run pointer is deliberately not history: switching runs is how a new screen goes live.
    assert.equal(Number((await pool.query('SELECT count(*) n FROM research_oz_eb5_current')).rows[0].n),1);
  }finally{await pool.end();}
});

test('OZ / EB-5 reads: bounded list filters, county markets, state geometry and the Bedford alias',async()=>{
  const pool=new pg.Pool({connectionString:url});
  const client=await pool.connect();
  try{
    const run=await currentOzEb5Run(client);
    assert.ok(run,'the second fixture run is live');
    assert.equal(run.importedBy,'synthetic-operator');
    assert.equal(run.scriptSha256,hex('synthetic screen script'));
    assert.equal(run.counts.tracts,8);
    assert.match(run.importedAt,/^\d{4}-\d{2}-\d{2}T/);
    assert.match(run.rule,/INA 203\(b\)\(5\)\(D\)\(ii\)/);
    const list=(over:Partial<Parameters<typeof ozEb5TractRows>[2]>={})=>ozEb5TractRows(client,run.id,{state:null,className:null,county:null,countyFips:null,includeMetro:false,boost:false,withAssets:false,...over});

    // Metropolitan tracts are excluded unless asked for, and the list is bounded.
    const everything=await list();
    assert.equal(everything.limit,2000);
    assert.equal(everything.truncated,false);
    assert.deepEqual(everything.rows.map(r=>r.geoid2010),['12057013000','12057013100','30003940600','30003940700','30093000100','30093000200','72001956700'],'ordered by state, county, tract and metro excluded');
    assert.deepEqual((await list({includeMetro:true})).rows.map(r=>r.geoid2010).sort(),['12057013000','12057013100','30003940600','30003940700','30093000100','30093000200','51019050100','72001956700']);
    assert.deepEqual((await list({className:'not_rural_msa',includeMetro:true})).rows.map(r=>r.geoid2010),['51019050100']);
    assert.deepEqual((await list({state:'Montana'})).rows.map(r=>r.geoid2010),['30003940600','30003940700','30093000100','30093000200']);
    assert.deepEqual((await list({className:'rural_clear'})).rows.map(r=>r.geoid2010),['12057013100','30003940600']);
    assert.deepEqual((await list({countyFips:'30093'})).rows.map(r=>r.geoid2010),['30093000100','30093000200']);
    assert.deepEqual((await list({state:'Montana',className:'rural_clear'})).rows.map(r=>r.geoid2010),['30003940600']);
    assert.equal((await list({state:'Virginia'})).rows.length,0,'the only Virginia tract is metropolitan');

    // The county search is a case-insensitive contains, with the LIKE wildcards escaped.
    assert.equal((await list({county:'big_horn'})).rows.length,2);
    assert.equal((await list({county:'BIG_HORN COUNTY'})).rows.length,2);
    assert.equal((await list({county:'Big Horn'})).rows.length,0,'an underscore is matched literally, not as a wildcard');
    assert.equal((await list({county:'%'})).rows.length,0,'a percent sign is matched literally, not as a wildcard');
    assert.equal((await list({county:'County'})).rows.length,6,'the Puerto Rico row is a Municipio and the Virginia one is metropolitan');

    // Every column of the offline table survives the round trip, including the numeric ones.
    const florida=(await list({countyFips:'12057',className:'not_rural_place_per_iiusa'})).rows[0];
    assert.equal(florida.place20kNames,'Plant City (39,764)');
    assert.equal(florida.place20kKind,'incorporated');
    assert.equal(florida.iiusaRows,1);
    assert.equal(florida.iiusaCoveragePct,100);
    assert.equal(florida.place20kSuccessorLandPct,0);
    assert.equal(florida.ozAuthority,'CDFI Fund designated QOZ list, December 14, 2018');

    // Migration 008: the extension columns round trip typed, a null stays null, and each row carries its own
    // asset roll-up from the same run.
    const hardin=(await list({countyFips:'30003',className:'rural_clear'})).rows[0];
    assert.equal(hardin.lihtcQct2026,'yes');
    assert.equal(hardin.lihtcQct2026LandPct,100);
    assert.equal(hardin.lihtcDda2026,'yes');
    assert.equal(hardin.nmtcPovertyRate,29.4);
    assert.equal(hardin.acs2015PovertyUniversePop,1873);
    assert.equal(hardin.acs2024Coverage,'whole');
    assert.equal(hardin.acs2024Population,1782);
    assert.equal(hardin.acs2024MedianFamilyIncomeUsd,61815);
    assert.equal(hardin.oz2027Status,'fully_eligible');
    assert.equal(hardin.oz2027Basis,'IRS Rev. Proc. 2026-14 appendix (synthetic)');
    assert.equal(hardin.assetCount,1);
    assert.equal(hardin.assetUnits,40);
    assert.equal(florida.lihtcQct2026,null,'a row the fixture left blank reads null, not zero or "no"');
    assert.equal(florida.acs2024Coverage,null);
    assert.equal(florida.assetCount,0);
    assert.equal(florida.assetUnits,0);
    const plantCity=(await list({countyFips:'12057',className:'rural_clear'})).rows[0];
    assert.equal(plantCity.lihtcQct2026,'no');
    assert.equal(plantCity.acs2024Coverage,'partial');
    assert.equal(plantCity.acs2024Population,null,'nothing is carried under partial coverage');
    assert.equal(plantCity.assetCount,1);
    assert.equal(plantCity.assetUnits,24);
    // The boost switch keeps QCT yes or partial and DDA yes; Bedford is partial QCT but metropolitan, so it needs both switches.
    assert.deepEqual((await list({boost:true})).rows.map(r=>r.geoid2010),['30003940600']);
    assert.deepEqual((await list({boost:true,includeMetro:true})).rows.map(r=>r.geoid2010),['30003940600','51019050100']);
    assert.deepEqual((await list({withAssets:true})).rows.map(r=>r.geoid2010),['12057013100','30003940600']);
    assert.deepEqual((await list({withAssets:true,boost:true})).rows.map(r=>r.geoid2010),['30003940600']);
    assert.deepEqual((await list({withAssets:true,state:'Florida'})).rows.map(r=>r.geoid2010),['12057013100']);
    const bedford=await ozEb5TractByGeoid(client,run.id,'51515050100');
    assert.equal(bedford?.assetCount,1);
    assert.equal(bedford?.assetUnits,0,'a source that reports no unit count sums to zero, not to null');
    assert.equal(bedford?.lihtcDda2026,'metro_zcta_not_evaluated');

    // Layer 4 reads: bounded, metropolitan excluded unless asked for, and every filter is a bound parameter.
    const assetsOf=(over:Partial<Parameters<typeof ozEb5AssetRows>[2]>={})=>ozEb5AssetRows(client,run.id,{geoid:null,state:null,countyFips:null,source:null,expiring:false,includeMetro:false,...over});
    const allAssets=await assetsOf();
    assert.equal(allAssets.limit,2000);
    assert.equal(allAssets.truncated,false);
    assert.deepEqual(allAssets.rows.map(a=>`${a.source}:${a.sourceObjectId}`),['usda_rural:7','hud_assisted:1'],'ordered by tract state and county, metro excluded');
    assert.deepEqual((await assetsOf({includeMetro:true})).rows.map(a=>a.sourceObjectId),['7','1','3']);
    assert.deepEqual((await assetsOf({geoid:'30003940600'})).rows.map(a=>a.propertyName),['Hardin Senior Residences']);
    assert.deepEqual((await assetsOf({state:'Florida'})).rows.map(a=>a.propertyName),['Plant City Family Apartments']);
    assert.deepEqual((await assetsOf({countyFips:'30003'})).rows.map(a=>a.sourceObjectId),['1']);
    assert.deepEqual((await assetsOf({source:'hud_lihtc'})).rows,[],'the LIHTC row is metropolitan');
    assert.deepEqual((await assetsOf({source:'hud_lihtc',includeMetro:true})).rows.map(a=>a.sourcePropertyId),['VAA20050012']);
    assert.deepEqual((await assetsOf({expiring:true})).rows.map(a=>a.sourceObjectId),['1'],'expires_by_2030 is kept, none and later are not');
    assert.deepEqual((await assetsOf({expiring:true,includeMetro:true})).rows.map(a=>a.sourceObjectId),['1']);
    assert.deepEqual((await assetsOf({state:'Wyoming'})).rows,[]);
    const senior=(await assetsOf({geoid:'30003940600'})).rows[0];
    assert.equal(senior.totalUnits,40);
    assert.equal(senior.assistedUnits,40);
    assert.equal(senior.expirationYear,2029);
    assert.equal(senior.expirationStatus,'expires_by_2030');
    assert.equal(senior.effectiveYear,2009);
    assert.equal(senior.loanMaturityYear,null);
    assert.equal(senior.latitude,45.73);
    assert.equal(senior.eb5RuralClass,'rural_clear');
    assert.equal(senior.cbsaTitle,'Hardin, MT');
    const commons=(await assetsOf({source:'hud_lihtc',includeMetro:true})).rows[0];
    assert.equal(commons.totalUnits,null,'a unit count the source did not report stays null');
    assert.equal(commons.expirationYear,2035);

    // Either Bedford identifier reaches the one row, and an unrelated identifier reaches nothing.
    for(const identifier of ['51019050100','51515050100']){
      const bedford=await ozEb5TractByGeoid(client,run.id,identifier);
      assert.equal(bedford?.geoid2010,'51019050100');
      assert.equal(bedford?.geometryAlias,'51515050100');
      assert.equal(bedford?.eb5RuralClass,'not_rural_msa');
    }
    assert.equal(await ozEb5TractByGeoid(client,run.id,'30003940600')!==null,true);
    assert.equal(await ozEb5TractByGeoid(client,run.id,'99999999999'),null);
    assert.equal(await ozEb5TractByGeoid(client,'not-a-run','51019050100'),null);

    // OMB List 1 is carried for every county in the run, including the Connecticut planning regions, so the
    // site test can answer the metropolitan leg at a point that holds no designated tract at all.
    assert.deepEqual(await ozEb5CbsaForCounty(client,run.id,'51019'),{code:'31340',title:'Lynchburg, VA',type:'metropolitan'});
    assert.deepEqual(await ozEb5CbsaForCounty(client,run.id,'09110'),{code:'25540',title:'Hartford-West Hartford-East Hartford, CT',type:'metropolitan'});
    assert.deepEqual(await ozEb5CbsaForCounty(client,run.id,'09160'),{code:'45860',title:'Torrington, CT',type:'micropolitan'});
    assert.deepEqual(await ozEb5CbsaForCounty(client,run.id,'56001'),noCbsa,'a county absent from List 1 is outside every CBSA');
    assert.deepEqual(await ozEb5CbsaForCounty(client,run.id,"30003'; DROP TABLE research_oz_eb5_tracts; --"),noCbsa);

    // Markets roll the same run up by county and keep only counties holding a qualifying tract.
    const markets=await ozEb5MarketRows(client,run.id,{state:null});
    assert.deepEqual(markets.map(m=>m.countyFips),['12057','30003','30093'],'ordered by rural_clear count then state and county');
    assert.equal(markets.find(m=>m.countyFips==='72001'),undefined,'an unknown-class tract is not a qualifying tract');
    assert.equal(markets.find(m=>m.countyFips==='51019'),undefined,'a metropolitan-only county holds nothing qualifying');
    const bigHorn=markets.find(m=>m.countyFips==='30003')!;
    assert.deepEqual({...bigHorn},{state:'Montana',countyName:'Big_Horn County',countyFips:'30003',cbsaType:'micropolitan',cbsaTitle:'Hardin, MT',designated:2,ruralClear:1,ruralInterpretationDependent:1,notRuralPlacePerIiusa:0,notRuralMsa:0,unknown:0});
    const hillsborough=markets.find(m=>m.countyFips==='12057')!;
    assert.equal(hillsborough.designated,2);
    assert.equal(hillsborough.ruralClear,1);
    assert.equal(hillsborough.notRuralPlacePerIiusa,1,'a failing tract is still counted in its county');
    assert.equal(hillsborough.cbsaTitle,'','the qualifying tract is outside every CBSA');
    // Where the qualifying tracts of one county disagree the type reads mixed and the title lists both.
    const silverBow=markets.find(m=>m.countyFips==='30093')!;
    assert.equal(silverBow.cbsaType,'mixed');
    assert.match(silverBow.cbsaTitle,/^mixed: /);
    assert.match(silverBow.cbsaTitle,/Butte-Silver Bow, MT/);
    assert.match(silverBow.cbsaTitle,/no CBSA/);
    assert.deepEqual((await ozEb5MarketRows(client,run.id,{state:'Florida'})).map(m=>m.countyFips),['12057']);
    assert.deepEqual(await ozEb5MarketRows(client,run.id,{state:'Wyoming'}),[]);

    // Geometry is one state at a time and only for the tracts that carry a polygon.
    const montana=await ozEb5GeometryRows(client,run.id,'Montana');
    assert.equal(montana.type,'FeatureCollection');
    assert.deepEqual(montana.features.map(f=>f.id),['30003940600','30003940700','30093000100','30093000200']);
    assert.deepEqual(montana.features[0].properties,{geoid:'30003940600',state:'Montana',county:'Big_Horn County',cbsaTitle:'Hardin, MT',className:'rural_clear'});
    assert.equal(montana.features[0].geometry.type,'Polygon');
    assert.equal(montana.features.every(f=>f.geometry&&f.properties.className!=='not_rural_msa'),true);
    assert.equal((await ozEb5GeometryRows(client,run.id,'Virginia')).features.length,0,'a metropolitan-only state draws nothing');
    assert.equal((await ozEb5GeometryRows(client,run.id,'Puerto Rico')).features.length,1);
  }finally{client.release();await pool.end();}
});

test('OZ / EB-5 routes refuse an unauthenticated caller before they inspect a filter',async()=>{
  // The service layer is loaded with the workspace identity boundary replaced, which is the only thing mocked:
  // the filters, the SQL and the database underneath are real.
  let session:WorkspaceUser|null=null;
  mock.module('server-only',{defaultExport:{}});
  mock.module(new URL('../../lib/research/service.ts',import.meta.url).href,{namedExports:{
    identity:async()=>{if(!session)throw new Error('AUTH_REQUIRED');return session;},
  }});
  const service=await import('../../lib/research/oz-eb5-service.ts');
  const database=await import('../../lib/workspace/db.ts');
  try{
    // Every entry point authenticates first. A caller with no session learns nothing about which values would
    // have been rejected, and the site test makes no outbound lookup at all.
    for(const call of [
      ()=>service.ozEb5Tracts(new URLSearchParams('state=Nowhere&class=invented&countyFips=nonsense')),
      ()=>service.ozEb5Tracts(new URLSearchParams()),
      ()=>service.ozEb5Markets('Nowhere'),
      ()=>service.ozEb5Geometry('Nowhere'),
      ()=>service.ozEb5Site('not a latitude','not a longitude'),
      ()=>service.ozEb5Site('45.71792','-107.57763'),
      ()=>service.ozEb5Assets(new URLSearchParams('geoid=nonsense&source=invented')),
      ()=>service.ozEb5Assets(new URLSearchParams()),
    ]) await assert.rejects(call,/AUTH_REQUIRED/);

    session={id:randomUUID(),name:'Synthetic OZ analyst',login:'synthetic-oz',avatarUrl:null};
    // With a session the same invalid inputs are refused by validation, after identity rather than before it.
    await assert.rejects(()=>service.ozEb5Tracts(new URLSearchParams('state=Nowhere')),/Unknown state/);
    await assert.rejects(()=>service.ozEb5Tracts(new URLSearchParams('class=invented')),/Unknown EB-5 rural class/);
    await assert.rejects(()=>service.ozEb5Tracts(new URLSearchParams('countyFips=123')),/exactly five digits/);
    await assert.rejects(()=>service.ozEb5Markets('Nowhere'),/Unknown state/);
    await assert.rejects(()=>service.ozEb5Site('91','0'),/between -90 and 90/);
    await assert.rejects(()=>service.ozEb5Site('45.71792',''),/Supply both a latitude and a longitude/);

    const tracts=await service.ozEb5Tracts(new URLSearchParams('state=MT&class=rural_clear'));
    assert.ok(tracts);
    assert.equal(tracts.total,1);
    assert.equal(tracts.limit,2000);
    assert.equal(tracts.truncated,false);
    assert.deepEqual(tracts.filters,{state:'Montana',className:'rural_clear',county:null,countyFips:null,includeMetro:false,boost:false,withAssets:false});
    assert.equal(tracts.rows[0].geoid2010,'30003940600');
    assert.equal(tracts.rows[0].assetCount,1,'the tract list carries its layer-4 roll-up');
    assert.equal(tracts.run.importedBy,'synthetic-operator');
    assert.equal(tracts.run.counts.tracts,8);
    assert.equal(tracts.run.counts.assets,3);
    // The assets route validates after identity and returns the bounded layer-4 list with its filters echoed.
    await assert.rejects(()=>service.ozEb5Assets(new URLSearchParams('geoid=nonsense')),/exactly eleven digits/);
    await assert.rejects(()=>service.ozEb5Assets(new URLSearchParams('source=invented')),/Unknown asset source/);
    const assetList=await service.ozEb5Assets(new URLSearchParams('state=MT&expiring=1'));
    assert.ok(assetList);
    assert.deepEqual(assetList.filters,{geoid:null,state:'Montana',countyFips:null,source:null,expiring:true,includeMetro:false});
    assert.equal(assetList.total,1);
    assert.equal(assetList.rows[0].propertyName,'Hardin Senior Residences');
    assert.equal(assetList.limit,2000);
    assert.equal(assetList.truncated,false);

    const markets=await service.ozEb5Markets('Montana');
    assert.ok(markets);
    assert.equal(markets.state,'Montana');
    assert.deepEqual(markets.rows.map(m=>m.countyFips),['30003','30093']);
    assert.equal((await service.ozEb5Markets(null))!.rows.length,3,'no state means every qualifying county');

    const geometry=await service.ozEb5Geometry('Montana');
    assert.ok(geometry);
    assert.equal(geometry.state,'Montana');
    assert.equal(geometry.features.length,4);
    assert.equal(await service.ozEb5Geometry(null),null,'the map asks for one state at a time');
  }finally{await database.getPool().end();mock.reset();}
});
