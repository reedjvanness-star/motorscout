import type {Filters,Listing} from './domain';
import {coordinates,type Place} from './location';
const cache=new Map<string,Promise<Place>>();
export async function lookupZip(zip:string,request:typeof fetch=fetch):Promise<Place>{
 if(!/^\d{5}$/.test(zip))throw Error('Enter a five-digit U.S. ZIP code.');
 const lookup=async()=>{
  let response:Response;
  try{response=await request(`https://api.zippopotam.us/us/${zip}`,{signal:AbortSignal.timeout(5000),redirect:'error'});}catch{throw Error('ZIP lookup is unavailable. Try again, or choose a state in filters.');}
  if(response.status===404)throw Error(`ZIP code ${zip} was not found. Check the five digits.`);
  if(!response.ok)throw Error('ZIP lookup is unavailable. Try again, or choose a state in filters.');
  const data:any=await response.json(),p=data.places?.[0],point=coordinates(p?.latitude,p?.longitude);
  if(data['post code']!==zip||!point||!p?.['place name']||! /^[A-Z]{2}$/.test(p?.['state abbreviation']))throw Error('Could not verify this ZIP code. Please check it.');
  return {zip,city:String(p['place name']),state:String(p['state abbreviation']),...point};
 };
 // Public ZIP centroids only; never cache visitor data or credentials here.
 if(request!==fetch)return lookup();
 if(!cache.has(zip)){if(cache.size>=500)cache.clear();cache.set(zip,lookup().catch(e=>{cache.delete(zip);throw e}));}
 return cache.get(zip)!;
}
export async function resolveZip(f:Filters,request:typeof fetch=fetch):Promise<Filters>{
 if(!f.zip)return {...f,location:null};
 return {...f,state:'',location:await lookupZip(f.zip,request)};
}
export async function locateListings(rows:Listing[],f:Filters){
 if(!f.zip)return rows;
 const zips=[...new Set(rows.filter(r=>!r.coordinates&&!r.locationQuery).map(r=>r.postalCode??'').filter(z=>/^\d{5}$/.test(z)))].slice(0,100);
 const places=new Map<string,Place>();
 for(let i=0;i<zips.length;i+=10)await Promise.all(zips.slice(i,i+10).map(async zip=>{try{places.set(zip,await lookupZip(zip))}catch{/* Missing location never qualifies as nearby. */}}));
 return rows.map(row=>row.coordinates||!places.has(row.postalCode??'')?row:{...row,coordinates:places.get(row.postalCode!)!});
}
