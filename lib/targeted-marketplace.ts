import type {Filters,Listing,Source} from './domain';

// Verified against a capped live run on 2026-09-29. The keyword actor ignores
// this trim; CarMax's own model URL selects it before the paid result limit.
export const TARGETED_ACTOR='HqZudyEggO98WZvlN';
export function targetedMarketplaceInput(f:Filters){
 if(f.seller==='private'||f.make!=='BMW'||f.model!=='5 Series'||!/^M550i(?:\s+xDrive)?$/i.test(f.trim))return null;
 return {searchUrls:[{url:'https://www.carmax.com/cars/bmw/m550'}],maxResultsPerUrl:10,maxResults:10};
}
export function targetedMarketplaceSources(rows:Listing[],done:boolean):Source[]{
 const count=rows.filter(row=>row.source==='CarMax').length;
 return [{name:'CarMax',status:count?'searched':done?'error':'ready',count,inspected:count,detail:count?`${count} usable listings returned through a targeted CarMax search. Exact requirements are checked before display. Partial coverage; result and free-credit limits apply.`:done?'The targeted CarMax search returned no usable listings. Other connected marketplaces can be checked separately.':'Targeted CarMax search is running.'}];
}
