import {photoUrls} from './vehicle-photos';
import {detailFilterShape,detailsMatch,detailChanges,type VehicleDetails} from './vehicle-requirements';
import {locationMatches,type ListingLocation} from './location';
import { z } from 'zod';
import {canonicalVehicle,vehicleNameKey,trimMatches} from './vehicle-identity';
import type {PriceReview} from './price-review';
export const filterSchema=z.object({...detailFilterShape,make:z.string().max(40).default(''),model:z.string().max(60).default(''),trim:z.string().max(60).default(''),maxPrice:z.number().int().min(500).max(1000000).nullable().default(null),maxMiles:z.number().int().min(0).max(1000000).nullable().default(null),minYear:z.number().int().min(1900).max(2030).nullable().default(null),zip:z.string().regex(/^(?:\d{5})?$/).default(''),radiusMiles:z.number().int().min(1).max(3000).default(100),location:z.object({zip:z.string(),city:z.string(),state:z.string(),latitude:z.number(),longitude:z.number()}).nullable().default(null),state:z.string().regex(/^([A-Z]{2})?$/).default(''),seller:z.enum(['any','private','dealer']).default('any'),awd:z.boolean().default(false),cleanTitle:z.boolean().default(false),shippingAllowance:z.number().int().min(0).max(20000).default(0),limit:z.number().int().min(1).max(50).default(12)}).transform(canonicalVehicle);
export type Filters=z.infer<typeof filterSchema>;
export const initialFilters:Filters=filterSchema.parse({});
export type ListingOffer={priceWarning?:string|null;source:string;url:string;price:number;fees:number|null;checkedAt:string};
export type Listing=VehicleDetails&ListingLocation&{priceReview?:PriceReview;priceWarning?:string|null;offers?:ListingOffer[];photos?:string[];photosSourceUrl?:string;id:string;vin:string|null;title:string;make:string;model:string;trim:string;year:number|null;price:number;miles:number|null;state:string;city:string;source:string;url:string;photo:string|null;seller:'private'|'dealer'|'unknown';drive:string;titleStatus:string;condition:string;history:string;fees:number|null;checkedAt:string;sourceUpdatedAt:string|null;concerns:string[];comparables:{id:string;title:string;price:number;miles:number|null;url:string}[];median:number|null;reason:string;total:number};
export type Source={name:string;status:'ready'|'unavailable'|'searched'|'error';detail:string;count?:number;total?:number;inspected?:number;hasMore?:boolean};
export type Message={role:'user'|'assistant';text:string;ids?:string[];target?:'compare';at:number};
export function availableComparisonIds(rows:Listing[],ids:string[]){const available=new Set(rows.map(r=>r.id));return [...new Set(ids)].filter(id=>available.has(id));}
export type SearchCursor={dealer:number|null;private:number|null;auction:number|null;autodev:string|null;autotrader?:number|null;retailers?:number|null};
export const firstCursor=():SearchCursor=>({dealer:0,private:0,auction:0,autodev:'1',autotrader:0,retailers:0});
export type Workspace={searchId?:string;nextCursor?:SearchCursor|null;batch?:number;filters:Filters;messages:Message[];listings:Listing[];saved:Listing[];compare:string[];comparisonCars?:Listing[];sources:Source[];pending:Filters|null;searchedAt:string|null};
export const blankWorkspace=():Workspace=>({filters:{...initialFilters},messages:[],listings:[],saved:[],compare:[],sources:[],pending:null,searchedAt:null});
export function safeUrl(v:unknown):string|null {
  if(typeof v!=='string')return null;
  try {
    const u=new URL(v);
    if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return null;
    for(const k of [...u.searchParams.keys()])if(/^(api[-_]?key|access_token|token|authorization)$/i.test(k))u.searchParams.delete(k);
    return u.href;
  }catch{return null}
}
export function listingKey(r:Listing){
  if(r.vin?.trim().length===17)return 'vin:'+r.vin.trim().toUpperCase();
  const u=new URL(r.url);
  for(const k of [...u.searchParams.keys()])if(/^utm_|^(gclid|fbclid|msclkid)$/i.test(k))u.searchParams.delete(k);
  u.searchParams.sort();return 'url:'+u.href;
}
export function deduplicate(rows:Listing[]){
  const groups=new Map<string,Listing[]>();
  for(const r of rows){const key=listingKey(r);groups.set(key,[...(groups.get(key)??[]),r])}
  return [...groups.values()].map(group=>{
    const ordered=[...group].sort((a,b)=>Number(!!a.priceWarning)-Number(!!b.priceWarning)||(a.price+(a.fees??0))-(b.price+(b.fees??0))||Date.parse(b.checkedAt)-Date.parse(a.checkedAt));
    const offers=new Map<string,ListingOffer>();
    for(const row of ordered)for(const offer of row.offers??[{source:row.source,url:row.url,price:row.price,fees:row.fees,checkedAt:row.checkedAt,priceWarning:row.priceWarning}])if(!offers.has(offer.url))offers.set(offer.url,offer);
    return {...ordered[0],photos:photoUrls(...ordered.filter(row=>row.url===ordered[0].url&&row.photosSourceUrl===row.url).flatMap(row=>[row.photo,row.photos])),photosSourceUrl:ordered[0].url,offers:[...offers.values()]};
  });
}
const eq=(a:string,b:string)=>vehicleNameKey(a)===vehicleNameKey(b);
export function matches(r:Listing,f:Filters){return locationMatches(r,f)&&detailsMatch(r,f)&&r.priceReview?.status!=='unavailable'&&(!r.priceWarning||f.maxPrice===null)&&(!f.make||eq(r.make,f.make))&&(!f.model||eq(r.model,f.model))&&trimMatches(r.trim,f.trim)&&(f.maxPrice===null||r.price+(r.fees??0)+f.shippingAllowance<=f.maxPrice)&&(f.maxMiles===null||(r.miles!==null&&r.miles<=f.maxMiles))&&(f.minYear===null||(r.year!==null&&r.year>=f.minYear))&&(!f.state||eq(r.state,f.state))&&(f.seller==='any'||r.seller===f.seller)&&(!f.awd||/^(awd|all wheel drive|all-wheel drive)$/i.test(r.drive))&&(!f.cleanTitle||r.titleStatus==='clean')}
export function rank(rows:Listing[],pool:Listing[],f:Filters,resultLimit=f.limit){const comparablePool=deduplicate(pool).filter(c=>!c.priceWarning&&c.titleStatus!=='unknown'&&c.history!=='unknown');return deduplicate(rows.filter(r=>matches(r,f))).map(r=>{const comps=comparablePool.filter(c=>!r.priceWarning&&!c.priceWarning&&listingKey(c)!==listingKey(r)&&eq(c.make,r.make)&&eq(c.model,r.model)&&!!r.trim&&eq(c.trim,r.trim)&&c.year!==null&&r.year!==null&&Math.abs(c.year-r.year)<=1&&c.miles!==null&&r.miles!==null&&Math.abs(c.miles-r.miles)<=10000&&!!r.state&&eq(c.state,r.state)&&r.seller!=='unknown'&&c.seller===r.seller&&r.condition!=='unknown'&&c.condition===r.condition&&r.titleStatus!=='unknown'&&c.titleStatus===r.titleStatus&&r.history!=='unknown'&&c.history===r.history);const prices=comps.map(c=>c.price).sort((a,b)=>a-b);const med=prices.length>=5?(prices[Math.floor((prices.length-1)/2)]+prices[Math.ceil((prices.length-1)/2)])/2:null;return {...r,total:r.price+(r.fees??0)+f.shippingAllowance,median:med,comparables:med?comps.slice(0,10).map(c=>({id:c.id,title:c.title,price:c.price,miles:c.miles,url:c.url})):[],reason:r.priceWarning?'The reported amount needs seller confirmation. This car is not eligible for a deal score or a budget match.':med?`${r.price<med?'Below':'At or above'} the $${Math.round(med).toLocaleString()} median asking price of ${comps.length} comparable listings. Asking prices are not sale prices.`:'Matches your filters. There is not enough condition-matched comparable evidence to call this a good deal.',concerns:Array.from(new Set([...r.concerns,...(r.priceWarning?[r.priceWarning]:[]),...(r.fees===null?['Seller fees are unknown; final price may exceed your budget.']:[]),...(r.titleStatus==='unknown'?['Title status has not been provided.']:[]),...(r.history==='unknown'?['Accident and service history are unknown.']:[]),...(f.shippingAllowance?['Shipping allowance is your estimate, not a transport quote.']:[])]))}}).sort((a,b)=>{if(!!a.priceWarning!==!!b.priceWarning)return a.priceWarning?1:-1;if(a.median&&b.median)return (a.total/a.median)-(b.total/b.median);return a.total-b.total}).slice(0,resultLimit)}
export function relaxed(a:Filters,b:Filters){return (!!a.zip&&(a.zip!==b.zip||b.radiusMiles>a.radiusMiles))||detailChanges(a,b)||(a.maxPrice!==null&&(b.maxPrice===null||b.maxPrice>a.maxPrice))||(a.maxMiles!==null&&(b.maxMiles===null||b.maxMiles>a.maxMiles))||(a.minYear!==null&&(b.minYear===null||b.minYear<a.minYear))||(a.cleanTitle&&!b.cleanTitle)||(a.awd&&!b.awd)||(a.seller!=='any'&&a.seller!==b.seller)||(!!a.state&&a.state!==b.state)||(!!a.make&&a.make!==b.make)||(!!a.model&&a.model!==b.model)||(!!a.trim&&a.trim!==b.trim)||(b.shippingAllowance<a.shippingAllowance)}
export const money=(n:number)=>'$'+Math.round(n).toLocaleString('en-US');

// A review flag, not an estimate of a car's value. Preserve the provider amount.
export function priceWarning(price:number,year:number|null){
  const recent=year!==null&&year>=new Date().getUTCFullYear()-7;
  return price<1000||(recent&&price<3000)?'Unusually low provider amount. It may be a payment, deposit, fee, data error, or a vehicle with significant problems. Confirm the full purchase price with the seller.':null;
}
