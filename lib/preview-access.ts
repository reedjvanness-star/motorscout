const cookieName='__Host-motorscout-preview';
const lifetime=86400;
type Settings={PREVIEW_PASSWORD?:string;PREVIEW_COOKIE_SECRET?:string};
const encoder=new TextEncoder();
function encode(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function decode(value:string){if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error('Invalid signature');return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}
async function key(secret:string){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
async function signatureKey(settings:Settings){return key(`${settings.PREVIEW_COOKIE_SECRET}:${settings.PREVIEW_PASSWORD}`)}
function escape(value:string){return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))}
export function previewReturnPath(value:string,origin:string){try{if(!value.startsWith('/')||value.startsWith('//'))return '/';const url=new URL(value,origin);return url.origin===origin&&!url.pathname.startsWith('/api/')?url.pathname+url.search:'/'}catch{return '/'}}
function page(returnTo:string,error=false){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MotorScout · Private preview</title><style>body{margin:0;background:#f7f8fa;color:#19212b;font:16px/1.5 Arial,sans-serif;min-height:100dvh;display:grid;place-items:center}main{box-sizing:border-box;width:min(420px,calc(100% - 32px));padding:32px;background:white;border:1px solid #e1e5e9;border-radius:16px}h1{font-size:28px;margin:0 0 12px}p{color:#647180;margin:0 0 24px}label{display:block;font-weight:600;margin-bottom:8px}input,button{box-sizing:border-box;width:100%;font:inherit;border-radius:8px;padding:12px}input{border:1px solid #cbd3dc;margin-bottom:16px}button{border:0;background:#e84d2c;color:white;font-weight:600;cursor:pointer}input:focus-visible,button:focus-visible{outline:3px solid #e84d2c;outline-offset:3px}.error{color:#a82d20;margin-bottom:16px}.brand{font-size:13px;color:#c94325;font-weight:700;letter-spacing:1px;margin-bottom:20px}</style></head><body><main><div class="brand">MOTORSCOUT</div><h1>Private preview</h1><p>Enter the shared password to try MotorScout.</p>${error?'<p class="error" role="alert">That password isn’t correct. Please try again.</p>':''}<form method="post" action="/api/preview-access"><input type="hidden" name="returnTo" value="${escape(returnTo)}"><label for="password">Password</label><input id="password" name="password" type="password" required maxlength="200" autocomplete="current-password" autofocus><button type="submit">Enter MotorScout</button></form></main></body></html>`}
function gatePage(returnTo:string,error=false){return new Response(page(returnTo,error),{status:error?401:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'}})}
async function allowed(req:Request,settings:Settings,now:number){
 const token=(req.headers.get('cookie')??'').split(';').map(c=>c.trim()).find(c=>c.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(!token||token.length>300)return false;
 try{const [expires,signature,...rest]=token.split('.');const expiry=Number(expires),seconds=Math.floor(now/1000);if(rest.length||!signature||!/^\d+$/.test(expires)||expiry<=seconds||expiry>seconds+lifetime)return false;return crypto.subtle.verify('HMAC',await signatureKey(settings),decode(signature),encoder.encode(`${new URL(req.url).host}:${expires}`))}catch{return false}
}
/** Returns null only when the request may continue to existing account authentication. */
export async function previewAccess(req:Request,settings:Settings,allowAttempt:()=>Promise<boolean>=async()=>true,now=Date.now()):Promise<Response|null>{
 if(!settings.PREVIEW_PASSWORD)return null;
 if(!settings.PREVIEW_COOKIE_SECRET)return new Response('Preview access is temporarily unavailable.',{status:503,headers:{'Cache-Control':'no-store'}});
 const url=new URL(req.url);
 // These routes retain their existing signed unsubscribe/scheduler authorization.
 if(url.pathname==='/api/jobs/alerts'||url.pathname==='/api/alerts/unsubscribe')return null;
 if(url.pathname==='/api/preview-access'&&req.method==='POST'){
  if(req.headers.get('origin')!==url.origin)return new Response('Request origin rejected.',{status:403});
  if(!await allowAttempt())return new Response('Too many attempts. Please try again in 10 minutes.',{status:429,headers:{'Cache-Control':'no-store','Retry-After':'600'}});
  const body=await req.text();if(body.length>2000)return new Response('Request too large.',{status:413});
  const form=new URLSearchParams(body),returnTo=previewReturnPath(form.get('returnTo')??'/',url.origin),password=form.get('password')??'';
  const digest=async(value:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)));const [a,b]=await Promise.all([digest(password),digest(settings.PREVIEW_PASSWORD)]);let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];if(difference)return gatePage(returnTo,true);
  const expires=String(Math.floor(now/1000)+lifetime),signature=encode(new Uint8Array(await crypto.subtle.sign('HMAC',await signatureKey(settings),encoder.encode(`${url.host}:${expires}`))));
  return new Response(null,{status:303,headers:{Location:returnTo,'Cache-Control':'no-store','Set-Cookie':`${cookieName}=${expires}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${lifetime}`}});
 }
 if(await allowed(req,settings,now))return null;
 if(url.pathname.startsWith('/api/')||!['GET','HEAD'].includes(req.method))return Response.json({error:'Enter the preview password to continue.'},{status:401,headers:{'Cache-Control':'no-store'}});
 return gatePage(previewReturnPath(url.pathname+url.search,url.origin));
}
