'use client';
import {useState} from 'react';
import Image from 'next/image';
import {CarFront} from 'lucide-react';

type PhotoProps={src:string|null;title:string;className:string;loading?:'lazy'|'eager';onUnavailable?:(url:string)=>void};
export function VehiclePhoto(props:PhotoProps){return <Photo key={props.src??'missing'} {...props}/>;}
function Photo({src,title,className,loading='lazy',onUnavailable}:PhotoProps){
 const [failed,setFailed]=useState(false);
 return src&&!failed?<Image unoptimized width={800} height={600} src={src} alt={title} className={className} loading={loading} decoding="async" onError={()=>{setFailed(true);onUnavailable?.(src)}}/>:<div className={`${className} photo-placeholder`}><CarFront size={36} aria-hidden="true"/><span>Photo unavailable</span></div>;
}
