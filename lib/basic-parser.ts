import {mileageRequest,applyMileageRequest} from './mileage-range';
import {requestedEngineTerms,engineTerm} from './engine-specs';
import {applyLocationText} from './location-command';
import {initialFilters,filterSchema,type Filters} from './domain';
import {vehicles,curatedVehicles,states} from './vehicle-options';
import {normalizeMercedesText,normalizeAudiText,normalizeBmwText,vehicleNameKey} from './vehicle-identity';
import {bodyType,cabStyle,knownFeatures} from './vehicle-requirements';
const norm=(s:string)=>s.toLowerCase().replace(/-/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const has=(text:string,part:string)=>(' '+norm(text)+' ').includes(' '+norm(part)+' ');
const number=(s:string)=>Number(s.replace(/,/g,'').replace(/k$/i,''))*(/k$/i.test(s)?1000:1);
export function basic(text:string,old:Filters){text=normalizeBmwText(normalizeAudiText(normalizeMercedesText(text)));const f=filterSchema.parse(old);let question='';const t=text.toLowerCase();let action='search',recognized=false;
const make=Object.keys(vehicles).find(m=>has(text,m));if(make){if(make!==old.make&&!/\bkeep\b|same (?:budget|limits|requirements)/i.test(text))Object.assign(f,initialFilters);f.make=make;if(make!==old.make){f.model='';f.trim=''}recognized=true}
const candidates=Object.entries(make?vehicles:curatedVehicles).filter(([m])=>!make||make===m).flatMap(([m,models])=>Object.entries(models).flatMap(([model,trims])=>[{make:m,model,trim:'',term:model},...trims.filter(trim=>trim.length>=4&&!['base','premium','limited','sport','touring','platinum','select','signature','preferred','premium plus','prestige','performance','standard range plus','long range','technology','advance','a-spec','momentum','inscription','r-design'].includes(trim.toLowerCase())).map(trim=>({make:m,model,trim,term:trim}))]));
const exact=candidates.filter(c=>has(text,c.term));const unique=exact.filter(c=>!exact.some(x=>(x.term.length>c.term.length&&has(x.term,c.term))||(!c.trim&&!!x.trim&&x.make===c.make&&x.model===c.model)));
const preferred=unique.filter(c=>!f.make||c.make===f.make);const matched=preferred.length?preferred:unique;if(matched.length===1){if((matched[0].make!==old.make||matched[0].model!==old.model)&&!/\bkeep\b|same (?:budget|limits|requirements)/i.test(text))Object.assign(f,initialFilters);f.make=matched[0].make;f.model=matched[0].model;f.trim=matched[0].trim;recognized=true}else if(matched.length>1){question='Which model do you mean? Choose it in Use filters so I keep the right vehicle.'}
const body=bodyType(t);if(body){f.bodyType=body as Filters['bodyType'];recognized=true;if(!matched.length&&body!==old.bodyType){f.model='';f.trim='';f.cabStyle='';if(!make)f.make=''}}
const engines=requestedEngineTerms(t);if(engines.length){f.requiredTerms=[...f.requiredTerms.filter(x=>!engineTerm(x)),...engines];recognized=true;if(/\bor\b|\bnot\b|\bwithout\b/.test(t))question='Which single engine configuration should I require? Engine alternatives and exclusions need clarification.'}
if(/\bnon[ -]turbo\b/.test(t))question='Do you want a naturally aspirated engine, or would a supercharged engine also work?';
const colors=t.match(/\b(green|red|blue|black|white|silver|gray|grey|orange|yellow|brown|beige|gold|purple)\b/g);if(colors){if(new Set(colors).size>1||/\binterior\b|\b(?:black|white|red|brown) leather\b/.test(t))question='I can filter exterior color and leather seats, but cannot verify exact interior color or alternative colors yet. Which exterior color is required?';else{f.exteriorColor=colors[0]==='grey'?'gray':colors[0];recognized=true}}
const fuel=t.match(/\b(diesel|electric|hybrid|gasoline|gas)\b/);if(fuel){f.fuel=(fuel[1]==='gas'?'gasoline':fuel[1]) as Filters['fuel'];recognized=true}
const transmission=t.match(/\b(automatic|manual|stick shift)\b/);if(transmission){f.transmission=transmission[1]==='automatic'?'automatic':'manual';recognized=true}
const drive=t.match(/\b(4wd|4x4|awd|fwd|rwd)\b|four.wheel drive|all.wheel drive|rear.wheel drive|front.wheel drive/);if(drive){f.drivetrain=/4wd|4x4|four/.test(drive[0])?'4wd':/awd|all/.test(drive[0])?'awd':/rwd|rear/.test(drive[0])?'rwd':'fwd';f.awd=false;recognized=true}
const cab=cabStyle(t);if(cab){f.cabStyle=cab;recognized=true}
const features=knownFeatures([text]);if(features.length){f.features=[...new Set([...f.features,...features])] as Filters['features'];recognized=true}
const mileage=mileageRequest(t);if(mileage?.question)return {filters:old,question:mileage.question,action:'clarify',mode:'Basic filter parser · AI not connected'};
const price=t.match(/(?:under|around|about|budget(?: of| is)?|less than|maximum|max|up to)\s*\$\s*([\d,.]+k?)/)||t.match(/\$\s*([\d,.]+k?)\s*(?:budget|max)/);if(price){f.maxPrice=number(price[1]);recognized=true}
if(!price){const budgetText=mileage?t.slice(0,mileage.start)+' '+t.slice(mileage.end):t;const bare=budgetText.match(/(?:under|around|about|budget(?: of| is)?|less than|maximum|max|up to)\s+([\d,.]+k?)(\s*\w*)/);if(bare&&!/^\s*(miles|mi)\b/.test(bare[2])&&(!/^(?:around|about)/.test(bare[0])||/k$/i.test(bare[1])||/\b(?:budget|price|dollars)\b/.test(budgetText))){f.maxPrice=number(bare[1]);recognized=true}}
if(mileage){Object.assign(f,applyMileageRequest(f,mileage));recognized=true}
if(/lower mileage/.test(t)){if(f.maxMiles!==null){f.maxMiles=Math.max(0,f.maxMiles-10000);recognized=true}else question='What maximum mileage would you like? You can select it with the mileage slider.'}
const state=states.find(([code,name])=>has(text,name)||new RegExp('\\bin\\s+'+code+'\\b','i').test(text));if(state){f.state=state[0];f.zip='';f.location=null;recognized=true}if(/nationwide|anywhere in (the )?us/.test(t)){f.state='';f.zip='';f.location=null;recognized=true}const located=applyLocationText(text,f);if(located.zip!==f.zip||located.radiusMiles!==f.radiusMiles)recognized=true;Object.assign(f,located);
if(/\bonly awd\b|\bawd only\b|all.wheel drive/.test(t)){f.awd=true;recognized=true}if(/private seller|private owner/.test(t)){f.seller='private';recognized=true}if(/dealers only|only dealers/.test(t)){f.seller='dealer';recognized=true}if(/clean title/.test(t)){f.cleanTitle=true;recognized=true}
const limit=t.match(/top\s+(\d+|three|five|ten)/);if(limit){f.limit=limit[1]==='three'?3:limit[1]==='five'?5:limit[1]==='ten'?10:Number(limit[1]);recognized=true}
const year=t.match(/(?:from|since|at least|minimum year|newer than)\s*(20\d{2}|19\d{2})/);if(year){f.minYear=Number(year[1]);recognized=true}
if(/cheaper|similar/.test(t))question='Which lower budget or alternative model would you like? Your current limits are still in place.';
if(/shipping/.test(t))question='Choose a shipping allowance in All filters. I will reserve it from your budget; a carrier quote is still needed.';
if(/compare|best value|which of/.test(t))action='compare';if(/save/.test(t))action='save';if(/alert|notify/.test(t))action='alert';
if(/\btow(?:ing)?\s+(?:at least\s+)?\d|\bbed length\b|\b\d[\d.]*\s*(?:foot|ft)\s*bed|accident.free|service history|\bwithout\b|\bnot (?:green|red|blue|black|white)\b/.test(t))question='That includes a requirement I cannot verify with the current inventory fields. Tell me which supported requirements to search, or whether to leave that requirement out.';
// Do not let a recognized budget/make silently discard an unknown model code.
const codes=text.match(/\b(?:[a-z]{1,4}-?\d{1,3}[a-z]{0,2}|\d{1,3}[a-z]{1,3})\b/gi)??[];
const unknownCode=codes.find(code=>!engineTerm(code)&&! /^(?:\d+(?:k|mi|ft|st|nd|rd|th)|4x4|4wd|2wd|v(?:4|6|8|10|12|16)|i[46]|w(?:12|16))$/i.test(code.replace(/[- ]/g,''))&&!exact.some(c=>vehicleNameKey(c.term).includes(vehicleNameKey(code))));
if(unknownCode&&!question&&action==='search')question=`I could not identify “${unknownCode}” as a model. Enter its make and model in Use filters so I do not show unrelated cars.`;
if(!recognized&&!question&&action==='search')question='Tell me the make and model, plus any budget, mileage or location limits—for example, “Audi RS7 under $60,000 in Colorado.” You can also choose them in Use filters.';
if(f.minMiles!==null&&f.maxMiles!==null&&f.minMiles>f.maxMiles)return {filters:old,question:'The minimum mileage is higher than the maximum. Which mileage range should I use?',action:'clarify',mode:'Basic filter parser · AI not connected'};
return {filters:filterSchema.parse(f),question,action,mode:'Basic filter parser · AI not connected'};}
