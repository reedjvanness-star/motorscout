import {firstCursor,type Filters,type SearchCursor,type Source} from './domain';
import {searchInventory,inventoryStatus,type InventoryKeys} from './inventory';
type Result=Awaited<ReturnType<typeof searchInventory>>;
import type {Database} from './database';
const prefix='__inventory_cache__:';
const cooldownMs=300000;
const providers=['marketcheck','autodev'] as const;
type Provider=typeof providers[number];
type Cooldown={createdAt:number;expiresAt:number};
const sourceSlot:Record<string,keyof SearchCursor>={'MarketCheck · dealer inventory':'dealer','MarketCheck · private sellers':'private','MarketCheck · auctions':'auction','Auto.dev · dealer inventory':'autodev','AutoTrader':'autotrader','MarketCheck · additional retailers':'retailers'};
const providerNames=Object.fromEntries(providers.map(provider=>[provider,new Set(inventoryStatus({[provider]:'configured'}).filter(source=>source.status==='ready').map(source=>source.name))])) as Record<Provider,Set<string>>;
const valid=(entry:Cooldown,now:number)=>Number.isFinite(entry.createdAt)&&Number.isFinite(entry.expiresAt)&&entry.createdAt<=now&&entry.expiresAt>now&&entry.expiresAt>entry.createdAt&&entry.expiresAt-entry.createdAt<=cooldownMs;
async function hash(value:unknown){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('')}
function eligible(source:Source,provider:Provider,filters:Filters){
 const slot=sourceSlot[source.name]??(provider==='marketcheck'?'retailers':'autodev');
 if(slot==='auction'&&(filters.seller!=='any'||filters.maxPrice!==null))return null;
 if(filters.seller==='private'&&['dealer','autodev','retailers'].includes(slot))return null;
 if(filters.seller==='dealer'&&slot==='private')return null;
 return slot;
}
export async function cachedInventory(database:Database,filters:Filters,keys:InventoryKeys,cursor?:SearchCursor,search:typeof searchInventory=searchInventory,now=Date.now()):Promise<Result>{
 // Both response reuse and cooldowns store hashes, never provider credentials.
 const id=prefix+await hash({version:2,keys:{marketcheck:keys.marketcheck??'',autodev:keys.autodev??''},filters,cursor:cursor??null});
 try{
  const row=await database.prepare('SELECT payload FROM workspaces WHERE user_id=?').bind(id).first<{payload:string}>();
  if(row){const entry=JSON.parse(row.payload);if(valid(entry,now)){
   const result=entry.result as Result;
   return {...result,sources:result.sources.map(source=>({...source,detail:source.detail+' Reused a recent check; listing timestamps are unchanged.'}))};
  }}
 }catch{/* A cache failure must not disable live search. */}
 const activeKeys={...keys},cooldowns=new Map<Provider,Cooldown>(),cooldownIds=new Map<Provider,string>();
 await Promise.all(providers.map(async provider=>{
  if(!keys[provider])return;
  const cooldownId=prefix+'cooldown:'+await hash({provider,key:keys[provider]});cooldownIds.set(provider,cooldownId);
  try{
   const row=await database.prepare('SELECT payload FROM workspaces WHERE user_id=?').bind(cooldownId).first<{payload:string}>();
   if(row){const entry=JSON.parse(row.payload) as Cooldown;if(valid(entry,now)){cooldowns.set(provider,entry);delete activeKeys[provider]}}
  }catch{/* Unavailable cooldown storage does not disable providers. */}
 }));
 const result:Result=Object.values(activeKeys).some(Boolean)||!cooldowns.size?await search(filters,activeKeys,cursor):{listings:[],records:[],sources:inventoryStatus(activeKeys),checkedAt:new Date(now).toISOString(),nextCursor:null};
 // Only fresh provider errors start cooldowns; skipped requests never extend one.
 const freshCooldowns=providers.filter(provider=>activeKeys[provider]&&result.sources.some(source=>providerNames[provider].has(source.name)&&source.status==='error'&&/HTTP 429\b/.test(source.detail)));
 const requested=cursor??firstCursor();
 for(const [provider] of cooldowns){
  result.sources=result.sources.map(source=>{
   if(!providerNames[provider].has(source.name))return source;
   const slot=eligible(source,provider,filters);if(!slot)return source;
   if(requested[slot]!=null){
    result.nextCursor??=Object.fromEntries(Object.entries(requested).map(([key,value])=>[key,value===undefined?undefined:null])) as SearchCursor;
    Object.assign(result.nextCursor,{[slot]:requested[slot]});
   }
   return {...source,status:'error',count:0,inspected:0,hasMore:requested[slot]!=null,detail:'This provider recently reported a rate or quota limit (HTTP 429). Searches using this connection pause for up to five minutes; retry then. No new listings were checked for this source.'};
  });
 }
 const quotaLimited=result.sources.some(source=>source.status==='error'&&/HTTP 429/.test(source.detail));
 const ttl=quotaLimited?cooldownMs:result.sources.some(source=>source.status==='error')?30000:cooldownMs;
 const expiresAt=Math.min(now+ttl,...[...cooldowns.values()].map(entry=>entry.expiresAt));
 const payload=JSON.stringify({createdAt:now,expiresAt,result});
 try{
  for(const provider of freshCooldowns)await database.prepare('INSERT INTO workspaces(user_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(cooldownIds.get(provider),JSON.stringify({createdAt:now,expiresAt:now+cooldownMs}),now).run();
  if(new TextEncoder().encode(payload).length<=500000)await database.prepare('INSERT INTO workspaces(user_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(id,payload,now).run();
  // Cooldown markers share the existing 500-row bound with response caches.
  await database.prepare("DELETE FROM workspaces WHERE user_id GLOB '__inventory_cache__:*' AND updated_at < ?").bind(now-cooldownMs).run();
  await database.prepare("DELETE FROM workspaces WHERE user_id IN (SELECT user_id FROM workspaces WHERE user_id GLOB '__inventory_cache__:*' ORDER BY updated_at DESC LIMIT -1 OFFSET 500)").run();
 }catch{/* Cache writes are optional; return the provider result. */}
 return result;
}
