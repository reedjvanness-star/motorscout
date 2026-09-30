import {safeUrl,type Listing} from './domain';

/** Accept only an explicit CARFAX report URL found in a seller/provider listing. */
export function carfaxReportUrl(...values:unknown[]):string|undefined{
 return findReport(null,values);
}

// This also recovers links in descriptions retained before the report field existed.
export function listingCarfaxReportUrl(car:Pick<Listing,'vin'|'historyReportUrl'|'evidenceText'>){
 return findReport(car.vin,[car.historyReportUrl,car.evidenceText]);
}

function findReport(vin:string|null,values:unknown[]):string|undefined{
 for(const value of values){
  if(typeof value!=='string')continue;
  const decoded=value.replace(/&amp;|&#0*38;|&#x0*26;/gi,'&');
  const candidates=[...decoded.matchAll(/https?:\/\/[^\s<>"']+/gi)].map(match=>match[0].replace(/[),.;]+$/,''));
  for(const candidate of candidates){
   const url=safeUrl(candidate);if(!url)continue;
   const parsed=new URL(url);
   if(!['carfax.com','www.carfax.com'].includes(parsed.hostname.toLowerCase()))continue;
   if(!/^\/(?:VehicleHistory\/p\/Report\.cfx|vehiclehistory\/report)\/?$/i.test(parsed.pathname)||!parsed.search)continue;
   const reportVin=[...parsed.searchParams].find(([key])=>key.toLowerCase()==='vin')?.[1];
   if(vin&&reportVin&&reportVin.toUpperCase()!==vin.toUpperCase())continue;
   return url;
  }
 }
 return undefined;
}
