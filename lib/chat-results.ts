import type {Listing,Message,Workspace} from './domain';

// Current copies take precedence over older retained rows. No network lookup or
// filter relaxation is needed to open a message's explicitly referenced cars.
export function retainedWorkspaceCars(workspace:Workspace):Listing[]{
 const previous=workspace.previousSearch;
 const cars=new Map<string,Listing>();
 for(const car of [...(previous?.chatCars??[]),...(previous?.collected??[]),...(previous?.listings??[]),...(workspace.chatCars??[]),...(workspace.comparisonCars??[]),...workspace.saved,...(workspace.collected??[]),...workspace.listings])cars.set(car.id,car);
 return [...cars.values()];
}
export function resolveMessageCars(workspace:Workspace,message:Pick<Message,'ids'>):{cars:Listing[];missingCount:number}{
 const available=new Map(retainedWorkspaceCars(workspace).map(car=>[car.id,car]));
 const ids=[...new Set(message.ids??[])],cars:Listing[]=[];
 for(const id of ids){const car=available.get(id);if(car)cars.push(car)}
 return {cars,missingCount:ids.length-cars.length};
}
export function retainMessageCars(workspace:Workspace){
 const ids=[...new Set(workspace.messages.slice(-40).reverse().flatMap(message=>message.ids??[]))].slice(0,480);
 const {cars}=resolveMessageCars(workspace,{ids});
 workspace.chatCars=cars.length?cars:undefined;
}
