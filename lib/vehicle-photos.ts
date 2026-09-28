// Preserve actual provider images; never manufacture angles or substitute stock cars.
export function photoUrls(...values:unknown[]):string[]{
 const urls=new Set<string>();
 function add(value:unknown,depth=0){
  if(depth>4||urls.size>=60)return;
  if(Array.isArray(value)){for(const item of value)add(item,depth+1);return;}
  if(value&&typeof value==='object'){const item=value as Record<string,unknown>;add(item.url??item.contentUrl??item.src,depth+1);return;}
  if(typeof value!=='string'||value.length>2048)return;
  try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return;
   if([...url.searchParams.keys()].some(k=>/^(api[-_]?key|access_token|authorization)$/i.test(k)))return;
   urls.add(url.href);
  }catch{/* Ignore invalid image URLs. */}
 }
 values.forEach(v=>add(v));return [...urls];
}
export async function fetchVehiclePhotos(vin:string,key:string,request:typeof fetch=fetch){
 if(!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin))throw Error('This listing does not include a valid VIN for extra photos.');
 const response=await request(`https://api.auto.dev/photos/${vin.toUpperCase()}`,{headers:{Authorization:`Bearer ${key}`,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(12000)});
 if(response.status===404)return [];
 if(!response.ok)throw Error(response.status===429?'The photo provider has reached its allowance. Available listing photos are still here.':'Extra photos are unavailable right now. You can still view the listing photos.');
 const data:any=await response.json();return photoUrls(data.data?.retail);
}
