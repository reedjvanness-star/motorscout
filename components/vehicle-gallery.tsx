'use client';
import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Expand,Images,LoaderCircle,ZoomIn,ZoomOut} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {VehiclePhoto} from './vehicle-photo';
import {photoUrls} from '@/lib/vehicle-photos';
import type {Listing} from '@/lib/domain';

export function VehicleGallery({car}:{car:Listing}){
 const [photos,setPhotos]=useState(()=>photoUrls(car.photo,car.photos));
 const [index,setIndex]=useState(0),[expanded,setExpanded]=useState(false),[zoom,setZoom]=useState(false),[loading,setLoading]=useState(false),[note,setNote]=useState('Photos supplied with this listing.');
 const touch=useRef<number|null>(null);
 useEffect(()=>{
  const initial=photoUrls(car.photo,car.photos);setPhotos(initial);setIndex(0);setZoom(false);setNote('Photos supplied with this listing.');
  if(initial.length>1)return;
  let active=true;setLoading(true);
  fetch('/api/photos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:car.id}),signal:AbortSignal.timeout(16000)})
   .then(async response=>{const data:any=await response.json();if(!response.ok)throw Error(data.error||'Extra photos are unavailable.');if(active){setPhotos(photoUrls(initial,data.photos));setNote(typeof data.note==='string'?data.note:'Photos supplied for this vehicle.');}})
   .catch(e=>{if(active)setNote(e.name==='TimeoutError'?'Extra photos took too long to load. The seller may have more.':e.message);})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[car.id]);
 const move=(step:number)=>{setIndex(i=>(i+step+photos.length)%photos.length);setZoom(false)};
 const controls=<><button type="button" className="gallery-prev" aria-label="Previous photo" disabled={photos.length<2} onClick={()=>move(-1)}><ChevronLeft/></button><button type="button" className="gallery-next" aria-label="Next photo" disabled={photos.length<2} onClick={()=>move(1)}><ChevronRight/></button></>;
 const stage=(large=false)=><div className={`gallery-stage ${large?'gallery-large':''} ${large&&zoom?'gallery-zoomed':''}`} tabIndex={0} aria-label="Vehicle photo gallery. Use left and right arrow keys to browse." onKeyDown={e=>{if(photos.length>1&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();move(e.key==='ArrowLeft'?-1:1)}}} onTouchStart={e=>{touch.current=e.touches[0].clientX}} onTouchEnd={e=>{if(!zoom&&touch.current!==null&&photos.length>1){const change=e.changedTouches[0].clientX-touch.current;if(Math.abs(change)>45)move(change>0?-1:1)}touch.current=null;}}>
  <div className="gallery-image-scroll"><VehiclePhoto key={photos[index]} src={photos[index]??null} title={`${car.title} — photo ${index+1}`} className="gallery-image" loading="eager"/></div>
  {photos.length>1&&controls}
  {photos.length>0&&<span className="gallery-counter" aria-live="polite">{index+1} / {photos.length}</span>}
 </div>;
 const thumbs=<div className="gallery-thumbnails" aria-label="Choose a photo">{photos.map((url,i)=><button type="button" key={url} aria-label={`Show photo ${i+1}`} aria-pressed={i===index} onClick={()=>{setIndex(i);setZoom(false)}}><VehiclePhoto src={url} title={`Photo ${i+1}`} className="gallery-thumbnail"/></button>)}</div>;
 return <section className="vehicle-gallery" aria-label="Listing photos">
  <div className="gallery-heading"><span><Images size={17}/>{loading?'Loading photos…':`${photos.length} ${photos.length===1?'photo':'photos'}`}</span><button type="button" disabled={!photos.length} onClick={()=>setExpanded(true)}><Expand size={16}/>Expand gallery</button></div>
  {stage()}{photos.length>1&&thumbs}
  <p className="gallery-note" role="status">{loading?<><LoaderCircle className="spin" size={14}/>Checking for more photos of this car…</>:note}</p>
  <Dialog open={expanded} onOpenChange={open=>{setExpanded(open);setZoom(false)}}><DialogContent className="gallery-dialog"><div className="gallery-dialog-heading"><div><DialogTitle>{car.title}</DialogTitle><DialogDescription>Browse actual listing photos. Swipe or use the arrows to change views.</DialogDescription></div><button type="button" onClick={()=>setZoom(v=>!v)} aria-pressed={zoom}>{zoom?<ZoomOut/>:<ZoomIn/>}{zoom?'Fit photo':'Zoom in'}</button></div>{stage(true)}{photos.length>1&&thumbs}</DialogContent></Dialog>
 </section>;
}
