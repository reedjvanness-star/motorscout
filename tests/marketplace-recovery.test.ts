import assert from 'node:assert/strict';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {blankWorkspace} from '../lib/domain';
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
const fixture={workspace:blankWorkspace(),status:'SUCCEEDED',starts:0,reads:0,db:{prepare:(query:string)=>new Statement(query)},car};
const fixtureGlobal=globalThis as typeof globalThis & {__recoveryFixture?:typeof fixture};
fixtureGlobal.__recoveryFixture=fixture;
const modules:Record<string,string>={
 server:`const f=globalThis.__recoveryFixture;export const identity=()=> 'visitor',db=()=>f.db,readWorkspace=async()=>structuredClone(f.workspace),writeWorkspace=async(id,w)=>{f.workspace=structuredClone(w)},boundedJson=req=>req.json(),failure=e=>Response.json({error:e.message},{status:400});`,
 connections:`export const providerKey=async()=> 'fixture-key',connectionStatus=async()=>({apifyShared:true});`,
 'shared-marketplace':`export const reserveBetaSearch=async()=>{};`,
 'marketplace-budget':`export const startBudgetedMarketplaceRun=async()=>{globalThis.__recoveryFixture.starts++;return {id:'new-run',status:'RUNNING'}};`,
 'zip-location':`export const locateListings=async rows=>rows;`,
 apify:`const f=globalThis.__recoveryFixture;export const ACTOR='fixture-actor',FACEBOOK_ACTOR='fixture-facebook',MARKETPLACE_RUN_CAP=.04;export const marketplaceInput=()=>({query:'same-input'}),facebookInput=marketplaceInput,retailerMarketplaceInput=marketplaceInput;export const normalizeMarketplace=row=>row,normalizeFacebook=normalizeMarketplace;export const marketplaceSources=()=>[],retailerMarketplaceSources=marketplaceSources;export const apifyRequest=async(key,path)=>{f.reads++;if(path.startsWith('actor-runs/'))return {data:{actId:ACTOR,status:f.status,defaultDatasetId:'fixture-dataset'}};if(path.startsWith('datasets/'))return [f.car];throw Error('Unexpected provider request');};`,
};
const dir=await mkdtemp(join(tmpdir(),'motorscout-recovery-'));
try{
 const file=join(dir,'route.mjs');
 await build({entryPoints:['app/api/marketplaces/route.ts'],outfile:file,bundle:true,platform:'node',format:'esm',plugins:[{name:'recovery-fixtures',setup(b:{onResolve(options:{filter:RegExp},callback:(args:{path:string})=>{path:string;namespace:string}|undefined):void;onLoad(options:{filter:RegExp;namespace?:string},callback:(args:{path:string})=>{contents:string}):void}){
 b.onResolve({filter:/^@\/lib\//},({path})=>{const name=path.slice('@/lib/'.length);return modules[name]?{path:name,namespace:'fixture'}:undefined});
 b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:modules[path]}));
 }}]});
 const api: {POST:(req:Request)=>Promise<Response>}=await import(pathToFileURL(file).href);
 async function call(action:string){const response=await api.POST(new Request('https://motorscout.test/api/marketplaces',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,provider:'automotive',searchId:'current-search',advance:true})}));assert.equal(response.status,200);return response.json() as Promise<{done:boolean;state:string}>}
 function seed(state:string,runId:string|null='existing-run',searchId='current-search'){
  fixture.workspace=blankWorkspace();fixture.workspace.searchId='current-search';fixture.status=state;fixture.starts=0;fixture.reads=0;
  sql.prepare('INSERT OR REPLACE INTO workspaces VALUES(?,?,?)').run('visitor:marketplace-job',JSON.stringify({searchId,runId,state,startedAt:Date.now(),successful:true,inputKey:JSON.stringify({actor:'fixture-actor',input:{query:'same-input'}})}),Date.now());
 }
 // A browser interruption between start and first poll must not strand a terminal run.
 for(const state of ['SUCCEEDED','FAILED','TIMED-OUT','ABORTED']){
  seed(state);assert.equal((await call('start')).done,false,`${state} still needs its dataset imported`);
  assert.equal(fixture.starts,0,'recovery must not consume another provider run');
  assert.equal((await call('poll')).done,true);assert.equal(fixture.workspace.listings.length,1,'recover usable results, including partial failed runs');
  assert.equal(fixture.workspace.messages.length,1);
  assert.equal((await call('start')).done,true);assert.equal((await call('poll')).done,true);
  assert.equal(fixture.workspace.messages.length,1,'completed recovery must be idempotent');assert.equal(fixture.reads,2);
 }
 // Reproduce the actual reuse path, then simulate refreshing before its first poll.
 seed('IMPORTED','existing-run','previous-search');fixture.status='SUCCEEDED';
 assert.equal((await call('start')).done,false);assert.equal(fixture.starts,0);
 assert.equal((await call('start')).done,false,'restarting a reused run must still request import');
 await call('poll');assert.equal(fixture.workspace.listings.length,1);assert.equal(fixture.starts,0);
 seed('FAILED',null);assert.equal((await call('start')).done,false);assert.equal(fixture.starts,1,'failed starts without a run remain retryable');
 console.log('PASS: interrupted terminal runs, exact-input reuse recovery, idempotent imports and failed-start retry');
}finally{sql.close();delete fixtureGlobal.__recoveryFixture;await rm(dir,{recursive:true,force:true})}
