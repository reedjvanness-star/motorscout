import assert from 'node:assert/strict';
import {normalizeMarketplace,marketplaceInput,marketplaceSources,verifyFreeAccount,apifyRequest} from '../lib/apify';
import {initialFilters,rank} from '../lib/domain';
const raw={source:'CarGurus',url:'https://www.cargurus.com/details/451198217',brand:{name:'Toyota'},model:'Camry',vehicleModelDate:'2023',vehicleConfiguration:'LE FWD',vehicleIdentificationNumber:'4T1C11AK5PU786764',offers:{price:22487,priceCurrency:'USD'},mileageFromOdometer:{value:58126,unitCode:'SMI'},color:'Green',bodyType:'Sedan',itemLocation:{address:{addressLocality:'Capitola',addressRegion:'CA'}},sellerType:'dealer'};
const row=normalizeMarketplace(raw)!;assert.equal(row.price,22487);assert.equal(row.miles,58126);assert.equal(row.source,'CarGurus');
for(const url of ['https://www.autotrader.com/cars-for-sale/vehicle/782603846','https://www.autotrader.com/cars-for-sale/vehicledetails.xhtml?listingId=782603846']){
 const car=normalizeMarketplace({...raw,url})!;assert.equal(car.source,'AutoTrader');assert.equal(car.price,22487);assert.equal(car.url,url);
}
for(const url of ['https://www.autotrader.com/cars-for-sale/all-cars','https://www.autotrader.com/cars-for-sale/vehicle/no-id','https://www.autotrader.com/cars-for-sale/vehicledetails.xhtml','https://autotrader.com.evil.test/cars-for-sale/vehicle/782603846'])assert.equal(normalizeMarketplace({...raw,url}),null);
assert.equal(normalizeMarketplace({...raw,url:'https://cargurus.com.evil.test/details/1'}),null);
assert.equal(normalizeMarketplace({...raw,url:'https://www.cargurus.com/'}),null);
assert.equal(normalizeMarketplace({...raw,offers:{price:200,priceCurrency:'EUR'}}),null);
assert.equal(normalizeMarketplace({...raw,itemCondition:'https://schema.org/NewCondition'}),null);
assert.equal(normalizeMarketplace({...raw,mileageFromOdometer:{value:10000,unitCode:'unknown'}})!.miles,null);
assert.equal(rank([row],[row],{...initialFilters,make:'Toyota',model:'Camry',exteriorColor:'green'}).length,1);
assert.equal(rank([row],[row],{...initialFilters,exteriorColor:'black'}).length,0);
assert.equal(rank([row],[row],{...initialFilters,maxPrice:20000}).length,0);
assert.equal(rank([row],[row],{...initialFilters,features:['heated seats']}).length,0,'missing equipment cannot be inferred');
assert.equal(rank([{...row,evidenceText:'Overland build. Black leather interior.'}],[],{...initialFilters,requiredTerms:['overland','black leather']}).length,1);
assert.equal(rank([{...row,evidenceText:'No overland equipment. Black leather optional extra.'}],[],{...initialFilters,requiredTerms:['overland','black leather']}).length,0,'negated or optional specifications are not exact matches');
assert(!marketplaceSources([row],true).some(s=>s.name==='AutoTrader'),'Apify cannot overwrite the separate AutoTrader feed status');
const input=marketplaceInput({...initialFilters,make:'BMW',model:'M4',trim:'Competition',exteriorColor:'green',maxPrice:60000,shippingAllowance:1000,maxMiles:40000});
assert.equal(input.priceMax,59000);assert.equal(input.maxResults,60);assert.equal(input.maxResultsPerUrl,20);assert.equal(input.sources.length,3);assert(input.keywords[0].includes('Competition green'));
assert.equal(input.craigslistRegions.length,0,'Craigslist must not consume the other sources shared result cap');
const regional=marketplaceInput(initialFilters,1);
assert.equal(regional.craigslistRegions.length,20);
assert(regional.craigslistRegions.every(r=>/^[a-z0-9-]+$/.test(r)),'actor rejects full Craigslist hostnames before starting any source');
assert(marketplaceInput({...initialFilters,state:'CO'},1).craigslistRegions.includes('boulder'));
assert(marketplaceInput({...initialFilters,state:'CA'},1).sources.includes('craigslist'));
assert.deepEqual(marketplaceInput(initialFilters,1).sources,['craigslist']);
assert(marketplaceSources([],true,'CA',1).some(s=>s.name==='Craigslist'));
const craigslist=normalizeMarketplace({...raw,url:'https://www.craigslist.org/view/d/englewood-good-condition-great-price/GrTE7iG08RGWCN0SHm89jw',color:'custom',additionalProperties:{exteriorColor:'Champagne Mica'},fuelType:'gas',itemLocation:{address:{addressRegion:'CO'}},offers:{price:8750,priceCurrency:'USD'}})!;
assert.equal(craigslist.source,'Craigslist');assert.equal(craigslist.price,8750);assert.equal(craigslist.exteriorColor,'Champagne Mica');assert.equal(craigslist.fuel,'gasoline');
assert.equal(normalizeMarketplace({...raw,url:'https://craigslist.org.evil.test/view/d/car/123'}),null);
assert.equal(normalizeMarketplace({...raw,url:'https://www.craigslist.org/search/cta'}),null);
assert(marketplaceSources([craigslist],true,'CO',1).find(s=>s.name==='Craigslist')!.detail.includes('Targeted regions'));
await assert.rejects(()=>verifyFreeAccount('test',async()=>Response.json({data:{id:'account',isPaying:true,plan:{monthlyBasePriceUsd:29}}})),/Free account/);
assert.equal(await verifyFreeAccount('test',async(_url,init)=>{assert.equal(init?.redirect,'manual');return Response.json({data:{id:'account',isPaying:false,plan:{monthlyBasePriceUsd:0}}})}),'account');
await assert.rejects(()=>apifyRequest('secret','users/me',{},async()=>new Response(null,{status:302,headers:{Location:'https://untrusted.example'}})),/302/);
await assert.rejects(()=>apifyRequest('secret','users/me',{},async()=>new Response(null,{status:401})),/401/);
console.log('PASS: marketplace normalization, exact filters, missing specs, source attribution and free-account gate');

