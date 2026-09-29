import assert from 'node:assert/strict';
import {searchInventory,nextAutoPosition} from '../lib/inventory';
import {marketcheckUrl,normalizeMarketcheck} from '../lib/marketcheck';
import {initialFilters,deduplicate,rank,safeUrl,firstCursor} from '../lib/domain';

const record=(i:number,patch:Record<string,unknown>={})=>({id:String(i),vin:`TEST${String(i).padStart(13,'0')}`,heading:'2022 BMW M340i',build:{year:2022,make:'BMW',model:'3 Series',trim:'M340i',drivetrain:'AWD'},price:30000+i,miles:39000,inventory_type:'used',dealer:{state:'CO',city:'Test'},vdp_url:`https://example.test/listing?id=${i}`,...patch});
const f={...initialFilters,make:'BMW',model:'3 Series',maxPrice:35000,maxMiles:40000,minYear:2020,state:'CO',awd:true};
const u=marketcheckUrl({...f,cleanTitle:true,shippingAllowance:1000},false,50);
for(const [key,value] of Object.entries({start:'50',year_range:'2020-2030',drivetrain:'AWD',carfax_clean_title:'true',sort_by:'price',append_api_key:'false',price_range:'1-34000'}))assert.equal(u.searchParams.get(key),value);
assert.equal(normalizeMarketcheck(record(1,{fees:1000,price_includes_fees:false}),false)?.fees,1000);
assert.equal(normalizeMarketcheck(record(1,{fees:1000,price_includes_fees:true}),false)?.fees,0);
assert.equal(normalizeMarketcheck(record(1,{fees:1000}),false)?.fees,null);
assert.equal(normalizeMarketcheck(record(1,{carfax_clean_title:true}),false)?.titleStatus,'clean');
for(const x of [null,{},record(1,{price:NaN}),record(1,{inventory_type:'new'}),record(1,{vdp_url:'javascript:alert(1)'})])assert.equal(normalizeMarketcheck(x,false),null);
assert.equal(normalizeMarketcheck(record(1,{miles:-1}),false)?.miles,null);
assert.equal(safeUrl('https://example.test/car?id=123&api_key=secret'),'https://example.test/car?id=123');
assert.equal(safeUrl('https://user:password@example.test/car'),null);
const a=normalizeMarketcheck(record(1),false)!,b=normalizeMarketcheck(record(2),false)!;
assert.equal(deduplicate([{...a,vin:null},{...b,vin:null}]).length,2,'distinct URL query IDs survive deduplication');
const cheaper={...a,id:'other',url:'https://second.test/car',price:29000};
const merged=deduplicate([a,cheaper])[0];assert.equal(merged.price,29000);assert.equal(merged.offers?.length,2);
assert.equal(rank([{...a,price:40000},cheaper],[],f)[0].price,29000,'over-budget duplicate cannot hide eligible offer');
assert.equal(rank([{...a,miles:50000},{...cheaper,price:31000}],[],f).length,1,'filter offers before merging');
let calls:URL[]=[];
const mock:typeof fetch=async(input)=>{
  const url=new URL(String(input));calls.push(url);
  if(url.host==='api.auto.dev')return Response.json({data:[],links:{next:null}});
  if(url.pathname.includes('fsbo')||url.pathname==='/v2/dealerships/inventory')return Response.json({listings:[],num_found:0});
  const offset=Number(url.searchParams.get('start'));
  return Response.json({listings:Array.from({length:offset===0?50:5},(_,i)=>record(offset+i)),num_found:55});
};
const one=await searchInventory(f,{marketcheck:'test-only',autodev:'test-only'},firstCursor(),mock);
assert.equal(one.listings.length,50,'no top-12 truncation before local pagination');
assert.deepEqual(one.nextCursor,{dealer:50,private:null,auction:null,autodev:null,autotrader:null,retailers:null});
assert.equal(one.sources[0].total,55);assert.equal(calls.length,5);
calls=[];
const two=await searchInventory(f,{marketcheck:'test-only',autodev:'test-only'},one.nextCursor!,mock);
assert.equal(two.listings.length,5);assert.equal(two.nextCursor,null);assert.equal(calls.length,1,'exhausted and filter-excluded feeds not called again');
const outage=await searchInventory(f,{marketcheck:'test-only'},firstCursor(),async()=>{throw Error('secret upstream error')});
assert.deepEqual(outage.nextCursor,{dealer:0,private:0,auction:null,autodev:null,autotrader:0,retailers:0});assert(!JSON.stringify(outage).includes('secret upstream'));
const partial=await searchInventory(f,{marketcheck:'test-only'},firstCursor(),async(input,init)=>String(input).includes('fsbo')?new Response('',{status:403}):mock(input,init));
assert.equal(partial.listings.length,50);assert.equal(partial.sources[1].status,'error');assert.equal(partial.nextCursor?.private,0);
let skipped=0;await searchInventory({...f,seller:'private'},{autodev:'test'},firstCursor(),async()=>{skipped++;return Response.json({})});assert.equal(skipped,0);
assert.equal(nextAutoPosition({links:{next:'https://evil.test/listings?cursor=stolen'}},'50',20),null);
assert.equal(nextAutoPosition({links:{next:'https://api.auto.dev/listings?cursor=abc'}},'50',20),'cursor:abc');
assert.equal(nextAutoPosition({links:{next:'https://api.auto.dev/listings?cursor=abc'}},'cursor:abc',20),null);
assert.equal(nextAutoPosition({},'1',20),'2');assert.equal(nextAutoPosition({},'50',20),null);
assert.equal(nextAutoPosition({links:{next:null}},'1',20),null);
const none=await searchInventory(f,{},firstCursor(),mock);assert.equal(none.listings.length,0);assert.equal(none.nextCursor,null);
const riskSummary=await searchInventory(initialFilters,{autodev:'test'},firstCursor(),async()=>Response.json({data:[{
  vehicle:{year:2022,make:'BMW',model:'3 Series'},
  retailListing:{used:true,price:30000,vdp:'https://seller.example/used-Test-BMW-3MW59FT06T8G07697',miles:30000}
}],links:{next:null}}));
assert(riskSummary.listings[0].priceWarning,'page-template risk discovered during review');
assert.match(riskSummary.sources[3].detail,/1 unconfirmed amounts/,'source summary includes warnings added by price review');
console.log('PASS: inventory paging, complete batch retention, partial failures, retries, fee/title normalization, duplicate offers, and credential boundaries');

