import type {Filters} from './domain';
export function zipInText(text:string){return text.trim().match(/^(\d{5})(?:-\d{4})?(?:\s+within\s+\d+\s+miles?)?$/)?.[1]??text.match(/\b(?:zip(?:\s*code)?(?:\s+is)?|near|around|in|from)\s*[:#]?\s*(\d{5})(?:-\d{4})?\b/i)?.[1]}
export function applyLocationText(text:string,f:Filters){
 const zip=zipInText(text),radius=text.match(/\b(?:within|radius(?:\s+of)?)\s+(\d+)\s*(?:miles?|mi)\b/i);
 return {...f,...(zip?{zip,state:'',location:null}:{}),...(radius?{radiusMiles:Number(radius[1])}:{}),...(/\bnationwide\b|\banywhere in (?:the )?(?:us|usa)\b/i.test(text)?{zip:'',state:'',location:null}:{})};
}
export function localLocationCommand(text:string,current:Filters){
 if(!/^(?:(?:search |look )?(?:near|around|in|from)\s+|(?:my )?zip(?:\s*code)?(?:\s+is)?\s*[:#]?\s*)?\d{5}(?:-\d{4})?(?:\s+within\s+\d+\s+miles?)?[.!?]?$/i.test(text.trim()))return null;
 const filters=applyLocationText(text.trim().replace(/[.!?]$/,''),current);
 return filters.zip?{action:'search',filters,question:''}:null;
}
