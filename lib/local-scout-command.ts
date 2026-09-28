// Exact, self-contained shortcuts only. Requests with extra requirements still use Scout.
export function localScoutCommand(text:string):'compare'|null{
 return /^(?:compare cars|compare my selected cars|compare the cheapest cars in my results|compare my saved cars)[.!?]?$/i.test(text.trim())?'compare':null;
}
