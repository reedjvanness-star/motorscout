import type {Workspace,SearchSnapshot} from './domain';

// One nonrecursive snapshot uses the same collection/message bounds as the live
// workspace. Saved cars and comparisons always belong to the current account.
export function captureSearch(workspace:Workspace):SearchSnapshot|undefined{
 if(!workspace.listings.length&&!workspace.collected?.length)return undefined;
 return structuredClone({...workspace.chatCars?.length?{chatCars:workspace.chatCars.slice(0,480)}:{},filters:workspace.filters,poolFilters:workspace.poolFilters,
  collected:workspace.collected?.slice(0,3000),listings:workspace.listings.slice(0,3000),
  messages:workspace.messages.slice(-40),sources:workspace.sources,searchedAt:workspace.searchedAt,
  searchId:workspace.searchId,nextCursor:workspace.nextCursor,batch:workspace.batch});
}
export function rememberSearch(workspace:Workspace,previous:Workspace=workspace){
 const snapshot=captureSearch(previous);
 if(snapshot)workspace.previousSearch=snapshot;
}
export function restorePreviousSearch(workspace:Workspace){
 if(!workspace.previousSearch)throw Error('There is no previous search to restore yet.');
 const previous=structuredClone(workspace.previousSearch),current=captureSearch(workspace);
 Object.assign(workspace,previous,{chatCars:previous.chatCars,collected:previous.collected,poolFilters:previous.poolFilters,batch:previous.batch,previousSearch:current,pending:null,searchId:crypto.randomUUID(),nextCursor:null});
}
