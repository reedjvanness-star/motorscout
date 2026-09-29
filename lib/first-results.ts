import {firstCursor,type Filters,type SearchCursor} from './domain';
import {inventoryStatus,type InventoryKeys,type searchInventory} from './inventory';

// Return the first dealer/private feed without waiting for every secondary feed.
// The unchanged starting cursors let the next client batch check all other feeds.
export async function firstResults(filters:Filters,keys:InventoryKeys,search:typeof searchInventory){
 const slot=keys.autodev&&filters.seller!=='private'?'autodev':keys.marketcheck?(filters.seller==='private'?'private':'dealer'):null;
 if(!slot)return search(filters,keys);
 const start=firstCursor();
 const cursor:SearchCursor={dealer:null,private:null,auction:null,autodev:null,autotrader:null,retailers:null};
 if(slot==='autodev')cursor.autodev='1';else cursor[slot]=0;
 const result=await search(filters,keys,cursor);
 const next:SearchCursor={dealer:null,private:null,auction:null,autodev:null,autotrader:null,retailers:null,...result.nextCursor};
 const status=inventoryStatus(keys);
 const sourcesBySlot={dealer:'MarketCheck · dealer inventory',private:'MarketCheck · private sellers',auction:'MarketCheck · auctions',autodev:'Auto.dev · dealer inventory',autotrader:'AutoTrader',retailers:'MarketCheck · additional retailers'} as const;
 for(const pending of Object.keys(sourcesBySlot) as (keyof typeof sourcesBySlot)[]){
  if(pending===slot)continue;
  const eligible=pending==='autodev'?!!keys.autodev&&filters.seller!=='private':!!keys.marketcheck&&!(pending==='dealer'&&filters.seller==='private')&&!(pending==='private'&&filters.seller==='dealer')&&!(pending==='retailers'&&filters.seller==='private')&&!(pending==='auction'&&(filters.seller!=='any'||filters.maxPrice!==null));
  if(pending==='autodev')next.autodev=eligible?start.autodev:null;
  else next[pending]=eligible?start[pending]??null:null;
  const index=result.sources.findIndex(source=>source.name===sourcesBySlot[pending]),baseline=status.find(source=>source.name===sourcesBySlot[pending]);
  if(index>=0&&baseline){
   if(eligible)result.sources[index]={...baseline,detail:'Waiting for the next background batch. First results are shown while more sources are checked.'};
   else if(pending==='auction'&&keys.marketcheck)result.sources[index]={...baseline,status:'unavailable',detail:'Excluded by your seller or maximum-price filter: auction seller identity and final purchase price are unconfirmed.'};
  }
 }
 if(next.retailers!==null){
  const cursorNames=new Set<string>(Object.values(sourcesBySlot));
  result.sources=result.sources.map(source=>{const baseline=status.find(row=>row.name===source.name);return !cursorNames.has(source.name)&&baseline?.status==='ready'?baseline:source});
 }
 return {...result,nextCursor:Object.values(next).some(value=>value!==null)?next:null};
}
