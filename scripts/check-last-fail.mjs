const COOLIFY_HOST = 'http://188.132.198.144:8000';
const COOLIFY_TOKEN = '1|h9uFOZlfwk5w7EUrve5X8TfdJQ3IXzevaX1xtuRK2217d5ec';
const APP_UUID = 'tiadrkjgtdj1tet3ojuxegq4';
const DEPLOY_UUID = 'tfz2llusosfsiyhwxgku5f2u';

async function check() {
  const depRes = await fetch(`${COOLIFY_HOST}/api/v1/deployments/${DEPLOY_UUID}`, {
    headers: { 'Authorization': `Bearer ${COOLIFY_TOKEN}`, 'Accept': 'application/json' }
  });
  const dep = await depRes.json();
  console.log('Deploy Status:', dep.status);

  // Check application status
  const appRes = await fetch(`${COOLIFY_HOST}/api/v1/applications/${APP_UUID}`, {
    headers: { 'Authorization': `Bearer ${COOLIFY_TOKEN}`, 'Accept': 'application/json' }
  });
  const app = await appRes.json();
  console.log('App status:', app.status);
  console.log('App ports_mappings:', app.ports_mappings);
  console.log('App health_check:', app.health_check_enabled, app.health_check_path);
}

check().catch(console.error);
