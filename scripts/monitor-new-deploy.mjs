const COOLIFY_HOST = 'http://188.132.198.144:8000';
const COOLIFY_TOKEN = '1|h9uFOZlfwk5w7EUrve5X8TfdJQ3IXzevaX1xtuRK2217d5ec';
const DEPLOY_UUID = 'cgapv7jhviggye9bjlh3cxgs';

async function monitor() {
  const start = Date.now();
  console.log(`Monitoring deployment ${DEPLOY_UUID}...`);

  while (Date.now() - start < 180000) {
    try {
      const res = await fetch(`${COOLIFY_HOST}/api/v1/deployments/${DEPLOY_UUID}`, {
        headers: { 'Authorization': `Bearer ${COOLIFY_TOKEN}`, 'Accept': 'application/json' }
      });
      const data = await res.json();
      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(`[${elapsed}s] Deployment Status: ${data.status}`);

      if (data.status === 'finished' || data.status === 'success') {
        console.log('✅ Deployment FINISHED successfully!');
        return;
      } else if (data.status === 'failed' || data.status === 'error') {
        console.log('❌ Deployment FAILED.');
        return;
      }
    } catch (e) {
      console.log('Fetch error:', e.message);
    }
    await new Promise(r => setTimeout(r, 6000));
  }
}

monitor().catch(console.error);
