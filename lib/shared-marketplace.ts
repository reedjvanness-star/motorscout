import type {Database} from './database';
// Only the explicitly configured marketplace sponsor can fund the free beta.
// AI sponsorship is separately enabled; dealer credentials are never inherited.
export type ConnectionProvider='marketcheck'|'openai'|'autodev'|'apify';
export async function resolveProviderCredential(userId:string,provider:ConnectionProvider,env:Record<string,unknown>,readStored:(id:string,provider:ConnectionProvider)=>Promise<string|undefined>){
 const own=await readStored(userId,provider);if(own)return own;
 const name={marketcheck:'MARKETCHECK_API_KEY',autodev:'AUTODEV_API_KEY',apify:'APIFY_API_KEY',openai:'OPENAI_API_KEY'}[provider];
 const global=env[name];if(typeof global==='string'&&global)return global;
 const sponsor=env.SHARED_FREE_APIFY_OWNER_ID;
 if(provider==='apify'&&typeof sponsor==='string'&&sponsor&&sponsor!==userId)return readStored(sponsor,'apify');
 const aiSponsor=env.SHARED_OPENAI_OWNER_ID;
 if(provider==='openai'&&typeof aiSponsor==='string'&&aiSponsor&&aiSponsor!==userId)return readStored(aiSponsor,'openai');
}
export async function reserveBetaSearch(database:Database,userId:string,now=Date.now()){
 const day=new Date(now).toISOString().slice(0,10);
 const row=await database.prepare('INSERT INTO usage(user_id,day,count) VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET count=count+1 WHERE count < 50 RETURNING count').bind(userId+':shared-marketplace',day).first();
 if(!row)throw Error('Your 50 free beta search attempts for today are used. Your collected cars are still available. Try again tomorrow.');
}
