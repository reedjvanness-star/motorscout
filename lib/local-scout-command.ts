import {relaxed} from './domain';
import {engineTerm} from './engine-specs';
// Exact, self-contained shortcuts only. Requests with extra requirements still use Scout.
export function localScoutCommand(text:string):'compare'|null{
 return /^(?:compare cars|compare my selected cars|compare the cheapest cars in my results|compare my saved cars)[.!?]?$/i.test(text.trim())?'compare':null;
}
export function localScoutRefinement(text:string,current:Filters,base:Filters=current):{action:'refine'|'clarify';filters:Filters;question:string}|null{
 const clean=text.trim().replace(/[.!?]$/,'').toLowerCase();
 if(/^(?:show |restore )?(?:all (?:the )?)?collected cars$/.test(clean))return {action:'refine',filters:{...base},question:''};
 const allowed=(next:Filters)=>!relaxed(base,next);
 const engine=engineTerm(clean.replace(/^(?:only |show (?:me )?(?:only )?)/,'').replace(/(?: cars| ones)?(?: only)?$/,''));
 if(engine){const group=(x:string)=>/\d/.test(x)?'cylinders':'induction';const next={...current,requiredTerms:[...current.requiredTerms.filter(x=>!engineTerm(x)||group(engineTerm(x)!)!==group(engine)),engine]};if(allowed(next))return {action:'refine',filters:next,question:''};}
 if(clean==='only awd'&&allowed({...current,awd:true,drivetrain:'awd'}))return {action:'refine',filters:{...current,awd:true,drivetrain:'awd'},question:''};
 if(clean==='lower mileage')return current.maxMiles===null
  ?{action:'clarify',filters:current,question:'What maximum mileage would you like? I can filter your loaded cars without starting a new marketplace search.'}
  :{action:'refine',filters:{...current,maxMiles:Math.max(0,current.maxMiles-10000)},question:''};
 const mileage=clean.match(/^(?:(?:only )?(?:show(?: me)? )?(?:cars |ones )?)?(?:under|below|with (?:under|less than|fewer than)) ([\d,]+(?:\.\d+)?)\s*(k)? miles$/);
 if(mileage){
  const maxMiles=Number(mileage[1].replaceAll(',',''))*(mileage[2]?1000:1);
  if(Number.isInteger(maxMiles)&&maxMiles>=0&&maxMiles<=1000000&&allowed({...current,maxMiles}))return {action:'refine',filters:{...current,maxMiles},question:''};
 }
 const budget=clean.match(/^(?:(?:only )?(?:show(?: me)? )?(?:cars |ones )?)?(?:under|below|up to) \$([\d,]+(?:\.\d+)?)\s*(k)?$/);
 if(budget){
  const maxPrice=Number(budget[1].replaceAll(',',''))*(budget[2]?1000:1);
  if(Number.isInteger(maxPrice)&&maxPrice>=500&&maxPrice<=1000000&&allowed({...current,maxPrice}))return {action:'refine',filters:{...current,maxPrice},question:''};
 }
 const color=clean.match(/^(?:(?:only )?(?:show(?: me)? )?)(?:the )?(black|white|gray|grey|silver|blue|red|green|yellow|orange|brown|beige|purple)(?: cars| ones)?(?: only)?$/);
 if(color&&allowed({...current,exteriorColor:color[1]}))return {action:'refine',filters:{...current,exteriorColor:color[1]},question:''};
 const transmission=clean.match(/^(?:only |show (?:me )?(?:only )?)?(manual|automatic)(?: cars| ones| transmission)?(?: only)?$/);
 if(transmission&&allowed({...current,transmission:transmission[1] as 'manual'|'automatic'}))return {action:'refine',filters:{...current,transmission:transmission[1] as 'manual'|'automatic'},question:''};
 return null;
}
import type {Filters} from './domain';

export function loadedScoutRefinement(text:string,w:Pick<import('./domain').Workspace,'searchedAt'|'filters'|'poolFilters'>){return w.searchedAt?localScoutRefinement(text,w.filters,w.poolFilters??w.filters):null}
