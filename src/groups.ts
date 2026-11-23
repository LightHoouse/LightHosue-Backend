import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Db } from 'mongodb';
import { z } from 'zod';
import { readEvents } from './ndjson.js';

const text = z.string().trim().min(1).max(120);
const target = z.object({ automationId:z.string().max(300), name:z.string().max(300), controlType:z.string().max(80) }).strict();
const stepSchema = z.object({
  eventId:z.string().uuid(), event:z.enum(['click','doubleClick','rightClick','scroll','type']),
  target, window:z.object({process:text,title:z.string().max(300)}).strict(),
  timestamp:z.number().finite(), direction:z.enum(['up','down']).optional(),
}).strict();
const hash = (s:string) => createHash('sha256').update(s).digest('hex');
const expires = () => new Date(Date.now()+7*86400000);
const attempts = new Map<string,{count:number,until:number}>();
function rateLimit(req:IncomingMessage) {
  const key=req.socket.remoteAddress || 'unknown'; const now=Date.now();
  for(const [k,v] of attempts) if(v.until<now) attempts.delete(k);
  const value=attempts.get(key) || {count:0,until:now+60000};
  value.count++; attempts.set(key,value);
  if(value.count>60) throw new Error('429:Terlalu banyak permintaan. Coba satu menit lagi.');
}
export async function groupIndexes(db:Db) {
  await Promise.all([
    db.collection('groups').createIndex({code:1},{unique:true}),
    db.collection('members').createIndex({tokenHash:1},{unique:true}),
    db.collection('recordedSteps').createIndex({recordingId:1,eventId:1},{unique:true}),
    db.collection('recordedSteps').createIndex({recordingId:1,seq:1},{unique:true}),
    ...['groups','members','recordings','recordedSteps','guideAcks'].map(c=>db.collection(c).createIndex({expiresAt:1},{expireAfterSeconds:0})),
  ]);
}
export async function groupRoute(req:IncomingMessage,res:ServerResponse,db:Db|undefined,read:()=>Promise<unknown>):Promise<boolean> {
  const url=(req.url || '').split('?')[0]; if(!url.startsWith('/v1/')) return false;
  const send=(status:number,value:unknown)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(value));};
  const streamEvent=(event:unknown)=>{if(!res.headersSent){res.setHeader('content-type','application/x-ndjson; charset=utf-8');res.setHeader('cache-control','no-cache, no-transform');res.setHeader('x-accel-buffering','no');res.flushHeaders();}res.write(JSON.stringify(event)+'\n');};
  try {
    if(!db) throw new Error('503:Penyimpanan belum tersedia.');
    const groups=db.collection('groups'), members=db.collection('members'), recordings=db.collection('recordings'), steps=db.collection('recordedSteps');
    if(req.method==='POST' && ['/v1/groups','/v1/join'].includes(url)) {
      rateLimit(req);
      const input=z.object({name:text,groupName:text.optional(),code:z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8}$/).optional()}).parse(await read());
      const owner=url==='/v1/groups';
      const group=owner ? {groupId:randomUUID(),name:input.groupName || 'Praktikum',code:randomBytes(4).toString('hex').toUpperCase(),active:true,expiresAt:expires()} : await groups.findOne({code:input.code || '',active:true,expiresAt:{$gt:new Date()}});
      if(!group) throw new Error('404:Kode group tidak ditemukan atau sudah ditutup.');
      if(owner) await groups.insertOne(group);
      const token=randomBytes(32).toString('base64url');
      const member={memberId:randomUUID(),groupId:group.groupId,name:input.name,role:owner?'assistant':'student',tokenHash:hash(token),expiresAt:group.expiresAt};
      await members.insertOne(member);
      send(201,{token,memberId:member.memberId,role:member.role,group:{groupId:group.groupId,name:group.name,code:group.code}}); return true;
    }
    const bearer=req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
    const member=await members.findOne({tokenHash:hash(bearer),expiresAt:{$gt:new Date()}});
    if(!member) throw new Error('401:Sesi tidak valid. Silakan join lagi.');
    const group=await groups.findOne({groupId:member.groupId,active:true,expiresAt:{$gt:new Date()}});
    if(!group) throw new Error('410:Group sudah ditutup atau kedaluwarsa.');
    const owner=()=>{if(member.role!=='assistant') throw new Error('403:Hanya asisten yang dapat merekam.');};
    if(req.method==='GET' && url==='/v1/group') {
      send(200,{group:{groupId:group.groupId,name:group.name,code:group.code,askEnabled:group.askEnabled!==false},role:member.role,name:member.name,
        members:await members.find({groupId:group.groupId,expiresAt:{$gt:new Date()}},{projection:{_id:0,name:1,role:1,memberId:1}}).toArray(),
        recordings:await recordings.find({groupId:group.groupId},{projection:{_id:0}}).sort({createdAt:-1}).limit(50).toArray()}); return true;
    }
    if(req.method==='POST' && url==='/v1/group/close') {owner();await groups.updateOne({groupId:group.groupId},{$set:{active:false}});send(200,{ok:true});return true;}
    if(req.method==='POST' && url==='/v1/group/settings') {owner();const input=z.object({askEnabled:z.boolean()}).parse(await read());await groups.updateOne({groupId:group.groupId},{$set:input});send(200,input);return true;}
    if(req.method==='POST' && url==='/v1/leave') {await members.deleteOne({memberId:member.memberId});send(200,{ok:true});return true;}
    if(req.method==='POST' && url==='/v1/recordings') {
      owner();const input=z.object({name:text,process:text}).parse(await read());
      const recording={recordingId:randomUUID(),groupId:group.groupId,name:input.name,process:input.process,status:'recording',createdAt:Date.now(),expiresAt:group.expiresAt};
      await recordings.insertOne(recording);send(201,recording);return true;
    }
    const match=url.match(/^\/v1\/recordings\/([\w-]+)\/(steps|stop)$/);
    if(match) {
      const recording=await recordings.findOne({recordingId:match[1],groupId:group.groupId});
      if(!recording) throw new Error('404:Rekaman tidak ditemukan dalam group ini.');
      if(req.method==='POST' && match[2]==='stop') {owner();await recordings.updateOne({recordingId:match[1]},{$set:{status:'ready'}});send(200,{ok:true});return true;}
      if(req.method==='POST' && match[2]==='steps') {
        owner();if(recording.status!=='recording') throw new Error('409:Rekaman sudah selesai.');
        const input=stepSchema.parse(await read());
        if(recording.process!=='*' && input.window.process!==recording.process) throw new Error('400:Jendela berbeda dari rekaman.');
        const existing=await steps.findOne({recordingId:match[1],eventId:input.eventId});
        if(existing){send(200,{stepId:existing.stepId});return true;}
        const next=await recordings.findOneAndUpdate({recordingId:match[1],status:'recording',$or:[{nextSeq:{$lt:2000}},{nextSeq:{$exists:false}}]},{$inc:{nextSeq:1}},{returnDocument:'after'});
        if(!next)throw new Error('409:Rekaman selesai atau batas 2000 langkah tercapai.');
        const step={...input,stepId:randomUUID(),recordingId:match[1],groupId:group.groupId,seq:next.nextSeq,typedText:null,typedTextSensitive:input.event==='type',expiresAt:group.expiresAt};
        try{await steps.insertOne(step);}catch(error){const duplicate=await steps.findOne({recordingId:match[1],eventId:input.eventId});if(duplicate){send(200,{stepId:duplicate.stepId});return true;}throw error;}send(201,{stepId:step.stepId});return true;
      }
      if(req.method==='GET' && match[2]==='steps') {send(200,{steps:await steps.find({recordingId:match[1],groupId:group.groupId},{projection:{_id:0}}).sort({seq:1,timestamp:1}).toArray()});return true;}
    }
    if(req.method==='POST' && url==='/v1/guide') {
      const input=z.object({stream:z.boolean().default(false),recordingId:z.string().uuid().optional(),question:z.string().max(1000).default(''),afterSeq:z.number().int().min(0).default(0),visibleNames:z.array(z.string().max(300)).max(100).default([]),activeProcess:z.string().max(120).default('')}).parse(await read());
      if(group.askEnabled===false && member.role==='student')throw new Error('403:Asisten sedang menonaktifkan bantuan untuk sesi ini.');
      const recording=await recordings.findOne({...(input.recordingId?{recordingId:input.recordingId}:{nextSeq:{$gt:0}}),groupId:group.groupId},{sort:{createdAt:-1}});
      if(!recording) throw new Error('404:Rekaman tidak ditemukan dalam group ini.');
      const all=await steps.find({recordingId:recording.recordingId,groupId:group.groupId},{projection:{_id:0}}).sort({seq:1,timestamp:1}).toArray();
      if(!all.length)throw new Error('409:Belum ada langkah yang direkam.');
      let selected=all.find(s=>s.seq>input.afterSeq);
      let explanation='',source='recording';
      if(input.question.trim() && process.env.LAB_AI_URL) {
        const rateKey='ai:'+member.memberId,now=Date.now();const limit=attempts.get(rateKey)||{count:0,until:now+60000};if(limit.until<now){limit.count=0;limit.until=now+60000;}limit.count++;attempts.set(rateKey,limit);if(limit.count>12)throw new Error('429:Batas 12 pertanyaan AI per menit. Tunggu sebentar.');
        let response;
        try{response=await fetch(`${process.env.LAB_AI_URL}/guide${input.stream?'/stream':''}`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${process.env.LAB_AI_TOKEN || ''}`},body:JSON.stringify({question:input.question,visibleNames:input.visibleNames,activeProcess:input.activeProcess,steps:all.map(s=>({stepId:s.stepId,seq:s.seq,event:s.event,target:s.target,process:s.window.process}))}),signal:AbortSignal.timeout(60000)});}catch{throw new Error('503:AI belum dapat dihubungi. Coba lagi sebentar.');}
        if(!response.ok)throw new Error('503:AI belum tersedia. Coba lagi atau gunakan Langkah berikutnya.');
        if(input.stream){
          let finished=false;selected=undefined;
          for await(const event of readEvents(response)){
            if(event.type==='selection'){if(selected)throw new Error('503:Seleksi AI tidak valid.');selected=all.find(s=>s.stepId===event.stepId);if(!selected)throw new Error('404:AI tidak menemukan langkah dalam rekaman ini.');}
            else if(event.type==='delta'){if(!selected||typeof event.text!=='string'||explanation.length+event.text.length>4000)throw new Error('503:Stream AI tidak valid.');explanation+=event.text;streamEvent({type:'delta',text:event.text});}
            else if(event.type==='done'){finished=true;}
            else if(event.type==='error')throw new Error('503:AI terputus atau tidak menemukan langkah yang sesuai. Coba lagi.');
          }
          if(!finished||!selected||!explanation)throw new Error('503:Jawaban AI terputus. Coba lagi.');
        }else{
          const result=await response.json() as {stepId?:string;explanation?:string};
          selected=all.find(s=>s.stepId===result.stepId);if(!selected)throw new Error('404:AI tidak menemukan langkah yang sesuai dalam rekaman ini.');
          explanation=typeof result.explanation==='string'?result.explanation.slice(0,600):'';
        }
        source='ai';
      } else if(input.question.trim()) {
        const words=input.question.toLowerCase().split(/\W+/).filter(w=>w.length>2);
        const ranked=all.map(s=>({step:s,score:words.filter(w=>`${s.target.name} ${s.target.automationId} ${s.event}`.toLowerCase().includes(w)).length})).sort((a,b)=>b.score-a.score);
        if(!ranked[0]?.score)throw new Error('404:Tidak ada langkah yang cocok. Coba nama tombol atau gunakan Langkah berikutnya.');
        selected=ranked[0].step;
      }
      if(!selected){send(200,{done:true});return true;}
      const verbs:Record<string,string>={click:'Klik',doubleClick:'Klik dua kali',rightClick:'Klik kanan',scroll:'Scroll',type:'Isi dengan nilai milikmu pada'};
      const command={cmdId:randomUUID(),source,explanation,mode:'guide',step:selected,say:`${verbs[selected.event]} ${selected.target.name || selected.target.automationId || selected.target.controlType}${selected.event==='scroll' ? ' '+(selected.direction==='up'?'ke atas':'ke bawah'):''}.`,total:all.length};if(input.stream){streamEvent({type:'result',command});res.end();}else send(200,command);return true;
    }
    if(req.method==='POST' && url==='/v1/ack') {
      const input=z.object({cmdId:z.string().uuid(),stepId:z.string().uuid(),resolved:z.boolean(),strategy:z.string().max(80).nullable()}).parse(await read());
      if(!await steps.findOne({stepId:input.stepId,groupId:group.groupId}))throw new Error('404:Langkah tidak ditemukan.');
      await db.collection('guideAcks').insertOne({...input,groupId:group.groupId,memberId:member.memberId,expiresAt:group.expiresAt,at:Date.now()});send(200,{ok:true});return true;
    }
    throw new Error('404:Endpoint tidak ditemukan.');
  } catch(error) {
    const message=error instanceof Error?error.message:'';const match=message.match(/^(\d{3}):(.*)$/);
    if(res.headersSent){streamEvent({type:'error',message:match?match[2]:'Jawaban terputus. Coba lagi.'});res.end();return true;}
    send(match?Number(match[1]):400,{error:match?match[2]:'Data tidak valid. Periksa isian dan coba lagi.'});return true;
  }
}
