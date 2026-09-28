import {discountRisk,DISCOUNT_PRICE_WARNING,freshPriceCheck} from './price-safety';
import type {Listing} from './domain';
import audited from './price-audit.json';

export type PriceReview={status:'matched'|'corrected'|'conditional'|'unavailable'|'unverified';checkedAt:string;reportedPrice:number;sourcePrice?:number;feesIncluded?:boolean;titleStatus?:'rebuilt';note:string};
export function priceUrl(value:string){try{const u=new URL(value);u.hostname=u.hostname.replace(/^www\./,'');return u.hostname+decodeURIComponent(u.pathname).replace(/\/$/,'')+u.search+u.hash}catch{return value}}
const audit=new Map(audited.map(r=>[priceUrl(r.url),r.review as PriceReview]));
export function applyPriceReview(row:Listing,review?:PriceReview,now=Date.now()):Listing{
  const cached=audit.get(priceUrl(row.url));
  const previous=row.priceReview;
  const r=review??(cached&&(!previous||Date.parse(cached.checkedAt)>Date.parse(previous.checkedAt))?cached:previous);
  if(!r)return discountRisk(row)?{...row,priceWarning:DISCOUNT_PRICE_WARNING,median:null,comparables:[],concerns:[...new Set([...row.concerns,DISCOUNT_PRICE_WARNING])]}:row;
  const fresh=freshPriceCheck(r.checkedAt,now);
  const usable=fresh&&(r.status==='matched'||r.status==='corrected')&&r.sourcePrice!==undefined;
  const price=usable?r.sourcePrice!:row.price;
  const warning=r.status==='conditional'||r.status==='unavailable'?r.note:!fresh&&['matched','corrected'].includes(r.status)?'The source price check is expired or has an invalid timestamp. Recheck this listing before using its price.':usable?null:discountRisk(row)?DISCOUNT_PRICE_WARNING:row.priceWarning;
  const staleNote='Source price check is expired or has an invalid timestamp. ';
  const note=fresh||r.note.startsWith(staleNote)?r.note:staleNote+r.note;
  const fees=usable&&r.feesIncluded?0:price!==row.price?null:row.fees;
  return {...row,price,fees,titleStatus:r.titleStatus??row.titleStatus,priceReview:{...r,note},priceWarning:warning,total:price+(fees??0),median:warning?null:row.median,comparables:warning?[]:row.comparables,
    reason:warning?note:row.reason,concerns:[...new Set([...row.concerns,note])],
    offers:row.offers?.map(o=>priceUrl(o.url)===priceUrl(row.url)?{...o,price,fees,priceWarning:warning}:o)};
}

