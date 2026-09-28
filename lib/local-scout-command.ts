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
 const mileage=clean.match(/^(?:(?:only )?(?:show(?: me)? )?(?:cars |ones )?)?(?:under|below|with (?:under|less than|fewer than)) ([\d,]+(?:\.\d+)?)\s*(k)? miles$/);
 if(mileage){
  const maxMiles=Number(mileage[1].replaceAll(',',''))*(mileage[2]?1000:1);
  if(Number.isInteger(maxMiles)&&maxMiles>=0&&maxMiles<=1000000&&(current.maxMiles===null||maxMiles<=current.maxMiles))return {action:'refine',filters:{...current,maxMiles},question:''};
 }
 const budget=clean.match(/^(?:(?:only )?(?:show(?: me)? )?(?:cars |ones )?)?(?:under|below|up to) \$([\d,]+(?:\.\d+)?)\s*(k)?$/);
 if(budget){
  const maxPrice=Number(budget[1].replaceAll(',',''))*(budget[2]?1000:1);
  if(Number.isInteger(maxPrice)&&maxPrice>=500&&maxPrice<=1000000&&(current.maxPrice===null||maxPrice<=current.maxPrice))return {action:'refine',filters:{...current,maxPrice},question:''};
 }
 const color=clean.match(/^(?:(?:only )?(?:show(?: me)? )?)(?:the )?(black|white|gray|grey|silver|blue|red|green|yellow|orange|brown|beige|purple)(?: cars| ones)?(?: only)?$/);
 if(color&&(!current.exteriorColor||current.exteriorColor===color[1]))return {action:'refine',filters:{...current,exteriorColor:color[1]},question:''};
 const transmission=clean.match(/^(?:only |show (?:me )?(?:only )?)?(manual|automatic)(?: cars| ones| transmission)?(?: only)?$/);
 if(transmission&&(!current.transmission||current.transmission===transmission[1]))return {action:'refine',filters:{...current,transmission:transmission[1] as 'manual'|'automatic'},question:''};
 return null;
}
import type {Filters} from './domain';
