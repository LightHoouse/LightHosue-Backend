import { readFileSync } from 'node:fs';

// Loaded before application modules; configuration never enters the image.
if (process.env.LIGHTHOUSE_RUNTIME_CONFIG) {
  const config = JSON.parse(readFileSync(process.env.LIGHTHOUSE_RUNTIME_CONFIG, 'utf8'));
  const allowed = new Set(['MONGODB_URI', 'MQTT_URL', 'MQTT_USERNAME', 'MQTT_PASSWORD', 'MQTT_CA_CERT', 'API_TOKEN', 'LAB_AI_URL', 'LAB_AI_TOKEN']);
  for (const [key, value] of Object.entries(config)) {
    if (!allowed.has(key) || typeof value !== 'string') throw new Error('Invalid runtime configuration');
    process.env[key] = value;
  }
  for (const key of ['MONGODB_URI', 'MQTT_URL', 'MQTT_USERNAME', 'MQTT_PASSWORD', 'API_TOKEN']) {
    if (!process.env[key]) throw new Error(`Missing runtime configuration: ${key}`);
  }
}
