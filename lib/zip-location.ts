import type {Filters,Listing} from './domain';
import type {Place} from './location';
import zipData from './data/us-zips.json';
const places=zipData as unknown as Record<string,[string,string,number,number]>;
export async function lookupZip(zip:string):Promise<Place>{
 if(!/^\d{5}$/.test(zip))throw Error('Enter a five-digit U.S. ZIP code.');
 const p=places[zip];
 if(!p)throw Error(`ZIP code ${zip} was not found in our U.S. ZIP data. Check the five digits or choose a state.`);
 return {zip,city:p[0],state:p[1],latitude:p[2],longitude:p[3]};
}
export async function resolveZip(f:Filters):Promise<Filters>{
 if(!f.zip)return {...f,location:null};
 return {...f,state:'',location:await lookupZip(f.zip)};
}
export async function locateListings(rows:Listing[],f:Filters){
 if(!f.zip)return rows;
 return rows.map(row=>{
  const place=places[row.postalCode??''];
  return row.coordinates||!place?row:{...row,coordinates:{latitude:place[2],longitude:place[3]}};
 });
}
