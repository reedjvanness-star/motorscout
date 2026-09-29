import assert from 'node:assert/strict';
import {blankWorkspace,filterSchema,type Workspace} from '../lib/domain';
import {captureSearch,rememberSearch,restorePreviousSearch} from '../lib/search-history';
import {normalizeMarketcheck} from '../lib/marketcheck';
import {encodeWorkspace,decodeWorkspace} from '../lib/workspace-codec';
const car=(id:string)=>normalizeMarketcheck({id,price:35000,vdp_url:`https://example.test/${id}`,build:{make:'BMW',model:'M4',year:2020},miles:35000},false)!;
const workspace=blankWorkspace();workspace.filters=filterSchema.parse({make:'BMW'});workspace.poolFilters=workspace.filters;workspace.listings=[car('original')];workspace.collected=[...workspace.listings,car('hidden')];workspace.messages=[{role:'user',text:'Find BMWs',at:1}];workspace.sources=[{name:'CarGurus',status:'searched',count:2,detail:'Original source evidence'}];workspace.searchedAt='2026-09-29T00:00:00Z';workspace.searchId='old-run';workspace.nextCursor={dealer:50,private:null,auction:null,autodev:null};workspace.batch=2;
workspace.saved=[car('saved')];workspace.compare=['saved'];workspace.comparisonCars=[workspace.saved[0]];
const original=captureSearch(workspace)!;
rememberSearch(workspace);
workspace.filters=filterSchema.parse({make:'Audi'});workspace.messages=[];workspace.listings=[];workspace.collected=[];workspace.sources=[];workspace.searchId='new-run';workspace.nextCursor=null;
rememberSearch(workspace);assert.deepEqual(workspace.previousSearch,original,'empty or failed search must not replace the last useful collection');
workspace.saved.push(car('saved-after'));workspace.compare=['saved-after'];workspace.comparisonCars=[workspace.saved[1]];
restorePreviousSearch(workspace);
assert.deepEqual(workspace.filters,original.filters);assert.deepEqual(workspace.collected,original.collected);assert.deepEqual(workspace.listings,original.listings);assert.deepEqual(workspace.messages,original.messages);assert.deepEqual(workspace.sources,original.sources);assert.equal(workspace.searchedAt,original.searchedAt);assert.equal(workspace.batch,2);
assert.equal(workspace.saved.length,2);assert.deepEqual(workspace.compare,['saved-after']);assert.equal(workspace.comparisonCars[0].id,'marketcheck:saved-after');
assert.notEqual(workspace.searchId,'old-run');assert.notEqual(workspace.searchId,'new-run');assert.equal(workspace.nextCursor,null);assert.equal(workspace.pending,null);assert.equal(workspace.previousSearch,undefined);
rememberSearch(workspace);workspace.listings=[car('new-car')];workspace.collected=[...workspace.listings];restorePreviousSearch(workspace);assert.equal((workspace as Workspace).previousSearch?.listings[0].id,'marketcheck:new-car');assert(!('previousSearch' in workspace.previousSearch!),'history cannot recursively grow');
const many=blankWorkspace();many.listings=Array.from({length:3005},(_,i)=>car(String(i)));many.collected=many.listings;many.messages=Array.from({length:50},(_,i)=>({role:'user' as const,text:String(i),at:i}));rememberSearch(many);assert.equal(many.previousSearch?.collected?.length,3000);assert.equal(many.previousSearch?.listings.length,3000);assert.equal(many.previousSearch?.messages.length,40);assert(!('saved' in many.previousSearch!));assert(!('compare' in many.previousSearch!));
assert.deepEqual((await decodeWorkspace(await encodeWorkspace(workspace))).previousSearch,workspace.previousSearch,'snapshot persists through workspace storage');
assert.throws(()=>restorePreviousSearch(blankWorkspace()),/no previous search/);
// Pure history checks above require no services. Exercise the actual route below.
console.log('PASS: bounded previous search, empty/failure preservation, safe restore, shortlist retention and persistence');

