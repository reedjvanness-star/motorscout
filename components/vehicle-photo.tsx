'use client';
import {useEffect,useState} from 'react';
import {CarFront} from 'lucide-react';

export function VehiclePhoto({src,title,className,loading='lazy',onUnavailable}:{src:string|null;title:string;className:string;loading?:'lazy'|'eager';onUnavailable?:(url:string)=>void}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[src]);
 return src&&!failed?<img src={src} alt={title} className={className} loading={loading} decoding="async" onError={()=>{setFailed(true);onUnavailable?.(src)}}/>:<div className={`${className} photo-placeholder`}><CarFront size={36} aria-hidden="true"/><span>Photo unavailable</span></div>;
}
