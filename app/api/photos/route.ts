import {identity,boundedJson,readWorkspace,failure} from '@/lib/server';
import {retainedWorkspaceCars} from '@/lib/chat-results';
import {listingPhotoUrls} from '@/lib/vehicle-photos';
export async function POST(req:Request){try{
 const id=identity(req),body=await boundedJson(req),w=await readWorkspace(id);
 const car=retainedWorkspaceCars(w).find(row=>row.id===body.id);
 if(!car)throw Error('This car is no longer stored in your workspace.');
 return Response.json({photos:listingPhotoUrls(car),note:'Photos supplied with this listing.'},{headers:{'Cache-Control':'no-store'}});
}catch(e){return failure(e)}}
