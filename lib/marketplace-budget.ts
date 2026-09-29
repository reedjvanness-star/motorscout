import {record} from './unknown-data';
import {apifyRequest,verifyFreeAccount,MarketplaceError} from './apify';

type Reservation={token:string;cap:number;runId?:string};
type Budget={cycle:string;base:number;charged:number;pending:Reservation[];receipts?:{token:string;runId:string}[];leaseUntil:number;lease:string};
import type {Database} from './database';
const finished=(s:string)=>['SUCCEEDED','FAILED','TIMED-OUT','ABORTED'].includes(s);
const amount=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0;

export class MarketplaceStartError extends MarketplaceError {
 constructor(message:string,readonly safeToRetry:boolean,readonly runId?:string){super(message)}
}
export async function marketplaceStartReservation(database:Database,key:string,token:string,request:typeof fetch=fetch){
 const account=await verifyFreeAccount(key,request);
 const row=await database.prepare('SELECT payload FROM workspaces WHERE user_id=?').bind('apify-budget:'+account).first<{payload:string}>();
 if(!row)return null;
 const budget:Budget=JSON.parse(row.payload);
 const hold=budget.pending.find(item=>item.token===token)??budget.receipts?.find(item=>item.token===token);
 return hold?{runId:hold.runId}:null;
}

// Keep a conservative local ledger alongside the provider's real billing-cycle usage.
// Completed runs consume their reported cost, not their maximum reservation.
export async function startBudgetedMarketplaceRun(database:Database,key:string,actor:string,input:unknown,cap:number,request:typeof fetch=fetch,operationToken=crypto.randomUUID()){
 const attempt:{submitted:boolean;runId?:string}={submitted:false};
 try{return await startRun(database,key,actor,input,cap,request,operationToken,attempt)}catch(error){throw new MarketplaceStartError(error instanceof Error?error.message:'Marketplace start failed.',!attempt.submitted,attempt.runId)}
}
async function startRun(database:Database,key:string,actor:string,input:unknown,cap:number,request:typeof fetch,operationToken:string,attempt:{submitted:boolean;runId?:string}){
 const account=await verifyFreeAccount(key,request),id='apify-budget:'+account;
 const lease=crypto.randomUUID(),now=Date.now();
 const empty:Budget={cycle:'',base:0,charged:0,pending:[],leaseUntil:now+120000,lease};
 const claim=await database.prepare("INSERT INTO workspaces(user_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=json_set(workspaces.payload,'$.lease',?,'$.leaseUntil',?),updated_at=excluded.updated_at WHERE COALESCE(json_extract(workspaces.payload,'$.leaseUntil'),0) < ? RETURNING payload").bind(id,JSON.stringify(empty),now,lease,now+120000,now).first<{payload:string}>();
 if(!claim)throw new MarketplaceError('Another marketplace search is starting. Try again in a moment.');
 let budget:Budget=JSON.parse(claim.payload);
 const save=async()=>{
  const result=await database.prepare("UPDATE workspaces SET payload=?,updated_at=? WHERE user_id=? AND json_extract(payload,'$.lease')=?").bind(JSON.stringify(budget),Date.now(),id,lease).run();
  if(result.meta?.changes!==1)throw new MarketplaceError('Marketplace allowance check expired. Please retry.');
 };
 try{
  const previous=budget.pending.find(hold=>hold.token===operationToken)??budget.receipts?.find(hold=>hold.token===operationToken);
  if(previous){attempt.submitted=true;if(previous.runId){attempt.runId=previous.runId;return {id:previous.runId,status:'RUNNING'}}throw new MarketplaceError('The previous marketplace start is unconfirmed. Its free-credit reservation is retained; another run will not be started.');}
  const data=record(record(await apifyRequest(key,'users/me/limits',{},request)).data);
  const used=record(data.current).monthlyUsageUsd,limit=record(data.limits).maxMonthlyUsageUsd;
  const cycle=String(record(data.monthlyUsageCycle).startAt??''),end=Date.parse(String(record(data.monthlyUsageCycle).endAt??''));
  if(!amount(used)||!amount(limit)||!Number.isFinite(Date.parse(cycle))||!(end>Date.now())||Date.parse(cycle)>Date.now())throw new MarketplaceError('Could not verify remaining free marketplace credit. Please retry later.');
  if(budget.cycle!==cycle){
   // Never discard reservations while another run could still be charging.
   if(record(data.current).activeActorJobCount!==0)throw new MarketplaceError('Wait for your running marketplace searches to finish, then retry.');
   budget={...empty,cycle,base:used,pending:budget.pending.filter(hold=>!hold.runId),receipts:[...(budget.receipts??[]),...budget.pending.flatMap(hold=>hold.runId?[{token:hold.token,runId:hold.runId}]:[])].slice(-100)};
  }
  for(const hold of [...budget.pending]){
   if(!hold.runId)continue; // An ambiguous start keeps its reservation; never assume it was free.
   const run=record(record(await apifyRequest(key,'actor-runs/'+encodeURIComponent(hold.runId),{},request)).data);
   if(finished(String(run.status))&&amount(run?.usageTotalUsd)){
    budget.charged+=run.usageTotalUsd;
    budget.receipts=[...(budget.receipts??[]),{token:hold.token,runId:hold.runId}].slice(-100);
    budget.pending=budget.pending.filter(p=>p.token!==hold.token);
   }
  }
  const held=budget.pending.reduce((sum,p)=>sum+p.cap,0);
  const freeCeiling=Math.max(0,Math.min(5,limit)-0.25);
  const available=Math.max(0,freeCeiling-Math.max(used,budget.base+budget.charged)-held);
  // Use verified free credit only, retaining a $0.25 cushion plus per-run overhead.
  // Unknown starts remain reserved; raising the usable free allowance never erases holds.
  const reservation=cap+0.02;
  if(available+1e-9<reservation){
   await save();
   throw new MarketplaceError(`MotorScout’s shared marketplace allowance cannot fund another search right now. Your account is connected; no personal setup is needed. Existing results and saved cars remain available. The app reserves credit for unfinished or unconfirmed requests and keeps a free-credit buffer. Paid upgrades are not enabled. Remaining allowance after reservations: $${available.toFixed(3)}; this search requires $${reservation.toFixed(2)}.`);
  }
  const hold:Reservation={token:operationToken,cap:reservation};
  budget.pending.push(hold);await save();
  attempt.submitted=true;
  const run=record(record(await apifyRequest(key,`acts/${actor}/runs?maxTotalChargeUsd=${cap}&timeout=240&memory=1024`,{method:'POST',body:JSON.stringify(input)},request)).data);
  if(typeof run.id==='string'&&run.id){hold.runId=run.id;attempt.runId=run.id;await save();}
  if(typeof run.id!=='string'||!run.id||typeof run.status!=='string'||!run.status)throw new MarketplaceError('Provider did not return a run identifier.');
  return {...run,id:run.id,status:run.status};
 }finally{
  await database.prepare("UPDATE workspaces SET payload=json_set(payload,'$.leaseUntil',0),updated_at=? WHERE user_id=? AND json_extract(payload,'$.lease')=?").bind(Date.now(),id,lease).run();
 }
}
