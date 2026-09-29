import assert from 'node:assert/strict';
import {basic} from '../lib/basic-parser';
import {initialFilters,matches,filterSchema} from '../lib/domain';
import {marketcheckUrl,normalizeMarketcheck} from '../lib/marketcheck';
import {autoDevUrl,normalizeAutoDev} from '../lib/autodev';
import {interpretSearch} from '../lib/search-assistant';
import {knownFeatures,detailsMatch} from '../lib/vehicle-requirements';
const query='Find me a green truck under $30,000 with 4WD, crew cab, diesel, automatic, heated seats and under 80k miles';
const parsed=basic(query,initialFilters);assert.equal(parsed.question,'');
assert.equal(parsed.filters.exteriorColor,'green');assert.equal(parsed.filters.bodyType,'pickup');assert.equal(parsed.filters.drivetrain,'4wd');assert.equal(parsed.filters.cabStyle,'crew');assert.equal(parsed.filters.fuel,'diesel');assert.equal(parsed.filters.transmission,'automatic');assert.deepEqual(parsed.filters.features,['heated seats']);assert.equal(parsed.filters.maxMiles,80000);
const next=basic('make it blue',parsed.filters);assert.equal(next.filters.exteriorColor,'blue');assert.equal(next.filters.maxPrice,30000);assert.equal(next.filters.bodyType,'pickup');assert.equal(next.filters.cabStyle,'crew');
const old=filterSchema.parse({make:'Chevrolet',model:'Corvette',trim:'Stingray'});const fresh=basic('find me a green truck',old);assert.equal(fresh.filters.make,'');assert.equal(fresh.filters.model,'');assert.equal(fresh.filters.trim,'');
assert(basic('a green truck that can tow 12000 pounds',initialFilters).question);
const f=parsed.filters,u=marketcheckUrl(f,false);assert.equal(u.searchParams.get('base_ext_color'),'green');assert.equal(u.searchParams.get('body_type'),'Pickup');assert.equal(u.searchParams.get('body_subtype'),'Crew');assert.equal(u.searchParams.get('drivetrain'),'4WD');assert.equal(u.searchParams.get('high_value_features'),'heated seats');
const au=autoDevUrl(f);assert.equal(au.searchParams.get('vehicle.exteriorColor'),'green');assert.equal(au.searchParams.get('vehicle.bodyStyle'),'pickup');
const listing=normalizeMarketcheck({price:28000,vdp_url:'https://example.test/truck',base_ext_color:'Green',miles:50000,build:{make:'Ford',model:'F-250',body_type:'Pickup',body_subtype:'Crew',fuel_type:'Diesel',transmission:'Automatic',drivetrain:'4WD'},high_value_features:['Heated Front Seats']},false)!;
assert(matches(listing,f));assert(!matches({...listing,exteriorColor:'Blue',baseExteriorColor:'Blue'},f));assert(!matches({...listing,bodyType:'Sedan'},f));assert(!matches({...listing,drive:'AWD'},f));assert(!matches({...listing,exteriorColor:'',baseExteriorColor:''},f));assert(!matches({...listing,features:[]},f));
assert.deepEqual(knownFeatures(['no heated seats','without leather seats']),[]);
assert(!detailsMatch({drive:'4WD',bodyType:'pickup'},f),'missing feature evidence cannot pass');
const auto=normalizeAutoDev({vehicle:{make:'Ford',model:'F-150',exteriorColor:'Green',bodyStyle:'Pickup',fuel:'Gasoline',transmission:'Automatic'},retailListing:{price:29000,used:true,vdp:'https://example.test/truck'}})!;
assert(matches(auto,filterSchema.parse({exteriorColor:'green',bodyType:'pickup'})));
let body!:{tools:{function:{strict:boolean}}[];parallel_tool_calls:boolean};
const result=await interpretSearch(query,initialFilters,[],{apiKey:'test-only',request:async(_u,init)=>{body=JSON.parse(String(init?.body));return Response.json({choices:[{message:{tool_calls:[{function:{name:'update_search',arguments:JSON.stringify({filters:f,question:query,action:'search'})}}]}}]})}});
assert.equal(result.question,'','search responses execute rather than echo an AI paraphrase');assert.equal(result.filters.exteriorColor,'green');assert.equal(body.tools[0].function.strict,true);assert.equal(body.parallel_tool_calls,false);
const echo=await interpretSearch('find a green truck',initialFilters,[],{apiKey:'test',request:async()=>Response.json({choices:[{message:{tool_calls:[{function:{name:'update_search',arguments:JSON.stringify({filters:initialFilters,question:'find a green truck',action:'clarify'})}}]}}]})});
assert.equal(echo.filters.bodyType,'pickup');assert.equal(echo.filters.exteriorColor,'green');assert.equal(echo.question,'');
console.log('PASS: detailed green-truck request, follow-ups, exact provider filters, missing evidence, and strict AI execution');

for(const text of ['Keep this M5 search but lower the mileage.','Lower mileage','Find fewer miles for my M5 under $30,000']){
 let called=false;
 const current=filterSchema.parse({make:'BMW',model:'M5',maxPrice:30000});
 const clarification=await interpretSearch(text,current,[],{apiKey:'test-only',request:async()=>{called=true;throw Error('Should clarify before provider call')}});
 assert.equal(called,false);assert.equal(clarification.action,'clarify');assert.match(clarification.question,/maximum mileage/);assert.deepEqual(clarification.filters,current);
}
const explicit=await interpretSearch('lower the mileage to 40,000 miles',initialFilters,[],{apiKey:'test-only',request:async()=>Response.json({choices:[{message:{tool_calls:[{function:{name:'update_search',arguments:JSON.stringify({filters:{...initialFilters,maxMiles:40000},question:'',action:'search'})}}]}}]})});
assert.equal(explicit.filters.maxMiles,40000);assert.equal(explicit.action,'search');
