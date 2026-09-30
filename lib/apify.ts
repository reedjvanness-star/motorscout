import {canonicalListingVehicle} from './vehicle-identity';
import {record, array} from './unknown-data';
import {providerEngineText} from './engine-specs';
import {photoUrls} from './vehicle-photos';
import {coordinates} from './location';
import {safeUrl,priceWarning,type Listing,type Filters,type Source} from './domain';
import {craigslistHost,marketplaceRegionBatch} from './marketplace-regions';
import {knownFeatures} from './vehicle-requirements';
import {carfaxReportUrl} from './carfax';

export const marketplaceNames={'cargurus.com':'CarGurus','cars.com':'Cars.com','truecar.com':'TrueCar','autotrader.com':'AutoTrader','craigslist.org':'Craigslist','facebook.com':'Facebook Marketplace','carmax.com':'CarMax','carvana.com':'Carvana'} as const;
export const FACEBOOK_ACTOR='qFR6mjgdwPouKLDvE';
export function facebookInput(f:Filters){return {keywordSearches:marketplaceRegionBatch('facebook',f.state).regions.map(locationSlug=>({query:[f.make,f.model,f.trim,f.exteriorColor,f.bodyType,...f.requiredTerms].filter(Boolean).join(' ')||'used cars',locationSlug})),fetchDetails:true,maxListings:10,availability:'available',deduplicateListings:true,...(f.maxPrice!==null?{maxPrice:Math.max(0,f.maxPrice-f.shippingAllowance)}:{})};}
export function normalizeFacebook(input:unknown):Listing|null{
 const x=record(input);
 if(!x||x.country_code!=='US'||x.condition!=='USED'||x.is_live!==true||x.is_sold!==false||x.is_pending!==false)return null;
 const url=safeUrl(x.url);if(!url||new URL(url).hostname.replace(/^www\./,'')!=='facebook.com')return null;
 const title=string(x.title),year=title.match(/^(19\d{2}|20\d{2})\b/)?.[1];
 const row=normalizeMarketplace({url:x.url,name:title,description:x.description,brand:x.vehicle_make_display_name,model:x.vehicle_model_display_name,vehicleModelDate:year,vehicleConfiguration:x.vehicle_trim_display_name,vehicleIdentificationNumber:x.vehicle_identification_number,offers:{price:record(x.price).amount,priceCurrency:record(x.price).currency},mileageFromOdometer:{value:record(x.vehicle_odometer_data).value,unitCode:record(x.vehicle_odometer_data).unit==='MILES'?'SMI':record(x.vehicle_odometer_data).unit==='KILOMETERS'?'KMT':''},color:x.vehicle_exterior_color,image:x.images,itemLocation:{address:{addressLocality:record(x.location).city,addressRegion:record(x.location).state}},fuelType:string(x.vehicle_fuel_type).toLowerCase()==='petrol'?'gasoline':string(x.vehicle_fuel_type).toLowerCase(),vehicleTransmission:string(x.vehicle_transmission_type).toLowerCase(),sellerType:record(x.seller).type==='dealership'?'dealer':record(x.seller).type==='private'?'private':'unknown',titleStatus:string(x.vehicle_title_status).toLowerCase(),datePosted:record(x.creation_time).iso,features:x.vehicle_features});
 if(row&&x.payment_time_period)row.priceWarning='This listing reports a recurring payment. Full purchase price is unconfirmed.';
 return row;
}
export const MARKETPLACE_RUN_CAP=0.04;
export const ACTOR='QvdSsCWLcIKzKSeu3';
const string=(v:unknown)=>typeof v==='string'?v:'';
const number=(v:unknown)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
export function marketplaceInput(f:Filters,batch=0){
 // Live actor schema accepts region slugs, despite its public docs showing hostnames.
 const regions=batch>0?marketplaceRegionBatch('automotive',f.state,batch-1).regions:[];
 return {...(f.zip?{zipCodes:[f.zip],distanceMiles:f.radiusMiles}:{}),sources:[...(batch===0?['cars-com','cargurus','truecar']:[]),...(regions.length?['craigslist']:[])],craigslistRegions:regions,make:f.make,model:f.model,
  keywords:[f.trim,f.exteriorColor,f.bodyType,...f.features,...f.requiredTerms].filter(Boolean).length?[[f.make,f.model,f.trim,f.exteriorColor,f.bodyType,...f.features,...f.requiredTerms].filter(Boolean).join(' ')]:[],
  // Request a useful pool; the unchanged provider charge cap and free-credit gate
  // remain authoritative. A larger result ceiling never guarantees this many cars.
  condition:'used',detail:'full',priceCurrency:'USD',mileageUnit:'mi',maxResultsPerUrl:20,maxResults:60,
  ...(f.minYear!==null?{yearFrom:f.minYear}:{}),...(f.maxPrice!==null?{priceMax:Math.max(0,f.maxPrice-f.shippingAllowance)}:{}),
  ...(f.maxMiles!==null?{mileageMax:f.maxMiles}:{}),...(f.transmission?{transmission:f.transmission}:{}),
  ...(f.fuel?{fuelType:f.fuel==='gasoline'?'gas':f.fuel}:{}),...(f.seller!=='any'?{sellerType:f.seller==='private'?'owner':'dealer'}:{}),...(f.cleanTitle?{titleStatus:'clean'}:{})};
}
// Carvana's provider builds invalid URLs when free-text specifications become path slugs.
// Discover by make/model, then apply every original requirement locally.
// Keep failed keyword-actor CarMax/AutoTrader paths disabled. The separately verified
// CarMax URL actor is selected by targeted-marketplace for supported searches.
export function retailerMarketplaceInput(f:Filters){
 return {...marketplaceInput(f),sources:['carvana'],keywords:[],craigslistRegions:[],maxResultsPerUrl:15,maxResults:15};
}
export function retailerMarketplaceSources(rows:Listing[],done:boolean,previous:Source[]):Source[]{
 return ['Carvana'].map(name=>{
  const count=rows.filter(row=>row.source===name).length,old=previous.find(s=>s.name===name);
  if(count)return {name,status:'searched',count,inspected:count,detail:`${count} listings returned through Apify, independently of MarketCheck. Exact requirements are checked before display. Partial coverage.`};
  if(old?.status==='searched'&&(old.count??0)>0)return old;
  const detail=done?'Apify returned no usable listings for this source. Coverage is unverified.':'Independent marketplace lookup is running.';
  return {name,status:done?'error':'ready',count:0,detail:detail+(old?.status==='error'?' '+old.detail.replace(/ Apify returned.*$/,''):'')};
 });
}
export function normalizeMarketplace(input:unknown):Listing|null{
 const x=record(input);
 if(!x||typeof x!=='object')return null;
 const url=safeUrl(x.url);if(!url)return null;
 const hostname=new URL(url).hostname.replace(/^www\./,'');
 const host=craigslistHost(hostname)?'craigslist.org':hostname;if(!(host in marketplaceNames))return null;
 const path=new URL(url).pathname;
 if(host==='autotrader.com'&&!/^\/cars-for-sale\/(?:vehicle\/\d+\/?|vehicledetails\.xhtml)$/.test(path))return null;
 if(host==='autotrader.com'&&path.endsWith('vehicledetails.xhtml')&&!/^\d+$/.test(new URL(url).searchParams.get('listingId')??''))return null;
 if(host==='carmax.com'&&!/^\/car\/\d+\/?$/.test(path))return null;
 if(host==='carvana.com'&&!/^\/vehicle\/\d+\/?$/.test(path))return null;
 if(!['autotrader.com','carmax.com','carvana.com'].includes(host)&&(host==='facebook.com'?!/^\/marketplace\/item\/\d+\/?$/.test(path):host==='craigslist.org'? !(/^\/view\/d\/[^/]+\/[A-Za-z0-9_-]+\/?$/.test(path)||/^\/(?:[a-z0-9-]+\/)?(?:cto|ctd)\/d\/[^/]+\/\d+\.html$/.test(path)):!(/\/details\/\d+/.test(path)||/\/vehicledetail\//.test(path)||/\/listing\//.test(path)||/\/vehicledetails\//.test(path))))return null;
 const extras=record(x.additionalProperties);
 if(host==='carmax.com'&&[extras,record(extras.statusDetails)].some(status=>status.isSaleable===false||status.isAvailableToTransact===false||status.isSold===true||status.isReserved===true||status.isComingSoon===true))return null;
 const offer=record(Array.isArray(x.offers)?x.offers.length===1?x.offers[0]:null:x.offers);
 // Only explicit unavailable states exclude inventory; missing status proves nothing.
 if(/^(?:https?:\/\/schema\.org\/)?(?:SoldOut|OutOfStock|Discontinued)$/.test(string(offer.availability)))return null;
 const price=number(offer?.price),year=number(x.vehicleModelDate);
 if(price===null||price<=0||offer?.priceCurrency!=='USD')return null;
 const condition=string(x.itemCondition||offer.itemCondition).toLowerCase();
 if(/newcondition|^new$/.test(condition))return null;
 const mileage=number(record(x.mileageFromOdometer).value),unit=record(x.mileageFromOdometer).unitCode;
 const miles=mileage===null?null:unit==='SMI'?mileage:unit==='KMT'?Math.ceil(mileage/1.609344):null;
 const make=string(record(x.brand).name||x.brand);let model=string(x.model),trim=string(x.vehicleConfiguration);
 // CarMax splits the explicit M550i badge across its model and trim fields.
 if(host==='carmax.com'&&/^BMW$/i.test(make)&&/^M550$/i.test(model)&&/^i(?:\s+xDrive)?$/i.test(trim.trim())){model='5 Series';trim='M550i'+(/xDrive/i.test(trim)?' xDrive':'');}
 if(!make||!model)return null;
 const title=string(x.name)||[year,make,model,trim].filter(Boolean).join(' '),description=string(x.description);
 const payment=/\b(?:per month|monthly payment|down payment|amount to finance)\b|\/mo\b/i.test(title);
 const vin=/^[A-HJ-NPR-Z0-9]{17}$/i.test(string(x.vehicleIdentificationNumber))?string(x.vehicleIdentificationNumber).toUpperCase():null;
 const address=record(record(x.itemLocation).address);
 const photos=photoUrls(x.image,...(host==='carmax.com'?array(x.image).filter(value=>record(value).type==='image').map(value=>record(value).fullSizeUrl??record(value).thumbnailUrl):[]));
 const features=[...array(x.features),...(host==='carmax.com'?array(extras.features):[])];
 const warning=payment?'This amount may be a payment or deposit. Full purchase price is unconfirmed.':priceWarning(price,year);
 return canonicalListingVehicle<Listing>({id:'marketplace:'+url,vin,url,source:marketplaceNames[host as keyof typeof marketplaceNames],title,make,model,trim,year,price,miles,
 postalCode:string(address.postalCode).slice(0,5),coordinates:coordinates(record(record(x.itemLocation).geo).latitude,record(record(x.itemLocation).geo).longitude),state:string(address.addressRegion).toUpperCase(),city:string(address.addressLocality),photo:photos[0]??null,photosSourceUrl:url,photos,
 exteriorColor:string(host==='craigslist.org'?record(x.additionalProperties).exteriorColor||x.color:x.color),bodyType:string(x.bodyType),cabStyle:string(x.bodyType),fuel:string(x.fuelType).toLowerCase()==='gas'?'gasoline':string(x.fuelType),transmission:string(x.vehicleTransmission),drive:string(x.driveWheelConfiguration).replace(/^https?:\/\/schema.org\//,''),
 engineText:providerEngineText(x.vehicleEngine,x.engine,{cylinders:x.numberOfCylinders}),evidenceText:[title,description,...features.map(v=>string(record(v).name??v))].join('\n'),historyReportUrl:carfaxReportUrl(x.carfax_report_url,x.carfaxReportUrl,description),features:knownFeatures([...features,...description.split(/[.;\n]/)]),seller:(['carmax.com','carvana.com'].includes(host)||x.sellerType==='dealer'||record(offer.seller)['@type']==='AutoDealer'||record(x.seller)['@type']==='AutoDealer')?'dealer':x.sellerType==='owner'||x.sellerType==='private'?'private':'unknown',
 titleStatus:['clean','rebuilt','salvage'].includes(string(x.titleStatus))?string(x.titleStatus) as Listing['titleStatus']:'unknown',condition:'used',history:'unknown',fees:null,priceWarning:warning,
 checkedAt:new Date().toISOString(),sourceUpdatedAt:string(x.datePosted)||null,concerns:['Marketplace listing retrieved through Apify; confirm price, fitted equipment and availability with the seller.'],comparables:[],median:null,reason:'',total:price});
}
export class MarketplaceError extends Error {}
export async function apifyRequest(key:string,path:string,init:RequestInit={},request:typeof fetch=fetch){
 let res:Response;
 try{res=await request('https://api.apify.com/v2/'+path,{...init,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},redirect:'manual',signal:AbortSignal.timeout(18000)});}catch(e){throw new MarketplaceError(`The server could not reach Apify (${e instanceof Error&&['TypeError','TimeoutError','AbortError'].includes(e.name)?e.name:'network error'}). Check the search status before retrying.`);}
 if(!res.ok)throw new MarketplaceError(`Marketplace provider request failed (${res.status}). Existing results are unchanged.`);
 return res.json() as Promise<unknown>;
}
export async function verifyFreeAccount(key:string,request:typeof fetch=fetch){
 const data=record(record(await apifyRequest(key,'users/me',{},request)).data);
 if(!data?.id||data.isPaying!==false||record(data.plan).monthlyBasePriceUsd!==0)throw new MarketplaceError(`This connection requires an Apify Free account. No paid plan will be used. Verification: account ${data?.id?'present':'missing'}, paying flag ${typeof data?.isPaying==='boolean'?String(data.isPaying):'missing'}, base price ${typeof record(data.plan).monthlyBasePriceUsd==='number'?record(data.plan).monthlyBasePriceUsd:'missing'}.`);
 return String(data.id);
}
export function marketplaceSources(rows:Listing[],terminal:boolean,state='',batch=0):Source[]{
 return Object.values(marketplaceNames).filter(name=>!['Facebook Marketplace','AutoTrader','CarMax','Carvana'].includes(name)&&(batch===0?name!=='Craigslist':name==='Craigslist')).map(name=>{const count=rows.filter(r=>r.source===name).length;const plan=marketplaceRegionBatch('automotive',state,Math.max(0,batch-1));const region=name==='Craigslist'?`Targeted regions ${plan.start+1}–${plan.start+plan.regions.length} of ${plan.total}. Result and free-credit limits apply; this is partial coverage. `:'';return {name,status:count?'searched':terminal?'error':'ready',count,inspected:count,detail:region+(count?`${count} listings returned through Apify. Your exact filters are applied before display.`:terminal?'The provider returned no usable listings for this source. Coverage is not verified.':'Marketplace search is still running.')};});
}
