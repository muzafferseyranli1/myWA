const COOLIFY_HOST = 'http://188.132.198.144:8000';
const COOLIFY_TOKEN = '1|h9uFOZlfwk5w7EUrve5X8TfdJQ3IXzevaX1xtuRK2217d5ec';
const SERVER_UUID = 'ln7hnkbbdml7w7si9k3zcaz4';

async function testServerApi() {
  const res = await fetch(`${COOLIFY_HOST}/api/v1/servers/${SERVER_UUID}`, {
    headers: { 'Authorization': `Bearer ${COOLIFY_TOKEN}`, 'Accept': 'application/json' }
  });
  const data = await res.json();
  console.log('Server info:', JSON.stringify(data, null, 2));
}

testServerApi().catch(console.error);
