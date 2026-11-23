import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authorized, redact, topicId } from './safety.js';
test('API fails closed and accepts only the configured bearer', () => {
 assert.equal(authorized(undefined, undefined), false);
 assert.equal(authorized('Bearer secret', 'secret'), true);
 assert.equal(authorized('Bearer wrong', 'secret'), false);
});
test('redaction removes typed contents while preserving sensitive marker', () => {
 assert.deepEqual(redact({event:{typedText:'private',typedTextSensitive:true}}), {event:{typedText:null,typedTextSensitive:true}});
});
test('MQTT topic wildcard and path injection rejected', () => {
 for(const value of ['+','#','../other','one/two','',{}]) assert.equal(topicId(value), false);
 assert.equal(topicId('student-1'), true);
});
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
test('HTTP rejects unauthenticated writes and reports missing storage and AI', async () => {
 const reservation=createServer(); reservation.listen(0,'127.0.0.1'); await once(reservation,'listening');
 const address=reservation.address(); assert.ok(address && typeof address !== "string"); const port=address.port; await new Promise(resolve=>reservation.close(resolve));
 const child=spawn(process.execPath,['dist/index.js'],{env:{...process.env,PORT:String(port),API_TOKEN:'integration-token',NODE_ENV:'test',MONGODB_URI:'',MQTT_URL:'',LAB_AI_URL:''},stdio:['ignore','pipe','pipe']});
 try {
  await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('startup timeout')),5000).unref())]);
  const base=`http://127.0.0.1:${port}`;
  assert.equal((await fetch(`${base}/health`)).status,200);
  assert.equal((await fetch(`${base}/steps`,{method:'POST',body:'{}'})).status,401);
  const headers={authorization:'Bearer integration-token','content-type':'application/json'};
  assert.equal((await fetch(`${base}/steps`,{method:'POST',headers,body:JSON.stringify({stepId:'s',sessionId:'session',seq:0})})).status,503);
  assert.equal((await fetch(`${base}/answer`,{method:'POST',headers,body:'{}'})).status,503);
 } finally {child.kill();await once(child,'exit');}
});

