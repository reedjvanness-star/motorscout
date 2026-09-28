import {identity,boundedJson,readWorkspace,failure} from '@/lib/server';
import {workspaceCars} from '@/lib/shortlist';
import {listingPhotoUrls} from '@/lib/vehicle-photos';
export async function POST(req:Request){try{
 const id=identity(req),body=await boundedJson(req),w=await readWorkspace(id);
 const car=workspaceCars(w).find(row=>row.id===body.id);
 if(!car)throw Error('Open a car from your current results or saved cars.');
 return Response.json({photos:listingPhotoUrls(car),note:'Photos supplied with this listing.'},{headers:{'Cache-Control':'no-store'}});
}catch(e){return failure(e)}}
