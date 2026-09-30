import {marketplaceRegions} from './marketplace-regions';
import type {Source} from './domain';
const marketplaceNames=['Cars.com','CarGurus','TrueCar','Facebook Marketplace','Craigslist','Carvana'];
export function sourceDisplay(source:Source,marketplacesConnected:boolean,state:string){
 if(source.name==='CarMax'&&source.status==='error'&&source.detail.startsWith('The targeted CarMax search'))return {label:'Temporarily unavailable',detail:'The direct CarMax provider reported blocked requests and an exhausted fetch allowance. New searches use other connected marketplaces. CarMax listings may also arrive through the separate MarketCheck retailer feed when that feed is available.'};
 if(source.status==='unavailable'&&source.detail.startsWith('Excluded by your '))return {label:'Excluded by your filters',detail:source.detail};
 const regional=source.name==='Facebook Marketplace';
 if(marketplacesConnected&&marketplaceNames.includes(source.name)&&source.status==='unavailable'){
  if(regional&&!marketplaceRegions('facebook',state).length)return {label:'Outside current coverage',detail:'Facebook currently supports local searches around Denver, San Francisco, New York City and Chicago. Your selected state is outside that coverage.'};
  return {label:'Connected · not checked yet',detail:`Available through your marketplace provider${regional?' for selected local search centers':''}. Use “Check more marketplaces” to check this search. Coverage is partial.`};
 }
 const limited=/quota|rate.*limit|allowance|429/i.test(source.detail);
 return {label:source.status==='error'?(limited?'Provider limit reached':'Could not complete check'):source.status==='searched'?((source.count??0)>0?'Listings returned':'Checked · no listings returned'):source.status==='ready'?'Ready to search':'Not connected',detail:source.detail};
}