const low=normalizeMarketcheck(record(99,{price:40}),false)!;assert(low.priceWarning);assert.equal(rank([low],[low],f).length,0,'unconfirmed amount cannot satisfy a budget');
const browsing=rank([low,a],[low,a],initialFilters);assert.equal(browsing[0].id,a.id);assert.equal(browsing[1].median,null);assert.match(browsing[1].reason,/needs seller confirmation/);
assert.equal(deduplicate([low,{...a,vin:low.vin}])[0].id,a.id,'prefer a usable offer to an implausible amount');

assert.equal(deduplicate([{...a,vin:null,url:'https://example.test/cars#vin=one'},{...b,vin:null,url:'https://example.test/cars#vin=two'}]).length,2,'fragment identifiers can identify distinct cars');

// Exercise both completion orders: neither provider may overwrite the other.
for(const slowAuction of [true,false]){
  let release!:()=>void;
  const wait=new Promise<void>(resolve=>{release=resolve});
  const distinct:typeof fetch=async input=>{
    const url=new URL(String(input));
    const auction=url.pathname.includes('/auction/');
    const auto=url.host==='api.auto.dev';
    if(!auction&&!auto)return Response.json({listings:[],num_found:0});
    if(auction===slowAuction)await wait;else release();
    return auto?Response.json({data:[{vehicle:{vin:'AUTODEV12345678901',year:2022,make:'BMW',model:'3 Series'},retailListing:{used:true,price:32000,vdp:'https://auto.example/car',miles:30000}}],links:{next:null}}):Response.json({listings:[record(900,{price:15000})],num_found:1});
  };
  const result=await searchInventory(initialFilters,{marketcheck:'test',autodev:'test'},firstCursor(),distinct);
  assert.equal(result.listings.length,2,'both auction and Auto.dev cars survive concurrent completion');
  assert.equal(result.sources[2].count,1);assert.equal(result.sources[3].count,1);
  const auction=result.listings.find(r=>r.id.startsWith('auction:'))!;
  assert.match(auction.priceWarning!,/Auction amount/);assert.equal(auction.median,null);
  assert.equal(rank([auction],[],{...initialFilters,maxPrice:20000}).length,0,'auction bid cannot qualify as a cash budget match');
  assert.equal(result.listings[0].source,'auto.example','confirmed retail price sorts before unconfirmed bid');
}
let legacyAuctionCalls=0;
await searchInventory(initialFilters,{marketcheck:'test'}, {dealer:null,private:null,autodev:null} as unknown as import('../lib/domain').SearchCursor,async()=>{legacyAuctionCalls++;return Response.json({listings:[]})});
assert.equal(legacyAuctionCalls,0,'old saved cursors cannot start a new auction search with an undefined offset');
const redirected=await searchInventory(initialFilters,{marketcheck:'test',autodev:'test'},firstCursor(),async(_input,init)=>{
  assert.equal(init?.redirect,'manual','use Workers-compatible redirect handling without forwarding keys');
  return new Response(null,{status:302,headers:{Location:'https://untrusted.example/'}});
});
assert.equal(redirected.listings.length,0);
assert(redirected.sources.slice(0,4).every(s=>s.status==='error'&&s.detail.includes('HTTP 302')));

