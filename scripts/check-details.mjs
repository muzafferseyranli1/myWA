const COOLIFY_HOST = 'http://188.132.198.144:8000';
const COOLIFY_TOKEN = '1|h9uFOZlfwk5w7EUrve5X8TfdJQ3IXzevaX1xtuRK2217d5ec';
const APP_UUID = 'tiadrkjgtdj1tet3ojuxegq4';
const DEPLOY_UUID = 'dvjiileviyjlb5fku9itpoib';

async function checkDetails() {
  const appRes = await fetch(`${COOLIFY_HOST}/api/v1/applications/${APP_UUID}`, {
    headers: { 'Authorization': `Bearer ${COOLIFY_TOKEN}`, 'Accept': 'application/json' }
  });
  const appData = await appRes.json();
  console.log('App Data:', JSON.stringify({
    name: appData.name,
    build_pack: appData.build_pack,
    git_repository: appData.git_repository,
    status: appData.status,
    dockerfile_location: appData.dockerfile_location
  }, null, 2));

  const depRes = await fetch(`${COOLIFY_HOST}/api/v1/deployments/${DEPLOY_UUID}`, {
    headers: { 'Authorization': `Bearer ${COOLIFY_TOKEN}`, 'Accept': 'application/json' }
  });
  const depData = await depRes.json();
  console.log('Deployment Data keys:', Object.keys(depData));
  console.log('Deployment status:', depData.status);
  console.log('Deployment message/logs:', depData.logs || depData.commit_message || depData);
}

checkDetails().catch(console.error);
