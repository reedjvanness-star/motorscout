import {safeUrl} from './domain';

/** Accept only an explicit CARFAX report URL found in a seller/provider listing. */
export function carfaxReportUrl(...values:unknown[]):string|undefined{
 for(const value of values){
  if(typeof value!=='string')continue;
  const candidates=[...value.matchAll(/https?:\/\/[^\s<>"']+/gi)].map(match=>match[0].replace(/[),.;]+$/,''));
  for(const candidate of candidates){
   const url=safeUrl(candidate);if(!url)continue;
   const parsed=new URL(url);
   if(!['carfax.com','www.carfax.com'].includes(parsed.hostname.toLowerCase()))continue;
   if(!/report/i.test(parsed.pathname)||/^\/vehicle\/[A-HJ-NPR-Z0-9]{17}$/i.test(parsed.pathname))continue;
   return url;
  }
 }
 return undefined;
}
