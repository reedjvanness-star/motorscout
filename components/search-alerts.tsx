'use client';
import {Bell,Check,LoaderCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Switch} from '@/components/ui/switch';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription,SheetFooter} from '@/components/ui/sheet';
import {useState,useEffect} from 'react';
import {money,type Listing,type Filters} from '@/lib/domain';
import type {WorkspaceAction} from '@/lib/client-contract';
export type SavedAlert={id:string;filters:string;enabled:number;last_run:number|null;next_run:number;results:string|null;email_enabled:number|null;last_error:string|null};
export type MatchNotification={id:string;alert_id:string;cars:string;created_at:number;read_at:number|null};
export function AlertSignup({open,onOpenChange,labels,signedIn,scheduler,emailReady,busy,error,onSave}:{open:boolean;onOpenChange:(v:boolean)=>void;labels:string[];signedIn:boolean;scheduler:boolean;emailReady:boolean;busy:boolean;error?:string;onSave:(email:boolean)=>Promise<void>}){
 const [email,setEmail]=useState(false),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState('');
 const pending=busy||saving;
 async function save(){
  if(pending)return;
  setSaveError('');setSaving(true);
  try{await onSave(email&&emailReady)}catch(cause){setSaveError(cause instanceof Error?cause.message:'Your search could not be saved. Please try again.')}finally{setSaving(false)}
 }
 return <Sheet open={open} onOpenChange={onOpenChange}>
  <SheetContent className="filter-sheet alert-signup-sheet">
   <SheetHeader><SheetTitle>Save this search</SheetTitle><SheetDescription>Keep these exact filters in Saved searches.</SheetDescription></SheetHeader>
   <div className="sheet-body alert-signup">
    <div className="filter-chips">{labels.length?labels.map(t=><span className="filter-chip" key={t}>{t}</span>):<span className="helper">All used cars · no extra filters</span>}</div>
    <p>{scheduler?'New matches from available connected inventory appear in your inbox.':'Save now and reuse these filters anytime. Automatic checks are not active yet.'}</p>
    <label className="alert-toggle"><span>Email new matches</span><Switch checked={email&&emailReady} disabled={!emailReady||pending} onCheckedChange={setEmail}/></label>
    {!emailReady&&<p className="helper">Email is not available yet. You can still save this search.</p>}
    <p className="helper">Your filters stay unchanged. You can remove the saved search anytime.</p>
   </div>
   <SheetFooter className="alert-signup-footer">
    {(error||saveError)&&<p className="alert-signup-error" role="alert">{error||saveError}</p>}
    {signedIn?<Button className="alert-save-button" disabled={pending} onClick={()=>void save()}>{pending?<LoaderCircle className="spin"/>:<Bell/>}{saving?'Saving…':'Save search'}</Button>:<a className="alert-signin" href="/signin-with-chatgpt?return_to=/%3Ftab%3Dalerts" target="_top">Sign in to save search</a>}
   </SheetFooter>
  </SheetContent>
 </Sheet>;
}
export function SearchAlerts({alerts,notifications,scheduler,emailReady,busy,labels,onAction,onOpen,onSave}:{alerts:SavedAlert[];notifications:MatchNotification[];scheduler:boolean;emailReady:boolean;busy:boolean;labels:(filters:Filters)=>string[];onAction:(a:WorkspaceAction)=>Promise<unknown>;onOpen:(car:Listing)=>void;onSave:()=>void}){
 const [now,setNow]=useState(0);
 useEffect(()=>{const update=()=>setNow(Date.now());const initial=setTimeout(update,0);const interval=setInterval(update,30000);return()=>{clearTimeout(initial);clearInterval(interval)}},[]);
 return <><div className="results-heading"><div><h2>Saved searches</h2><p>Your wish list, with newly found matches in one place.</p></div><Button variant="outline" disabled={busy} onClick={onSave}><Bell/>Save a search</Button></div>{!scheduler&&<div className="notice"><Bell size={19}/><span>Automatic checks are awaiting an approved inventory feed and an active scheduler. Your saved requests stay here; use their filters to search again.</span></div>}<section className="match-inbox" aria-label="New car notifications"><h3>New matches {notifications.filter(n=>!n.read_at).length>0&&<span className="notification-count">{notifications.filter(n=>!n.read_at).length} unread</span>}</h3>{!notifications.length?<p className="helper">When a check finds a car you haven’t seen, it appears here.</p>:notifications.map(n=>{const cars:Listing[]=JSON.parse(n.cars);return <article className={`match-notification ${n.read_at?'read':''}`} key={n.id}><div className="notification-heading"><strong>{cars.length} newly found {cars.length===1?'match':'matches'}</strong><span>{new Date(n.created_at).toLocaleDateString()}</span>{!n.read_at&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>void onAction({action:'readNotification',id:n.id})}><Check/>Mark read</Button>}</div>{cars.map(car=><button key={car.id} className="notification-car" onClick={()=>{onOpen(car);if(!n.read_at)void onAction({action:'readNotification',id:n.id})}}><span>{car.title}<small>{car.miles===null?'Mileage unknown':`${car.miles.toLocaleString()} miles`} · {[car.city,car.state].filter(Boolean).join(', ')}</small></span><strong>{money(car.price)}</strong></button>)}<small>Found {new Date(n.created_at).toLocaleString()}. Confirm current availability with the seller.</small></article>})}</section>{alerts.length?alerts.map(a=><article className="alert-card" key={a.id}><div><h3>{labels(JSON.parse(a.filters)).join(' · ')}</h3><p>{a.enabled?(scheduler?'Daily checks on':'Notification request saved · activation pending'):'Daily checks paused'}</p><p>{a.last_run?`Last checked ${new Date(a.last_run).toLocaleString()}`:'Not checked yet'}{a.last_run&&a.enabled&&scheduler?` · Next check after ${new Date(a.next_run).toLocaleString()}`:''}</p>{a.last_error&&<p className="alert-check-error">{a.last_error}</p>}</div><label className="alert-toggle">{scheduler?"Daily notifications":"Enable when daily checks launch"}<Switch disabled={busy} checked={!!a.enabled} onCheckedChange={enabled=>void onAction({action:'toggleAlert',id:a.id,enabled})}/></label><label className="alert-toggle">Email new matches<Switch disabled={busy||(!emailReady&&!a.email_enabled)} checked={!!a.email_enabled} onCheckedChange={enabled=>void onAction({action:'toggleAlertEmail',id:a.id,enabled})}/></label><div className="car-actions"><Button variant="outline" size="sm" disabled={busy||!scheduler||a.next_run>now} onClick={()=>void onAction({action:'checkAlert',id:a.id})}>{busy?<LoaderCircle className="spin"/>:null}Check now</Button><Button variant="outline" size="sm" disabled={busy} onClick={()=>void onAction({action:'loadSearch',id:a.id})}>Use these filters</Button><Button variant="ghost" size="sm" disabled={busy} onClick={()=>void onAction({action:'deleteAlert',id:a.id})}>Remove search</Button></div>{a.results&&<p className="helper">{JSON.parse(a.results).listings?.length??0} matches in the last inventory batch. Checks keep your exact requirements; coverage and daily capacity are limited.</p>}</article>):<div className="vacant"><Bell/><h3>Haven’t found the right car?</h3><p>Save a search—even one with no matches—and return to its exact filters. Automatic alerts are shown only when activated.</p></div>}</>;
}
