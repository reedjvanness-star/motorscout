import {identity,boundedJson,readWorkspace,db,limitUsage,failure} from '@/lib/server';
import {providerKey} from '@/lib/connections';
import {workspaceCars} from '@/lib/shortlist';
import {photoUrls,fetchVehiclePhotos} from '@/lib/vehicle-photos';
export async function POST(req:Request){try{
 const id=identity(req),body=await boundedJson(req),w=await readWorkspace(id);
 const car=workspaceCars(w).find(row=>row.id===body.id);
 if(!car)throw Error('Open a car from your current results or saved cars.');
 const existing=photoUrls(car.photo,car.photos);
 if(existing.length>1)return Response.json({photos:existing,note:'Photos supplied with this listing.'});
 if(!car.vin||! /^[A-HJ-NPR-Z0-9]{17}$/i.test(car.vin))return Response.json({photos:existing,note:'No additional photos were supplied for this listing. The seller may have more.'});
 const cacheId=`__vehicle_photos__:${id}:${car.vin.toUpperCase()}`;
 const cached=await db().prepare('SELECT payload,updated_at FROM workspaces WHERE user_id=?').bind(cacheId).first<{payload:string;updated_at:number}>();
 const now=Date.now();
 if(cached&&now-cached.updated_at<3600000){const data=JSON.parse(cached.payload);return Response.json({...data,photos:photoUrls(existing,data.photos)},{headers:{'Cache-Control':'no-store'}});}
 const key=await providerKey(id,'autodev');
 if(!key)return Response.json({photos:existing,note:'These are the photos currently supplied by this source. The seller may have more.'});
 await limitUsage(id+':photo-lookups',30);
 const photos=await fetchVehiclePhotos(car.vin,key);
 const result={photos,note:photos.length?'Additional dealer photos matched by VIN through Auto.dev; photos may come from a different listing date.':'No additional photos were available for this VIN. The seller may have more.'};
 await db().prepare('INSERT INTO workspaces(user_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(cacheId,JSON.stringify(result),now).run();
 return Response.json({...result,photos:photoUrls(existing,photos)},{headers:{'Cache-Control':'no-store'}});
}catch(e){return failure(e)}}
