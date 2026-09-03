const COOLIFY_HOST = 'http://188.132.198.144:8000';
const COOLIFY_TOKEN = '1|h9uFOZlfwk5w7EUrve5X8TfdJQ3IXzevaX1xtuRK2217d5ec';

async function setupGithubApp() {
  const projectUuid = 'jnvy8xbsxk5s16492ntmpo9c';

  const payload = {
    project_uuid: projectUuid,
    server_uuid: 'ln7hnkbbdml7w7si9k3zcaz4',
    environment_name: 'production',
    destination_uuid: 'd6ne63eoit83wqp7xj3oo2f6',
    name: 'mywa-web',
    description: 'MyWA WhatsApp Task Management & Kanban Platform',
    git_repository: 'https://github.com/muzafferseyranli1/myWA',
    git_branch: 'main',
    build_pack: 'dockerfile',
    ports_mappings: '3060:3060',
    ports_exposes: '3060'
  };

  console.log('Creating application connected to GitHub repo...');
  const res = await fetch(`${COOLIFY_HOST}/api/v1/applications/public`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${COOLIFY_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  console.log('App Create Status:', res.status);
  console.log('App Create Data:', JSON.stringify(data, null, 2));

  if (!data.uuid) {
    console.error('Failed to get app UUID');
    return;
  }

  const appUuid = data.uuid;

  // Set environment variables
  console.log('\nSetting environment variables...');
  const envs = [
    { key: 'DATABASE_URL', value: 'postgresql://mywa:MyWA_Secure_2026!@188.132.198.144:5433/mywa' },
    { key: 'PORT', value: '3060' },
    { key: 'NODE_ENV', value: 'production' },
    { key: 'JWT_SECRET', value: 'mywa_jwt_production_secret_2026_super_key' },
    { key: 'ADMIN_USERNAME', value: 'admin' },
    { key: 'ADMIN_PASSWORD', value: 'admin123' },
    { key: 'WA_SESSION_PATH', value: '/app/.baileys_auth' },
    { key: 'UPLOAD_DIR', value: '/app/public/uploads' },
    { key: 'MAX_FILE_SIZE', value: '50' }
  ];

  for (const env of envs) {
    const envRes = await fetch(`${COOLIFY_HOST}/api/v1/applications/${appUuid}/envs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COOLIFY_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ key: env.key, value: env.value })
    });
    console.log(`Set ${env.key} -> status ${envRes.status}`);
  }

  // Update ports_mappings
  await fetch(`${COOLIFY_HOST}/api/v1/applications/${appUuid}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${COOLIFY_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ ports_mappings: '3060:3060', ports_exposes: '3060' })
  });

  // Trigger Deployment
  console.log('\nTriggering Deployment...');
  const deployRes = await fetch(`${COOLIFY_HOST}/api/v1/deploy?uuid=${appUuid}&force=true`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${COOLIFY_TOKEN}`,
      'Accept': 'application/json'
    }
  });

  const deployData = await deployRes.json().catch(() => ({}));
  console.log('Deploy Status:', deployRes.status);
  console.log('Deploy Info:', JSON.stringify(deployData, null, 2));

  console.log(`\n🎉 Application UUID: ${appUuid}`);
  console.log(`🌐 Live URL: http://188.132.198.144:3060`);
}

setupGithubApp().catch(console.error);
