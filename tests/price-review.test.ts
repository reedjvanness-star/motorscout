import assert from 'node:assert/strict';
import {inspectListingPage,applyPriceReview,checkListingPrice} from '../lib/price-review';
import {normalizeMarketcheck} from '../lib/marketcheck';
import {initialFilters,rank} from '../lib/domain';
import {checkedFullPrice} from '../lib/price-safety';
const car=normalizeMarketcheck({id:'price-test',vin:'3MW59FT06T8G07697',price:7500,vdp_url:'https://www.pacificautocenter.com/used-Fontana-2026-BMW-3+Series-M340i-3MW59FT06T8G07697',build:{make:'BMW',model:'3 Series',trim:'M340i',year:2026}},false)!;
const html=(price:number,vin=car.vin)=>`<p>VIN: ${vin} $7,500 SAVINGS Internet Price $${price} Monthly payment $850</p><script type="application/ld+json">${JSON.stringify({'@type':'Vehicle',vehicleIdentificationNumber:vin,offers:{price,priceCurrency:'USD'}})}</script>`;
const review=inspectListingPage(car,html(59580));
assert.equal(review.sourcePrice,59580);assert.equal(review.status,'corrected');
const corrected=applyPriceReview(car,review);assert.equal(corrected.price,59580);
assert(checkedFullPrice(corrected));
for(const status of ['matched','corrected'] as const){
 for(const checkedAt of ['invalid',new Date(Date.now()+3600000).toISOString(),new Date(Date.now()-86400000).toISOString()]){
  const stale={...review,status,checkedAt};
  const result=applyPriceReview({...car,url:'https://seller.example/car'},stale);
  assert(result.priceWarning,'invalid or stale evidence cannot approve a price');
  assert.equal(rank([result],[],{...initialFilters,maxPrice:35000}).length,0);
  assert(!checkedFullPrice({...corrected,priceReview:stale}));
 }
}
assert.equal(rank([corrected],[],{...initialFilters,maxPrice:35000}).length,0,'recheck hard budget after correction');
assert.equal(inspectListingPage(car,html(50000,'DIFFERENTVIN12345')).status,'unverified','ignore recommended cars with another VIN');
assert.equal(inspectListingPage(car,`<p>VIN ${car.vin} Advertised price is an approximate amount to finance, based on $3K DP. Retail Price $27,200</p>`).status,'conditional');
assert.equal(inspectListingPage(car,`<p>VIN ${car.vin} Internet special pricing reflects a partial down payment of 25%. Internet Price $29,495</p>`).status,'conditional');
assert.equal(inspectListingPage(car,html(59580)+'<p>Payment estimate based on 10% down, 72 months.</p>').status,'corrected','ordinary payment calculator is not a conditional cash price');
assert.equal(inspectListingPage(car,`<p>VIN ${car.vin} Internet Price $30,000 Sale price $35,000</p>`).status,'unverified','conflicting labels must not produce invented price');
assert.equal(inspectListingPage(car,html(59580)+'<p>On Hold</p>').status,'unavailable');
const expired=applyPriceReview(car,review,Date.parse(review.checkedAt)+25*3600000);assert(expired.priceWarning);assert.equal(rank([expired],[],{...initialFilters,maxPrice:35000}).length,0);
const included=applyPriceReview({...car,fees:85},{...review,feesIncluded:true});assert.equal(included.total,59580,'do not charge an included fee twice');
const gone=await checkListingPrice(car,async()=>new Response(null,{status:410}));assert.equal(gone.status,'unavailable');assert.equal(rank([applyPriceReview(car,gone)],[],initialFilters).length,0);
let calls=0;await checkListingPrice({...car,url:'http://127.0.0.1/admin'},async()=>{calls++;return new Response('')});assert.equal(calls,0,'private/unapproved hosts never fetched');
const redirect=await checkListingPrice(car,async(_url,init)=>{assert.equal(init?.redirect,'manual');assert(!JSON.stringify(init).includes('Bearer'));return new Response(null,{status:302,headers:{Location:'https://evil.example/'}})});assert.equal(redirect.status,'unverified');
const kbb={...car,url:'https://www.kbb.com/cars-for-sale/vehicle/787474304',price:52000};
assert.equal(inspectListingPage(kbb,'<meta property="og:url" content="https://www.kbb.com/cars-for-sale/vehicle/787474304"><p>$1,257 below market Listing Price $51,500</p>').sourcePrice,51500);
console.log('PASS: exact vehicle prices, savings, financing, ambiguity, availability, expiration, fees, and request boundaries');
const highlight=(kind:string,amount:number,label:string)=>`<div class="vehiclePricingHighlight ${kind}"><span class="vehiclePricingHighlightAmount">$${amount}</span><span class="vehiclePricingHighlightLabel">${label}</span></div>`;
for(const reversed of [false,true]){
 const blocks=[highlight('dealerDiscount',1110,'Savings'),highlight('featuredPrice',8689,'Internet Price')];
 if(reversed)blocks.reverse();
 const page=`<p>VIN ${car.vin}</p><div id="buy-${car.vin}"><div>${blocks.join('')}</div></div><div id="lease-${car.vin}">${highlight('featuredPrice',299,'Price')}</div>`;
 assert.equal(inspectListingPage(car,page).sourcePrice,8689,'use exact VIN cash price, independent of discount ordering and lease price');
}
const unsafe=applyPriceReview({...car,url:'https://seller.example/used-Test-BMW-3MW59FT06T8G07697',priceReview:undefined});
const accessoryCar={...car,vin:'5TFAZ5CN6HX041878',url:'https://www.vandergriffacura.com/used/Toyota/test.htm',price:1998,year:2017,miles:66223,priceReview:undefined};
const accessoryPage='<p>VIN 5TFAZ5CN6HX041878 Vandergriff Price $26,999 Doc Fee $225 Price After Fees $27,224 Optional Accessories $1,998</p>';
const accessoryReview=inspectListingPage(accessoryCar,accessoryPage);
assert.equal(accessoryReview.sourcePrice,27224,'accessories never replace the full price after fees');
assert.equal(accessoryReview.feesIncluded,true);
assert.equal(rank([applyPriceReview(accessoryCar,accessoryReview)],[],{...initialFilters,maxPrice:10000}).length,0);
assert(applyPriceReview(accessoryCar).priceWarning,'unverified cars from the affected dealer stay out of budgets');
assert(unsafe.priceWarning,'unchecked discount-prone feed amounts require source verification');
assert.equal(rank([unsafe],[],{...initialFilters,maxPrice:35000}).length,0,'unknown full price cannot qualify under budget');

