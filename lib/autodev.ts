import {photoUrls} from './vehicle-photos';
import {knownFeatures} from './vehicle-requirements';
import {safeUrl,priceWarning,type Filters,type Listing} from './domain';

// Auto.dev v2 documented endpoint. One bounded request per search, no photo fan-out.
export function autoDevUrl(f:Filters,position='1'){
  const u=new URL('https://api.auto.dev/listings');
  u.searchParams.set('limit','20');
  if (/^\d+$/.test(position)) u.searchParams.set('page',position);
  else u.searchParams.set('cursor',position.slice(7));
  u.searchParams.set('retailListing.used','true');
  u.searchParams.set('sort','price.asc');
  if(f.exteriorColor)u.searchParams.set('vehicle.exteriorColor',f.exteriorColor);
  if(f.bodyType)u.searchParams.set('vehicle.bodyStyle',f.bodyType);
  if(f.transmission)u.searchParams.set('vehicle.transmission',f.transmission);
  if(f.fuel)u.searchParams.set('vehicle.fuel',f.fuel);
  for(const field of ['make','model','trim'] as const)if(f[field])u.searchParams.set(`vehicle.${field}`,f[field]);
  if(f.zip){u.searchParams.set('zip',f.zip);u.searchParams.set('distance',String(f.radiusMiles));}
  if(f.state)u.searchParams.set('retailListing.state',f.state);
  if(f.maxPrice!==null)u.searchParams.set('retailListing.price',`1-${Math.max(1,f.maxPrice-f.shippingAllowance)}`);
  if(f.maxMiles!==null)u.searchParams.set('retailListing.miles',`0-${f.maxMiles}`);
  if(f.minYear!==null)u.searchParams.set('vehicle.year',`${f.minYear}-2030`);
  return u;
}

function nonnegative(v:unknown){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=0?n:null}
export function normalizeAutoDev(x:any):Listing|null{
  if(!x||typeof x!=='object')return null;
  const v=x.vehicle??{},r=x.retailListing??{};
  const url=safeUrl(r.vdp),price=nonnegative(r.price);
  // Do not substitute API record URLs, financing terms, or new vehicles.
  if(!url||price===null||price<=0||r.used!==true)return null;
  const title=[v.year,v.make,v.model,v.trim].filter(Boolean).join(' ');
  if(!title||/down payment|per month|\/mo\b|monthly payment/i.test(title))return null;
  const vin=typeof v.vin==='string'?v.vin:typeof x.vin==='string'?x.vin:null;
  return {evidenceText:[title,String(r.description??''),...(Array.isArray(v.features)?v.features.map((x:any)=>String(x?.name??x)):[])].join('\n'),exteriorColor:String(v.exteriorColor??''),bodyType:String(v.bodyStyle??''),cabStyle:String(v.bodyStyle??''),fuel:String(v.fuel??''),transmission:String(v.transmission??''),features:knownFeatures(v.features),id:`autodev:${vin??url}`,vin,title,make:String(v.make??''),model:String(v.model??''),trim:String(v.trim??''),year:nonnegative(v.year),priceWarning:priceWarning(price,nonnegative(v.year)),price,miles:nonnegative(r.miles),state:String(r.state??'').toUpperCase(),city:String(r.city??''),source:new URL(url).hostname,url,photo:safeUrl(r.primaryImage),photosSourceUrl:url,photos:photoUrls(r.primaryImage),seller:'dealer',drive:String(v.drivetrain??''),titleStatus:'unknown',condition:'used',history:'unknown',fees:null,checkedAt:new Date().toISOString(),sourceUpdatedAt:typeof x.updatedAt==='string'?x.updatedAt:null,concerns:['Auto.dev reports this dealer listing; confirm availability and full cash asking price with the seller.'],comparables:[],median:null,reason:'',total:price};
}
