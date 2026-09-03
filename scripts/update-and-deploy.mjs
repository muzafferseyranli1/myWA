const COOLIFY_HOST = 'http://188.132.198.144:8000';
const COOLIFY_TOKEN = '1|h9uFOZlfwk5w7EUrve5X8TfdJQ3IXzevaX1xtuRK2217d5ec';
const APP_UUID = 'tiadrkjgtdj1tet3ojuxegq4';

async function updateAndDeploy() {
  console.log('Patching application config...');
  const patchRes = await fetch(`${COOLIFY_HOST}/api/v1/applications/${APP_UUID}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${COOLIFY_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      dockerfile_location: '/Dockerfile',
      base_directory: '/',
      ports_mappings: '3060:3060',
      ports_exposes: '3060'
    })
  });

  const patchData = await patchRes.json().catch(() => ({}));
  console.log('Patch Status:', patchRes.status);
  console.log('Patch Data:', JSON.stringify(patchData, null, 2));

  console.log('\nTriggering new deployment with /Dockerfile location...');
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
}

updateAndDeploy().catch(console.error);
