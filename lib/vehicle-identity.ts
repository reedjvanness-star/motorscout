import {vehicles} from './vehicle-options';

export const vehicleNameKey=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
export const normalizeAudiText=(value:string)=>value.replace(/\b(RS|SQ|S|A|Q|R)[ -]+([1-8])\b/gi,(_,prefix,number)=>prefix.toUpperCase()+number).replace(/\bRS[ -]*Q[ -]*8\b/gi,'RS Q8');
export const normalizeMercedesText=(value:string)=>value.replace(/\be\s*55\s*(?:a?mg)\b/gi,'E 55 AMG').replace(/\bamg\s*e\s*55\b/gi,'E 55 AMG').replace(/\be55\b/gi,'E 55 AMG');
export const normalizeBmwText=(value:string)=>value.replace(/\bm[ -]*550[ -]*i\b/gi,'M550i').replace(/\bx[ -]*drive\b/gi,'xDrive');
export function trimMatches(actual:string,requested:string){
 const words=(v:string)=>normalizeBmwText(normalizeMercedesText(v)).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const a=words(actual),r=words(requested);if(!r)return true;
 if(/\bpremium\b/.test(r)&&!r.includes('premium plus')&&a.includes('premium plus'))return false;
 return (' '+a+' ').includes(' '+r+' ');
}
export function canonicalVehicle<T extends {make:string;model:string;trim:string}>(input:T):T{
 const out={...input,make:input.make.trim(),model:input.model.trim(),trim:input.trim.trim()};
 if(['benz','mercedes','mercedesbenz'].includes(vehicleNameKey(out.make)))out.make='Mercedes-Benz';
 if((!out.make||out.make==='Mercedes-Benz')&&['e55','e55amg','e55mg','amge55'].includes(vehicleNameKey(out.model))){out.make='Mercedes-Benz';out.model='E-Class';if(!out.trim)out.trim='E 55 AMG';}
 if(out.make==='Mercedes-Benz')out.trim=normalizeMercedesText(out.trim);
 const makes=Object.keys(vehicles);
 const make=makes.find(m=>vehicleNameKey(m)===vehicleNameKey(out.make));
 if(make)out.make=make;
 const bmwModel=normalizeBmwText(out.model).replace(/^BMW\s+/i,'');
 const conflictingBmwTrim=/\b(?:550i|M5)\b/i.test(normalizeBmwText(out.trim));
 if((!out.make||out.make==='BMW')&&/^M550i(?: xDrive)?$/i.test(bmwModel)&&!conflictingBmwTrim){
  out.make='BMW';out.model='5 Series';
  if(!out.trim)out.trim=bmwModel;
  else if(!/\bM550i\b/i.test(normalizeBmwText(out.trim)))out.trim=`${bmwModel} ${out.trim}`;
  else if(/\bxDrive\b/i.test(bmwModel)&&!/\bxDrive\b/i.test(normalizeBmwText(out.trim)))out.trim=normalizeBmwText(out.trim).replace(/\bM550i\b/i,'M550i xDrive');
 }
 if(out.make==='BMW')out.trim=normalizeBmwText(out.trim);

 const candidates=Object.entries(vehicles).filter(([m])=>!out.make||m===out.make).flatMap(([m,models])=>Object.keys(models).filter(model=>[model,m+' '+model].some(s=>vehicleNameKey(s)===vehicleNameKey(out.model))).map(model=>({make:m,model})));
 if(candidates.length===1){out.make=candidates[0].make;out.model=candidates[0].model;}
 return out;
}

// Recover a missing variant only from the vehicle badge at the start of its title.
// Explicit provider model/trim values remain authoritative, including conflicts.
export function canonicalListingVehicle<T extends {make:string;model:string;trim:string;title:string}>(input:T):T{
 const out=canonicalVehicle(input);
 if(out.make==='BMW'&&out.model==='5 Series'&&!out.trim){
  const badge=normalizeBmwText(out.title).match(/^(?:used\s+)?(?:(?:19|20)\d{2}\s+)?(?:BMW\s+)?(?:5\s*Series\s+)?(M550i(?:\s+xDrive)?)\b/i)?.[1];
  if(badge)out.trim=normalizeBmwText(badge);
 }
 return out;
}
