import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {startBudgetedMarketplaceRun} from '../lib/marketplace-budget';
import {MARKETPLACE_RUN_CAP} from '../lib/apify';

const sqlite=new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE workspaces(user_id TEXT PRIMARY KEY,payload TEXT,updated_at INTEGER)');
const db={prepare(sql:string){let args:any[]=[];return {
 bind(...values:any[]){args=values;return this},
 async first(){return sqlite.prepare(sql).get(...args)},
 async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}}
 }}};
let starts=0,used=1.22,paid=false,active=0,runCost=0.001,failStart=false;
const cycle={startAt:new Date(Date.now()-86400000).toISOString(),endAt:new Date(Date.now()+86400000).toISOString()};
const request:typeof fetch=async(url,init)=>{
 const path=String(url).replace('https://api.apify.com/v2/','');
 assert.equal(init?.redirect,'manual');
 if(path==='users/me')return Response.json({data:{id:'fixture',isPaying:paid,plan:{monthlyBasePriceUsd:paid?29:0}}});
 if(path==='users/me/limits')return Response.json({data:{monthlyUsageCycle:cycle,limits:{maxMonthlyUsageUsd:5},current:{monthlyUsageUsd:used,activeActorJobCount:active}}});
 if(path.startsWith('actor-runs/'))return Response.json({data:{status:active?'RUNNING':'SUCCEEDED',usageTotalUsd:runCost}});
 starts++;if(failStart)throw new TypeError('network failure');
 return Response.json({data:{id:'run'+starts,status:'RUNNING'}});
};
try{
 for(let n=0;n<45;n++)await startBudgetedMarketplaceRun(db,'fixture-key','actor',{},0.1,request);
 assert.equal(starts,45,'cheap runs can exceed the old 40 maximum-cost reservations');
 const ledger=JSON.parse((sqlite.prepare('SELECT payload FROM workspaces').get() as any).payload);
 assert(Math.abs(ledger.charged-0.044)<1e-9,'completed cost is charged once');
 assert.equal(ledger.pending.length,1);
 used=3.95;
 await assert.rejects(()=>startBudgetedMarketplaceRun(db,'fixture-key','actor',{},0.1,request),/shared marketplace allowance/);
 assert.equal(starts,45,'actual account usage blocks unaffordable starts');
 used=1.22;paid=true;
 await assert.rejects(()=>startBudgetedMarketplaceRun(db,'fixture-key','actor',{},0.1,request),/Free account/);
 paid=false;
 const simultaneous=await Promise.allSettled([startBudgetedMarketplaceRun(db,'fixture-key','actor',{},1,request),startBudgetedMarketplaceRun(db,'fixture-key','actor',{},1,request)]);
 assert.equal(simultaneous.filter(r=>r.status==='fulfilled').length,1,'account lock prevents concurrent budget overspend');
 failStart=true;
 await assert.rejects(()=>startBudgetedMarketplaceRun(db,'fixture-key','actor',{},1,request),/could not reach/);
 const uncertain=JSON.parse((sqlite.prepare('SELECT payload FROM workspaces').get() as any).payload);
 assert(uncertain.pending.some((p:any)=>!p.runId&&p.cap===1.02),'unknown network outcome retains its reservation');
 assert.equal(uncertain.leaseUntil,0,'errors release the account lock');
 cycle.startAt=new Date(Date.now()-1000).toISOString();active=1;failStart=false;
 await assert.rejects(()=>startBudgetedMarketplaceRun(db,'fixture-key','actor',{},0.1,request),/running marketplace/);
 active=0;used=0;
 await startBudgetedMarketplaceRun(db,'fixture-key','actor',{},0.1,request);
 assert.equal(JSON.parse((sqlite.prepare('SELECT payload FROM workspaces').get() as any).payload).base,0,'new provider billing cycle resets settled accounting');
 sqlite.prepare('DELETE FROM workspaces').run();used=3.522;
 sqlite.prepare('INSERT INTO workspaces VALUES(?,?,?)').run('apify-budget:fixture',JSON.stringify({cycle:cycle.startAt,base:1.2211488155545915,charged:2.068999999999997,pending:[{token:'unresolved-1',cap:0.12},{token:'unresolved-2',cap:0.12},{token:'unresolved-3',cap:0.12}],leaseUntil:0,lease:''}),Date.now());
 const before=starts;
 await startBudgetedMarketplaceRun(db,'fixture-key','actor',{},MARKETPLACE_RUN_CAP,request);
 assert.equal(starts,before+1,'smaller run fits the reported $0.118 balance');
 const reduced=JSON.parse((sqlite.prepare('SELECT payload FROM workspaces').get() as any).payload);
 assert.equal(reduced.pending.filter((p:any)=>!p.runId).length,3,'old uncertain reservations stay intact');
 assert.equal(reduced.pending.at(-1).cap,0.06,'four-cent scraper cap plus two-cent overhead');
 console.log('PASS: real usage, reservation reconciliation, free-only gate, concurrency, ambiguous failure and billing-cycle reset');
}finally{sqlite.close()}
