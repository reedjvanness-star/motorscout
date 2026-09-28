// Exact, self-contained shortcuts only. Requests with extra requirements still use Scout.
export function localScoutCommand(text:string):'compare'|null{
 return /^(?:compare cars|compare my selected cars|compare the cheapest cars in my results|compare my saved cars)[.!?]?$/i.test(text.trim())?'compare':null;
}
export function localScoutRefinement(text:string,current:Filters):{action:'refine'|'clarify';filters:Filters;question:string}|null{
 const clean=text.trim().replace(/[.!?]$/,'').toLowerCase();
 if(clean==='only awd')return {action:'refine',filters:{...current,awd:true,drivetrain:'awd'},question:''};
 if(clean==='lower mileage')return current.maxMiles===null
  ?{action:'clarify',filters:current,question:'What maximum mileage would you like? I can filter your loaded cars without starting a new marketplace search.'}
  :{action:'refine',filters:{...current,maxMiles:Math.max(0,current.maxMiles-10000)},question:''};
 const mileage=clean.match(/^(?:under|below|only under) ([\d,]+(?:\.\d+)?)\s*(k)? miles$/);
 if(mileage){
  const maxMiles=Number(mileage[1].replaceAll(',',''))*(mileage[2]?1000:1);
  if(Number.isInteger(maxMiles)&&maxMiles>=0&&maxMiles<=1000000&&(current.maxMiles===null||maxMiles<=current.maxMiles))return {action:'refine',filters:{...current,maxMiles},question:''};
 }
 return null;
}
import type {Filters} from './domain';
