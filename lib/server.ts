import {retainMessageCars} from './chat-results';
import {schedulerConfigured} from './scheduler-auth';
import {restoreComparisons} from './shortlist';
import {encodeWorkspace,decodeWorkspace} from './workspace-codec';
import {applyPriceReview} from './price-review';
import { env } from 'cloudflare:workers';
import { blankWorkspace,filterSchema,priceWarning,rank,type Listing, type Workspace } from './domain';
export const config=()=>env as unknown as {DB?:D1Database} & Partial<Record<'SUPPORT_EMAIL'|'CONNECTION_ENCRYPTION_KEY'|'OPENAI_API_KEY'|'OPENAI_MODEL'|'SHARED_OPENAI_OWNER_ID'|'SHARED_FREE_APIFY_OWNER_ID'|'MARKETCHECK_API_KEY'|'AUTODEV_API_KEY'|'APIFY_API_KEY'|'RESEND_API_KEY'|'ALERT_FROM_EMAIL'|'ALERT_SITE_URL'|'SCHEDULER_SECRET'|'SCHEDULER_GITHUB_REPOSITORY'|'SCHEDULER_GITHUB_REPOSITORY_ID'|'SCHEDULER_GITHUB_OWNER_ID'|'SCHEDULER_AUDIENCE'|'AUTODEV_ALERTS_APPROVED'|'MARKETCHECK_ALERTS_APPROVED',string>>;
export const db=()=>{const d=config().DB as D1Database|undefined;if(!d)throw Error('Storage is temporarily unavailable. Please try again.');return d};
export class SignInRequired extends Error {constructor(){super('Please sign in to save and search.');this.name='SignInRequired';}}
export function identity(req:Request){const id=req.headers.get('oai-authenticated-user-id');if(!id)throw new SignInRequired();const origin=req.headers.get('origin');if(req.method!=='GET'&&origin&&origin!==new URL(req.url).origin)throw Error('Request origin rejected.');return id}
const workspaceVersions=new WeakMap<Workspace,string|null>();
export async function readWorkspaceSnapshot(id:string):Promise<{workspace:Workspace;payload:string|null}>{const r=await db().prepare('SELECT payload FROM workspaces WHERE user_id = ?').bind(id).first<{payload:string}>();const w:Workspace=r?await decodeWorkspace(r.payload):blankWorkspace();w.filters=filterSchema.parse(w.filters);if(w.poolFilters)w.poolFilters=filterSchema.parse(w.poolFilters);if(w.pending)w.pending=filterSchema.parse(w.pending);const review=(input:Listing)=>{const car=applyPriceReview(input);const auction=car.concerns.some(c=>c.startsWith('Auction listing:'));const warning=auction?'Auction amount: confirm the final purchase price and buyer fees with the seller.':car.priceWarning??priceWarning(car.price,car.year);return warning?{...car,priceWarning:warning,median:null,comparables:[],reason:'The provider amount needs seller confirmation before comparing value.',concerns:Array.from(new Set([...car.concerns,warning]))}:car};if(w.collected)w.collected=w.collected.map(review);const reviewed=(w.collected??w.listings).map(review);w.listings=rank(reviewed,reviewed,w.filters,reviewed.length);w.saved=w.saved.map(review);w.comparisonCars=(w.comparisonCars??[]).map(review);restoreComparisons(w);retainMessageCars(w);w.chatCars=w.chatCars?.map(review);workspaceVersions.set(w,r?.payload??null);return {workspace:w,payload:r?.payload??null}}
export async function readWorkspace(id:string):Promise<Workspace>{return (await readWorkspaceSnapshot(id)).workspace}
// D1 batches execute transactionally: either both guarded row changes commit,
// or neither does. The unique token prevents a failed claim matching an old job.
export async function commitMarketplaceImport(id:string,workspace:Workspace,previousWorkspacePayload:string,jobId:string,previousJobPayload:string,job:object){
 workspace.messages=workspace.messages.slice(-40);retainMessageCars(workspace);
 const payload=await encodeWorkspace(workspace),jobPayload=JSON.stringify({...job,commitToken:crypto.randomUUID()}),now=Date.now(),database=db();
 const results=await database.batch([
  database.prepare('UPDATE workspaces SET payload=?,updated_at=? WHERE user_id=? AND payload=? AND EXISTS (SELECT 1 FROM workspaces WHERE user_id=? AND payload=?)').bind(jobPayload,now,jobId,previousJobPayload,id,previousWorkspacePayload),
  database.prepare('UPDATE workspaces SET payload=?,updated_at=? WHERE user_id=? AND payload=? AND EXISTS (SELECT 1 FROM workspaces WHERE user_id=? AND payload=?)').bind(payload,now,id,previousWorkspacePayload,jobId,jobPayload),
 ]);
 const committed=results[0].meta.changes===1&&results[1].meta.changes===1;
 if(committed)workspaceVersions.set(workspace,payload);
 return committed;
}
export async function writeWorkspace(id:string,w:Workspace){
 w.messages=w.messages.slice(-40);retainMessageCars(w);const payload=await encodeWorkspace(w),now=Date.now();
 if(workspaceVersions.has(w)){
  const previous=workspaceVersions.get(w);
  const result=previous===null
   ?await db().prepare('INSERT INTO workspaces(user_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO NOTHING').bind(id,payload,now).run()
   :await db().prepare('UPDATE workspaces SET payload=?,updated_at=? WHERE user_id=? AND payload=?').bind(payload,now,id,previous).run();
  if(result.meta.changes!==1)throw Error('Your workspace changed in another request. Refresh to see the latest changes before trying again.');
 }else{
  await db().prepare('INSERT INTO workspaces(user_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(id,payload,now).run();
 }
 workspaceVersions.set(w,payload);
}
export async function limitUsage(id:string,limit=500){const day=new Date().toISOString().slice(0,10);const row=await db().prepare('INSERT INTO usage(user_id,day,count) VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count').bind(id,day,limit).first();if(!row)throw Error(id.endsWith(':photo-lookups')?'Today’s extra-photo allowance is used. Available listing photos are still here.':id.endsWith(':inventory-pages')?'Inventory search allowance reached for today. Your collected cars are still available.':id.endsWith(':price-checks')?'Daily seller price-check allowance reached. Search results remain available; unverified prices are labeled.':'Daily limit reached: 500 searches per day. Try again tomorrow.');}
export async function boundedJson(req:Request){const t=await req.text();if(t.length>16000)throw Error('Request is too long.');return JSON.parse(t)}
export function failure(e:unknown){return Response.json({error:e instanceof Error?e.message:'Request failed. Please try again.'},{status:e instanceof SignInRequired?401:400,headers:{'Cache-Control':'no-store'}})}
export async function schedulerReady(){const r=await db().prepare("SELECT updated_at FROM workspaces WHERE user_id = '__scheduler__'").first<{updated_at:number}>();return schedulerConfigured(config())&&!!r&&Date.now()-r.updated_at<26*3600000}
export {filterSchema};