for(const host of ['sfbay','newyork','denver'])assert(normalizeMarketplace({...raw,url:`https://${host}.craigslist.org/sfc/cto/d/example/1234567890.html`}));

assert(!marketplaceSources([],true,'CA',0).some(s=>s.name==='Craigslist'));
const plannedRegions:string[]=[];
for(let batch=1;batch<=21;batch++)plannedRegions.push(...marketplaceInput(initialFilters,batch).craigslistRegions);
assert.equal(plannedRegions.length,413);assert.equal(new Set(plannedRegions).size,413);

const explicitDealer=normalizeMarketplace({...raw,sellerType:undefined,seller:{'@type':'AutoDealer'}})!;
assert.equal(explicitDealer.seller,'dealer','explicit top-level AutoDealer is seller evidence');
assert.equal(rank([explicitDealer],[],{...initialFilters,seller:'dealer'}).length,1);
for(const seller of [undefined,{}, {name:'Example Dealer'}, {'@type':'Organization'}, {'@type':'Person'}]){
 const unknownSeller=normalizeMarketplace({...raw,sellerType:undefined,seller})!;
 assert.equal(unknownSeller.seller,'unknown','seller names and generic organization/person types cannot establish seller category');
 assert.equal(rank([unknownSeller],[],{...initialFilters,seller:'dealer'}).length,0);
}
assert.equal(normalizeMarketplace({...raw,sellerType:undefined,offers:{...raw.offers,seller:{'@type':'AutoDealer'}}})!.seller,'dealer','offer seller evidence still works');

const optionalEquipment=normalizeMarketplace({...raw,description:'Heated seats available separately as an optional extra.'})!;
assert.equal(rank([optionalEquipment],[],{...initialFilters,features:['heated seats']}).length,0,'marketplace description cannot turn optional equipment into an exact feature match');

