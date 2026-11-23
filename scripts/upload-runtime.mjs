import { spawnSync } from 'node:child_process';

const keys = ['MONGODB_URI', 'MQTT_URL', 'MQTT_USERNAME', 'MQTT_PASSWORD', 'MQTT_CA_CERT', 'API_TOKEN', 'LAB_AI_URL'];
const config = Object.fromEntries(keys.map(key => [key, process.env[key] || '']));
for (const key of keys.filter(key => !['MQTT_CA_CERT', 'LAB_AI_URL'].includes(key))) {
  if (!config[key]) throw new Error(`Missing GitHub secret: ${key}`);
}
const result = spawnSync('ssh', ['-i', process.env.DEPLOY_KEY_FILE, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${process.env.DEPLOY_HOSTS_FILE}`, process.env.DEPLOY_SSH_TARGET, 'upload-runtime'], {
  input: JSON.stringify(config), encoding: 'utf8', timeout: 30000,
});
// Never echo captured remote output: it could contain credentials.
if (result.error || result.status !== 0) throw new Error('Runtime configuration upload failed');
console.log('Runtime configuration uploaded');
