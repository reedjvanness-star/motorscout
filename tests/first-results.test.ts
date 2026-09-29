import assert from 'node:assert/strict';
import {firstResults} from '../lib/first-results';
import {searchInventory} from '../lib/inventory';
import {initialFilters} from '../lib/domain';
import {healthyCursor} from '../lib/search-session';

const calls:string[]=[];
const request:typeof fetch=async input=>{
 const url=new URL(String(input));calls.push(url.host+url.pathname);
 if(url.host==='api.auto.dev')return Response.json({data:[{vehicle:{year:2010,make:'Toyota',model:'Tacoma'},retailListing:{used:true,price:12000,miles:150000,vdp:'https://seller.example/car'}}],links:{next:null}});
 return Response.json({listings:[],num_found:0});
};
const search:typeof searchInventory=(f,k,c)=>searchInventory(f,k,c,request);
const first=await firstResults(initialFilters,{autodev:'test',marketcheck:'test'},search);
assert.deepEqual(calls,['api.auto.dev/listings'],'first response does not wait for or call secondary feeds');
assert.equal(first.listings.length,1);
assert.deepEqual(first.nextCursor,{dealer:0,private:0,auction:0,autodev:null,autotrader:0,retailers:0});
assert.equal(first.sources[0].status,'ready','deferred sources must not be labeled checked');
assert(healthyCursor(first.nextCursor,first.sources),'background collection remains enabled');
calls.length=0;
await search(initialFilters,{autodev:'test',marketcheck:'test'},first.nextCursor!);
assert.equal(calls.length,5,'all deferred feeds are checked in the next batch');
assert(calls.every(url=>!url.startsWith('api.auto.dev')),'exhausted first feed is not repeated');
calls.length=0;
const privateFirst=await firstResults({...initialFilters,seller:'private'},{autodev:'test',marketcheck:'test'},search);
assert.equal(calls.length,1);assert(calls[0].includes('/fsbo/'));
assert.equal(privateFirst.nextCursor?.autodev,null);
assert.equal(privateFirst.nextCursor?.dealer,null);
assert.equal(privateFirst.nextCursor?.auction,null,'unknown-seller auctions cannot match private-only searches');
assert.equal(privateFirst.nextCursor?.autotrader,0,'AutoTrader FSBO remains eligible');
assert.equal(privateFirst.nextCursor?.retailers,null);
assert.equal(privateFirst.sources.find(source=>source.name==='MarketCheck · auctions')?.status,'unavailable');
calls.length=0;await search({...initialFilters,seller:'private'},{autodev:'test',marketcheck:'test'},privateFirst.nextCursor!);
assert.equal(calls.length,1,'only the eligible deferred AutoTrader feed is requested for private searches');
for(const filters of [{...initialFilters,seller:'dealer' as const},{...initialFilters,maxPrice:30000}]){
 const result=await firstResults(filters,{autodev:'test',marketcheck:'test'},search);
 assert.equal(result.nextCursor?.auction,null,'unconfirmed auction amounts cannot meet budget or seller requirements');
 assert.equal(result.nextCursor?.autotrader,0);assert.equal(result.nextCursor?.retailers,0);
}
const reordered=await firstResults(initialFilters,{autodev:'test',marketcheck:'test'},async(f,k,c)=>{const result=await searchInventory(f,k,c,async()=>new Response('',{status:429}));return {...result,sources:result.sources.reverse()}});
assert.equal(reordered.sources.find(source=>source.name==='Auto.dev · dealer inventory')?.status,'error','deferred status updates cannot overwrite the failed selected feed');
assert.equal(reordered.sources.find(source=>source.name==='MarketCheck · dealer inventory')?.status,'ready');
assert.equal(healthyCursor(reordered.nextCursor,reordered.sources)?.autodev,null);
assert.equal(healthyCursor(reordered.nextCursor,reordered.sources)?.dealer,0);
calls.length=0;
const only=await firstResults(initialFilters,{autodev:'test'},search);
assert.equal(only.nextCursor,null,'do not queue unconfigured sources');
const failed=await firstResults(initialFilters,{autodev:'test',marketcheck:'test'},(f,k,c)=>searchInventory(f,k,c,async()=>new Response('',{status:429})));
assert.equal(healthyCursor(failed.nextCursor,failed.sources)?.dealer,0,'a failed first source cannot prevent checking the others');
console.log('PASS: first-feed response, complete deferred coverage, seller filters and failure recovery');

const cooling=await firstResults(initialFilters,{autodev:'test',marketcheck:'test'},async(f,k,c)=>{
 const result=await search(f,k,c);
 result.sources=result.sources.map(source=>source.name.startsWith('MarketCheck')||source.name==='AutoTrader'?{...source,status:'error',detail:'HTTP 429. Retry after cooldown.'}:source);
 return result;
});
assert.equal(cooling.sources.find(source=>source.name==='MarketCheck · dealer inventory')?.status,'error','first results must preserve known provider cooldown errors');
assert.equal(cooling.sources.find(source=>source.name==='MarketCheck · auctions')?.status,'error','eligible but blocked auctions must not be labelled filter-excluded');
assert.equal(healthyCursor(cooling.nextCursor,cooling.sources),null,'a successful exhausted first feed cannot start background retries against known blocked feeds');
