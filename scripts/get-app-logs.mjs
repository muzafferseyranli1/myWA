const COOLIFY_HOST = 'http://188.132.198.144:8000';
const COOLIFY_TOKEN = '1|h9uFOZlfwk5w7EUrve5X8TfdJQ3IXzevaX1xtuRK2217d5ec';
const APP_UUID = 'tiadrkjgtdj1tet3ojuxegq4';

async function getAppLogs() {
  const endpoints = [
    `/applications/${APP_UUID}/logs`,
    `/applications/${APP_UUID}`,
  ];

  for (const ep of endpoints) {
    const res = await fetch(`${COOLIFY_HOST}/api/v1${ep}`, {
      headers: { 'Authorization': `Bearer ${COOLIFY_TOKEN}`, 'Accept': 'application/json' }
    });
    const data = await res.json().catch(() => ({}));
    console.log(`Endpoint ${ep} (${res.status}):`);
    console.log(JSON.stringify(data, null, 2));
  }
}

getAppLogs().catch(console.error);
