import {discountRisk,checkedFullPrice} from './price-safety';
import {retailers,retailerInventoryUrl,normalizeRetailer} from './retailers';
import {applyPriceReview,checkListingPrice,canCheckListingPrice} from './price-review';
import {autoDevUrl, normalizeAutoDev} from './autodev';
import {marketcheckUrl, normalizeMarketcheck, MARKETCHECK_PAGE_SIZE,autotraderMarketcheckUrl,normalizeAutotraderMarketcheck} from './marketcheck';
import {firstCursor, rank, type Filters, type Listing, type SearchCursor, type Source} from './domain';

export type InventoryKeys = {marketcheck?:string;autodev?:string};
class ProviderFailure extends Error { constructor(readonly status:number){super('Provider request failed')} }
function failureDetail(error:unknown){
  if(error instanceof ProviderFailure){
    const status=error.status;
    const reason=status===401?'The provider rejected the API key.':status===403?'The provider denied this inventory request; check plan access.':status===429?'The provider reported a rate or quota limit.':status===400||status===422?'The provider rejected the search parameters.':'The provider could not serve this request.';
    return `${reason} HTTP ${status}. Retry keeps your place.`;
  }
  if(error instanceof Error&&(error.name==='TimeoutError'||error.name==='AbortError'))return 'The inventory request timed out. Retry keeps your place.';
  return 'The inventory response could not be fetched or read. Retry keeps your place.';
}
export function inventoryStatus(keys: InventoryKeys): Source[] {
  return [
    {name:'MarketCheck · dealer inventory',status:keys.marketcheck?'ready':'unavailable',detail:'Dealer inventory; available coverage depends on your connected plan.'},
    {name:'MarketCheck · private sellers',status:keys.marketcheck?'ready':'unavailable',detail:'Requires private-party inventory access on your MarketCheck plan.'},
    {name:'MarketCheck · auctions',status:keys.marketcheck?'ready':'unavailable',detail:'Requires auction access on your plan. Auction amounts need confirmation and cannot qualify as cash-price budget matches or deal scores.'},
    {name:'Auto.dev · dealer inventory',status:keys.autodev?'ready':'unavailable',detail:'U.S. dealer inventory. Private sellers are not included.'},
    {name:'AutoTrader',status:keys.marketcheck?'ready':'unavailable',detail:'Available AutoTrader records through MarketCheck, 10 per batch. Coverage is partial; original listing URLs and exact requirements are checked.'},
    {name:'MarketCheck · additional retailers',status:keys.marketcheck?'ready':'unavailable',detail:'CarMax, Carvana, AutoNation USA, Driveway and EchoPark queried together; 10 records per batch within the existing plan. Partial coverage.'},
    ...Object.values(retailers).map(({name})=>({name,status:keys.marketcheck?'ready' as const:'unavailable' as const,detail:'Searched through the connected MarketCheck retailer feed. Original vehicle URLs are checked; coverage is partial.'})),
    ...['Cars.com','CarGurus','TrueCar','Facebook Marketplace','Craigslist','Newspaper classifieds'].map(name=>({name,status:'unavailable' as const,detail:'No direct inventory integration configured. A shopper account or website link does not supply an import feed. Listings from this website are included only when a connected provider returns their original URLs; complete marketplace coverage is not established.'})),
  ];
}

// Store only a provider cursor, never a URL to which credentials could be sent.
export function nextAutoPosition(data:any, current:string, count:number):string|null {
  const next = data.links?.next;
  if (typeof next === 'string') {
    try {
      const u = new URL(next, 'https://api.auto.dev');
      if(u.origin !== 'https://api.auto.dev' || u.pathname !== '/listings' || u.username || u.password) return null;
      const token=u.searchParams.get('cursor'),page=u.searchParams.get('page');
      if(token && token.length<=4096 && 'cursor:'+token!==current)return 'cursor:'+token;
      if(page && /^\d+$/.test(page) && Number(page)>Number(current) && Number(page)<=50)return page;
    } catch { return null; }
    return null;
  }
  if(next===null || count<20)return null;
  return /^\d+$/.test(current)&&Number(current)<50 ? String(Number(current)+1) : null;
}

