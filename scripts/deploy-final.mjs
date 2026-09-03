const COOLIFY_HOST = 'http://188.132.198.144:8000';
const COOLIFY_TOKEN = '1|h9uFOZlfwk5w7EUrve5X8TfdJQ3IXzevaX1xtuRK2217d5ec';
const APP_UUID = 'tiadrkjgtdj1tet3ojuxegq4';

async function updateAndDeploy() {
  console.log('Updating health check and mapping...');
  const patchRes = await fetch(`${COOLIFY_HOST}/api/v1/applications/${APP_UUID}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${COOLIFY_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      health_check_path: '/health',
      health_check_port: '3060',
      health_check_enabled: true,
      ports_mappings: '3060:3060',
      ports_exposes: '3060'
    })
  });

  const patchData = await patchRes.json().catch(() => ({}));
  console.log('Patch status:', patchRes.status);

  console.log('\nTriggering new deployment...');
  const deployRes = await fetch(`${COOLIFY_HOST}/api/v1/deploy?uuid=${APP_UUID}&force=true`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${COOLIFY_TOKEN}`,
      'Accept': 'application/json'
    }
  });

  const deployData = await deployRes.json().catch(() => ({}));
  console.log('Deploy Status:', deployRes.status);
  console.log('Deploy Info:', JSON.stringify(deployData, null, 2));

  const depUuid = deployData.deployments?.[0]?.deployment_uuid;
  if (!depUuid) return;

  console.log('\nMonitoring build (Deployment UUID: ' + depUuid + ')...');
  const start = Date.now();
  while (Date.now() - start < 300000) {
    await new Promise(r => setTimeout(r, 6000));
    try {
      const statusRes = await fetch(`${COOLIFY_HOST}/api/v1/deployments/${depUuid}`, {
        headers: { 'Authorization': `Bearer ${COOLIFY_TOKEN}`, 'Accept': 'application/json' }
      });
      const statusData = await statusRes.json();
      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(`[${elapsed}s] Status: ${statusData.status}`);
      if (statusData.status === 'finished' || statusData.status === 'success') {
        console.log('🎉🎉 DEPLOYMENT FINISHED AND LIVE AT http://188.132.198.144:3060 ! 🎉🎉');
        break;
      }
      if (statusData.status === 'failed' || statusData.status === 'error') {
        console.log('❌ Deployment failed.');
        break;
      }
    } catch (e) {
      console.log('Error:', e.message);
    }
  }
}

updateAndDeploy().catch(console.error);
