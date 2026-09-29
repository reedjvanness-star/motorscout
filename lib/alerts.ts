import {record} from './unknown-data';
import {config,db,filterSchema,limitUsage,schedulerReady} from './server';
import {inventoryKeys} from './connections';
import {searchListings} from './sources';
import {listingKey,type Filters,type Listing} from './domain';
import {alertSearchKey,newAlertMatches,alertEmailText} from './alert-matches';
import {approvedAlertKeys} from './alert-access';
const DAY=86400000;
export function emailReady(){
 const settings=config();
 if(!settings.RESEND_API_KEY||typeof settings.ALERT_FROM_EMAIL!=='string'||!settings.ALERT_FROM_EMAIL.includes('@'))return false;
 try{const url=new URL(settings.ALERT_SITE_URL??'');return url.protocol==='https:'&&!url.username&&!url.password}catch{return false}
}
export async function alertSnapshot(userId:string){
 const [rows,notices]=await Promise.all([
  db().prepare('SELECT a.id,a.filters,a.enabled,a.last_run,a.next_run,a.results,s.email_enabled,s.last_error FROM alerts a LEFT JOIN alert_settings s ON s.alert_id=a.id WHERE a.user_id=? ORDER BY a.next_run').bind(userId).all(),
  db().prepare('SELECT id,alert_id,cars,created_at,read_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50').bind(userId).all(),
 ]);
 const keys=approvedAlertKeys(config(),await inventoryKeys(userId));
 return {alerts:rows.results,notifications:notices.results,emailReady:emailReady(),schedulerReady:!!(keys.marketcheck||keys.autodev)&&await schedulerReady()};
}
export async function saveAlert(userId:string,filters:Filters,baseline:Listing[],enabled:boolean,email:string|null,emailEnabled:boolean){
 const canonical=alertSearchKey(filters);
 const findExisting=async()=>{
  const existing=await db().prepare('SELECT id,filters FROM alerts WHERE user_id=?').bind(userId).all<{id:string;filters:string}>();
  return existing.results.find(a=>alertSearchKey(filterSchema.parse(JSON.parse(a.filters)))===canonical)?.id;
 };
 const existing=await findExisting();if(existing)return existing;
 if(emailEnabled&&(!emailReady()||!email))throw Error('Email alerts are not connected yet. You can save this search for in-app updates.');
 const id=crypto.randomUUID(),now=Date.now();
 // Store the canonical filter JSON so racing saves with different display
 // limits share the SQL duplicate guard. Legacy rows are matched above.
 const result=await db().batch([
  db().prepare('INSERT INTO alerts(id,user_id,filters,enabled,next_run) SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM alerts WHERE user_id=?)<10 AND NOT EXISTS(SELECT 1 FROM alerts WHERE user_id=? AND filters=?)').bind(id,userId,canonical,enabled?1:0,now,userId,userId,canonical),
  db().prepare('INSERT INTO alert_settings(alert_id,email,email_enabled,unsubscribe_token) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM alerts WHERE id=?)').bind(id,emailEnabled?email:null,emailEnabled?1:0,crypto.randomUUID(),id),
  db().prepare('INSERT OR IGNORE INTO alert_seen(alert_id,listing_key) SELECT ?,value FROM json_each(?) WHERE EXISTS(SELECT 1 FROM alerts WHERE id=?)').bind(id,JSON.stringify([...new Set(baseline.filter(c=>!c.priceWarning).map(listingKey))]),id),
 ]);
 if(!result[0].meta.changes){const concurrent=await findExisting();if(concurrent)return concurrent;throw Error('You can save up to 10 searches. Remove a saved search before adding another.');}
 return id;
}
// One bounded inventory batch per search per day; no scraper jobs or AI calls.
export async function checkAlert(id:string,userId?:string){
 const now=Date.now(),lease=crypto.randomUUID();
 const row=await db().prepare('SELECT a.id,a.user_id,a.filters,a.enabled,a.next_run FROM alerts a WHERE a.id=? AND (? IS NULL OR a.user_id=?)').bind(id,userId??null,userId??null).first<{id:string;user_id:string;filters:string;enabled:number;next_run:number}>();
 if(!row||(!userId&&!row.enabled))return {checked:false};
 if(row.next_run>now)return {checked:false,nextRun:row.next_run};
 await db().prepare('INSERT OR IGNORE INTO alert_settings(alert_id,unsubscribe_token) VALUES(?,?)').bind(id,crypto.randomUUID()).run();
 const claimed=await db().prepare('UPDATE alert_settings SET lease=?,lease_until=? WHERE alert_id=? AND lease_until<=? AND EXISTS(SELECT 1 FROM alerts WHERE id=? AND next_run<=? AND (?=1 OR enabled=1)) RETURNING alert_id').bind(lease,now+5*60000,id,now,id,now,userId?1:0).first();
 if(!claimed)return {checked:false};
 try{
  const filters=filterSchema.parse(JSON.parse(row.filters)),keys=approvedAlertKeys(config(),await inventoryKeys(row.user_id));
  if(!keys.marketcheck&&!keys.autodev)throw Error('Saved-search checks are awaiting an approved inventory feed. Your filters are saved; no personal connection is needed.');
  await limitUsage('__daily_alert_checks__',10);
  const result=await searchListings({...filters,limit:50},keys);
  if(!result.sources.some(s=>s.status==='searched'&&s.inspected!==undefined))throw Error('Inventory could not be checked. We will retry later.');
  const prior=await db().prepare('SELECT listing_key FROM alert_seen WHERE alert_id=?').bind(id).all<{listing_key:string}>();
  const fresh=newAlertMatches(result.listings,filters,new Set(prior.results.map(x=>x.listing_key))).slice(0,50);
  const noticeId=crypto.randomUUID();
  const guard='EXISTS(SELECT 1 FROM alert_settings s JOIN alerts a ON a.id=s.alert_id WHERE s.alert_id=? AND s.lease=? AND (?=1 OR a.enabled=1))';
  const statements=fresh.map(car=>db().prepare(`INSERT OR IGNORE INTO alert_seen(alert_id,listing_key) SELECT ?,? WHERE ${guard}`).bind(id,listingKey(car),id,lease,userId?1:0));
  if(fresh.length)statements.push(db().prepare(`INSERT INTO notifications(id,user_id,alert_id,cars,created_at) SELECT ?,?,?,?,? WHERE ${guard}`).bind(noticeId,row.user_id,id,JSON.stringify(fresh),now,id,lease,userId?1:0));
  statements.push(db().prepare(`UPDATE alerts SET last_run=?,next_run=?,results=? WHERE id=? AND ${guard}`).bind(now,now+DAY,JSON.stringify(result),id,id,lease,userId?1:0));
  statements.push(db().prepare('UPDATE alert_settings SET lease=NULL,lease_until=0,last_error=? WHERE alert_id=? AND lease=?').bind(result.sources.some(s=>s.status==='error')?'Some sources could not be checked. Matches cover the available sources.':null,id,lease));
  const committed=await db().batch(statements);
  // Pausing/removing a search while inventory loads invalidates the lease.
  if(!committed[committed.length-2].meta.changes)return {checked:false};
  return {checked:true,newMatches:fresh.length};
 }catch(e){
  const message=e instanceof Error&&e.message.startsWith('Daily limit')?'Daily check capacity reached. Your search is saved for the next available check.':e instanceof Error?e.message:'The check could not finish.';
  await db().batch([
   db().prepare('UPDATE alerts SET next_run=? WHERE id=? AND EXISTS(SELECT 1 FROM alert_settings WHERE alert_id=? AND lease=?)').bind(now+3600000,id,id,lease),
   db().prepare('UPDATE alert_settings SET lease=NULL,lease_until=0,last_error=? WHERE alert_id=? AND lease=?').bind(message,id,lease),
  ]);
  return {checked:false,error:message};
 }
}
export async function deliverAlertEmails(){
 if(!emailReady())return {sent:0};
 const origin=new URL(config().ALERT_SITE_URL??'').origin;
 if(!origin.startsWith('https://'))throw Error('An HTTPS MotorScout URL is required.');
 const rows=await db().prepare('SELECT n.id,n.cars,s.email,s.unsubscribe_token FROM notifications n JOIN alerts a ON a.id=n.alert_id JOIN alert_settings s ON s.alert_id=a.id WHERE a.enabled=1 AND s.email_enabled=1 AND s.email IS NOT NULL AND n.email_sent_at IS NULL AND n.email_attempts<3 AND n.created_at>? ORDER BY n.created_at LIMIT 10').bind(Date.now()-23*3600000).all<{id:string;cars:string;email:string;unsubscribe_token:string}>();
 let sent=0;
 for(const row of rows.results){
  const claim=await db().prepare('UPDATE notifications SET email_attempts=email_attempts+1 WHERE id=? AND email_sent_at IS NULL AND email_attempts<3 AND EXISTS(SELECT 1 FROM alerts a JOIN alert_settings s ON s.alert_id=a.id WHERE a.id=notifications.alert_id AND a.enabled=1 AND s.email_enabled=1 AND s.email=?) RETURNING id').bind(row.id,row.email).first();
  if(!claim)continue;
  try{
   await limitUsage('__alert_emails__',90);
   const unsubscribe=`${origin}/api/alerts/unsubscribe?token=${encodeURIComponent(row.unsubscribe_token)}`,cars=JSON.parse(row.cars) as Listing[];
   const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${config().RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`motorscout-${row.id}`},body:JSON.stringify({from:config().ALERT_FROM_EMAIL,to:[row.email],subject:`MotorScout found ${cars.length} new ${cars.length===1?'match':'matches'}`,text:alertEmailText(cars,origin)+`\n\nStop email alerts for this search: ${unsubscribe}`,headers:{'List-Unsubscribe':`<${unsubscribe}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}),signal:AbortSignal.timeout(10000)});
   if(!response.ok)continue;
   const data=record(await response.json());if(!data.id)continue;
   await db().prepare('UPDATE notifications SET email_sent_at=? WHERE id=?').bind(Date.now(),row.id).run();sent++;
  }catch{/* Keep the in-app notification. Retries stop before the 24h idempotency window expires. */}
 }
 return {sent};
}