export async function searchInventory(f:Filters, keys:InventoryKeys, cursor:SearchCursor=firstCursor(), request:typeof fetch=fetch) {
  const sources=inventoryStatus(keys),next:SearchCursor={dealer:null,private:null,auction:null,autodev:null,autotrader:null,retailers:null};
  const groups:Listing[][]=[[],[],[],[],[],[]];
  async function market(privateSeller:boolean, auction=false) {
    const index=auction?2:privateSeller?1:0,slot=auction?'auction':privateSeller?'private':'dealer',source=sources[index],offset=cursor[slot]??null;
    if(!keys.marketcheck)return;
    if(!auction&&((f.seller==='private'&&!privateSeller)||(f.seller==='dealer'&&privateSeller))) {source.status='unavailable';source.detail='Excluded by your seller filter.';return;}
    if(offset===null){source.status='searched';source.count=0;source.detail='No further pages from this source in the current search.';return;}
    try {
      const url=marketcheckUrl(f,privateSeller,offset,auction);url.searchParams.set('api_key',keys.marketcheck);
      const response=await request(url,{headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(18000)});
      if(!response.ok)throw new ProviderFailure(response.status);
      const data:any=await response.json();
      if(!Array.isArray(data.listings))throw Error('Unexpected response');
      groups[index]=data.listings.map((r:any)=>{let row=normalizeMarketcheck(r,privateSeller);if(row){row={...row,cabStyle:row.cabStyle||f.cabStyle,features:[...new Set([...(row.features??[]),...(f.features??[])])],concerns:[...row.concerns,...(f.features?.length||f.cabStyle?['Cab and requested equipment are matched by the inventory provider’s search filters; verify fitted equipment with the seller.']:[])]}}return auction&&row?{...row,id:`auction:${row.id}`,seller:'unknown' as const,priceWarning:'Auction amount: this may be a bid rather than a purchase price. Confirm sale terms, buyer fees, and the final price with the auction seller.',concerns:[...row.concerns,'Auction listing: bid or sale terms are not a confirmed cash purchase price.']}:row}).filter((r:Listing|null):r is Listing=>r!==null);
      const total=typeof data.num_found==='number'&&Number.isFinite(data.num_found)&&data.num_found>=0?data.num_found:undefined;
      const following=offset+data.listings.length;
      const more=data.listings.length>0&&(total!==undefined?following<total:data.listings.length===MARKETCHECK_PAGE_SIZE);
      if(more&&following<10000)next[slot]=following;
      source.status='searched';source.count=groups[index].length;source.total=total;source.inspected=data.listings.length;source.hasMore=next[slot]!==null;
      const totalText=total===undefined?'':` of ${total.toLocaleString()} provider matches`;
      const auctionText=auction?'Auction amounts are flagged as unconfirmed and excluded from budget matches and deal scores. ':'';
      const limitText=more&&following>=10000?' Provider pagination limit reached; narrow your filters.':'';
      source.detail=`Checked records ${data.listings.length?offset+1:offset}–${following}${totalText}. ${auctionText}Your full requirements are checked again before display.${limitText}`;
    } catch (error) {
      next[slot]=offset;source.status='error';source.hasMore=true;
      source.detail=failureDetail(error);
    }
  }
  async function auto() {
    const source=sources[3],position=cursor.autodev;
    if(!keys.autodev)return;
    if(f.seller==='private'){source.status='unavailable';source.detail='Excluded by your private-seller filter.';return;}
    if(position===null){source.status='searched';source.count=0;source.detail='No further pages from this source in the current search.';return;}
    try {
      const response=await request(autoDevUrl(f,position),{headers:{Authorization:`Bearer ${keys.autodev}`,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(18000)});
      if(!response.ok)throw new ProviderFailure(response.status);
      const data:any=await response.json();if(!Array.isArray(data.data))throw Error('Unexpected response');
      groups[3]=data.data.map(normalizeAutoDev).filter((r:Listing|null):r is Listing=>r!==null);
      next.autodev=nextAutoPosition(data,position,data.data.length);
      source.status='searched';source.count=groups[3].length;source.inspected=data.data.length;source.hasMore=next.autodev!==null;
      source.detail=`Checked ${data.data.length} records; ${groups[3].length} had a used-car asking price and original listing link. ${source.hasMore?'More provider records are available.':'No further page was available; provider plan limits may apply.'}`;
    } catch (error) {
      next.autodev=position;source.status='error';source.hasMore=true;
      source.detail=failureDetail(error);
    }
  }
  async function autotrader(){
    const source=sources[4],offset=cursor.autotrader??null;if(!keys.marketcheck)return;
    if(offset===null){source.status='searched';source.count=0;source.detail='No further AutoTrader pages in this search. Start a new search to check current coverage.';return;}
    try{
      const url=autotraderMarketcheckUrl(f,offset);url.searchParams.set('api_key',keys.marketcheck);
      const response=await request(url,{headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(18000)});
      if(!response.ok)throw new ProviderFailure(response.status);
      const data:any=await response.json();if(!Array.isArray(data.listings))throw Error('Unexpected response');
      groups[4]=data.listings.map(normalizeAutotraderMarketcheck).filter((r:Listing|null):r is Listing=>r!==null);
      const total=typeof data.num_found==='number'&&Number.isFinite(data.num_found)&&data.num_found>=0?data.num_found:undefined;
      const following=offset+data.listings.length,more=data.listings.length>0&&(total===undefined?data.listings.length===10:following<total);
      if(more&&following<10000)next.autotrader=following;
      Object.assign(source,{status:'searched',count:groups[4].length,inspected:data.listings.length,total,hasMore:next.autotrader!==null,detail:`AutoTrader via MarketCheck: checked ${data.listings.length} records${total===undefined?'':` of ${total} provider matches`}. Partial provider coverage; full requirements are applied before display. Plan pagination limits may apply.`});
    }catch(error){next.autotrader=offset;source.status='error';source.hasMore=true;source.detail=failureDetail(error);}
  }
  async function retail(){
    const source=sources[5],offset=cursor.retailers??null,brands=sources.slice(6,6+Object.keys(retailers).length);
    if(!keys.marketcheck)return;
    if(f.seller==='private'){for(const s of [source,...brands]){s.status='unavailable';s.detail='Excluded by your private-seller filter.';}return;}
    if(offset===null){for(const s of [source,...brands]){s.status='searched';s.count=0;s.detail='No further retailer pages in this search. Start a new search to check current coverage.';}return;}
    try{
      const url=retailerInventoryUrl(f,offset);url.searchParams.set('api_key',keys.marketcheck);
      const response=await request(url,{headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(18000)});
      if(!response.ok)throw new ProviderFailure(response.status);
      const data:any=await response.json();if(!Array.isArray(data.listings))throw Error('Unexpected response');
      groups[5]=data.listings.map(normalizeRetailer).filter((r:Listing|null):r is Listing=>r!==null);
      const total=typeof data.num_found==='number'&&Number.isFinite(data.num_found)&&data.num_found>=0?data.num_found:undefined;
      const following=offset+data.listings.length,more=data.listings.length>0&&(total===undefined?data.listings.length===10:following<total);
      if(more&&following<10000)next.retailers=following;
      Object.assign(source,{status:'searched',count:groups[5].length,inspected:data.listings.length,total,hasMore:next.retailers!==null,detail:`Checked ${data.listings.length} retailer records${total===undefined?'':` of ${total} provider matches`}. Five retailers share one provider request. Plan pagination limits apply.`});
      const matching=rank(groups[5],groups[5],f,groups[5].length);
      for(const s of brands){const count=matching.filter(r=>r.source===s.name).length;Object.assign(s,{status:'searched',count,inspected:count,hasMore:next.retailers!==null,detail:count?`${count} matching listings returned through MarketCheck. Partial coverage; seller prices require confirmation.`:'No matching listings from this retailer in this batch. It remains included in the combined feed.'});}
    }catch(error){next.retailers=offset;for(const s of [source,...brands]){s.status='error';s.hasMore=true;s.detail=failureDetail(error);}}
  }
  await Promise.all([market(false),market(true),market(false,true),auto(),autotrader(),retail()]);
  const rows=groups.flat().map(r=>applyPriceReview(f.zip?{...r,locationQuery:{zip:f.zip,radiusMiles:f.radiusMiles}}:r));
  const candidates=rows.map((row,index)=>({row,index})).filter(({row})=>discountRisk(row)&&!checkedFullPrice(row)&&canCheckListingPrice(row)).slice(0,10);
  for(let i=0;i<candidates.length;i+=5)await Promise.all(candidates.slice(i,i+5).map(async({row,index})=>{rows[index]=applyPriceReview(row,await checkListingPrice(row,request));}));
  let rowOffset=0;
  for(let i=0;i<groups.length;i++){
    const reviewed=rows.slice(rowOffset,rowOffset+groups[i].length);rowOffset+=groups[i].length;
    const flagged=reviewed.filter(r=>r.priceWarning).length;
    if(flagged)sources[i].detail+=` ${flagged} unconfirmed amounts are excluded when a maximum budget is set.`;
  }
  if(f.zip)for(const source of sources)if(source.status==='searched'&&source.inspected!==undefined)source.detail+=` Provider location filter: within ${f.radiusMiles} miles of ZIP ${f.zip}.`;
  // Keep every eligible car in a fetched batch; display pagination happens locally.
  return {listings:rank(rows,rows,f,rows.length),sources,checkedAt:new Date().toISOString(),nextCursor:Object.values(next).some(v=>v!==null)?next:null};
}
