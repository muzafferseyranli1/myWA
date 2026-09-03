const COOLIFY_HOST = 'http://188.132.198.144:8000';
const COOLIFY_TOKEN = '1|h9uFOZlfwk5w7EUrve5X8TfdJQ3IXzevaX1xtuRK2217d5ec';
const APP_UUID = 'tiadrkjgtdj1tet3ojuxegq4';

async function updateToPublicGit() {
  const patchRes = await fetch(`${COOLIFY_HOST}/api/v1/applications/${APP_UUID}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${COOLIFY_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      git_repository: 'https://github.com/muzafferseyranli1/myWA.git',
      git_branch: 'main',
      build_pack: 'dockerfile',
      dockerfile_location: '/Dockerfile'
    })
  });

  const data = await patchRes.json().catch(() => ({}));
  console.log('Update Status:', patchRes.status);
  console.log('Update Data:', JSON.stringify(data, null, 2));

  // Trigger deploy
  const deployRes = await fetch(`${COOLIFY_HOST}/api/v1/deploy?uuid=${APP_UUID}&force=true`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${COOLIFY_TOKEN}`,
      'Accept': 'application/json'
    }
  });
  const deployData = await deployRes.json().catch(() => ({}));
  console.log('Deploy Status:', deployRes.status);
  console.log('Deploy Data:', JSON.stringify(deployData, null, 2));
}

updateToPublicGit().catch(console.error);
