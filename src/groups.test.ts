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
  const s=await call('/v1/join',{name:'Student',code:a.data.group.code,device:{deviceId:randomUUID(),localIps:['192.168.1.12']}});assert.equal(s.data.role,'student');
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
  assert.equal((await call('/v1/guide',{question:'Simpan'},s.data.token)).status,200);
  assert.equal((await call('/v1/activity',undefined,s.data.token)).status,403);
  assert.equal((await call('/v1/activity',undefined,b.data.token)).data.questions.length,0);
  const activity=await call('/v1/activity',undefined,a.data.token);assert.ok(activity.data.questions.some((q:any)=>q.question==='Simpan'&&q.name==='Student'));
  const roster=await call('/v1/group',undefined,a.data.token);assert.deepEqual(roster.data.members.find((m:any)=>m.role==='student').device.localIps,['192.168.1.12']);const studentRoster=await call('/v1/group',undefined,s.data.token);assert.equal(studentRoster.data.members.find((m:any)=>m.role==='student').device,undefined);

  let releaseStream=()=>{}, streamMode='success';
  const ai=createServer(async(req,res)=>{
    for await(const _ of req){};
    res.setHeader('content-type','application/x-ndjson');
    res.write(JSON.stringify({type:'selection',stepId:streamMode==='foreign'?randomUUID():guide.data.step.stepId})+'\n');
    res.write(JSON.stringify({type:'delta',text:'Klik tombol '})+'\n');
    if(streamMode==='success'){await new Promise<void>(resolve=>{releaseStream=resolve;});res.end(JSON.stringify({type:'delta',text:'Simpan.'})+'\n'+JSON.stringify({type:'done'})+'\n');}
    else res.end(JSON.stringify({type:'error',message:'private provider detail'})+'\n');
  });
  await new Promise<void>(resolve=>ai.listen(0,'127.0.0.1',resolve));
  const aiAddress=ai.address();assert.ok(aiAddress&&typeof aiAddress!=='string');const previousAI=process.env.LAB_AI_URL;process.env.LAB_AI_URL=`http://127.0.0.1:${aiAddress.port}`;
  const streamRequest=()=>fetch(base+'/v1/guide',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${s.data.token}`},body:JSON.stringify({question:'Simpan',stream:true})});
  try{
    const streamed=await streamRequest();assert.equal(streamed.status,200);const reader=streamed.body!.getReader();
    const first=await reader.read();const initial=new TextDecoder().decode(first.value);assert.match(initial,/"type":"delta"/);assert.doesNotMatch(initial,/"type":"result"/);releaseStream();
    let rest='';while(true){const chunk=await reader.read();if(chunk.done)break;rest+=new TextDecoder().decode(chunk.value);}assert.match(rest,/"type":"result"/);assert.match(rest,/Simpan/);
    streamMode='broken';const broken=await streamRequest();const interrupted=await broken.text();assert.match(interrupted,/"type":"error"/);assert.doesNotMatch(interrupted,/private provider detail|"type":"result"/);
    streamMode='foreign';const foreign=await streamRequest();assert.equal(foreign.status,404);assert.doesNotMatch(await foreign.text(),/"type":"delta"/);
  }finally{releaseStream();if(previousAI===undefined)delete process.env.LAB_AI_URL;else process.env.LAB_AI_URL=previousAI;await new Promise<void>(resolve=>ai.close(()=>resolve()));}
  assert.equal((await call('/v1/group/settings',{askEnabled:false},s.data.token)).status,403);
  await call('/v1/group/settings',{askEnabled:false},a.data.token);
  assert.equal((await call('/v1/guide',{question:'Simpan'},s.data.token)).status,403);
  await call('/v1/group/settings',{askEnabled:true},a.data.token);
  assert.equal((await call('/v1/guide',{recordingId:r.data.recordingId,question:'Unrelated'},s.data.token)).status,404);
  await call(`/v1/recordings/${r.data.recordingId}/stop`,{},a.data.token);
  assert.equal((await call(route,{...step,eventId:randomUUID()},a.data.token)).status,409);
  assert.equal((await call(route,{...step,enrichment:false},a.data.token)).status,200);
  const state={windowTitle:'Fixture',visibleNames:[],elements:[],observedAt:Date.now()};
  const capture={surface:'uia',preState:null,postState:state,details:{className:'Button',ancestors:[],supportedPatterns:[],enabled:true,bboxNorm:[0,0,1,1],appVersion:''},env:{os:'Windows',dpi:null,resolution:[1920,1080],monitorCount:1,locale:'en-US'}};
  assert.equal((await call(route,{...step,enrichment:true,capture},a.data.token)).status,200);
  const stored=await call(route,undefined,a.data.token);assert.equal(stored.data.steps.length,1);assert.deepEqual(stored.data.steps[0].capture.postState,state);
  assert.equal((await call(route,{...step,event:'type',enrichment:true,capture},a.data.token)).status,409);
  assert.equal((await call(route,{...step,eventId:randomUUID(),enrichment:true,capture},a.data.token)).status,409);
  assert.equal((await call('/v1/group/close',{},s.data.token)).status,403);
  await call('/v1/group/close',{},a.data.token);
  assert.equal((await call('/v1/group',undefined,s.data.token)).status,410);
  assert.equal((await call('/v1/join',{name:'Late',code:a.data.group.code})).status,404);
 }finally{await new Promise<void>(r=>server.close(()=>r()));await db.dropDatabase();await client.close();await mongo?.stop();}
});
