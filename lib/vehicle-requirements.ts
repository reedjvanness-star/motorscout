import {engineMatches,type EngineVehicle} from './engine-specs';
import {z} from 'zod';
export const featureNames=['heated seats','cooled seats','leather seats','sunroof','navigation','backup camera','blind spot monitor','adaptive cruise control','Apple CarPlay','Android Auto','remote start','tow package','third row'] as const;
export const detailFilterShape={
 requiredTerms:z.array(z.string().trim().min(1).max(80)).max(6).default([]),
 exteriorColor:z.string().max(40).default(''),bodyType:z.enum(['','pickup','suv','sedan','coupe','convertible','hatchback','wagon','van']).default(''),
 fuel:z.enum(['','gasoline','diesel','hybrid','electric']).default(''),transmission:z.enum(['','automatic','manual']).default(''),
 drivetrain:z.enum(['','awd','4wd','fwd','rwd']).default(''),cabStyle:z.enum(['','crew','extended','regular']).default(''),
 features:z.array(z.enum(featureNames)).max(13).default([]),
};
export const detailFilters=z.object(detailFilterShape);
export type DetailFilters=z.infer<typeof detailFilters>;
export type VehicleDetails=EngineVehicle&{exteriorColor?:string;baseExteriorColor?:string;bodyType?:string;fuel?:string;transmission?:string;cabStyle?:string;features?:string[];evidenceText?:string};
export const detailProperties={requiredTerms:{type:'array',items:{type:'string'},description:'Additional exact phrases that must appear in the seller listing, for custom equipment/specifications. Empty unless requested.'},exteriorColor:{type:'string',description:'Base exterior color, lowercase; empty for any.'},bodyType:{type:'string',enum:['','pickup','suv','sedan','coupe','convertible','hatchback','wagon','van']},fuel:{type:'string',enum:['','gasoline','diesel','hybrid','electric']},transmission:{type:'string',enum:['','automatic','manual']},drivetrain:{type:'string',enum:['','awd','4wd','fwd','rwd']},cabStyle:{type:'string',enum:['','crew','extended','regular']},features:{type:'array',items:{type:'string',enum:featureNames}}};
const clean=(s:unknown)=>typeof s==='string'?s.toLowerCase().replace(/[-_/]/g,' ').replace(/\s+/g,' ').trim():'';
export function bodyType(s:unknown){const v=clean(s);return /pickup|\btruck\b/.test(v)?'pickup':/sport utility|\bsuv\b|crossover/.test(v)?'suv':/convertible|cabriolet|roadster/.test(v)?'convertible':/hatchback/.test(v)?'hatchback':/wagon/.test(v)?'wagon':/\bvan\b|minivan/.test(v)?'van':/coupe/.test(v)?'coupe':/sedan/.test(v)?'sedan':''}
export function driveType(s:unknown){const v=clean(s);return /\bawd\b|all wheel/.test(v)?'awd':/\b4wd\b|\b4x4\b|four wheel/.test(v)?'4wd':/\bfwd\b|front wheel/.test(v)?'fwd':/\brwd\b|rear wheel/.test(v)?'rwd':''}
export function cabStyle(s:unknown){const v=clean(s);return /crew|supercrew|crewmax/.test(v)?'crew':/extended|supercab|double cab|king cab|access cab/.test(v)?'extended':/regular|single cab/.test(v)?'regular':''}
export function fuelType(s:unknown){const v=clean(s);return /hybrid|electric.*(?:gas|unleaded)/.test(v)?'hybrid':/diesel/.test(v)?'diesel':/electric|\bbev\b/.test(v)?'electric':/gas|unleaded|petrol/.test(v)?'gasoline':''}
export function transmissionType(s:unknown){const v=clean(s);return /automatic|cvt|dual clutch|automated manual/.test(v)?'automatic':/manual/.test(v)?'manual':''}
export function colorMatches(actual:unknown,wanted:string){const v=clean(actual),w=clean(wanted);return !!v&&!!w&&(v===w||(' '+v+' ').includes(' '+w+' '))}
const featurePatterns:Record<string,RegExp>={
 'heated seats':/heated (?:front |rear |front and rear )?seats/,'cooled seats':/(?:cooled|ventilated) (?:front )?seats/,'leather seats':/leather (?:trimmed |appointed )?(?:seats|upholstery)/,
 sunroof:/sunroof|moonroof|sun moonroof/,navigation:/navigation/,'backup camera':/back ?up camera|rear ?view camera|rear vision camera/,'blind spot monitor':/blind spot (?:monitor|detection|warning)/,
 'adaptive cruise control':/adaptive cruise|radar cruise|distance control cruise/,'Apple CarPlay':/apple carplay/,'Android Auto':/android auto/,'remote start':/remote (?:engine )?start/,'tow package':/tow(?:ing)? package|trailer(?:ing)? package/,'third row':/third row|3rd row/
};
export function knownFeatures(value:unknown):string[]{
 const values=Array.isArray(value)?value:[];
 return featureNames.filter(name=>values.some(x=>{const text=clean(typeof x==='object'&&x?x.name:x);return !/\bno\b|without|not equipped/.test(text)&&featurePatterns[name].test(text)}));
}
export function detailsMatch(r:VehicleDetails&{drive:string},f:Partial<DetailFilters>){return (f.requiredTerms??[]).every(term=>engineMatches(r,term)??evidenceMatches(r.evidenceText,term))&&(!f.exteriorColor||(colorMatches(r.exteriorColor,f.exteriorColor)||colorMatches(r.baseExteriorColor,f.exteriorColor)))&&(!f.bodyType||bodyType(r.bodyType)===f.bodyType)&&(!f.fuel||fuelType(r.fuel)===f.fuel)&&(!f.transmission||transmissionType(r.transmission)===f.transmission)&&(!f.drivetrain||driveType(r.drive)===f.drivetrain)&&(!f.cabStyle||cabStyle(r.cabStyle)===f.cabStyle)&&(f.features??[]).every(x=>(r.features??[]).includes(x))}
export function detailLabels(f:Partial<DetailFilters>){return [...(f.requiredTerms??[]),f.exteriorColor?`${f.exteriorColor} exterior`:'',f.bodyType,f.fuel,f.transmission,f.drivetrain?.toUpperCase(),f.cabStyle?`${f.cabStyle} cab`:'',...(f.features??[])].filter(Boolean) as string[]}
export function detailChanges(a:Partial<DetailFilters>,b:Partial<DetailFilters>){return (a.requiredTerms??[]).some(x=>!(b.requiredTerms??[]).includes(x))||(['exteriorColor','bodyType','fuel','transmission','drivetrain','cabStyle'] as const).some(k=>!!a[k]&&a[k]!==b[k])||(a.features??[]).some(x=>!(b.features??[]).includes(x))}

export function evidenceMatches(evidence:unknown,term:string){const needle=clean(term).replace(/(\d),(?=\d)/g,'$1');return !!needle&&String(evidence??'').split(/[.;\n]/).some(sentence=>{const s=clean(sentence).replace(/(\d),(?=\d)/g,'$1');return !( /\bno\b|\bwithout\b|not equipped|not included|available separately|optional extra/.test(s))&&(' '+s+' ').includes(' '+needle+' ')});}
