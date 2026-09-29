import {rank,matches,type Listing,type Source,type SearchCursor,type Filters,type Workspace} from './domain';
import {applyPriceReview} from './price-review';

// Collect a useful pool automatically; still bounded by provider quotas and exhaustion.
export const AUTO_SEARCH_PAGES=15;
export const AUTO_SEARCH_MATCHES=300;
const cursorSources={dealer:'MarketCheck · dealer inventory',private:'MarketCheck · private sellers',auction:'MarketCheck · auctions',autodev:'Auto.dev · dealer inventory',autotrader:'AutoTrader',retailers:'MarketCheck · additional retailers'} as const;
const cursorSourceNames=new Set<string>(Object.values(cursorSources));
export function healthyCursor(cursor:SearchCursor|null|undefined,sources:Source[]):SearchCursor|null{
 if(!cursor)return null;
 const next={...cursor};
 for(const slot of Object.keys(cursorSources) as (keyof typeof cursorSources)[]){
  if(sources.some(source=>source.name===cursorSources[slot]&&source.status==='error'))next[slot]=null;
 }
 return Object.values(next).some(v=>v!==null)?next:null;
}
// Background batches skip failed feeds but must retain their position for an
// explicit retry after the shopper resolves a temporary provider limit.
export function preserveDeferredCursor(next:SearchCursor|null,previous:SearchCursor|null|undefined,sources:Source[]):SearchCursor|null{
 const merged:SearchCursor={dealer:null,private:null,auction:null,autodev:null,autotrader:null,retailers:null,...next};
 for(const slot of Object.keys(cursorSources) as (keyof typeof cursorSources)[]){
  if(previous?.[slot]!=null&&sources.some(source=>source.name===cursorSources[slot]&&source.status==='error'))Object.assign(merged,{[slot]:previous[slot]});
 }
 return Object.values(merged).some(value=>value!==null)?merged:null;
}
// Keep complete source records so a later price update can change the winning offer.
// Legacy composite rows retain only the alternate offer metadata actually stored.
export function mergeCollected(previous:Listing[],incoming:Listing[],filters:Filters){
 const rows=new Map<string,Listing>(),urls=new Map<string,string>();
 const checked=(row:Listing)=>Number.isFinite(Date.parse(row.checkedAt))?Date.parse(row.checkedAt):0;
 for(const row of [...previous,...incoming]){
  const previousId=rows.has(row.id)?row.id:urls.get(row.url);
  const old=previousId===undefined?undefined:rows.get(previousId);
  if(old&&checked(old)>checked(row))continue;
  if(old){rows.delete(old.id);urls.delete(old.url)}
  rows.set(row.id,row);urls.set(row.url,row.id);
 }
 const knownUrls=new Set([...rows.values()].map(row=>row.url));
 return [...rows.values()].map(row=>applyPriceReview({...row,
  // A full refreshed record supersedes any embedded legacy offer for that URL,
  // including updates that no longer satisfy the collection's hard filters.
  offers:row.offers?.filter(offer=>!knownUrls.has(offer.url)),
 })).filter(row=>matches(row,filters));
}
export function mergeSearch(previous:Listing[],incoming:Listing[],filters:Filters){
 const combined=mergeCollected(previous,incoming,filters);
 return rank(combined,combined,filters,combined.length);
}
export function mergeSources(previous:Source[],incoming:Source[]):Source[]{
 const merged=incoming.map(source=>{
  const old=previous.find(s=>s.name===source.name);
  if(!old)return source;
  // Dealer pagination includes unchecked marketplace placeholders, not fresh
  // evidence that previously imported marketplace results are unavailable.
  if(!cursorSourceNames.has(source.name)&&['unavailable','ready'].includes(source.status)&&source.inspected===undefined)return old;
  if(old.status==='error'&&source.status==='searched'&&source.inspected===undefined)return old;
  if(source.inspected===undefined&&old.inspected!==undefined&&source.status==='searched')return {...old,hasMore:false};
  return {...source,total:source.total??old.total,count:(old.count??0)+(source.count??0),inspected:(old.inspected??0)+(source.inspected??0)};
 });
 return [...merged,...previous.filter(old=>!incoming.some(source=>source.name===old.name))];
}

// Refinements keep the original collection so a shopper can change their mind.
export function collectWorkspace(w:Workspace,incoming:Listing[],reset=false){
 if(reset||!w.poolFilters)w.poolFilters={...w.filters};
 w.collected=mergeCollected(reset?[]:(w.collected??w.listings),incoming,w.poolFilters).slice(0,3000);
 w.listings=mergeSearch(w.collected,[],w.filters);
}
export function refineWorkspace(w:Workspace,filters:Filters){
 if(!w.poolFilters)w.poolFilters={...w.filters};
 if(!w.collected)w.collected=[...w.listings];
 w.filters=filters;w.listings=mergeSearch(w.collected,[],filters);w.nextCursor=null;
}
