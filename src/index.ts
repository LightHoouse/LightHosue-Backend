import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import mqtt from "mqtt";
import { MongoClient } from "mongodb";
import { commandSchema } from "./protocol/types.js";

const port = Number(process.env.PORT ?? 3000);
const mongoUri = process.env.MONGODB_URI;
const mqttUrl = process.env.MQTT_URL;
const mqttOptions = process.env.MQTT_USERNAME ? { username: process.env.MQTT_USERNAME, password: process.env.MQTT_PASSWORD, rejectUnauthorized: true } : undefined;
const mongo = mongoUri ? new MongoClient(mongoUri) : undefined;
const mqttClient = mqttUrl ? mqtt.connect(mqttUrl, mqttOptions) : undefined;

mqttClient?.on("connect", () => console.log(JSON.stringify({level:"info", message:"mqtt_connected"})));
mqttClient?.on("error", (error) => console.error(JSON.stringify({level:"error", message:"mqtt_error", error:error.message})));

const server = createServer(async (req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.method === "GET" && req.url === "/health") { res.end(JSON.stringify({ok:true, service:"lighthouse-backend"})); return; }
  if (req.method === "POST" && req.url === "/commands") {
    let body = ""; req.on("data", chunk => body += chunk); req.on("end", () => {
      try {
        const input = JSON.parse(body);
        const command = commandSchema.parse({...input, cmdId: input.cmdId ?? randomUUID(), snapshotId: input.snapshotId ?? "snap_unknown", issuedAt: input.issuedAt ?? Date.now(), schemaVersion: 1, mode: "guide", prerequisiteStepRefs: [], params: {}, locators: input.locators ?? [], window: input.window ?? {process:"",titlePattern:"",urlPattern:null}, scrollContainer: input.scrollContainer ?? null, verify: input.verify ?? {}, onFail: input.onFail ?? {}, say: input.say ?? "", detail: input.detail ?? null});
        const topic = `lab/${command.sessionId}/student/${command.studentId}/cmd`;
        if (!mqttClient?.connected) { res.statusCode=503; res.end(JSON.stringify({error:"mqtt_unavailable"})); return; }
        mqttClient.publish(topic, JSON.stringify(command), {qos:1}, error => { if (error) {res.statusCode=502; res.end(JSON.stringify({error:"mqtt_publish_failed"})); return;} res.statusCode=202; res.end(JSON.stringify({accepted:true, cmdId:command.cmdId})); });
      } catch (error) { res.statusCode=400; res.end(JSON.stringify({error:error instanceof Error ? error.message : "invalid_request"})); }
    }); return;
  }
  res.statusCode=404; res.end(JSON.stringify({error:"not_found"}));
});

async function main() { if (mongo) await mongo.connect(); server.listen(port, () => console.log(JSON.stringify({level:"info", message:"http_started", port}))); }
main().catch(error => { console.error(error); process.exit(1); });

