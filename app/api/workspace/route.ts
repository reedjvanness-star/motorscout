import {retainedWorkspaceCars} from '@/lib/chat-results';
import {rememberSearch,restorePreviousSearch} from '@/lib/search-history';
import {resolveZip} from '@/lib/zip-location';
import {localLocationCommand} from '@/lib/location-command';
import {localScoutCommand,loadedScoutRefinement} from '@/lib/local-scout-command';
import {withMarketplaceAccess} from '@/lib/marketplace-access';
import {prepareChatComparison} from '@/lib/chat-comparison';
import {workspaceCars,toggleComparison,collectedCarCount} from '@/lib/shortlist';
import {alertSnapshot,saveAlert,checkAlert,emailReady} from '@/lib/alerts';
import {alertSearchKey} from '@/lib/alert-matches';
import {resolveSearchVehicle} from '@/lib/catalog-server';
import {healthyCursor,preserveDeferredCursor,mergeSources,collectWorkspace,refineWorkspace} from '@/lib/search-session';
import {applyPriceReview,checkListingPrice} from '@/lib/price-review';
import {inventoryKeys,connectionStatus,providerKey} from '@/lib/connections';
import {identity,readWorkspace,writeWorkspace,limitUsage,boundedJson,failure,filterSchema,db} from '@/lib/server';
import {sourceStatus,searchListings} from '@/lib/sources';
import {interpret} from '@/lib/assistant';
import {initialFilters,type Listing} from '@/lib/domain';
export const dynamic='force-dynamic';
async function snapshot(id:string){const workspace=await readWorkspace(id),connections=await connectionStatus(id);const sources=withMarketplaceAccess(sourceStatus(await inventoryKeys(id)),connections);workspace.sources=withMarketplaceAccess(workspace.sources.length?workspace.sources:sources,connections);return {workspace,...await alertSnapshot(id),ai:!!await providerKey(id,'openai'),sources,connections}}
async function notifiedCar(userId:string,carId:string){const rows=await db().prepare('SELECT cars FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50').bind(userId).all<{cars:string}>();return rows.results.flatMap(n=>(JSON.parse(n.cars) as Listing[])).find((r)=>r.id===carId)}
export async function GET(req:Request){try{return Response.json(await snapshot(identity(req)),{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
export async function POST(req:Request){try{const id=identity(req),a=await boundedJson(req),w=await readWorkspace(id);const reply=(text:string,ids?:string[])=>w.messages.push({role:'assistant',text,ids,at:Date.now()});let search=false;
if(a.action==='chat'){if(typeof a.text!=='string'||!a.text.trim()||a.text.length>2000)throw Error('Please use a message of 1–2,000 characters.');await limitUsage(id);const command=localScoutCommand(a.text);const parsed=command?{action:command,filters:w.filters,question:''}:loadedScoutRefinement(a.text,w)??localLocationCommand(a.text,w.filters)??await interpret(a.text,w.filters,w.messages,await providerKey(id,'openai'));w.messages.push({role:'user',text:a.text,at:Date.now()});w.pending=null;
if(parsed.question)reply(parsed.question);
else if(parsed.action==='refine'){
 refineWorkspace(w,filterSchema.parse(parsed.filters));
 reply(`Filtered your collection: ${w.listings.length} match out of ${collectedCarCount(w)} collected cars. No paid AI call or new marketplace search was used. Say “show all collected cars” to restore the original pool, or use Show matching cars for fresh inventory.`,w.listings.slice(0,12).map(car=>car.id));
}
else if(parsed.action==='compare')w.messages.push({role:'assistant',...prepareChatComparison(w,a.text),at:Date.now()});
else if(parsed.action==='save')reply('Use Save on a recommendation to keep it in Saved cars. I won’t guess which car you meant.');
else if(parsed.action==='alert')reply('Tap “Save search” beside your results to save your exact requirements and choose notifications. Manage them under Saved searches.');
else{w.filters=filterSchema.parse(parsed.filters);search=true;}}
else if(a.action==='search'){await limitUsage(id);w.filters=filterSchema.parse(a.filters);w.pending=null;search=true;}
else if(a.action==='nextBatch'){if(!w.nextCursor)throw Error('No further inventory pages are available.');if(a.searchId!==w.searchId)throw Error('Your search changed. Use the latest results.');if(a.cursor!==JSON.stringify(w.nextCursor))throw Error('These results have already advanced. Refresh to continue.');await limitUsage(id+':inventory-pages',5000);search=true;}
else if(a.action==='confirm'){if(!w.pending)throw Error('No filter change is waiting for confirmation.');await limitUsage(id);w.filters=w.pending;w.pending=null;search=true;}
else if(a.action==='reviewPrices'){
 if(!Array.isArray(a.ids)||a.ids.length>5||a.ids.some((x:unknown)=>typeof x!=='string'))throw Error('Check up to five existing listings at a time.');
 await limitUsage(id+':price-checks',2000);
 const rows=workspaceCars(w).filter((r,i,all)=>a.ids.includes(r.id)&&all.findIndex(x=>x.id===r.id)===i);
 const reviewed=await Promise.all(rows.map(async r=>applyPriceReview(r,await checkListingPrice(r))));
 const latest=await readWorkspace(id);if(latest.searchedAt!==w.searchedAt)throw Error('Your search changed during price checking. Recheck the new results.');Object.assign(w,latest);
 const updated=new Map(reviewed.map(r=>[r.id,r]));
 w.listings=w.listings.map(r=>updated.get(r.id)??r);w.collected=w.collected?.map(r=>updated.get(r.id)??r);w.saved=w.saved.map(r=>updated.get(r.id)??r);w.comparisonCars=w.comparisonCars?.map(r=>updated.get(r.id)??r);
}
else if(a.action==='cancel'){w.pending=null;reply('Kept your original requirements.');}
else if(a.action==='save'){const row=retainedWorkspaceCars(w).find(r=>r.id===a.id)||await notifiedCar(id,String(a.id));if(!row)throw Error('This listing is no longer in your results.');if(w.saved.some(r=>r.id===row.id)){w.saved=w.saved.filter(r=>r.id!==row.id)}else{if(w.saved.length>=100)throw Error('You can save up to 100 cars.');w.saved.push(row)}}
else if(a.action==='compare'){const candidate=retainedWorkspaceCars(w).find(r=>r.id===a.id)||await notifiedCar(id,String(a.id));if(!candidate)throw Error('Listing not found.');toggleComparison(w,candidate)}
else if(a.action==='resetChat'){w.messages=[];w.pending=null;}
else if(a.action==='restoreSearch'){restorePreviousSearch(w);}
else if(a.action==='newSearch'){rememberSearch(w);w.filters={...initialFilters};w.messages=[];w.listings=[];w.collected=[];w.poolFilters=undefined;w.sources=[];w.pending=null;w.searchedAt=null;w.nextCursor=null;w.searchId=crypto.randomUUID();w.batch=0;}
else if(a.action==='saveSearch'){
 const filters=a.filters?filterSchema.parse(a.filters):w.filters;
 if(a.enabled!==undefined&&typeof a.enabled!=='boolean')throw Error('Invalid alert setting.');
 if(a.emailEnabled!==undefined&&typeof a.emailEnabled!=='boolean')throw Error('Invalid email setting.');
 await saveAlert(id,filters,alertSearchKey(filters)===alertSearchKey(w.filters)?w.listings:[],a.enabled===true,req.headers.get('oai-authenticated-user-email'),a.emailEnabled===true);
}
else if(a.action==='toggleAlert'){
 if(typeof a.enabled!=='boolean')throw Error('Invalid alert setting.');
 await db().batch([
  db().prepare('UPDATE alerts SET enabled=? WHERE id=? AND user_id=?').bind(a.enabled?1:0,String(a.id),id),
  db().prepare('UPDATE alert_settings SET lease=NULL,lease_until=0 WHERE alert_id IN (SELECT id FROM alerts WHERE id=? AND user_id=?)').bind(String(a.id),id),
 ]);
}
else if(a.action==='toggleAlertEmail'){
 if(typeof a.enabled!=='boolean')throw Error('Invalid email setting.');
 const email=req.headers.get('oai-authenticated-user-email');
 if(a.enabled&&(!emailReady()||!email))throw Error('Email alerts are not connected yet.');
 await db().prepare('INSERT INTO alert_settings(alert_id,email,email_enabled,unsubscribe_token) SELECT id,?,?,? FROM alerts WHERE id=? AND user_id=? ON CONFLICT(alert_id) DO UPDATE SET email=excluded.email,email_enabled=excluded.email_enabled').bind(a.enabled?email:null,a.enabled?1:0,crypto.randomUUID(),String(a.id),id).run();
}
else if(a.action==='checkAlert'){
 const result=await checkAlert(String(a.id),id);
 if('error' in result&&result.error)throw Error(result.error);
 if(!result.checked)throw Error('This search is already checking or is not due yet. Checks run at most once a day.');
}
else if(a.action==='readNotification'){
 await db().prepare('UPDATE notifications SET read_at=? WHERE id=? AND user_id=?').bind(Date.now(),String(a.id),id).run();
}
else if(a.action==='deleteAlert'){
 const alertId=String(a.id);
 await db().batch([
  db().prepare('DELETE FROM alert_seen WHERE alert_id IN (SELECT id FROM alerts WHERE id=? AND user_id=?)').bind(alertId,id),
  db().prepare('DELETE FROM alert_settings WHERE alert_id IN (SELECT id FROM alerts WHERE id=? AND user_id=?)').bind(alertId,id),
  db().prepare('DELETE FROM notifications WHERE alert_id=? AND user_id=?').bind(alertId,id),
  db().prepare('DELETE FROM alerts WHERE id=? AND user_id=?').bind(alertId,id),
 ]);
}
else if(a.action==='loadSearch'){const row=await db().prepare('SELECT filters FROM alerts WHERE id=? AND user_id=?').bind(String(a.id),id).first<{filters:string}>();if(!row)throw Error('Saved search not found.');rememberSearch(w);w.filters=filterSchema.parse(JSON.parse(row.filters));w.listings=[];w.collected=[];w.poolFilters=undefined;w.searchedAt=null;w.pending=null;w.nextCursor=null;w.searchId=crypto.randomUUID();w.batch=0;w.sources=[];reply('Saved filters loaded. Press Search to check current listings.');}
else throw Error('Unknown action.');
if(search){
  const access=await connectionStatus(id);
  if(!access.marketcheck&&!access.autodev&&!access.apify)throw Error('Live inventory is not connected for this account yet. This is an access issue, not a lack of matching cars. Your previous search and saved cars are unchanged.');
  const continuing=a.action==='nextBatch';
  const cursor=continuing?(a.automatic?healthyCursor(w.nextCursor,w.sources):w.nextCursor):undefined;
  if(continuing&&!cursor)throw Error('Remaining sources are unavailable. Your collected cars are still here.');
  if(!continuing)w.filters=await resolveSearchVehicle(id,await resolveZip(w.filters));
  const result=await searchListings(w.filters,await inventoryKeys(id),cursor??undefined,!continuing);
  const latest=await readWorkspace(id);
  if(latest.searchId!==w.searchId||(continuing&&JSON.stringify(latest.nextCursor)!==JSON.stringify(w.nextCursor)))throw Error('Your search changed while inventory was loading.');
  w.saved=latest.saved;w.compare=latest.compare;w.comparisonCars=latest.comparisonCars;
  const succeeded=result.sources.some(s=>s.status==='searched'&&s.inspected!==undefined);
  if(!continuing){rememberSearch(w,latest);w.searchId=crypto.randomUUID();}
  const keepLoaded=continuing||a.action==='chat'||a.action==='confirm';
  if(succeeded||!continuing){const retained=keepLoaded?(w.collected??w.listings):[];collectWorkspace(w,[...retained,...(result.records??result.listings)],!continuing);w.batch=continuing?(w.batch??1)+1:1;w.searchedAt=result.checkedAt;}
  const nextCursor=continuing&&a.automatic?preserveDeferredCursor(result.nextCursor,w.nextCursor,w.sources):result.nextCursor;
  w.sources=continuing?mergeSources(w.sources,result.sources):result.sources;w.nextCursor=nextCursor;
  const message=access.apify&&!access.marketcheck&&!access.autodev?'Your requirements are ready. Searching the connected marketplaces next; results may take a few minutes.':!succeeded?'Some inventory sources could not be checked. Your collected cars remain available. Open Sources for details.':`Found ${w.listings.length} matching cars across the inventory checked so far. ${healthyCursor(w.nextCursor,w.sources)?'More inventory pages are available.':'All currently accessible pages for this search have been checked.'} ${w.listings.length<5?'Fewer than five exact matches have been found so far; your requirements have not been relaxed. ':''}Your requested requirements are shown beside the results. Seller prices and equipment still need confirmation.`;
  if(continuing&&w.messages.at(-1)?.role==='assistant')w.messages[w.messages.length-1]={role:'assistant',text:message,ids:w.listings.slice(0,12).map(r=>r.id),at:Date.now()};
  else reply(message,w.listings.slice(0,12).map(r=>r.id));
}

if(!['saveSearch','toggleAlert','toggleAlertEmail','checkAlert','readNotification','deleteAlert'].includes(a.action))await writeWorkspace(id,w);return Response.json(await snapshot(id),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e)}}