// A second real dealer used the accessory subtotal as the reported asking price.
const camry={...car,vin:'4T1BK1FK1CU510755',url:'https://www.vandergriffhonda.com/used/Toyota/test.htm',price:1028,year:2012,miles:163695,priceReview:undefined};
const camryPage='<p>VIN 4T1BK1FK1CU510755 Vandergriff Price $13,495 Doc Fee $225 Price After Fees $13,720 Optional Accessories $1,028</p>';
const camryReview=inspectListingPage(camry,camryPage);
assert.equal(camryReview.sourcePrice,13720);assert.equal(camryReview.feesIncluded,true);
assert(applyPriceReview(camry).priceWarning);
assert.equal(rank([applyPriceReview(camry)],[],{...initialFilters,maxPrice:10000}).length,0);
const checkedCamry=applyPriceReview(camry,camryReview);
assert.equal(checkedCamry.total,13720);
assert.equal(rank([checkedCamry],[],{...initialFilters,maxPrice:10000}).length,0);
assert.equal(rank([checkedCamry],[],{...initialFilters,maxPrice:15000}).length,1);
assert(applyPriceReview(camry,camryReview,Date.parse(camryReview.checkedAt)+86400000).priceWarning);

const loveford={...car,vin:'4S4GUHF63S3720418',url:'https://www.loveford.com/used-Loveland-2025-Subaru-Crosstrek-Sport-4S4GUHF63S3720418',price:1500};
const lovePage=`<p>VIN ${loveford.vin}</p><div id="buy-${loveford.vin}">${highlight('dealerDiscount',1500,'Savings')}${highlight('featuredPrice',29497,'Internet Price')}</div>`;
assert.equal((await checkListingPrice(loveford,async()=>new Response(lovePage,{headers:{'content-type':'text/html'}}))).sourcePrice,29497);
