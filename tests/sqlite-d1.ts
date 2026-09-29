import type {DatabaseSync,SQLInputValue} from 'node:sqlite';
import type {Database} from '../lib/database';
export function sqliteD1(sqlite:DatabaseSync):Database {
 return {prepare(sql:string){let values:SQLInputValue[]=[];return {
  bind(...args:unknown[]){values=args.map(value=>{if(value===null||typeof value==='string'||typeof value==='number'||typeof value==='bigint'||ArrayBuffer.isView(value))return value as SQLInputValue;throw Error('Unsupported SQL binding');});return this;},
  async first<T>(){return (sqlite.prepare(sql).get(...values)??null) as T|null;},
  async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}};}
 };}};
}
