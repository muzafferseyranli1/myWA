const COOLIFY_HOST = 'http://188.132.198.144:8000';
const COOLIFY_TOKEN = process.env.COOLIFY_TOKEN;
const DEPLOY_UUID = 'dvjiileviyjlb5fku9itpoib';

async function watchDeploy() {
  const res = await fetch(`${COOLIFY_HOST}/api/v1/deployments/${DEPLOY_UUID}`, {
    headers: {
      'Authorization': `Bearer ${COOLIFY_TOKEN}`,
      'Accept': 'application/json'
    }
  });

  const data = await res.json().catch(() => ({}));
  console.log('Status:', data.status);
  if (data.logs) {
    const lines = data.logs.split('\n');
    console.log('--- Logs (tail 15) ---');
    console.log(lines.slice(-15).join('\n'));
  }
}

watchDeploy().catch(console.error);
