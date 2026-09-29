import {record} from './unknown-data';
export type CatalogField='make'|'model'|'trim';
export type CatalogResult={values:string[];complete:boolean};
export function catalogUrl(field:CatalogField,make='',model='',offset=0){
 const u=new URL('https://api.marketcheck.com/v2/search/car/active');
 u.searchParams.set('rows','0');u.searchParams.set('country','us');u.searchParams.set('facets',`${field}|${offset}|1000|1`);u.searchParams.set('facet_sort','index');
 if(field!=='make'&&make)u.searchParams.set('make',make);
 if(field==='trim'&&model)u.searchParams.set('model',model);
 return u;
}
export async function fetchCatalog(key:string,field:CatalogField,make='',model='',request:typeof fetch=fetch):Promise<CatalogResult>{
 const values=new Map<string,string>();
 for(let offset=0;offset<5000;offset+=1000){
  const u=catalogUrl(field,make,model,offset);u.searchParams.set('api_key',key);
  const response=await request(u,{headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('Vehicle suggestions are temporarily unavailable. You can still type any vehicle.');
  const data=record(await response.json()),terms=record(data.facets)[field];
  if(!Array.isArray(terms)||terms.some(t=>t?.result==='Error'))throw Error('Vehicle catalogue is unavailable.');
  for(const term of terms)if(typeof term?.item==='string'&&term.item.trim()&&term.item.length<=80&&term.count>0)values.set(term.item.trim().toLowerCase(),term.item.trim());
  if(terms.length<1000)return {values:[...values.values()].sort((a,b)=>a.localeCompare(b)),complete:true};
 }
 return {values:[...values.values()].sort((a,b)=>a.localeCompare(b)),complete:false};
}
export const catalogNameKey=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]/g,'');
export function resolveCatalogName(value:string,choices:string[]){return choices.find(c=>catalogNameKey(c)===catalogNameKey(value))??value;}
