import type {Filters} from './domain';
export type Place={zip:string;city:string;state:string;latitude:number;longitude:number};
export type ListingLocation={postalCode?:string;coordinates?:{latitude:number;longitude:number}|null;locationQuery?:{zip:string;radiusMiles:number}};
export function coordinates(latitude:unknown,longitude:unknown){
 if(latitude===null||latitude===undefined||latitude===''||longitude===null||longitude===undefined||longitude==='')return null;
 const lat=Number(latitude),lon=Number(longitude);
 return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?{latitude:lat,longitude:lon}:null;
}
export function milesBetween(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}){
 const rad=Math.PI/180,dLat=(b.latitude-a.latitude)*rad,dLon=(b.longitude-a.longitude)*rad;
 const h=Math.sin(dLat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dLon/2)**2;
 return 3958.7613*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
}
export function locationMatches(row:ListingLocation,f:Filters){
 if(!f.zip)return true;
 if(f.location?.zip!==f.zip)return false;
 if(row.coordinates)return milesBetween(f.location,row.coordinates)<=f.radiusMiles;
 // A provider's documented radius filter is evidence only for that query.
 return row.locationQuery?.zip===f.zip&&row.locationQuery.radiusMiles<=f.radiusMiles;
}
export function locationLabel(f:Filters){return f.zip?`${f.radiusMiles} miles from ${f.location?.zip===f.zip?`${f.location.city}, ${f.location.state} `:''}${f.zip}`:f.state||'Nationwide'}
