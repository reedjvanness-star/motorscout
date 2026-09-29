// Keep engine requirements independent of seller wording. Unknown is never a match.
export type EngineVehicle={engineText?:string;evidenceText?:string;make?:string;model?:string;trim?:string;year?:number|null;fuel?:string};
const normalize=(v:string)=>v.toLowerCase().replace(/[-_]/g,' ').replace(/\b(three|four|five|six|eight|ten|twelve|sixteen)\b/g,word=>({three:'3',four:'4',five:'5',six:'6',eight:'8',ten:'10',twelve:'12',sixteen:'16'}[word]!)).replace(/\s+/g,' ').trim();
export function engineTerm(value:string):string|null{
 const s=normalize(value).replace(/ engine$/,'');
 const layout=s.match(/^(v|w|i|h|inline|straight|flat|boxer)\s*(4|6|8|10|12|16)$/);
 if(layout)return ({inline:'i',straight:'i',boxer:'flat',h:'flat'}[layout[1]]??layout[1])+layout[2];
 const count=s.match(/^(3|4|5|6|8|10|12|16)\s*(?:cylinders?|cyl)$/);
 if(count)return count[1]+' cylinder';
 if(/^(supercharged|supercharger|supercherged)$/.test(s))return 'supercharged';
 if(/^(turbo|turbocharged|turbocharger)$/.test(s))return 'turbocharged';
 if(/^(twin turbo|twin turbocharged|biturbo|bi turbo)$/.test(s))return 'twin turbo';
 if(/^(naturally aspirated)$/.test(s))return 'naturally aspirated';
 return null;
}
export function requestedEngineTerms(text:string):string[]{
 const tokens=normalize(text).match(/\b(?:twin turbo(?:charged)?|bi ?turbo|naturally aspirated|non turbo|supercharg(?:ed|er)|supercherged|turbo(?:charged|charger)?|(?:v|w|i|h|inline|straight|flat|boxer)\s*(?:16|12|10|8|6|4)|(?:16|12|10|8|6|5|4|3)\s*(?:cylinders?|cyl))\b/g)??[];
 return [...new Set(tokens.map(engineTerm).filter((x):x is string=>!!x))];
}
// Only engine-specific provider fields belong here; never stringify entire records.
export function providerEngineText(...values:unknown[]):string{
 const keys=['name','description','engineType','engine_type','configuration','engineConfiguration','cylinderConfiguration','cylinder_configuration','aspiration','induction','engine_aspiration'];
 return values.flatMap(value=>{
  if(typeof value==='string')return [value];
  if(!value||typeof value!=='object'||Array.isArray(value))return [];
  const v=value as Record<string,unknown>;
  const count=v.cylinders??v.numberOfCylinders??v.cylinder_count;
  const layout=String(v.engine_block??v.configuration??'').toLowerCase();
  const combined=/^(v|i|w|h)$/.test(layout)&&/^(3|4|5|6|8|10|12|16)$/.test(String(count))?[layout+count]:[];
  return [...combined,...keys.flatMap(k=>typeof v[k]==='string'?[v[k] as string]:[]),...['cylinders','numberOfCylinders','cylinder_count'].flatMap(k=>/^(3|4|5|6|8|10|12|16)$/.test(String(v[k]??''))?[`${v[k]} cylinder`]:[])];
 }).join('\n').slice(0,2000);
}
function facts(text:string){
 const result=new Set<string>();
 // Split on sentences/newlines, not decimal points in displacement (3.0L).
 for(const line of text.split(/\n|;|[.!?](?:\s|$)/)){
  if(/\bno\b|\bwithout\b|\bnot\b|optional|available separately|instead of|unlike|compared to|performance of|v\d+ like|replaced|swap|conversion/i.test(line))continue;
  for(const term of requestedEngineTerms(line)){
   result.add(term);
   const count=term.match(/^(?:v|w|i|flat)(\d+)$/);if(count)result.add(count[1]+' cylinder');
   if(term==='twin turbo')result.add('turbocharged');
  }
 }
 return result;
}
export function engineFacts(r:EngineVehicle):{terms:string[];basis:string}{
 const structured=facts(r.engineText??'');
 const described=facts(r.evidenceText??'');
 const terms=new Set([...structured,...described]);
 // US 2015 Audi 3.0T: Audi's EPA application, test group FVGAJ03.0AUD.
 // https://dis.epa.gov/otaqpub/display_file.jsp?docid=33544&flag=1
 // Require the engine-specific trim as these nameplates also have other engines.
 const factory=r.make?.toLowerCase()==='audi'&&r.year===2015&&
  /^(s4|s5|s5 cabriolet|q5|sq5|a6|a7)$/i.test(r.model??'')&&/\b3\.0\s*t(?:fsi)?\b/i.test(r.trim??'')&&
  !/diesel|electric/i.test(r.fuel??'')&&!/swap|conversion|replaced|\bnot supercharged\b|\bno supercharger\b/i.test(r.evidenceText??'');
 const factoryConflict=[...terms].some(t=>/^(?:v|w|i|flat)\d+$/.test(t)&&t!=='v6'||/^\d+ cylinder$/.test(t)&&t!=='6 cylinder'||['turbocharged','naturally aspirated'].includes(t));
 if(factory&&!factoryConflict){terms.add('v6');terms.add('6 cylinder');terms.add('supercharged')}
 // A contradictory listing is not proof of either specification.
 const layouts=[...terms].filter(x=>/^(?:v|w|i|flat)\d+$/.test(x));
 const counts=[...terms].filter(x=>/^\d+ cylinder$/.test(x));
 if(layouts.length>1||counts.length>1){for(const x of [...layouts,...counts])terms.delete(x)}
 if(terms.has('naturally aspirated')&&(terms.has('turbocharged')||terms.has('supercharged'))){terms.delete('naturally aspirated');terms.delete('turbocharged');terms.delete('twin turbo');terms.delete('supercharged')}
 return {terms:[...terms],basis:factory&&!factoryConflict?'Factory specification · confirm current engine':structured.size?'Provider engine data':'Seller description'};
}
export function engineMatches(r:EngineVehicle,term:string):boolean|null{
 const wanted=engineTerm(term);return wanted===null?null:engineFacts(r).terms.includes(wanted);
}
export function engineSummary(r:EngineVehicle){const info=engineFacts(r);const terms=info.terms.filter(t=>!/^\d+ cylinder$/.test(t)||!info.terms.some(x=>/^(?:v|w|i|flat)\d+$/.test(x))).filter(t=>t!=='turbocharged'||!info.terms.includes('twin turbo'));return terms.map(t=>/^(?:v|w|i)\d+$/.test(t)?t.toUpperCase():t).join(' · ')}
