import {record} from './unknown-data';
import type {Database} from './database';
// Conservative reservations, not billed usage. Each request holds $0.02 permanently
// for its UTC day, including failures/timeouts, so concurrent calls cannot overspend.
// At published GPT-4.1 mini prices ($0.40/$1.60 per million tokens), 24 KB of
// UTF-8 request data plus 1,600 output tokens fits below this reservation with margin.
// https://developers.openai.com/api/docs/models/gpt-4.1-mini (2026-09-23)
export const SHARED_AI_MODEL='gpt-4.1-mini-2025-04-14';
export function budgetedAiRequest(database:Database,request:typeof fetch=fetch,now:()=>number=Date.now):typeof fetch{
 return async(input,init)=>{
  const body=init?.body;
  if(input!=='https://api.openai.com/v1/chat/completions'||init?.method!=='POST'||typeof body!=='string'||new TextEncoder().encode(body).length>24000)throw Error('This conversation is too long for Scout. Start a new chat or use the filters; your saved cars remain available.');
  const payload=record(JSON.parse(body));
  if(payload.model!==SHARED_AI_MODEL||payload.max_tokens!==1600||payload.n!==undefined||payload.stream||!Array.isArray(payload.messages)||payload.messages.some((m:unknown)=>typeof record(m).content!=='string')||(payload.tools!==undefined&&(!Array.isArray(payload.tools)||payload.tools.some((t:unknown)=>record(t).type!=='function'))))throw Error('Scout request exceeded its configured budget safeguards. Use the filters for now.');
  const day=new Date(now()).toISOString().slice(0,10);
  const reserved=await database.prepare('INSERT INTO usage(user_id,day,count) VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET count=count+1 WHERE count < 50 RETURNING count').bind('__shared_scout_ai_budget__',day).first();
  if(!reserved)throw Error('Scout has reached its shared AI allowance for today. Use the vehicle filters to keep searching, or try Scout again tomorrow.');
  return request(input,{...init,redirect:'manual'});
 };
}
