const COOLIFY_HOST = 'http://188.132.198.144:8000';
const COOLIFY_TOKEN = '1|h9uFOZlfwk5w7EUrve5X8TfdJQ3IXzevaX1xtuRK2217d5ec';
const DEPLOY_UUID = 'giqwaimiiq6z5uggxmj1aunq';

async function checkFail() {
  const res = await fetch(`${COOLIFY_HOST}/api/v1/deployments/${DEPLOY_UUID}`, {
    headers: { 'Authorization': `Bearer ${COOLIFY_TOKEN}`, 'Accept': 'application/json' }
  });
  const data = await res.json();
  console.log('Keys:', Object.keys(data));
  console.log('Status:', data.status);
  console.log('Log / Message fields:');
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string' && v.length > 0 && k !== 'deployment_url') {
      console.log(`[${k}]: ${v}`);
    }
  }
}

checkFail().catch(console.error);
