import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
import {filterSchema,listingKey,type Listing} from '../lib/domain';
import {newAlertMatches,alertSearchKey} from '../lib/alert-matches';
import {approvedAlertKeys} from '../lib/alert-access';
assert.deepEqual(approvedAlertKeys({}, {marketcheck:'mc',autodev:'ad'}),{marketcheck:undefined,autodev:undefined});
assert.deepEqual(approvedAlertKeys({AUTODEV_ALERTS_APPROVED:'true'}, {marketcheck:'mc',autodev:'ad'}),{marketcheck:undefined,autodev:'ad'});

const car:Listing={id:'one',vin:'12345678901234567',title:'Fixture green BMW M4',make:'BMW',model:'M4',trim:'Competition',exteriorColor:'Green',year:2021,price:45000,miles:30000,state:'CO',city:'Test',source:'test',url:'https://example.test/one',photo:null,seller:'dealer',drive:'RWD',titleStatus:'clean',condition:'used',history:'unknown',fees:0,checkedAt:new Date().toISOString(),sourceUpdatedAt:null,concerns:[],comparables:[],median:null,reason:'',total:45000};
const filters=filterSchema.parse({make:'BMW',model:'M4',trim:'Competition',exteriorColor:'green',maxPrice:50000,maxMiles:40000,state:'CO'});
assert.equal(newAlertMatches([car,{...car,id:'duplicate',url:'https://example.test/two'},{...car,id:'red',vin:null,exteriorColor:'red'}],filters,new Set()).length,1);
assert.equal(newAlertMatches([car],filters,new Set([listingKey(car)])).length,0);
assert.equal(newAlertMatches([{...car,priceWarning:'Discount only'},{...car,miles:null},{...car,fees:6000}],filters,new Set()).length,0);
assert.equal(alertSearchKey(filters),alertSearchKey({...filters,limit:50}));

// Exercise the real job and D1 SQL with SQLite; replace only runtime bindings and inventory I/O.
const sqlite=new DatabaseSync(':memory:');
for(const name of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(await readFile(join('drizzle',name),'utf8'));
class Statement{
 values:any[]=[];
 constructor(public sql:string){}
 bind(...values:any[]){this.values=values;return this}
 async first(){return sqlite.prepare(this.sql).get(...this.values)??null}
 async all(){return {results:sqlite.prepare(this.sql).all(...this.values)}}
 async run(){const r=sqlite.prepare(this.sql).run(...this.values);return {meta:{changes:Number(r.changes)}}}
}
const database={prepare:(sql:string)=>new Statement(sql),batch:async(statements:Statement[])=>{
 sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out}catch(e){sqlite.exec('ROLLBACK');throw e}
}};
let calls=0,inventory=[car],failure=false;
const fixture={env:{DB:database,AUTODEV_ALERTS_APPROVED:'true'},search:async()=>{calls++;if(failure)return {listings:[],sources:[{status:'error'}]};return {listings:inventory,sources:[{status:'searched',inspected:inventory.length}],checkedAt:new Date().toISOString()}}};
(globalThis as any).__alertFixture=fixture;
const dir=await mkdtemp(join(tmpdir(),'motorscout-alert-test-'));
try{
 const file=join(dir,'alerts.mjs');
 await build({entryPoints:['lib/alerts.ts'],outfile:file,bundle:true,platform:'node',format:'esm',plugins:[{name:'test-boundaries',setup(b:any){
  b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'runtime',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env=globalThis.__alertFixture.env;'}));
  b.onLoad({filter:/lib\/sources\.ts$/},()=>({contents:'export const searchListings=(...args)=>globalThis.__alertFixture.search(...args);'}));
  b.onLoad({filter:/lib\/connections\.ts$/},()=>({contents:'export const inventoryKeys=async()=>({autodev:"test-only"});'}));
 }}]});
 const api=await import(pathToFileURL(file).href);
 const id=await api.saveAlert('alice',filters,[],true,null,false);
 await assert.rejects(()=>api.saveAlert('alice',filters,[],true,null,false),/already saved/);
 assert.equal((await api.checkAlert(id,'bob')).checked,false,'other account cannot run/read a search');
 assert.equal(calls,0);
 const results=await Promise.all([api.checkAlert(id),api.checkAlert(id)]);
 assert.equal(results.filter(r=>r.checked).length,1,'concurrent schedules claim once');
 assert.equal(calls,1);
 let snapshot=await api.alertSnapshot('alice');
 assert.equal(snapshot.notifications.length,1);
 assert.equal((await api.alertSnapshot('bob')).notifications.length,0,'inbox is account scoped');
 assert.equal((await api.checkAlert(id)).checked,false,'same-day runs do not spend inventory calls');
 sqlite.prepare('UPDATE alerts SET next_run=0 WHERE id=?').run(id);
 await api.checkAlert(id);
 assert.equal((await api.alertSnapshot('alice')).notifications.length,1,'same VIN never notifies again');
 inventory=[{...car,id:'next',vin:'22345678901234567'}];
 sqlite.prepare('UPDATE alerts SET next_run=0,enabled=0 WHERE id=?').run(id);
 assert.equal((await api.checkAlert(id)).checked,false,'pause stops scheduled jobs');
 sqlite.prepare('UPDATE alerts SET enabled=1 WHERE id=?').run(id);failure=true;
 assert.equal((await api.checkAlert(id)).checked,false);
 assert.equal((await api.alertSnapshot('alice')).notifications.length,1,'failed source is not a successful zero-result check');
 failure=false;sqlite.prepare('UPDATE alerts SET next_run=0 WHERE id=?').run(id);
 await api.checkAlert(id);
 assert.equal((await api.alertSnapshot('alice')).notifications.length,2,'recovered source creates a new notice');
 const baselineId=await api.saveAlert('carol',filters,[car],true,null,false);inventory=[car];
 await api.checkAlert(baselineId);
 assert.equal((await api.alertSnapshot('carol')).notifications.length,0,'cars already shown when subscribing are baseline');
 assert.equal((await api.deliverAlertEmails()).sent,0,'no email without configured sender');
 const pauseId=await api.saveAlert('pause-during-fetch',filters,[],true,null,false);
 fixture.search=async()=>{sqlite.prepare('UPDATE alerts SET enabled=0 WHERE id=?').run(pauseId);return {listings:[car],sources:[{status:'searched',inspected:1}],checkedAt:new Date().toISOString()}};
 assert.equal((await api.checkAlert(pauseId)).checked,false,'pause while inventory loads cancels the commit');
 assert.equal((await api.alertSnapshot('pause-during-fetch')).notifications.length,0);
 fixture.env.AUTODEV_ALERTS_APPROVED='false';
 const blockedId=await api.saveAlert('unapproved-feed',filters,[],true,null,false);
 const callsBefore=calls;
 assert.match((await api.checkAlert(blockedId)).error,/approved inventory feed/);
 assert.equal(calls,callsBefore,'unapproved feeds never receive an alert request');
 assert.equal((await api.alertSnapshot('unapproved-feed')).schedulerReady,false);
 console.log('PASS: exact-match alerts, baseline, deduplication, concurrency, daily gating, account isolation, pause and provider recovery');
}finally{sqlite.close();delete (globalThis as any).__alertFixture;await rm(dir,{recursive:true,force:true})}
