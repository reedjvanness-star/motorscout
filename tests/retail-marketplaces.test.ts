import assert from 'node:assert/strict';
import {normalizeMarketplace,retailerMarketplaceInput,retailerMarketplaceSources,marketplaceSources} from '../lib/apify';
import {initialFilters,rank} from '../lib/domain';

const raw={brand:{name:'Toyota'},model:'Camry',vehicleModelDate:2022,vehicleConfiguration:'LE',offers:{price:23998,priceCurrency:'USD'},mileageFromOdometer:{value:35000,unitCode:'SMI'},color:'blue',sellerType:'dealer',itemCondition:'https://schema.org/UsedCondition'};
const rows=[['https://www.carmax.com/car/70002037','CarMax'],['https://www.carvana.com/vehicle/1234567','Carvana']].map(([url,source])=>{
 const row=normalizeMarketplace({...raw,url})!;assert(row);assert.equal(row.source,source);assert.equal(row.price,23998);return row;
});
for(const url of ['https://www.carmax.com/cars/toyota','https://carmax.com.evil.test/car/123','https://www.carvana.com/cars/toyota','https://www.carvana.com/vehicle/no-id'])assert.equal(normalizeMarketplace({...raw,url}),null);
assert.equal(normalizeMarketplace({...raw,url:rows[0].url,itemCondition:'https://schema.org/NewCondition'}),null);
assert.equal(rank(rows,rows,{...initialFilters,maxPrice:20000}).length,0);
assert.equal(rank(rows,rows,{...initialFilters,exteriorColor:'green'}).length,0);
const input=retailerMarketplaceInput({...initialFilters,make:'Toyota',model:'Camry',maxPrice:25000,shippingAllowance:1000});
assert.deepEqual(input.sources,['carvana']);assert.equal(input.maxResults,15);assert.equal(input.priceMax,24000);
assert.deepEqual(input.craigslistRegions,[]);
const blocked={name:'Carvana',status:'error' as const,detail:'MarketCheck HTTP 429'};
assert.equal(retailerMarketplaceSources(rows,true,[blocked])[0].status,'searched');
assert(retailerMarketplaceSources([],true,[blocked])[0].detail.includes('429'));
const working={name:'Carvana',status:'searched' as const,count:3,detail:'MarketCheck returned listings'};
assert.equal(retailerMarketplaceSources([],true,[working]).find(s=>s.name==='Carvana'),working);
assert(!marketplaceSources(rows,true).some(s=>s.name==='CarMax'),'general source batch cannot overwrite retailer results');
console.log('PASS: independent retail inputs, URLs, source status and strict filters');

// Real Carvana shape omits sellerType but supplies an AutoDealer offer.
const carvana=normalizeMarketplace({...raw,url:rows[1].url,sellerType:undefined,offers:{price:28990,priceCurrency:'USD',seller:{'@type':'AutoDealer',name:'Carvana'}},vehicleConfiguration:'LE Sedan 4D',color:'Silver'})!;
assert.equal(carvana.seller,'dealer');
assert.equal(rank([carvana],[carvana],{...initialFilters,seller:'dealer'}).length,1);
const exact={...initialFilters,make:'Toyota',model:'Camry',trim:'XSE',exteriorColor:'green'};
assert.deepEqual(retailerMarketplaceInput(exact).keywords,[]);
assert.equal(rank([carvana],[carvana],exact).length,0,'broad discovery must not relax exact trim/color');
assert(!retailerMarketplaceSources([],true,[]).some(s=>['CarMax','AutoTrader'].includes(s.name)));
