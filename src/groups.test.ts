import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { groupIndexes,groupRoute } from './groups.js';
import { randomUUID } from 'node:crypto';

test('real Mongo group ownership, recording, guidance isolation and closure',async()=>{
 const mongo=process.env.TEST_MONGODB_URI?undefined:await MongoMemoryServer.create();const client=new MongoClient(process.env.TEST_MONGODB_URI || mongo!.getUri());await client.connect();const db=client.db('lighthouse_test_'+randomUUID().replaceAll('-',''));await groupIndexes(db);
 const server=createServer(async(req,res)=>{await groupRoute(req,res,db,async()=>{let s='';for await(const chunk of req)s+=chunk;return JSON.parse(s||'{}');});});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
 async function call(route:string,body?:unknown,token?:string){const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json() as any};}
 try {
  const a=await call('/v1/groups',{name:'Assistant',groupName:'A'});assert.equal(a.status,201);
  const s=await call('/v1/join',{name:'Student',code:a.data.group.code});assert.equal(s.data.role,'student');
  const b=await call('/v1/groups',{name:'Other',groupName:'B'});
  assert.equal((await call('/v1/group')).status,401);
  assert.equal((await call('/v1/recordings',{name:'Bad',process:'fixture'},s.data.token)).status,403);
  const r=await call('/v1/recordings',{name:'Lesson',process:'fixture'},a.data.token);assert.equal(r.status,201);
  const step={eventId:randomUUID(),event:'click',target:{automationId:'save',name:'Simpan',controlType:'Button'},window:{process:'fixture',title:'Fixture'},timestamp:Date.now()};
  const route=`/v1/recordings/${r.data.recordingId}/steps`;
  assert.equal((await call(route,step,a.data.token)).status,201);
  assert.equal((await call(route,step,a.data.token)).status,200);
  assert.equal((await call(route,{...step,eventId:randomUUID(),typedText:'secret'},a.data.token)).status,400);
  assert.equal((await call(route,undefined,b.data.token)).status,404);
  assert.equal((await call('/v1/guide',{recordingId:r.data.recordingId},b.data.token)).status,404);
  const guide=await call('/v1/guide',{recordingId:r.data.recordingId,question:'Simpan'},s.data.token);assert.equal(guide.status,200);assert.equal(guide.data.step.target.automationId,'save');assert.equal(guide.data.total,1);
  assert.equal((await call('/v1/guide',{recordingId:r.data.recordingId,question:'Unrelated'},s.data.token)).status,404);
  await call(`/v1/recordings/${r.data.recordingId}/stop`,{},a.data.token);
  assert.equal((await call(route,{...step,eventId:randomUUID()},a.data.token)).status,409);
  assert.equal((await call('/v1/group/close',{},s.data.token)).status,403);
  await call('/v1/group/close',{},a.data.token);
  assert.equal((await call('/v1/group',undefined,s.data.token)).status,410);
  assert.equal((await call('/v1/join',{name:'Late',code:a.data.group.code})).status,404);
 }finally{await new Promise<void>(r=>server.close(()=>r()));await db.dropDatabase();await client.close();await mongo?.stop();}
});
