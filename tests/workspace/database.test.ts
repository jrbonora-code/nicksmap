import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { randomUUID } from "node:crypto";
import type { WorkspaceUser } from "../../lib/workspace/types.ts";
import { createDatabasePool } from "../../db/connection.mjs";
import { fingerprint } from "../../scripts/db-recovery-support.mjs";

const connection = process.env.WORKSPACE_INTEGRATION_URL;

test("PostgreSQL workspace identity, ownership, transactions, snapshots and stale-write integration", {skip:!connection}, async t => {
  const target = new URL(connection!);
  assert.ok(["127.0.0.1","localhost","[::1]"].includes(target.hostname),"Integration tests require a loopback database.");
  assert.ok(target.pathname.startsWith("/radar_test_"),"Use a dedicated radar_test_* database; no production target.");
  process.env.DATABASE_URL = connection;
  process.env.DATABASE_SSL_MODE = "disable";
  const actor: WorkspaceUser = {id:randomUUID(),name:"Synthetic integration user",login:"synthetic-test",avatarUrl:null};
  let currentActor: WorkspaceUser | null = null;
  mock.module("server-only",{defaultExport:{}});
  mock.module(new URL("../../lib/auth/session.ts",import.meta.url).href,{namedExports:{
    requireWorkspaceSession:async()=>{if(!currentActor) throw new Error("AUTH_REQUIRED"); return currentActor;},
  }});
  const service = await import("../../lib/workspace/service.ts");
  const database = await import("../../lib/workspace/db.ts");
  const pool = createDatabasePool({DATABASE_URL:connection});
  const makeForm = (fields:Record<string,string>) => {
    const form = new FormData(); form.set("requestId",randomUUID());
    for(const [key,value] of Object.entries(fields)) form.set(key,value);
    return form;
  };
  const idOf = (result:{ok:boolean;id?:string}) => {assert.equal(result.ok,true); assert.ok(result.id); return result.id;};
  try {
    await t.test("every private service authenticates, including direct mutations and preview",async()=>{
      const actions = [()=>service.getWorkspaceOverview(),()=>service.listDeals(),()=>service.listCountyCoverage(),()=>service.getDeal(randomUUID()),()=>service.listEvidence(randomUUID()),()=>service.listSnapshots(randomUUID()),()=>service.getWorkspaceSettings(),
        ...[service.createDeal,service.updateDeal,service.addEvidence,service.saveScreening,service.saveMandate,service.previewScreening,service.saveResearchDecision].map(action=>()=>action(new FormData()))];
      for(const action of actions) await assert.rejects(action,/AUTH_REQUIRED/);
    });
    currentActor=actor;
    const formA = makeForm({name:"Synthetic integration A",countyFips:"12071",strategy:"acquisition",stage:"research"});
    const first = await service.createDeal(formA);
    const dealId=idOf(first);
    const otherId=idOf(await service.createDeal(makeForm({name:"Synthetic integration B",countyFips:"12086",strategy:"land",stage:"research"})));
    await t.test("successful submissions are idempotent, including concurrent retries",async()=>{
      assert.deepEqual(await service.createDeal(formA),first);
      const concurrent = makeForm({name:"Synthetic concurrent",countyFips:"12001",strategy:"recapitalization",stage:"research"});
      const both=await Promise.all([service.createDeal(concurrent),service.createDeal(concurrent)]);
      assert.deepEqual(both[0],both[1]);
      const count=await pool.query("SELECT count(*)::int AS n FROM workspace_deals WHERE name='Synthetic concurrent'");
      assert.equal(count.rows[0].n,1);
      formA.set("name","Changed repeated request");
      await assert.rejects(()=>service.createDeal(formA),/already saved with different content/);
    });
    await t.test("missing values, statewide coverage and unavailable recovery are truthful",async()=>{
      const deal=await service.getDeal(dealId);
      assert.equal(deal?.unitCount,null); assert.equal(deal?.askingPriceCents,null);
      assert.equal((await service.listCountyCoverage()).length,67);
      assert.equal((await service.listCountyCoverage()).find(c=>c.fips==="12071")?.status,"manual");
      const settings=await service.getWorkspaceSettings();
      assert.equal(settings.mandate.status,"unconfigured"); assert.equal(settings.recovery.status,"not_verified"); assert.equal(settings.storageConfigured,false);
      const direct=makeForm({name:"Forbidden direct diligence",countyFips:"12071",strategy:"acquisition",stage:"diligence"});
      await assert.rejects(()=>service.createDeal(direct),/reasoned screening decision/);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM workspace_requests WHERE request_id=$1",[direct.get("requestId")])).rows[0].n,0);
    });
    await t.test("stale edits cannot overwrite another user's changes and version tokens advance",async()=>{
      const original=(await service.getDeal(dealId))!;
      const update=makeForm({id:dealId,expectedUpdatedAt:original.updatedAt,name:original.name,countyFips:original.countyFips,strategy:original.strategy,stage:original.stage,askingPrice:"1234567.89",notes:"Fresh information"});
      await service.updateDeal(update);
      const changed=(await service.getDeal(dealId))!;
      assert.equal(changed.askingPriceCents,123456789); assert.notEqual(changed.updatedAt,original.updatedAt);
      update.set("requestId",randomUUID()); update.set("askingPrice","1"); update.set("nextAction","Stale second tab");
      await assert.rejects(()=>service.updateDeal(update),/changed after you opened it/);
      assert.equal((await service.getDeal(dealId))?.askingPriceCents,123456789);
    });
    const evidenceForm=(id:string)=>makeForm({dealId:id,title:"Synthetic annual facts",sourceType:"estimate",sourceUrl:"https://example.com/synthetic",effectiveDate:"2026-01-01",retrievedAt:"2026-01-02",notes:"Synthetic operating statement and assumptions for local tests.",reviewStatus:"reviewed"});
    const sourceId=idOf(await service.addEvidence(evidenceForm(dealId)));
    const foreignSourceId=idOf(await service.addEvidence(evidenceForm(otherId)));
    await t.test("a reasoned early pass preserves unknown finances and can move to passed",async()=>{
      const decision=makeForm({dealId:otherId,label:"Qualitative site constraint",decision:"pass",reason:"Synthetic fatal site constraint; pricing and operations unknown."});
      decision.set("evidenceIds",foreignSourceId);
      const result=await service.saveResearchDecision(decision);
      assert.equal(result.ok,true);
      const snapshot=(await service.listSnapshots(otherId))[0];
      assert.deepEqual(snapshot.inputs,{});
      assert.equal(snapshot.result.availability,"not_calculated");
      assert.equal(snapshot.modelVersion,"research-decision-1.0.0");
      const original=(await service.getDeal(otherId))!;
      await service.updateDeal(makeForm({id:otherId,expectedUpdatedAt:original.updatedAt,name:original.name,countyFips:original.countyFips,strategy:original.strategy,stage:"passed"}));
      assert.equal((await service.getDeal(otherId))?.stage,"passed");
      decision.set("decision","advance"); decision.set("requestId",randomUUID());
      await assert.rejects(()=>service.saveResearchDecision(decision));
    });
    const screening=makeForm({dealId,label:"Synthetic annual screening",unitCount:"10",grossPotentialRent:"120000",vacancyLoss:"6000",concessions:"2000",creditLoss:"1000",otherIncome:"3000",operatingExpenses:"40000",replacementReserves:"3000",annualDebtService:"50000",loanBalance:"600000",purchasePrice:"1000000",totalCost:"1100000",decision:"advance",reason:"Synthetic human judgment for next research step",result:'{"noiCents":999999999}'});
    screening.set("evidenceIds",foreignSourceId);
    let snapshotId="";
    await t.test("foreign evidence fails atomically; same request ID can be corrected and server recomputes",async()=>{
      await assert.rejects(()=>service.saveScreening(screening),/belong to this deal/);
      assert.equal((await service.listSnapshots(dealId)).length,0);
      screening.set("evidenceIds",sourceId);
      snapshotId=idOf(await service.saveScreening(screening));
      const snapshot=(await service.listSnapshots(dealId))[0];
      assert.equal((snapshot.result.value as {noiCents:number}).noiCents,7400000);
      assert.equal(snapshot.evidenceSnapshots![0].id,sourceId);
      assert.equal(snapshot.evidenceSnapshots![0].notes,"Synthetic operating statement and assumptions for local tests.");
      assert.equal(snapshot.mandateSnapshot!.status,"unconfigured");
      assert.equal((await service.previewScreening(screening)).value!.noiCents,7400000);
    });
    await t.test("database blocks edits/deletes to immutable decisions, evidence and actor audit",async()=>{
      await assert.rejects(()=>pool.query("UPDATE workspace_screening_snapshots SET reason='tampered' WHERE id=$1",[snapshotId]),/append-only/);
      await assert.rejects(()=>pool.query("DELETE FROM workspace_screening_snapshots WHERE id=$1",[snapshotId]),/append-only/);
      await assert.rejects(()=>pool.query("UPDATE workspace_evidence SET notes='tampered' WHERE id=$1",[sourceId]),/append-only/);
      await assert.rejects(()=>pool.query("DELETE FROM workspace_audit WHERE actor_id=$1",[actor.id]),/append-only/);
      const audits=(await pool.query("SELECT actor_id,actor_login FROM workspace_audit WHERE entity_id=$1",[snapshotId])).rows;
      assert.deepEqual(audits,[{actor_id:actor.id,actor_login:actor.login}]);
      await assert.rejects(()=>pool.query("UPDATE workspace_deals SET county_fips='12025' WHERE id=$1",[dealId]),/foreign key/);
      await assert.rejects(()=>pool.query("UPDATE workspace_deals SET workspace_id='other' WHERE id=$1",[dealId]),/check constraint/);
    });
    await t.test("concurrent first mandate saves preserve exactly one draft and reject the stale initial version",async()=>{
      assert.equal((await service.getWorkspaceSettings()).mandate.updatedAt,null);
      const attempts=[makeForm({notes:"Initial mandate from first tab",expectedUpdatedAt:""}),makeForm({notes:"Initial mandate from second tab",expectedUpdatedAt:""})];
      const results=await Promise.allSettled(attempts.map(form=>service.saveMandate(form)));
      assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
      assert.equal(results.filter(result=>result.status==="rejected").length,1);
      const winner=results.findIndex(result=>result.status==="fulfilled");
      const saved=(await service.getWorkspaceSettings()).mandate;
      assert.equal(saved.status,"draft");
      assert.equal(saved.notes,attempts[winner].get("notes"));
      assert.ok(saved.updatedAt);
      const repeated=await service.saveMandate(attempts[winner]);
      assert.equal(repeated.ok,true,"A successful identical retry still replays despite its now-old initial version.");
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM workspace_audit WHERE event='mandate.drafted'")).rows[0].n,1);
      await assert.rejects(()=>service.saveMandate(makeForm({notes:"Another stale initial draft",expectedUpdatedAt:""})),/mandate changed after you opened it/);
      assert.equal((await service.getWorkspaceSettings()).mandate.notes,saved.notes);
    });
    await t.test("concurrent mandate edits reject stale content, preserve audit, and permit retry after reviewing the latest version",async()=>{
      const before=(await service.getWorkspaceSettings()).mandate;
      const attempts=[makeForm({notes:"New mandate from first tab",expectedUpdatedAt:before.updatedAt!}),makeForm({notes:"New mandate from second tab",expectedUpdatedAt:before.updatedAt!})];
      const results=await Promise.allSettled(attempts.map(form=>service.saveMandate(form)));
      assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
      assert.equal(results.filter(result=>result.status==="rejected").length,1);
      const winner=results.findIndex(result=>result.status==="fulfilled");
      const loser=1-winner;
      const rejected=results[loser];
      assert.equal(rejected.status,"rejected");
      if(rejected.status==="rejected") assert.equal(rejected.reason.fields.expectedUpdatedAt,"Reload and review the latest mandate before saving.");
      const saved=(await service.getWorkspaceSettings()).mandate;
      assert.equal(saved.notes,attempts[winner].get("notes"));
      assert.ok(Date.parse(saved.updatedAt!)>Date.parse(before.updatedAt!),"Every saved revision needs a distinguishable version.");
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM workspace_audit WHERE event='mandate.drafted'")).rows[0].n,2);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM workspace_requests WHERE request_id=$1",[attempts[loser].get("requestId")])).rows[0].n,0,"A conflict must roll back its idempotency reservation.");
      attempts[loser].set("expectedUpdatedAt",saved.updatedAt!);
      attempts[loser].set("notes","Reconciled mandate after reviewing the saved draft");
      assert.equal((await service.saveMandate(attempts[loser])).ok,true);
      const reconciled=(await service.getWorkspaceSettings()).mandate;
      assert.equal(reconciled.notes,"Reconciled mandate after reviewing the saved draft");
      assert.ok(Date.parse(reconciled.updatedAt!)>Date.parse(saved.updatedAt!));
    });
    await t.test("later deal/policy updates preserve the frozen decision context",async()=>{
      const original=(await service.getDeal(dealId))!;
      await service.updateDeal(makeForm({id:dealId,expectedUpdatedAt:original.updatedAt,name:"Later synthetic name",countyFips:original.countyFips,strategy:original.strategy,stage:"diligence",notes:"Later facts"}));
      await service.saveMandate(makeForm({notes:"Later draft mandate",status:"reviewed",expectedUpdatedAt:(await service.getWorkspaceSettings()).mandate.updatedAt??""}));
      const snapshot=(await service.listSnapshots(dealId))[0];
      assert.equal(snapshot.dealSnapshot!.name,"Synthetic integration A");
      assert.equal(snapshot.mandateSnapshot!.status,"unconfigured");
      assert.equal((await service.getWorkspaceSettings()).mandate.status,"draft");
    });
    await t.test("an older advance cannot bypass a later reasoned pass",async()=>{
      const decline=makeForm({dealId,label:"Later constraint",decision:"pass",reason:"New synthetic site evidence changes the human decision."});
      decline.set("evidenceIds",sourceId);
      await service.saveResearchDecision(decline);
      const current=(await service.getDeal(dealId))!;
      const closed=makeForm({id:dealId,expectedUpdatedAt:current.updatedAt,name:current.name,countyFips:current.countyFips,strategy:current.strategy,stage:"closed"});
      await assert.rejects(()=>service.updateDeal(closed),/reasoned screening decision/);
      closed.set("stage","passed");
      await service.updateDeal(closed);
      assert.equal((await service.getDeal(dealId))?.stage,"passed");
    });
    await t.test("recovery fingerprints match under different session time zones despite different raw timestamp JSON",async()=>{
      const western=new URL(connection!);
      const eastern=new URL(connection!);
      western.searchParams.set("options","-c timezone=Pacific/Honolulu");
      eastern.searchParams.set("options","-c timezone=Asia/Tokyo");
      const westPool=createDatabasePool({DATABASE_URL:western.toString()});
      const eastPool=createDatabasePool({DATABASE_URL:eastern.toString()});
      try {
        const query="SELECT current_setting('TimeZone') AS timezone, to_jsonb(t) AS value FROM workspace_screening_snapshots t ORDER BY id LIMIT 1";
        const west=(await westPool.query(query)).rows[0];
        const east=(await eastPool.query(query)).rows[0];
        assert.equal(west.timezone,"Pacific/Honolulu");
        assert.equal(east.timezone,"Asia/Tokyo");
        assert.notEqual(west.value.created_at,east.value.created_at,"Control: PostgreSQL JSON renders timestamptz in its session time zone.");
        assert.equal(new Date(west.value.created_at).getTime(),new Date(east.value.created_at).getTime(),"Both representations describe the same saved instant.");
        assert.deepEqual(await fingerprint(western.toString()),await fingerprint(eastern.toString()),"Logical recovery hashes must not depend on connection time zone.");
      } finally {await westPool.end();await eastPool.end();}
    });
    currentActor=null;
    await t.test("revoking the session denies previously accessible records",async()=>{
      await assert.rejects(()=>service.getDeal(dealId),/AUTH_REQUIRED/);
      await assert.rejects(()=>service.listSnapshots(dealId),/AUTH_REQUIRED/);
      await assert.rejects(()=>service.saveScreening(screening),/AUTH_REQUIRED/);
    });
  } finally {
    await pool.end();
    await database.getPool().end();
    mock.restoreAll();
  }
});
