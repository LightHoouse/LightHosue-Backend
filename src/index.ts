import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import mqtt from "mqtt";
import { MongoClient, type Db } from "mongodb";
import { commandSchema } from "./protocol/types.js";

import { authorized, redact, topicId } from "./safety.js";
import { groupIndexes, groupRoute } from './groups.js';

const port = Number(process.env.PORT ?? 3000);
const aiUrl = process.env.LAB_AI_URL ?? "http://127.0.0.1:8100";
const mongoUri = process.env.MONGODB_URI;
const mongo = mongoUri ? new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 }) : undefined;
let db: Db | undefined;
const mqttUrl = process.env.MQTT_URL;
const mqttClient = mqttUrl ? mqtt.connect(mqttUrl, { username: process.env.MQTT_USERNAME, password: process.env.MQTT_PASSWORD, rejectUnauthorized: true, ca: process.env.MQTT_CA_CERT || undefined, clientId: `lighthouse-backend-${randomUUID()}` }) : undefined;

async function jsonBody(req: IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const chunk of req) { raw += chunk.toString(); if (raw.length > 2_000_000) throw new Error("request_too_large"); }
  return JSON.parse(raw || "{}");
}
function respond(res: ServerResponse, status: number, body: unknown) { res.statusCode = status; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(body)); }

async function save(collection: string, value: Record<string, unknown>) { if (!db) throw new Error("storage_unavailable"); await db.collection(collection).insertOne({ ...value, _storedAt: new Date() }); }

mqttClient?.on("connect", () => { console.log(JSON.stringify({ level:"info", message:"mqtt_connected" })); mqttClient.subscribe("lab/+/student/+/ack", { qos: 1 }); });
mqttClient?.on("message", async (_topic, payload) => { try { await save("acks", JSON.parse(payload.toString())); } catch (error) { console.error(JSON.stringify({ level:"error", message:"ack_store_failed", error:String(error) })); } });
mqttClient?.on("error", error => console.error(JSON.stringify({ level:"error", message:"mqtt_error", error:error.message })));

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") { respond(res, 200, { ok:true, service:"lighthouse-backend", mqtt:Boolean(mqttClient?.connected), mongo:Boolean(db) }); return; }
    if(await groupRoute(req,res,db,()=>jsonBody(req))) return;
    if (!authorized(req.headers.authorization, process.env.API_TOKEN)) { respond(res, 401, {error:"unauthorized"}); return; }
    if (req.method === "GET" && req.url === "/health/detailed") { const checks = { mongo: Boolean(db), mqtt: Boolean(mqttClient?.connected), ai: false }; try { checks.ai = (await fetch(`${aiUrl}/healthz`, { signal: AbortSignal.timeout(1500) })).ok; } catch {} respond(res, checks.mongo && checks.mqtt ? 200 : 503, { status: Object.values(checks).every(Boolean) ? "ok" : "degraded", checks }); return; }
    if (req.method === "POST" && req.url === "/snapshots") { const snapshot = redact(await jsonBody(req)) as Record<string, unknown>; await save("snapshots", snapshot); respond(res, 201, { stored:true }); return; }
    if (req.method === "POST" && req.url === "/steps") { const step = redact(await jsonBody(req)) as Record<string, unknown>; if (!step.stepId || !step.sessionId) { respond(res, 400, { error:"stepId_and_sessionId_required" }); return; } await save("steps", step); respond(res, 201, { stored:true }); return; }
    if (req.method === "POST" && req.url === "/answer") { if (!process.env.LAB_AI_URL) { respond(res, 503, {error:"ai_not_configured"}); return; } const snapshot = await jsonBody(req); const response = await fetch(`${aiUrl}/answer`, { method:"POST", headers:{"content-type":"application/json",authorization:`Bearer ${process.env.LAB_AI_TOKEN || ""}`}, body:JSON.stringify(snapshot), signal:AbortSignal.timeout(30000) }); respond(res, response.status, await response.json()); return; }
    if (req.method === "POST" && req.url === "/commands") {
      const input = await jsonBody(req) as Record<string, unknown>;
      if (!topicId(input.sessionId) || !topicId(input.studentId)) { respond(res,400,{error:"invalid_scope"}); return; }
      const command = commandSchema.parse({ ...input, cmdId: input.cmdId ?? randomUUID(), snapshotId: input.snapshotId ?? "snap_unknown", issuedAt: input.issuedAt ?? Date.now(), schemaVersion:1, mode:"guide", prerequisiteStepRefs: input.prerequisiteStepRefs ?? [], params: input.params ?? {}, locators: input.locators ?? [], window: input.window ?? { process:"", titlePattern:"", urlPattern:null }, scrollContainer: input.scrollContainer ?? null, verify: input.verify ?? {}, onFail: input.onFail ?? {}, say: input.say ?? "", detail: input.detail ?? null });
      if (Date.now() > command.issuedAt + command.ttlMs) { respond(res, 410, { error:"expired", cmdId:command.cmdId }); return; }
      if (!mqttClient?.connected) { respond(res, 503, { error:"mqtt_unavailable" }); return; }
      await save("commands", command as unknown as Record<string, unknown>);
      const topic = `lab/${command.sessionId}/student/${command.studentId}/cmd`;
      await new Promise<void>((resolve, reject) => mqttClient.publish(topic, JSON.stringify(command), { qos:1 }, error => error ? reject(error) : resolve()));
      respond(res, 202, { accepted:true, cmdId:command.cmdId }); return;
    }
    respond(res, 404, { error:"not_found" });
  } catch (error) { const unavailable = error instanceof Error && error.message === "storage_unavailable"; respond(res, unavailable ? 503 : 400, { error:unavailable ? "storage_unavailable" : "request_failed" }); }
});

async function main() {
  if (process.env.NODE_ENV === "production" && (!process.env.API_TOKEN || process.env.API_TOKEN.length < 32 || !mongoUri || !mqttUrl?.startsWith("mqtts://"))) throw new Error("Production requires API_TOKEN (32+ chars), MONGODB_URI, and MQTT TLS");
  if (mongo) { await mongo.connect(); db = mongo.db(); await Promise.all([db.collection("snapshots").createIndex({ _storedAt:1 }, { expireAfterSeconds: 86400 }), db.collection("steps").createIndex({ sessionId:1, seq:1 }, { unique:true }), db.collection("acks").createIndex({ cmdId:1 }, { unique:true, sparse:true })]); }
  if(db) await groupIndexes(db);
  server.listen(port, () => console.log(JSON.stringify({ level:"info", message:"http_started", port })));
}
main().catch(error => { console.error(error); process.exit(1); });

