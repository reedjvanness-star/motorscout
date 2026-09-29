// GitHub-issued tokens are accepted only for this deployment's configured repository and workflow.
const issuer='https://token.actions.githubusercontent.com';
const workflow='.github/workflows/saved-search-alerts.yml@refs/heads/main';
type Settings=Record<string,unknown>;
export function schedulerConfigured(settings:Settings){return !!settings.SCHEDULER_SECRET||!!(settings.SCHEDULER_GITHUB_REPOSITORY&&settings.SCHEDULER_GITHUB_REPOSITORY_ID&&settings.SCHEDULER_GITHUB_OWNER_ID&&settings.SCHEDULER_AUDIENCE)}
function bytes(value:string){if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error('Invalid encoding');return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}
function decode(value:string){return JSON.parse(new TextDecoder().decode(bytes(value)))}
export async function schedulerAuthorized(req:Request,settings:Settings,request:typeof fetch=(input,init)=>globalThis.fetch(input,init),now=Date.now()){
 const reject=(reason:string)=>{console.warn('Scheduler authentication rejected: '+reason);return false};
 const auth=req.headers.get('authorization')??'';
 if(settings.SCHEDULER_SECRET&&auth===`Bearer ${settings.SCHEDULER_SECRET}`)return true;
 if(!settings.SCHEDULER_GITHUB_REPOSITORY||!settings.SCHEDULER_GITHUB_REPOSITORY_ID||!settings.SCHEDULER_GITHUB_OWNER_ID||!settings.SCHEDULER_AUDIENCE||!auth.startsWith('Bearer ')||auth.length>16000)return reject('check-1');
 let stage='decode';
 try{
  const parts=auth.slice(7).split('.');if(parts.length!==3)return reject('check-2');
  const header=decode(parts[0]),claims=decode(parts[1]);
  if(header.alg!=='RS256'||header.typ!=='JWT'||typeof header.kid!=='string'||header.crit)return reject('check-3');
  const seconds=now/1000;
  if(!['exp','iat','nbf'].every(k=>typeof claims[k]==='number'&&Number.isFinite(claims[k])))return reject('check-4');
  if(claims.exp<=seconds||claims.nbf>seconds+30||claims.iat>seconds+30||claims.iat<seconds-600||claims.exp-claims.iat>600)return reject('check-5');
  if(claims.iss!==issuer||claims.aud!==settings.SCHEDULER_AUDIENCE||claims.repository!==settings.SCHEDULER_GITHUB_REPOSITORY||claims.repository_id!==settings.SCHEDULER_GITHUB_REPOSITORY_ID||claims.repository_owner_id!==settings.SCHEDULER_GITHUB_OWNER_ID)return reject('check-6');
  if(claims.ref!=='refs/heads/main'||claims.workflow_ref!==`${settings.SCHEDULER_GITHUB_REPOSITORY}/${workflow}`||!['schedule','workflow_dispatch'].includes(claims.event_name))return reject('check-7');
  // Pin the key endpoint; never follow JWT-supplied URLs or redirects.
  stage='fetch-signing-keys';
  const response=await request(`${issuer}/.well-known/jwks`,{redirect:'manual',signal:AbortSignal.timeout(8000)});
  if(!response.ok)return reject('check-8');
  const text=await response.text();if(text.length>100000)return reject('check-9');
  const keys=JSON.parse(text).keys;if(!Array.isArray(keys))return reject('check-10');
  const jwk=keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.alg==='RS256'&&k.use==='sig');if(!jwk)return reject('check-11');
  stage='import-signing-key';
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  stage='verify-signature';
  return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,bytes(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
 }catch(e){return reject('exception-'+stage+'-'+(e instanceof Error?e.name:'unknown'))}
}
