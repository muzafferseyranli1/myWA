const COOLIFY_HOST = 'http://188.132.198.144:8000';
const COOLIFY_TOKEN = '1|h9uFOZlfwk5w7EUrve5X8TfdJQ3IXzevaX1xtuRK2217d5ec';

async function checkAllApps() {
  const res = await fetch(`${COOLIFY_HOST}/api/v1/applications`, {
    headers: { 'Authorization': `Bearer ${COOLIFY_TOKEN}`, 'Accept': 'application/json' }
  });
  const apps = await res.json();
  console.log('All apps source configuration:');
  apps.forEach(a => {
    console.log(`- [${a.name}] uuid: ${a.uuid}, repo: ${a.git_repository}, source_type: ${a.source_type}, source_id: ${a.source_id}, build_pack: ${a.build_pack}`);
  });
}

checkAllApps().catch(console.error);
