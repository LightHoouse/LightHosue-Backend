const { COOLIFY_URL:base, COOLIFY_TOKEN:token, COOLIFY_APP_UUID:uuid, HEALTH_URL:health } = process.env;
if (!base || !token || !uuid || !health) throw new Error('Deployment configuration missing');
async function api(route, body) {
 const response = await fetch(`${base}/api/v1/${route}`, {method:body ? 'POST' : 'GET', headers:{authorization:`Bearer ${token}`,'content-type':'application/json'}, ...(body ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(30000)});
 if (!response.ok) throw new Error(`Coolify request failed: ${response.status}`);
 return response.json();
}
const created = await api('deploy', {uuid});
const deployment = created.deployments?.[0]?.deployment_uuid;
if (!deployment) throw new Error('No deployment ID');
for (let i=0;i<90;i++) {
 const state=await api(`deployments/${deployment}`);
 if (state.status==='finished') {
  const res=await fetch(health, {signal:AbortSignal.timeout(15000)});
  const body=await res.json();
  if(!res.ok || !body.ok || !body.mongo || !body.mqtt) throw new Error('Deployment dependency smoke check failed');
  console.log('Coolify deployment and public health check passed'); process.exit(0);
 }
 if(['failed','cancelled'].includes(state.status)) throw new Error('Coolify deployment failed');
 await new Promise(resolve=>setTimeout(resolve,5000));
}
throw new Error('Deployment timed out');