function textOf(html:string){return html.replace(/<!--[^]*?-->/g,' ').replace(/<(script|style)\b[^>]*>[^]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ')}
function money(value:unknown){if(typeof value!=='number'&&typeof value!=='string')return null;const s=String(value).replace(/[$,\s]/g,'');if(!/^\d+(\.\d{1,2})?$/.test(s))return null;const n=Number(s);return n>0&&n<=1000000?n:null}
function cashHighlights(html:string,vin:string|null|undefined){
  if(!vin||! /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin))return [];
  const start=new RegExp('<div\\b[^>]*\\bid=["\']buy-'+vin+'["\'][^>]*>','i').exec(html);
  if(!start)return [];
  let depth=1,end=start.index+start[0].length;
  const tail=html.slice(end);
  for(const tag of tail.matchAll(/<div\b[^>]*>|<\/div\s*>/gi)){depth+=/^<\//.test(tag[0])?-1:1;if(!depth){end+=tag.index!;break}}
  if(depth)return [];
  const pane=html.slice(start.index,end);
  return [...pane.matchAll(/<div\b[^>]*class=["'][^"']*\bfeaturedPrice\b[^"']*["'][^>]*>([^]*?)<\/div>/gi)].flatMap(m=>{
    const label=textOf(m[1].match(/<span\b[^>]*class=["'][^"']*vehiclePricingHighlightLabel[^"']*["'][^>]*>([^]*?)<\/span>/i)?.[1]??'');
    const amount=textOf(m[1].match(/<span\b[^>]*class=["'][^"']*vehiclePricingHighlightAmount[^"']*["'][^>]*>([^]*?)<\/span>/i)?.[1]??'');
    const price=money(amount);
    return /price/i.test(label)&&!/saving|discount|rebate|month|lease|payment/i.test(label)&&price!==null?[price]:[];
  });
}
export function inspectListingPage(row:Listing,html:string,now=new Date().toISOString()):PriceReview{
  const base={checkedAt:now,reportedPrice:row.priceReview?.reportedPrice??row.price};
  const result=(status:PriceReview['status'],note:string,sourcePrice?:number):PriceReview=>({...base,status,note,...(sourcePrice===undefined?{}:{sourcePrice})});
  const text=textOf(html);
  const host=new URL(row.url).hostname.replace(/^www\./,'');
  const ogUrl=html.match(/<meta\s+property=["']og:url["']\s+content=["']([^"']+)["']/i)?.[1];
  const mainText=text.split(/You May Also Like|Vehicles You Might Like|Similar Vehicles|Related Vehicles|Recommended Vehicles/i)[0];
  const sameVehicle=(!!row.vin&&mainText.toUpperCase().includes(row.vin.toUpperCase()))||(host==='kbb.com'&&/^\/cars-for-sale\/vehicle\/\d+$/.test(new URL(row.url).pathname)&&!!ogUrl&&priceUrl(ogUrl)===priceUrl(row.url));
  // A disclaimer about the advertised price is different from an optional loan calculator.
  if(sameVehicle&&/(?:advertised price[^.]{0,120}(?:amount to finance|amount for financ)|(?:internet special pricing|advertised price)[^.]{0,120}(?:reflects|after|based on)[^.]{0,80}(?:down payment|\bDP\b))/i.test(text))
    return result('conditional','The seller describes this advertised amount as financing or pricing after a down payment. Full cash purchase price is unconfirmed.');
  if(sameVehicle&&/\bOn Hold\b/.test(text))return result('unavailable','The seller currently marks this vehicle on hold. Confirm availability before comparing its price.');
  const candidates:number[]=[];
  function walk(node:any,depth=0){
    if(!node||typeof node!=='object'||depth>14)return;
    if(Array.isArray(node)){node.forEach(n=>walk(n,depth+1));return}
    const types=[node['@type']].flat();
    const vin=node.vehicleIdentificationNumber;
    const exactVin=typeof vin==='string'&&!!row.vin&&vin.toUpperCase()===row.vin.toUpperCase();
    const exactUrl=typeof node.url==='string'&&priceUrl(node.url)===priceUrl(row.url);
    if(types.some(t=>['Car','Vehicle','Product'].includes(t))&&(exactVin||(!vin&&exactUrl))){
      for(const offer of [node.offers].flat().filter(Boolean)){
        if(typeof offer.url==='string'&&priceUrl(offer.url)!==priceUrl(row.url))continue;
        if(offer.priceCurrency!=='USD'||/Lease|Rental/i.test(String(offer.businessFunction??'')))continue;
        const n=money(offer.price);if(n!==null)candidates.push(n);
      }
    }
    Object.values(node).forEach(n=>{if(typeof n==='object')walk(n,depth+1)});
  }
  for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([^]*?)<\/script>/gi)){
    try{walk(JSON.parse(match[1]))}catch{/* Invalid structured data is not price evidence. */}
  }
  // Accept complete selling-price labels, never SAVINGS, DIFFERENCE, rebates,
  // MSRP, a payment, or a down payment. Match the vehicle before reading prices.
  let visible:number[]=[];
  if(sameVehicle){
    const amount='\\$\\s*([\\d,]+(?:\\.\\d{2})?)';
    const values=(label:string)=>[...mainText.matchAll(new RegExp('(?:'+label+')\\s*:?\\s*'+amount,'gi'))].map(m=>money(m[1])!).filter(Boolean);
    const afterFees=values('Price After Fees');
    const total=afterFees.length?afterFees:values('Total Price|Final Price|Dealer Price|Koons Price|Wesley Chapel Price|Hood Chevy Price|Malcolm Cunningham Price|Vandergriff Price');
    const selling=values("Your Sale Price|Sale Price|Internet Price|Asking Price|Today's Price|Listing Price");
    const retail=values('Retail Price(?:\\s*\\([^)]*(?:Fee Included|Includes Fees)[^)]*\\))?');
    visible=total.length?total:selling.length?selling:retail;
    const reduced=values('Now Only Reduced Price');if(reduced.length&&!total.length)visible=reduced;
  }
  const cash=sameVehicle?cashHighlights(html,row.vin):[];
  const prices=[...new Set(cash.length?cash:visible.length?visible:candidates)];
  if(prices.length!==1)return result('unverified',prices.length?'The seller page contains conflicting vehicle prices. Confirm the full cash amount.':'Could not identify one price for this exact vehicle on its source page.');
  const sourcePrice=prices[0];
  const savings=[...mainText.matchAll(/(?:Savings|Dealer Discount|Difference|Rebate|Optional Accessories|Doc Fee)\s*:?\s*-?\$\s*([\d,]+(?:\.\d{2})?)|\$\s*([\d,]+(?:\.\d{2})?)\s*(?:SAVINGS|DIFFERENCE|OFF)\b/gi)].map(m=>money(m[1]??m[2]));
  if(!cash.length&&savings.includes(sourcePrice))return result('conditional','The extracted amount is labeled as savings, a discount, rebate, fee or accessory charge. It is not a verified full purchase price.');
  // Tiny amounts in structured data can themselves be savings or payments.
  if(sourcePrice<1000)return result('conditional','The source amount is too ambiguous to identify as a full vehicle purchase price.');
  const found=result(sourcePrice===base.reportedPrice?'matched':'corrected',sourcePrice===base.reportedPrice?'Advertised amount matched the exact vehicle on its source page. Taxes and other costs may apply.':'Replaced the provider amount with the advertised price found for this vehicle on its source page. Taxes and other costs may apply.',sourcePrice);
  if(/Doc Fee Included/i.test(mainText)||[...mainText.matchAll(/Price After Fees\s*:?\s*\$\s*([\d,]+(?:\.\d{2})?)/gi)].some(m=>money(m[1])===sourcePrice))found.feesIncluded=true;
  return found;
}

// Explicit public hosts from the audited inventory. No arbitrary URLs, credentials,
// IP addresses, or cross-host redirects may be supplied by a client.
const hosts=new Set([...audited.map(r=>new URL(r.url).hostname.replace(/^www\./,'')),'loveford.com']);
export function canCheckListingPrice(row:Listing){try{return hosts.has(new URL(row.url).hostname.replace(/^www\./,''))}catch{return false}}
export async function checkListingPrice(row:Listing,request:typeof fetch=fetch):Promise<PriceReview>{
  const base={checkedAt:new Date().toISOString(),reportedPrice:row.priceReview?.reportedPrice??row.price};
  const fail=(note:string,status:PriceReview['status']='unverified'):PriceReview=>({...base,status,note});
  if(row.concerns.some(c=>c.startsWith('Auction listing:')))return fail('Auction amount is not a confirmed cash purchase price.','conditional');
  let url=new URL(row.url);
  if(!['http:','https:'].includes(url.protocol)||!hosts.has(url.hostname.replace(/^www\./,''))||url.username||url.password||url.port)return fail('This seller format has not been added to source price checking yet.');
  try{
    for(let attempt=0;attempt<3;attempt++){
      const res=await request(url,{headers:{Accept:'text/html'},redirect:'manual',signal:AbortSignal.timeout(12000)});
      if(res.status===404||res.status===410)return fail('The original listing is no longer available (HTTP '+res.status+').','unavailable');
      if(res.status>=300&&res.status<400){const location=res.headers.get('location');await res.body?.cancel();if(!location)return fail('The seller redirected without a listing destination.');const next=new URL(location,url);if(next.hostname.replace(/^www\./,'')!==url.hostname.replace(/^www\./,'')||!['http:','https:'].includes(next.protocol)||next.username||next.password||next.port)return fail('The source redirects elsewhere; price could not be checked.');url=next;continue}
      if(!res.ok)return fail('The seller page could not be checked (HTTP '+res.status+'). Provider amount remains unverified.');
      if(!res.headers.get('content-type')?.includes('text/html'))return fail('The source did not return a listing page.');
      const reader=res.body?.getReader();if(!reader)return fail('The source returned an empty page.');
      let size=0,html='';const decoder=new TextDecoder();
      while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>3_000_000){await reader.cancel();return fail('The seller page exceeded the price checker size limit.')}html+=decoder.decode(chunk.value,{stream:true})}
      return inspectListingPage(row,html,base.checkedAt);
    }
    return fail('The source redirected too many times to check its price.');
  }catch{return fail('The seller page could not be reached. Provider amount remains unverified.')}
}
