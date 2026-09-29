import {record} from '@/lib/unknown-data';
import {locateListings} from '@/lib/zip-location';
import {identity,db,readWorkspace,writeWorkspace,boundedJson,failure} from '@/lib/server';
import {reserveBetaSearch} from '@/lib/shared-marketplace';
import {providerKey,connectionStatus} from '@/lib/connections';
import {apifyRequest,marketplaceInput,normalizeMarketplace,marketplaceSources,MARKETPLACE_RUN_CAP,ACTOR,FACEBOOK_ACTOR,facebookInput,normalizeFacebook,retailerMarketplaceInput,retailerMarketplaceSources} from '@/lib/apify';
import {startBudgetedMarketplaceRun} from '@/lib/marketplace-budget';
import {marketplaceRegionBatch} from '@/lib/marketplace-regions';
import {reusableMarketplaceJob} from '@/lib/marketplace-reuse';
import {collectWorkspace} from '@/lib/search-session';
import type {Listing,Source} from '@/lib/domain';
export const dynamic='force-dynamic';
type Job={searchId:string;runId?:string;state:string;startedAt:number;batch?:number;inputKey?:string;successful?:boolean};
const terminal=(state:string)=>['SUCCEEDED','FAILED','TIMED-OUT','ABORTED','IMPORTED'].includes(state);
export async function POST(req:Request){try{
 const id=identity(req),a=await boundedJson(req),key=await providerKey(id,'apify');if(!key)throw Error('Connect your free marketplace account in Sources first.');
 const w=await readWorkspace(id);if(!w.searchId||a.searchId!==w.searchId)throw Error('Your search changed. Use the latest results.');
 if(!['automotive','facebook','retail'].includes(a.provider))throw Error('Unknown marketplace provider.');
 const shared=(await connectionStatus(id)).apifyShared;
 if(shared&&a.provider!=='automotive')return Response.json({done:true,state:'NOT_IN_FREE_BETA'});
 const facebook=a.provider==='facebook',retail=a.provider==='retail';
 if(retail&&w.filters.seller==='private')return Response.json({done:true,state:'EXCLUDED_BY_FILTER'});
 if(facebook&&!marketplaceRegionBatch('facebook',w.filters.state).regions.length)return Response.json({done:true,state:'OUTSIDE_COVERAGE'});
 const actor=facebook?FACEBOOK_ACTOR:ACTOR;
 const jobId=id+(facebook?':facebook-job':retail?':retail-marketplace-job':':marketplace-job');
 const stored=await db().prepare('SELECT payload FROM workspaces WHERE user_id=?').bind(jobId).first<{payload:string}>();
 let job:Job|undefined=stored?JSON.parse(stored.payload):undefined;
 const hasMore=(j:Job)=>!shared&&!facebook&&!retail&&((j.batch??0)===0||marketplaceRegionBatch('automotive',w.filters.state,(j.batch??0)-1).hasMore);
 if(a.action==='start'){
  const advance=job?.searchId===w.searchId&&job.state==='IMPORTED'&&a.advance===true&&hasMore(job);
  if(job?.searchId===w.searchId&&!advance&&!(job.state==='FAILED'&&!job.runId))return Response.json({done:terminal(job.state),state:job.state,hasMore:hasMore(job)});
  if(job?.runId&&!terminal(job.state)){try{await apifyRequest(key,'actor-runs/'+encodeURIComponent(job.runId)+'/abort',{method:'POST'})}catch{throw Error('Previous marketplace search could not be stopped. Retry before starting another.')}}
  const next:Job={searchId:w.searchId,state:'STARTING',startedAt:Date.now(),batch:advance?(job!.batch??0)+1:job?.searchId===w.searchId?(job.batch??0):0};
  const input=facebook?facebookInput(w.filters):retail?retailerMarketplaceInput(w.filters):marketplaceInput(w.filters,next.batch);
  next.inputKey=JSON.stringify({actor,input});
  const startingPayload=JSON.stringify(next);
  const locked=await db().prepare("INSERT INTO workspaces(user_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at WHERE json_extract(workspaces.payload,'$.searchId') != ? OR (json_extract(workspaces.payload,'$.state')='FAILED' AND json_extract(workspaces.payload,'$.runId') IS NULL) OR workspaces.payload=? RETURNING user_id").bind(jobId,JSON.stringify(next),Date.now(),w.searchId,advance?stored!.payload:'').first();
  if(!locked)return Response.json({done:false,state:'STARTING'});
  try{
   if(!advance&&reusableMarketplaceJob(job,next.inputKey)){
    next.runId=job!.runId;next.state='SUCCEEDED';next.startedAt=job!.startedAt;next.successful=true;
   }else{
    if(shared)await reserveBetaSearch(db(),id);
    const data=await startBudgetedMarketplaceRun(db(),key,actor,input,facebook?1:MARKETPLACE_RUN_CAP);
    next.runId=data.id;next.state=data.status;
   }
  }catch(e){next.state='FAILED';await db().prepare('UPDATE workspaces SET payload=?,updated_at=? WHERE user_id=? AND payload=?').bind(JSON.stringify(next),Date.now(),jobId,startingPayload).run();throw e;}
  await db().prepare("UPDATE workspaces SET payload=?,updated_at=? WHERE user_id=? AND json_extract(payload,'$.searchId')=?").bind(JSON.stringify(next),Date.now(),jobId,w.searchId).run();
  return Response.json({done:false,state:next.state});
 }
 if(a.action!=='poll')throw Error('Unknown marketplace action.');
 if(job?.searchId===w.searchId&&job.state==='IMPORTED')return Response.json({done:true,state:'IMPORTED',hasMore:hasMore(job)});
 if(!job||job.searchId!==w.searchId||!job.runId)return Response.json({done:job?.state==='FAILED',state:job?.state??'NOT_STARTED'});
 const data=record(record(await apifyRequest(key,'actor-runs/'+encodeURIComponent(job.runId))).data);
 if(data.actId!==actor||typeof data.status!=='string')throw Error('Unexpected marketplace job.');
 const done=terminal(data.status);
 const raw=data.defaultDatasetId?await apifyRequest(key,`datasets/${encodeURIComponent(String(data.defaultDatasetId))}/items?format=json&clean=true&limit=100`):[];
 if(!Array.isArray(raw))throw Error('Invalid marketplace inventory response.');
 const unlocated=raw.map(facebook?normalizeFacebook:normalizeMarketplace).filter((r:Listing|null):r is Listing=>r!==null).map(row=>({...row,checkedAt:new Date(job!.startedAt).toISOString()}));
 const rows=await locateListings(unlocated,w.filters);
 const latest=await readWorkspace(id);if(latest.searchId!==w.searchId)throw Error('Your search changed while marketplaces were loading.');
 collectWorkspace(latest,rows);
 const sources:Source[]=retail?retailerMarketplaceSources(rows,done,latest.sources):facebook?[{name:'Facebook Marketplace',status:rows.length?'searched':done?'error':'ready',count:rows.length,inspected:rows.length,detail:`Local search centers: ${marketplaceRegionBatch('facebook',latest.filters.state).regions.join(', ')}. Partial coverage only. ${rows.length} usable vehicles returned. Your exact filters are applied before display.`}]:marketplaceSources(rows,done,latest.filters.state,job.batch??0);if(w.filters.zip)for(const source of sources)source.detail+=` Only vehicles with verifiable locations within ${w.filters.radiusMiles} miles of ${w.filters.zip} appear. Listings without location evidence are excluded.`;latest.sources=[...latest.sources.filter(s=>!sources.some(n=>n.name===s.name)),...sources];
 if(done){const n=latest.listings.length;latest.messages.push({role:'assistant',at:Date.now(),text:`Marketplace search finished. ${n} cars match your current requirements.${n<5?' Fewer than five exact matches were found in the inventory checked; your specifications have not been relaxed.':''}`,ids:latest.listings.slice(0,12).map(r=>r.id)});}
 // Repeated completed polls must not duplicate messages.
 if(job.state!== 'IMPORTED')await writeWorkspace(id,latest);
 job={...job,state:done?'IMPORTED':data.status,successful:data.status==='SUCCEEDED'};
 await db().prepare("UPDATE workspaces SET payload=?,updated_at=? WHERE user_id=? AND json_extract(payload,'$.searchId')=?").bind(JSON.stringify(job),Date.now(),jobId,w.searchId).run();
 return Response.json({done,state:data.status,count:rows.length,hasMore:done&&hasMore(job)});
}catch(e){return failure(e)}}