const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {pathToFileURL}=await import('node:url');const {createRequire}=await import('node:module');
const require=createRequire(import.meta.url);const {build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const routeFixture={workspace:structuredClone(workspace),providerCalls:0,usage:0,throws:false};
const fixtureGlobal=globalThis as typeof globalThis & {__historyFixture?:typeof routeFixture};fixtureGlobal.__historyFixture=routeFixture;
const mocks:Record<string,string>={
 server:`const f=globalThis.__historyFixture;export const identity=()=> 'visitor',readWorkspace=async()=>structuredClone(f.workspace),writeWorkspace=async(id,w)=>{f.workspace=structuredClone(w)},boundedJson=req=>req.json(),failure=e=>Response.json({error:e.message},{status:400}),limitUsage=async()=>{f.usage++},db=()=>({prepare:()=>({bind:()=>({first:async()=>({filters:JSON.stringify({make:'Toyota'})})})})});export {filterSchema} from '${process.cwd()}/lib/domain';`,
 connections:`export const inventoryKeys=async()=>({}),connectionStatus=async()=>({apify:true}),providerKey=async()=>undefined;`,
 sources:`export const sourceStatus=()=>[],searchListings=async()=>{const f=globalThis.__historyFixture;f.providerCalls++;if(f.throws)throw Error('Provider failed');return {listings:[],sources:[{name:'fixture',status:'error',detail:'Provider failed'}],nextCursor:null,checkedAt:'2026-09-29T00:00:00Z'}};`,
 alerts:`export const alertSnapshot=async()=>({alerts:[],notifications:[],schedulerReady:false}),saveAlert=()=>{},checkAlert=()=>{},emailReady=()=>false;`,
 'catalog-server':`export const resolveSearchVehicle=async(id,filters)=>filters;`,
 'zip-location':`export const resolveZip=async filters=>filters;`,
 assistant:`export const interpret=()=>{throw Error('Unexpected AI request')};`,
};
const dir=await mkdtemp(join(tmpdir(),'motorscout-history-'));
try{
 const file=join(dir,'route.mjs');await build({entryPoints:['app/api/workspace/route.ts'],outfile:file,bundle:true,platform:'node',format:'esm',plugins:[{name:'history-fixtures',setup(b:{onResolve(options:{filter:RegExp},callback:(args:{path:string})=>{path:string;namespace:string}|undefined):void;onLoad(options:{filter:RegExp;namespace?:string},callback:(args:{path:string})=>{contents:string}):void}){
 b.onResolve({filter:/^@\/lib\//},({path})=>{const name=path.slice('@/lib/'.length);return mocks[name]?{path:name,namespace:'fixture'}:undefined});b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:mocks[path],resolveDir:process.cwd()}));
 }}]});
 const api:{POST:(request:Request)=>Promise<Response>}=await import(pathToFileURL(file).href);
 async function action(action:string,extra:Record<string,unknown>={},status=200){const response=await api.POST(new Request('https://fixture.test/api/workspace',{method:'POST',body:JSON.stringify({action,...extra})}));assert.equal(response.status,status);return response}
 const baseline=structuredClone(routeFixture.workspace);await action('newSearch');assert.equal(routeFixture.workspace.listings.length,0);assert(routeFixture.workspace.previousSearch);
 await action('restoreSearch');assert.deepEqual(routeFixture.workspace.listings,baseline.listings);assert.deepEqual(routeFixture.workspace.saved,baseline.saved);assert.deepEqual(routeFixture.workspace.compare,baseline.compare);assert.equal(routeFixture.providerCalls,0);assert.equal(routeFixture.usage,0,'restore consumes no search allowance');
 await action('search',{filters:{make:'Audi'}});assert.equal(routeFixture.workspace.listings.length,0);assert(routeFixture.workspace.previousSearch);await action('restoreSearch');assert.deepEqual(routeFixture.workspace.listings,baseline.listings,'all-source failure keeps old cars recoverable');
 routeFixture.throws=true;const beforeFailure=structuredClone(routeFixture.workspace);await action('search',{filters:{make:'Ford'}},400);assert.deepEqual(routeFixture.workspace,beforeFailure,'thrown provider failure leaves current search intact');
 await action('loadSearch',{id:'saved-filter'});assert.equal(routeFixture.workspace.filters.make,'Toyota');await action('restoreSearch');assert.deepEqual(routeFixture.workspace.listings,baseline.listings);
 console.log('PASS: route new-search, failed-search and saved-filter recovery without extra provider calls or allowance');
}finally{delete fixtureGlobal.__historyFixture;await rm(dir,{recursive:true,force:true})}
