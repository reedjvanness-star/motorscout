import assert from 'node:assert/strict';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {blankWorkspace,type Workspace} from '../lib/domain';
import {normalizeMarketcheck} from '../lib/marketcheck';
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const sql=new DatabaseSync(':memory:');
sql.exec('CREATE TABLE workspaces(user_id TEXT PRIMARY KEY,payload TEXT,updated_at INTEGER)');
class Statement{
 values:SQLInputValue[]=[];constructor(public query:string){}
 bind(...values:SQLInputValue[]){this.values=values;return this}
 async first(){return sql.prepare(this.query).get(...this.values)??null}
 async run(){const r=sql.prepare(this.query).run(...this.values);return {meta:{changes:Number(r.changes)}}}
}
const car=normalizeMarketcheck({id:'recovered-car',price:45000,vdp_url:'https://example.test/car',build:{make:'BMW',model:'M4',year:2023},miles:12000},false)!;
let failSecondStatement=false;
let beforeStart:(()=>Promise<void>)|undefined;
let beforeBatch:(()=>Promise<void>)|undefined,beforeDataset:(()=>Promise<void>)|undefined;
const database={prepare:(query:string)=>new Statement(query),async batch(statements:Statement[]){
 const hook=beforeBatch;beforeBatch=undefined;if(hook)await hook();
 sql.exec('BEGIN');try{const results=statements.map((statement,index)=>{if(failSecondStatement&&index===1){failSecondStatement=false;throw Error('Injected second-statement failure')}const r=sql.prepare(statement.query).run(...statement.values);return {meta:{changes:Number(r.changes)}}});sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}
}};
const fixture={status:'SUCCEEDED',starts:0,reads:0,env:{DB:database},car,async start(){fixture.starts++;const hook=beforeStart;beforeStart=undefined;if(hook)await hook();return {id:'new-run',status:'RUNNING'}},async dataset(){const hook=beforeDataset;beforeDataset=undefined;if(hook)await hook();return [car]}};
const fixtureGlobal=globalThis as typeof globalThis & {__recoveryFixture?:typeof fixture};
fixtureGlobal.__recoveryFixture=fixture;
const modules:Record<string,string>={
 connections:`export const providerKey=async()=> 'fixture-key',connectionStatus=async()=>({apifyShared:true});`,
 'shared-marketplace':`export const reserveBetaSearch=async()=>{};`,
 'marketplace-budget':`export const startBudgetedMarketplaceRun=()=>globalThis.__recoveryFixture.start();`,
 'zip-location':`export const locateListings=async rows=>rows;`,
 apify:`const f=globalThis.__recoveryFixture;export const ACTOR='fixture-actor',FACEBOOK_ACTOR='fixture-facebook',MARKETPLACE_RUN_CAP=.04;export const marketplaceInput=()=>({query:'same-input'}),facebookInput=marketplaceInput,retailerMarketplaceInput=marketplaceInput;export const normalizeMarketplace=row=>row,normalizeFacebook=normalizeMarketplace;export const marketplaceSources=()=>[],retailerMarketplaceSources=marketplaceSources;export const apifyRequest=async(key,path)=>{f.reads++;if(path.startsWith('actor-runs/'))return {data:{actId:ACTOR,status:f.status,defaultDatasetId:'fixture-dataset'}};if(path.startsWith('datasets/'))return f.dataset();throw Error('Unexpected provider request');};`,
};
const dir=await mkdtemp(join(tmpdir(),'motorscout-recovery-'));
try{
 const file=join(dir,'route.mjs');
 await build({stdin:{contents:'export * from "./app/api/marketplaces/route";export * from "./lib/server";',resolveDir:process.cwd()},outfile:file,bundle:true,platform:'node',format:'esm',plugins:[{name:'recovery-fixtures',setup(b:{onResolve(options:{filter:RegExp},callback:(args:{path:string})=>{path:string;namespace:string}|undefined):void;onLoad(options:{filter:RegExp;namespace?:string},callback:(args:{path:string})=>{contents:string}):void}){
 b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'runtime',namespace:'fixture'}));
 b.onResolve({filter:/^@\/lib\//},({path})=>{const name=path.slice('@/lib/'.length);return modules[name]?{path:name,namespace:'fixture'}:undefined});
 b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='runtime'?'export const env=globalThis.__recoveryFixture.env;':modules[path]}));
 }}]});
 const api: {POST:(req:Request)=>Promise<Response>;readWorkspace:(id:string)=>Promise<Workspace>;writeWorkspace:(id:string,w:Workspace)=>Promise<void>;readWorkspaceSnapshot:(id:string)=>Promise<{workspace:Workspace;payload:string}>}=await import(pathToFileURL(file).href);
 async function call(action:string,expectedStatus=200){const response=await api.POST(new Request('https://motorscout.test/api/marketplaces',{method:'POST',headers:{'Content-Type':'application/json','oai-authenticated-user-id':'visitor'},body:JSON.stringify({action,provider:'automotive',searchId:'current-search',advance:true})}));assert.equal(response.status,expectedStatus);return response.json() as Promise<{done:boolean;state:string}>}
 async function seed(state:string,runId:string|null='existing-run',searchId='current-search'){
  const workspace=blankWorkspace();workspace.searchId='current-search';await api.writeWorkspace('visitor',workspace);fixture.status=state;fixture.starts=0;fixture.reads=0;
  sql.prepare('INSERT OR REPLACE INTO workspaces VALUES(?,?,?)').run('visitor:marketplace-job',JSON.stringify({searchId,runId,state,startedAt:Date.now(),successful:true,inputKey:JSON.stringify({actor:'fixture-actor',input:{query:'same-input'}})}),Date.now());
 }
 // A browser interruption between start and first poll must not strand a terminal run.
 for(const state of ['SUCCEEDED','FAILED','TIMED-OUT','ABORTED']){
  await seed(state);assert.equal((await call('start')).done,false,`${state} still needs its dataset imported`);
  assert.equal(fixture.starts,0,'recovery must not consume another provider run');
  assert.equal((await call('poll')).done,true);assert.equal((await api.readWorkspace('visitor')).listings.length,1,'recover usable results, including partial failed runs');
  assert.equal((await api.readWorkspace('visitor')).messages.length,1);
  assert.equal((await call('start')).done,true);assert.equal((await call('poll')).done,true);
  assert.equal((await api.readWorkspace('visitor')).messages.length,1,'completed recovery must be idempotent');assert.equal(fixture.reads,2);
 }
 // Reproduce the actual reuse path, then simulate refreshing before its first poll.
 await seed('IMPORTED','existing-run','previous-search');fixture.status='SUCCEEDED';
 assert.equal((await call('start')).done,false);assert.equal(fixture.starts,0);
 assert.equal((await call('start')).done,false,'restarting a reused run must still request import');
 await call('poll');assert.equal((await api.readWorkspace('visitor')).listings.length,1);assert.equal(fixture.starts,0);
 await seed('FAILED',null);assert.equal((await call('start')).done,false);assert.equal(fixture.starts,1,'failed starts without a run remain retryable');
 // Hold a stale poll after its provider status is captured; a newer poll wins.
 function barrier(){let release!:()=>void,entered!:()=>void;const waiting=new Promise<void>(resolve=>{release=resolve}),ready=new Promise<void>(resolve=>{entered=resolve});return {release,ready,hold:async()=>{entered();await waiting}}}
 for(const staleStatus of ['SUCCEEDED','RUNNING']){
  await seed('RUNNING');fixture.status=staleStatus;
  const gate=barrier();beforeDataset=gate.hold;const stale=call('poll');await gate.ready;
  fixture.status='SUCCEEDED';await call('poll');gate.release();await stale;
  assert.equal((await api.readWorkspace('visitor')).messages.length,1,'overlapping polls complete once');
  const job=JSON.parse((sql.prepare('SELECT payload FROM workspaces WHERE user_id=?').get('visitor:marketplace-job') as {payload:string}).payload);
  assert.equal(job.state,'IMPORTED','stale running poll cannot regress completed job');assert.equal(fixture.reads,4,'conflicts never refetch provider');
 }
 // Both polls can read the same snapshots; only one atomic batch may claim them.
 await seed('RUNNING');fixture.status='SUCCEEDED';const gate=barrier();beforeBatch=gate.hold;
 const delayed=call('poll');await gate.ready;await call('poll');gate.release();await delayed;
 assert.equal((await api.readWorkspace('visitor')).messages.length,1);
 // A save/chat committed during encoding must survive importer retry, including gzip rows.
 await seed('RUNNING');fixture.status='SUCCEEDED';
 const large=await api.readWorkspace('visitor');large.messages=[{role:'user',text:'x'.repeat(120000),at:1}];await api.writeWorkspace('visitor',large);
 assert((await api.readWorkspaceSnapshot('visitor')).payload.startsWith('gzip:'));
 beforeBatch=async()=>{const current=await api.readWorkspace('visitor');current.saved=[car];current.compare=[car.id];current.comparisonCars=[car];current.messages.push({role:'user',text:'Keep this car',at:2});await api.writeWorkspace('visitor',current)};
 await call('poll');const kept=await api.readWorkspace('visitor');assert.equal(kept.saved[0].id,car.id);assert.deepEqual(kept.compare,[car.id]);assert(kept.messages.some(message=>message.text==='Keep this car'));assert.equal(kept.listings.length,1);assert.equal(fixture.reads,2);
 // A new search committed before import wins; neither old results nor job completion persist.
 await seed('RUNNING');fixture.status='SUCCEEDED';
 beforeBatch=async()=>{const current=blankWorkspace();current.searchId='new-search';await api.writeWorkspace('visitor',current)};
 await call('poll',400);assert.equal((await api.readWorkspace('visitor')).searchId,'new-search');assert.equal((await api.readWorkspace('visitor')).listings.length,0);
 assert.equal(JSON.parse((sql.prepare('SELECT payload FROM workspaces WHERE user_id=?').get('visitor:marketplace-job') as {payload:string}).payload).state,'RUNNING');
 // A failing second statement must roll back the already-updated job row.
 await seed('RUNNING');fixture.status='SUCCEEDED';failSecondStatement=true;
 await call('poll',400);assert.equal((await api.readWorkspace('visitor')).listings.length,0);
 assert.equal(JSON.parse((sql.prepare('SELECT payload FROM workspaces WHERE user_id=?').get('visitor:marketplace-job') as {payload:string}).payload).state,'RUNNING');
 await call('poll');assert.equal((await api.readWorkspace('visitor')).listings.length,1);
 // Reverse ordering: an action loaded before import cannot later erase its results.
 await seed('RUNNING');fixture.status='SUCCEEDED';const staleWorkspace=await api.readWorkspace('visitor');
 await call('poll');staleWorkspace.saved=[car];
 await assert.rejects(()=>api.writeWorkspace('visitor',staleWorkspace),/workspace changed/);
 assert.equal((await api.readWorkspace('visitor')).listings.length,1);
 const sequential=await api.readWorkspace('visitor');sequential.saved=[car];await api.writeWorkspace('visitor',sequential);sequential.messages.push({role:'user',text:'Still here',at:3});await api.writeWorkspace('visitor',sequential);
 assert.equal((await api.readWorkspace('visitor')).saved.length,1);assert((await api.readWorkspace('visitor')).messages.some(message=>message.text==='Still here'));
 // A snapshot of an absent workspace cannot overwrite a concurrent creation.
 const absent=await api.readWorkspace('fresh-visitor');const created=blankWorkspace();created.searchId='created';await api.writeWorkspace('fresh-visitor',created);
 await assert.rejects(()=>api.writeWorkspace('fresh-visitor',absent),/workspace changed/);
 assert.equal((await api.readWorkspace('fresh-visitor')).searchId,'created');
 // Another run for the same search must not be overwritten by a late import/start.
 const replacement={searchId:'current-search',runId:'replacement-run',state:'RUNNING',batch:1,startedAt:Date.now()};
 const replaceJob=async()=>{sql.prepare('UPDATE workspaces SET payload=? WHERE user_id=?').run(JSON.stringify(replacement),'visitor:marketplace-job')};
 await seed('RUNNING');fixture.status='SUCCEEDED';beforeBatch=replaceJob;
 await call('poll',400);assert.equal((await api.readWorkspace('visitor')).listings.length,0);
 await seed('FAILED',null);beforeStart=replaceJob;await call('start');
 assert.deepEqual(JSON.parse((sql.prepare('SELECT payload FROM workspaces WHERE user_id=?').get('visitor:marketplace-job') as {payload:string}).payload),replacement,'late start only updates its exact STARTING claim');
 console.log('PASS: marketplace recovery, atomic imports, concurrent polls, stale statuses, saved/chat preservation, gzip and new-search isolation');
}finally{sql.close();delete fixtureGlobal.__recoveryFixture;await rm(dir,{recursive:true,force:true})}
