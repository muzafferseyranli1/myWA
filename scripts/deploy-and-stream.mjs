const COOLIFY_HOST = 'http://188.132.198.144:8000';
const COOLIFY_TOKEN = '1|h9uFOZlfwk5w7EUrve5X8TfdJQ3IXzevaX1xtuRK2217d5ec';
const APP_UUID = 'tiadrkjgtdj1tet3ojuxegq4';

async function deployAndStream() {
  console.log('Triggering deployment for application ' + APP_UUID + '...');
  const res = await fetch(`${COOLIFY_HOST}/api/v1/deploy?uuid=${APP_UUID}&force=true`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${COOLIFY_TOKEN}`,
      'Accept': 'application/json'
    }
  });

  const data = await res.json();
  console.log('Deploy response:', JSON.stringify(data, null, 2));

  const depUuid = data.deployments?.[0]?.deployment_uuid;
  if (!depUuid) return;

  console.log('\nPolling deployment logs for UUID:', depUuid);
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 4000));
    const depRes = await fetch(`${COOLIFY_HOST}/api/v1/deployments/${depUuid}`, {
      headers: { 'Authorization': `Bearer ${COOLIFY_TOKEN}`, 'Accept': 'application/json' }
    });
    const depData = await depRes.json();
    console.log(`[${i * 4}s] Status: ${depData.status}`);
    if (depData.logs) {
      console.log('--- LOGS ---');
      console.log(depData.logs);
      console.log('--- END LOGS ---');
    }
    if (depData.status === 'finished' || depData.status === 'success') {
      console.log('DEPLOYMENT SUCCESSFUL!');
      break;
    }
    if (depData.status === 'failed' || depData.status === 'error') {
      console.log('DEPLOYMENT FAILED!');
      break;
    }
  }
}

deployAndStream().catch(console.error);