for(const status of ['SoldOut','OutOfStock','Discontinued'])for(const prefix of ['', 'http://schema.org/', 'https://schema.org/']){
 const offer={...raw.offers,availability:prefix+status};
 assert.equal(normalizeMarketplace({...raw,offers:offer}),null,`explicit unavailable offer is excluded: ${prefix+status}`);
 assert.equal(normalizeMarketplace({...raw,offers:[offer]}),null,'singleton offer arrays enforce availability too');
}
for(const availability of [undefined,'InStock','http://schema.org/InStock','https://schema.org/InStock','Unknown','https://example.test/SoldOut']){
 const offer={...raw.offers,...(availability===undefined?{}:{availability})};
 for(const offers of [offer,[offer]]){
  const availableOrUnknown=normalizeMarketplace({...raw,offers});
  assert.ok(availableOrUnknown,'available or unrecognized availability preserves the listing');
  assert.equal(availableOrUnknown.price,raw.offers.price);
  assert(availableOrUnknown.concerns.some(note=>note.includes('confirm price, fitted equipment and availability')),'normalizing a listing does not claim confirmed stock');
 }
}

const carmaxRaw={...raw,url:'https://www.carmax.com/car/29124199',brand:{name:'BMW'},model:'M550',vehicleConfiguration:'I xDrive',name:'2022 BMW M550 I xDrive',fuelType:'Gas',vehicleTransmission:'Automatic',driveWheelConfiguration:'All Wheel Drive',bodyType:'4D Sedan',image:[{type:'image',fullSizeUrl:'https://img2.carmax.com/assets/29124199/hero.jpg',thumbnailUrl:'https://img2.carmax.com/assets/29124199/thumb.jpg'},{type:'image',thumbnailUrl:'https://img2.carmax.com/assets/29124199/rear.jpg'}],additionalProperties:{isSaleable:true,isAvailableToTransact:true,isSold:false,isReserved:false,isComingSoon:false,features:[{name:'Heated Front Seats',installedOption:false},{name:'Apple CarPlay',installedOption:true}]}};
const carmax=normalizeMarketplace(carmaxRaw)!;
assert.equal(carmax.model,'5 Series');assert.equal(carmax.trim,'M550i xDrive');assert.equal(carmax.fuel,'gasoline');assert.equal(carmax.seller,'dealer');
assert.deepEqual(carmax.photos,['https://img2.carmax.com/assets/29124199/hero.jpg','https://img2.carmax.com/assets/29124199/rear.jpg']);assert.equal(carmax.photosSourceUrl,carmax.url);
assert(carmax.features!.includes('heated seats'),'standard fitted features remain evidence when installedOption is false');assert(carmax.features!.includes('Apple CarPlay'));
assert.equal(rank([carmax],[],{...initialFilters,make:'BMW',model:'5 Series',trim:'M550i',fuel:'gasoline',transmission:'automatic',drivetrain:'awd',bodyType:'sedan',features:['heated seats']}).length,1);
for(const negative of [{isSaleable:false},{isAvailableToTransact:false},{isSold:true},{isReserved:true},{isComingSoon:true}]){
 assert.equal(normalizeMarketplace({...carmaxRaw,offers:{...raw.offers,availability:'https://schema.org/InStock'},additionalProperties:{...carmaxRaw.additionalProperties,...negative}}),null);
 assert.equal(normalizeMarketplace({...carmaxRaw,additionalProperties:{...carmaxRaw.additionalProperties,statusDetails:negative}}),null,'nested negative status overrides positive flattened flags');
}
assert(normalizeMarketplace({...carmaxRaw,additionalProperties:{}}),'missing status is unverified, not assumed unavailable');
assert.equal(normalizeMarketplace({...carmaxRaw,vehicleConfiguration:''})!.model,'M550','do not infer the i badge when its explicit trim evidence is missing');
assert.equal(normalizeMarketplace({...carmaxRaw,model:'550',vehicleConfiguration:'I xDrive'})!.model,'550','non-M550 does not acquire the performance variant');