// A simultaneous cross-provider VIN duplicate must reach collection as full records.
const {collectWorkspace}=await import('../lib/search-session');
const {blankWorkspace}=await import('../lib/domain');
const commonVin='4S4GUHF63S3720418';
const simultaneous=await searchInventory(f,{marketcheck:'test',autodev:'test'},{dealer:0,private:null,auction:null,autodev:'1',autotrader:null,retailers:null},async input=>{
 const url=new URL(String(input));
 if(url.host==='api.auto.dev')return Response.json({data:[{vehicle:{vin:commonVin,year:2022,make:'BMW',model:'3 Series',trim:'M340i',drivetrain:'AWD'},retailListing:{used:true,price:32000,vdp:'https://auto.example/same-vin',miles:39000,state:'CO',primaryImage:'https://images.example/auto.jpg'}}],links:{next:null}});
 return Response.json({listings:[record(701,{vin:commonVin,price:30000,media:{photo_links:['https://images.example/market.jpg']}}),record(702,{price:60000})],num_found:2});
});
assert.equal(simultaneous.listings.length,1,'display still shows one matching vehicle');
assert.equal(simultaneous.records!.length,2,'full matching alternate records survive inventory-stage deduplication');
assert(!simultaneous.records!.some(row=>row.price===60000),'unmatched raw data is not retained');
const simultaneousPool=blankWorkspace();simultaneousPool.filters=f;
collectWorkspace(simultaneousPool,simultaneous.records??simultaneous.listings,true);
const primary=simultaneous.records!.find(row=>row.id.startsWith('marketcheck:'))!;
collectWorkspace(simultaneousPool,[{...primary,price:34000,checkedAt:new Date(Date.parse(primary.checkedAt)+1000).toISOString()}]);
assert.equal(simultaneousPool.listings[0].source,'auto.example');
assert.equal(simultaneousPool.listings[0].price,32000);
assert.deepEqual(simultaneousPool.listings[0].photos,['https://images.example/auto.jpg'],'retained alternate supplies its own complete photo provenance');

