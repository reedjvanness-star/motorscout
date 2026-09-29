'use client';
import {useEffect,useState} from 'react';
import {vehicles} from './vehicle-options';
import {catalogNameKey,type CatalogField} from './vehicle-catalog';
const cache=new Map<string,{values:string[];complete:boolean;fallback?:boolean}>();
function useOptions(field:CatalogField,make:string,model:string,enabled:boolean){
 const key=JSON.stringify([field,make.toLowerCase(),model.toLowerCase()]);
 const [state,setState]=useState<{key:string;values:string[];status:string}>({key:'',values:[],status:''});
 useEffect(()=>{
  if(!enabled)return;
  if(cache.has(key))return;
  const controller=new AbortController();
  const timer=setTimeout(async()=>{try{const q=new URLSearchParams({field,make,model});const r=await fetch('/api/vehicles?'+q,{signal:controller.signal});if(!r.ok)throw Error();const data=await r.json() as {values:string[];complete:boolean;fallback?:boolean};if(!Array.isArray(data.values)||data.values.some(v=>typeof v!=='string'))throw Error();if(controller.signal.aborted)return;cache.set(key,data);setState({key,values:data.values,status:data.fallback?'fallback':data.complete?'live':'partial'});}catch{if(!controller.signal.aborted)setState({key,values:[],status:'fallback'});}},450);
  return ()=>{clearTimeout(timer);controller.abort();};
 },[key,enabled,field,make,model]);
 const previous=cache.get(key);
 return previous?{key,values:previous.values,status:previous.fallback?'fallback':previous.complete?'live':'partial'}:state.key===key?state:{key,values:[],status:enabled?'loading':''};
}
const merge=(a:string[],b:string[])=>[...new Map([...a,...b].map(v=>[catalogNameKey(v),v])).values()].sort((a,b)=>a.localeCompare(b));
export function useVehicleCatalog(make:string,model:string,enabled:boolean){
 const makes=useOptions('make','','',enabled),models=useOptions('model',make,'',enabled&&!!make),trims=useOptions('trim',make,model,enabled&&!!make&&!!model);
 const knownMake=Object.keys(vehicles).find(v=>catalogNameKey(v)===catalogNameKey(make))??make;
 const knownModel=Object.keys(vehicles[knownMake]??{}).find(v=>catalogNameKey(v)===catalogNameKey(model))??model;
 return {makes:merge(Object.keys(vehicles),makes.values),models:merge(Object.keys(vehicles[knownMake]??{}),models.values),trims:merge(vehicles[knownMake]?.[knownModel]??[],trims.values),status:(model?trims:make?models:makes).status};
}
