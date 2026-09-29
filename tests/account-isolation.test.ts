import assert from 'node:assert/strict';
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {blankWorkspace} from '../lib/domain';
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const sql=new DatabaseSync(':memory:');
for(const name of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())sql.exec(await readFile(join('drizzle',name),'utf8'));
class Statement{
 values:SQLInputValue[]=[];constructor(public query:string){}
 bind(...values:SQLInputValue[]){this.values=values;return this}
 async first(){return sql.prepare(this.query).get(...this.values)??null}
 async all(){return {results:sql.prepare(this.query).all(...this.values)}}
 async run(){const r=sql.prepare(this.query).run(...this.values);return {meta:{changes:Number(r.changes)}}}
}
const fixture={env:{DB:{prepare:(query:string)=>new Statement(query)},CONNECTION_ENCRYPTION_KEY:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')}};
const fixtureGlobal=globalThis as typeof globalThis & {__isolationFixture?:typeof fixture};
fixtureGlobal.__isolationFixture=fixture;
const dir=await mkdtemp(join(tmpdir(),'motorscout-isolation-'));
try{
 const file=join(dir,'isolation.mjs');
 await build({stdin:{contents:'export * from "./lib/server";export * from "./lib/connections";',resolveDir:process.cwd()},outfile:file,bundle:true,platform:'node',format:'esm',plugins:[{name:'fixture-env',setup(b:{onResolve(options:{filter:RegExp},callback:()=>{path:string;namespace:string}):void;onLoad(options:{filter:RegExp;namespace?:string},callback:()=>{contents:string}):void}){
 b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'runtime',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env=globalThis.__isolationFixture.env;'}));
 }}]});
 const api=await import(pathToFileURL(file).href);
 assert.throws(()=>api.identity(new Request('https://motorscout.test/api/workspace')),/sign in/);
 assert.throws(()=>api.identity(new Request('https://motorscout.test/api/workspace',{method:'POST',headers:{'oai-authenticated-user-id':'alice',origin:'https://other.test'}})),/origin rejected/);
 assert.equal(api.identity(new Request('https://motorscout.test/api/workspace',{method:'POST',headers:{'oai-authenticated-user-id':'alice',origin:'https://motorscout.test'}})),'alice');
 const alice=blankWorkspace();alice.messages=[{role:'user',text:'Private test request',at:Date.now()}];
 await api.writeWorkspace('alice',alice);
 assert.equal((await api.readWorkspace('bob')).messages.length,0);
 assert.equal((await api.readWorkspace('alice')).messages[0].text,'Private test request');
 for(const provider of ['autodev','marketcheck','apify','openai']){
  await api.storeKey('alice',provider,'alice-fixture-'+provider);
  assert.equal(await api.providerKey('bob',provider),undefined,'new users never inherit owner credentials');
  assert.equal(await api.providerKey('alice',provider),'alice-fixture-'+provider);
 }
 const bob=await api.connectionStatus('bob');
 for(const provider of ['autodev','marketcheck','apify','openai'])assert.equal(bob[provider],false);
 assert.equal(bob.secureSetupReady,true);
 const raw=sql.prepare("SELECT encrypted_key FROM connections WHERE user_id='alice' AND provider='autodev'").get() as {encrypted_key:string};
 assert(!raw.encrypted_key.includes('alice-fixture'));
 // Even a storage mix-up cannot decrypt another user's envelope.
 sql.prepare('INSERT INTO connections VALUES (?,?,?,?)').run('bob','autodev',raw.encrypted_key,Date.now());
 await assert.rejects(()=>api.providerKey('bob','autodev'));
 const other=blankWorkspace();other.messages=[{role:'user',text:'Bob only',at:Date.now()}];await api.writeWorkspace('bob',other);
 assert.equal((await api.readWorkspace('alice')).messages[0].text,'Private test request');
 assert(!JSON.stringify(await api.connectionStatus('alice')).includes('alice-fixture'));
 console.log('PASS: fresh accounts, credential isolation, encrypted owner binding, workspace separation and request origin');
}finally{sql.close();delete fixtureGlobal.__isolationFixture;await rm(dir,{recursive:true,force:true})}