assert.equal(nextAutoPosition({links:{next:'?page=2'}},'1',20),'2','query-relative next pages resolve against the listings endpoint');
assert.equal(nextAutoPosition({links:{next:'?cursor=next-token'}},'1',20),'cursor:next-token');
for(const next of ['?page=51','?page=1','//evil.test/listings?page=2','/other?page=2','https://user:password@api.auto.dev/listings?page=2'])assert.equal(nextAutoPosition({links:{next}},'1',20),null,'relative link support preserves endpoint and page limits');
const relativeCalls:string[]=[];
const relativeFetcher:typeof fetch=async input=>{
 const url=new URL(String(input));relativeCalls.push(url.href);
 const second=url.searchParams.get('page')==='2';
 return Response.json({data:[{vehicle:{vin:second?'4S4GUHF63S3720418':'4T1C11AK5PU786764',year:2022,make:'BMW',model:'3 Series'},retailListing:{used:true,price:32000,vdp:`https://auto.example/relative-${second?2:1}`,miles:30000}}],links:{next:second?null:'?page=2'}});
};
const relativeFirst=await searchInventory(initialFilters,{autodev:'test'},firstCursor(),relativeFetcher);
assert.equal(relativeFirst.nextCursor?.autodev,'2','explicit next links survive even a shorter-than-limit page');
const relativeSecond=await searchInventory(initialFilters,{autodev:'test'},relativeFirst.nextCursor!,relativeFetcher);
assert.equal(relativeSecond.listings.length,1);assert.equal(relativeSecond.nextCursor,null);
assert.equal(relativeCalls.length,2);assert.equal(new URL(relativeCalls[1]).pathname,'/listings');assert.equal(new URL(relativeCalls[1]).searchParams.get('page'),'2');

for(const filters of [{...initialFilters,seller:'dealer' as const},{...initialFilters,seller:'private' as const},{...initialFilters,maxPrice:50000},initialFilters]){
 let auctionCalls=0;
 const result=await searchInventory(filters,{marketcheck:'test'},firstCursor(),async input=>{
  if(new URL(String(input)).pathname.includes('/auction/'))auctionCalls++;
  return Response.json({listings:[],num_found:0});
 });
 const excluded=filters.seller!=='any'||filters.maxPrice!==null;
 assert.equal(auctionCalls,excluded?0:1,'skip auction requests whose unknown seller or purchase price guarantees no exact match');
 assert.equal(result.sources[2].status,excluded?'unavailable':'searched');
 if(excluded){assert.equal(result.nextCursor?.auction??null,null);assert.match(result.sources[2].detail,/Excluded by your seller or maximum-price filter/);}
}

for(const privateSeller of [false,true]){
 assert.equal(marketcheckUrl({...initialFilters,minMiles:10000,maxMiles:20000},privateSeller).searchParams.get('miles_range'),'10000-20000');
 assert.equal(marketcheckUrl({...initialFilters,maxMiles:20000},privateSeller).searchParams.get('miles_range'),'0-20000');
 assert(!marketcheckUrl({...initialFilters,minMiles:10000},privateSeller).searchParams.has('miles_range'),'minimum-only mileage remains a local requirement without invented provider bounds');
 assert.equal(marketcheckUrl({...initialFilters,minMiles:10000,maxMiles:20000},privateSeller).searchParams.get('rows'),'50');
}

const {autotraderMarketcheckUrl}=await import('../lib/marketcheck');
const {retailerInventoryUrl}=await import('../lib/retailers');
for(const builder of [autotraderMarketcheckUrl,retailerInventoryUrl]){
 const bounded=builder({...initialFilters,minMiles:10000,maxMiles:20000});
 assert.equal(bounded.searchParams.get('miles_range'),'10000-20000');assert.equal(bounded.searchParams.get('rows'),'10');
 assert(!builder({...initialFilters,minMiles:10000}).searchParams.has('miles_range'));
}
