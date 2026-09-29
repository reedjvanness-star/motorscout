import assert from 'node:assert/strict';
import {blankWorkspace} from '../lib/domain';
import {normalizeMarketcheck} from '../lib/marketcheck';
import {captureSearch,restorePreviousSearch} from '../lib/search-history';
import {resolveMessageCars,retainedWorkspaceCars,retainMessageCars} from '../lib/chat-results';
const car=(id:string)=>normalizeMarketcheck({id,price:35000,vdp_url:`https://example.test/${id}`,build:{make:'BMW',model:'M4',year:2020},miles:35000},false)!;
const previous=blankWorkspace();previous.listings=[car('old')];previous.collected=[car('old'),car('previous-hidden')];
const workspace=blankWorkspace();workspace.previousSearch=captureSearch(previous);workspace.listings=[car('current')];workspace.collected=[...workspace.listings,car('hidden')];workspace.saved=[car('saved')];workspace.comparisonCars=[car('compared')];
const before=structuredClone(workspace);
const ids=['old','hidden','saved','compared','previous-hidden','missing','old'].map(id=>'marketcheck:'+id);
const found=resolveMessageCars(workspace,{ids});assert.deepEqual(found.cars.map(row=>row.id),ids.slice(0,5));assert.equal(found.missingCount,1);assert.deepEqual(workspace,before,'opening chat results cannot alter the collection, filters or history');
assert.deepEqual(resolveMessageCars(workspace,{ids:['missing']}),{cars:[],missingCount:1},'missing historical cars never fall back to unrelated current results');
assert.deepEqual(resolveMessageCars(workspace,{}),{cars:[],missingCount:0});
workspace.listings.push({...car('old'),price:32000});assert.equal(resolveMessageCars(workspace,{ids:['marketcheck:old']}).cars[0].price,32000,'current evidence wins over an old snapshot');
assert.equal(retainedWorkspaceCars(workspace).filter(row=>row.id==='marketcheck:old').length,1);
assert.equal(resolveMessageCars(blankWorkspace(),{ids}).cars.length,0,'another account cannot resolve these cars without retaining them');
console.log('PASS: exact historical chat IDs, all retained collections, missing results, current evidence and no mutation');

workspace.messages=[{role:'assistant',text:'Original cars',ids:['marketcheck:old','marketcheck:hidden'],at:1}];retainMessageCars(workspace);
workspace.previousSearch=undefined;workspace.collected=[];workspace.listings=[];
assert.equal(resolveMessageCars(workspace,workspace.messages[0]).cars.length,2,'message references survive a replaced collection and previous snapshot');
retainMessageCars(workspace);assert.equal(workspace.chatCars?.length,2);
workspace.messages=[];retainMessageCars(workspace);assert.equal(workspace.chatCars,undefined,'clearing conversation releases unreferenced rows');
const large=blankWorkspace();large.collected=Array.from({length:600},(_,i)=>car('archive-'+i));large.messages=Array.from({length:50},(_,i)=>({role:'assistant' as const,text:'batch',at:i,ids:large.collected!.slice(i*12,i*12+12).map(row=>row.id)}));retainMessageCars(large);assert.equal(large.chatCars?.length,480);assert(!large.chatCars?.some(row=>row.id==='marketcheck:archive-0'),'only latest40 messages are archived');
console.log('PASS: bounded persistent message cars, collection replacement and history expiry');

// Exercise the persistence hooks with real server encoding and an in-memory D1 fixture.
const {DatabaseSync}=await import('node:sqlite');const {sqliteD1}=await import('./sqlite-d1');const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {pathToFileURL}=await import('node:url');const {createRequire}=await import('node:module');
const require=createRequire(import.meta.url);const {build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE workspaces(user_id TEXT PRIMARY KEY,payload TEXT,updated_at INTEGER)');
const fixture={env:{DB:sqliteD1(sql)}};const fixtureGlobal=globalThis as typeof globalThis & {__chatResultsFixture?:typeof fixture};fixtureGlobal.__chatResultsFixture=fixture;
const dir=await mkdtemp(join(tmpdir(),'motorscout-chat-results-'));
try{
 const file=join(dir,'server.mjs');await build({entryPoints:['lib/server.ts'],outfile:file,bundle:true,platform:'node',format:'esm',plugins:[{name:'chat-results-env',setup(b:{onResolve(options:{filter:RegExp},callback:()=>{path:string;namespace:string}):void;onLoad(options:{filter:RegExp;namespace?:string},callback:()=>{contents:string}):void}){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'runtime',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env=globalThis.__chatResultsFixture.env;'}))}}]});
 const api:typeof import('../lib/server')=await import(pathToFileURL(file).href);
 const live=blankWorkspace();live.listings=[car('persisted')];live.collected=live.listings;live.messages=[{role:'assistant',text:'These cars',ids:['marketcheck:persisted'],at:1}];await api.writeWorkspace('visitor',live);
 const raw=JSON.parse((sql.prepare('SELECT payload FROM workspaces WHERE user_id=?').get('visitor') as {payload:string}).payload);assert.equal(raw.chatCars[0].id,'marketcheck:persisted','write persists the bounded archive');
 const later=await api.readWorkspace('visitor');later.listings=[];later.collected=[];later.previousSearch=undefined;await api.writeWorkspace('visitor',later);
 const reloaded=await api.readWorkspace('visitor');assert.equal(resolveMessageCars(reloaded,reloaded.messages[0]).cars[0].id,'marketcheck:persisted');
 assert.equal((await api.readWorkspace('other-visitor')).chatCars,undefined,'archive stays account scoped');
 const snapshotSource=await api.readWorkspace('visitor');snapshotSource.listings=[car('snapshot-car')];snapshotSource.collected=snapshotSource.listings;const switching=blankWorkspace();switching.previousSearch=captureSearch(snapshotSource);restorePreviousSearch(switching);retainMessageCars(switching);assert.equal(resolveMessageCars(switching,switching.messages[0]).cars[0].id,'marketcheck:persisted','restoring a snapshot retains chat cars from still older searches');
 // A legacy row with no archive is hydrated from retained cars when read.
 delete raw.chatCars;sql.prepare('UPDATE workspaces SET payload=? WHERE user_id=?').run(JSON.stringify(raw),'visitor');assert.equal((await api.readWorkspace('visitor')).chatCars?.length,1);
 console.log('PASS: server archive persistence, legacy hydration and account isolation');
}finally{sql.close();delete fixtureGlobal.__chatResultsFixture;await rm(dir,{recursive:true,force:true})}
