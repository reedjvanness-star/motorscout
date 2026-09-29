import {listingKey,type Listing,type Workspace} from './domain';

export function collectedCarCount(w:Pick<Workspace,'collected'|'listings'>){return new Set((w.collected??w.listings).map(listingKey)).size;}

export function workspaceCars(w:Workspace){
 const cars=new Map<string,Listing>();
 for(const car of [...(w.comparisonCars??[]),...w.saved,...w.listings])cars.set(car.id,car);
 return [...cars.values()].map(car=>({...car,total:car.price+(car.fees??0)+w.filters.shippingAllowance}));
}
export function restoreComparisons(w:Workspace){
 const cars=new Map(workspaceCars(w).map(car=>[car.id,car]));
 w.compare=[...new Set(w.compare)].filter(id=>cars.has(id)).slice(0,3);
 w.comparisonCars=w.compare.map(id=>cars.get(id)!);
}
export function toggleComparison(w:Workspace,car:Listing){
 restoreComparisons(w);
 if(w.compare.includes(car.id)){
  w.compare=w.compare.filter(id=>id!==car.id);
  w.comparisonCars=w.comparisonCars!.filter(c=>c.id!==car.id);
 }else{
  if(w.compare.length>=3)throw Error('Compare up to three cars at once. Remove one to add another.');
  w.compare.push(car.id);w.comparisonCars!.push(car);
 }
}
