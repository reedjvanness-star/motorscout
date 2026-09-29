import {sqliteD1} from './sqlite-d1';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {cachedInventory} from '../lib/inventory-cache';
import {initialFilters} from '../lib/domain';
const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE workspaces(user_id TEXT PRIMARY KEY,payload TEXT,updated_at INTEGER)');
const db=sqliteD1(sql);
let calls=0,failed=false;
const search:typeof import('../lib/inventory').searchInventory=async()=>{calls++;return {listings:[],sources:[{name:'test',status:failed?'error':'searched',detail:failed?'HTTP 429':'Checked',count:0}],checkedAt:'2026-09-21T16:00:00Z',nextCursor:null}};
try{
 const first=await cachedInventory(db,initialFilters,{autodev:'secret-a'},undefined,search,1000000);
 const second=await cachedInventory(db,initialFilters,{autodev:'secret-a'},undefined,search,1000001);
 assert.equal(calls,1);assert.equal(first.checkedAt,second.checkedAt);assert(second.sources[0].detail.includes('Reused'));
 await cachedInventory(db,{...initialFilters,exteriorColor:'green'},{autodev:'secret-a'},undefined,search,1000002);assert.equal(calls,2,'changed requirements cannot reuse another query');
 await cachedInventory(db,initialFilters,{autodev:'secret-b'},undefined,search,1000003);assert.equal(calls,3,'different provider credentials stay isolated');
 await cachedInventory(db,initialFilters,{autodev:'secret-a'},undefined,search,1300001);assert.equal(calls,4,'expired data is refreshed');
 assert(!JSON.stringify(sql.prepare('SELECT * FROM workspaces').all()).includes('secret-'),'no plaintext credentials in stored keys or values');
 failed=true;
 await cachedInventory(db,initialFilters,{autodev:'failure'},undefined,search,1400000);
 await cachedInventory(db,initialFilters,{autodev:'failure'},undefined,search,1420000);assert.equal(calls,5);
 await cachedInventory(db,initialFilters,{autodev:'failure'},undefined,search,1430001);assert.equal(calls,5,'quota errors are not retried every 30 seconds');
 await cachedInventory(db,initialFilters,{autodev:'failure'},undefined,search,1700001);assert.equal(calls,6,'quota requests retry after five minutes');
 const broken={prepare(){throw Error('cache unavailable')}};
 await cachedInventory(broken,initialFilters,{},undefined,search,1500000);assert.equal(calls,7,'cache outage does not break live results');
 sql.prepare('INSERT INTO workspaces VALUES(?,?,?)').run('real-user','private-workspace',1);
 await cachedInventory(db,initialFilters,{},undefined,search,1600000);
 assert.equal((sql.prepare('SELECT payload FROM workspaces WHERE user_id=?').get('real-user') as {payload:string}).payload,'private-workspace','cleanup cannot delete user workspaces');
 console.log('PASS: repeat reuse, exact filter/credential isolation, expiration, error recovery and safe cleanup');
}finally{sql.close()}
