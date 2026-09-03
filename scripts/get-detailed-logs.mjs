const COOLIFY_HOST = 'http://188.132.198.144:8000';
const COOLIFY_TOKEN = '1|h9uFOZlfwk5w7EUrve5X8TfdJQ3IXzevaX1xtuRK2217d5ec';
const DEPLOY_UUID = '0rcgzeydzdbpgkpown8mhog2';

async function getDetailedLogs() {
  const res = await fetch(`${COOLIFY_HOST}/api/v1/deployments/${DEPLOY_UUID}`, {
    headers: { 'Authorization': `Bearer ${COOLIFY_TOKEN}`, 'Accept': 'application/json' }
  });
  const data = await res.json();
  console.log('Deployment status:', data.status);
  console.log('Logs:');
  console.log(data.logs || 'No logs in logs field');

  // Also check application logs
  const appLogsRes = await fetch(`${COOLIFY_HOST}/api/v1/applications/tiadrkjgtdj1tet3ojuxegq4/logs`, {
    headers: { 'Authorization': `Bearer ${COOLIFY_TOKEN}`, 'Accept': 'application/json' }
  });
  const appLogs = await appLogsRes.json().catch(() => ({}));
  console.log('App Logs:', JSON.stringify(appLogs, null, 2));
}

getDetailedLogs().catch(console.error);
