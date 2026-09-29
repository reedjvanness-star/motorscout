import {record} from './unknown-data';
import {autotraderMarketcheckUrl,normalizeMarketcheck} from './marketcheck';
import {safeUrl,type Filters,type Listing} from './domain';

// Verified against live MarketCheck source responses, September 19, 2026.
export const retailers={
 'carmax.com':{name:'CarMax',path:/^\/car\/\d+\/?$/},
 'carvana.com':{name:'Carvana',path:/^\/vehicle\/\d+\/?$/},
 'autonationusa.com':{name:'AutoNation USA',path:/^\/cars\/[A-HJ-NPR-Z0-9]{17}\/?$/i},
 'driveway.com':{name:'Driveway',path:/^\/shop\/vehicle\/\d+\/?$/},
 'echopark.com':{name:'EchoPark',path:/^\/car\/[A-HJ-NPR-Z0-9]{17}\/?$/i},
} as const;
export function retailerInventoryUrl(f:Filters,offset=0){
 const url=autotraderMarketcheckUrl(f,offset);
 url.searchParams.set('source',Object.keys(retailers).join(','));
 return url;
}
export function normalizeRetailer(input:unknown):Listing|null{
 const x=record(input);
 const url=safeUrl(x?.vdp_url);if(!url||x.inventory_type!=='used')return null;
 const u=new URL(url),host=u.hostname.replace(/^www\./,'');
 if(!Object.prototype.hasOwnProperty.call(retailers,host))return null;
 const retailer=retailers[host as keyof typeof retailers];if(!retailer.path.test(u.pathname))return null;
 const row=normalizeMarketcheck(x,false);if(!row||!row.make||!row.model)return null;
 // Use the vehicle's location, not a national retailer's corporate address.
 return {...row,source:retailer.name,seller:'dealer',state:String(record(x.car_location).state??'').toUpperCase(),city:String(record(x.car_location).city??''),concerns:[...row.concerns,`${retailer.name} inventory supplied by MarketCheck. Coverage is partial; confirm location, delivery costs and availability.`]};
}
