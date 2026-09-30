import {env} from 'cloudflare:workers';
import {NextResponse} from 'next/server';
import {previewAccess} from './lib/preview-access';

export async function proxy(req:Request){
 const settings=env as unknown as {PREVIEW_PASSWORD?:string;PREVIEW_COOKIE_SECRET?:string;DB?:D1Database};
 const response=await previewAccess(req,settings,async()=>{
  if(!settings.DB)return false;
  const bucket=String(Math.floor(Date.now()/600000));
  const ip=req.headers.get('cf-connecting-ip')??'unknown';
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip)))).map(n=>n.toString(16).padStart(2,'0')).join('');
  const row=await settings.DB.prepare('INSERT INTO usage(user_id,day,count) VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET count=count+1 WHERE count < 10 RETURNING count').bind('preview-access:'+digest,bucket).first();
  return !!row;
 });
 return response??NextResponse.next();
}
