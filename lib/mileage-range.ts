export type MileageRequest={minMiles?:number;maxMiles?:number;question:string;start:number;end:number};
const amount='(-?[0-9][0-9,]*(?:\\.[0-9]+)?\\s*k?)';
const units='(?:miles|mi\\b)';
const value=(text:string)=>Number(text.replace(/[\s,k]/gi,''))*(/k/i.test(text)?1000:1);
export function mileageRequest(text:string):MileageRequest|null{
 const patterns:[RegExp,'range'|'min'|'max'][]=[
  [new RegExp('(?:between\\s+|from\\s+)?'+amount+'\\s*(?:'+units+'\\s*)?(?:to|through|and|[-–—])\\s*'+amount+'\\s*'+units,'i'),'range'],
  [new RegExp('(?:at least|minimum(?: of)?|min|over|above|more than)\\s*'+amount+'\\s*'+units,'i'),'min'],
  [new RegExp('(?:under|below|fewer than|less than|max(?:imum)?|up to)\\s*'+amount+'\\s*'+units,'i'),'max'],
 ];
 for(const [pattern,kind] of patterns){
  const match=pattern.exec(text);if(!match)continue;
  const before=text.slice(0,match.index),after=text.slice(match.index+match[0].length);
  if(/(?:\$|within\s*|radius(?:\s+of)?\s*|distance(?:\s+of)?\s*)$/i.test(before)||/^\s*(?:away|radius|from|of\s+(?:zip|\d{5}\b))/i.test(after))continue;
  let first=value(match[1]);const second=kind==='range'?value(match[2]):undefined;
  // In a shared suffix such as 30–50k, k qualifies both endpoints.
  if(kind==='range'&&!/k/i.test(match[1])&&/k/i.test(match[2])&&Math.abs(first)<1000)first*=1000;
  const minMiles=kind==='max'?undefined:first,maxMiles=kind==='min'?undefined:second??first;
  const invalid=[minMiles,maxMiles].some(n=>n!==undefined&&(!Number.isInteger(n)||n<0||n>1000000));
  const question=invalid?'Choose mileage limits between 0 and 1,000,000 miles.':minMiles!==undefined&&maxMiles!==undefined&&minMiles>maxMiles?'The minimum mileage is higher than the maximum. Which mileage range should I use?':'';
  return {minMiles,maxMiles,question,start:match.index,end:match.index+match[0].length};
 }
 return null;
}
export function applyMileageRequest<T extends {minMiles:number|null;maxMiles:number|null}>(filters:T,request:MileageRequest):T{
 return {...filters,...(request.minMiles!==undefined?{minMiles:request.minMiles}:{}),...(request.maxMiles!==undefined?{maxMiles:request.maxMiles}:{})};
}
