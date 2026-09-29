import type {Filters,SearchCursor} from './domain';
import {searchInventory,type InventoryKeys} from './inventory';
type Result=Awaited<ReturnType<typeof searchInventory>>;
import type {Database} from './database';
const prefix='__inventory_cache__:';
export async function cachedInventory(database:Database,filters:Filters,keys:InventoryKeys,cursor?:SearchCursor,search:typeof searchInventory=searchInventory,now=Date.now()):Promise<Result>{
 // Scope by credentials as well as the complete request; never persist raw API keys.
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({version:1,keys:{marketcheck:keys.marketcheck??'',autodev:keys.autodev??''},filters,cursor:cursor??null})));
 const id=prefix+Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
 try{
  const row=await database.prepare('SELECT payload FROM workspaces WHERE user_id=?').bind(id).first<{payload:string}>();
  if(row){const entry=JSON.parse(row.payload);if(entry.expiresAt>now&&entry.createdAt<=now&&entry.expiresAt-entry.createdAt<=300000){
   const result=entry.result as Result;
   return {...result,sources:result.sources.map(source=>({...source,detail:source.detail+' Reused a recent check; listing timestamps are unchanged.'}))};
  }}
 }catch{/* A cache failure must not disable live search. */}
 const result=await search(filters,keys,cursor);
 // Avoid repeating the same blocked provider request every 30 seconds.
 const quotaLimited=result.sources.some(source=>source.status==='error'&&/HTTP 429/.test(source.detail));
 const ttl=quotaLimited?300000:result.sources.some(source=>source.status==='error')?30000:300000;
 const payload=JSON.stringify({createdAt:now,expiresAt:now+ttl,result});
 try{
  // Bound storage and leave unusually large responses uncached.
  if(new TextEncoder().encode(payload).length<=500000)await database.prepare('INSERT INTO workspaces(user_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(id,payload,now).run();
  await database.prepare("DELETE FROM workspaces WHERE user_id GLOB '__inventory_cache__:*' AND updated_at < ?").bind(now-300000).run();
  await database.prepare("DELETE FROM workspaces WHERE user_id IN (SELECT user_id FROM workspaces WHERE user_id GLOB '__inventory_cache__:*' ORDER BY updated_at DESC LIMIT -1 OFFSET 500)").run();
 }catch{/* Cache writes are optional; return the provider result. */}
 return result;
}
