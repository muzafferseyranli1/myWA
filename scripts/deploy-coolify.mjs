#!/usr/bin/env node

/**
 * MyWA Coolify Deployment Script
 * Triggers deployment for MyWA application on Coolify
 */

const COOLIFY_HOST = process.env.COOLIFY_HOST || 'http://188.132.198.144:8000';
const COOLIFY_TOKEN = process.env.COOLIFY_TOKEN || '1|h9uFOZlfwk5w7EUrve5X8TfdJQ3IXzevaX1xtuRK2217d5ec';
const APP_UUID = process.env.COOLIFY_APP_UUID || 'tiadrkjgtdj1tet3ojuxegq4';

async function deploy() {
  console.log('🚀 MyWA Deployment Started...\n');
  console.log(`📡 Coolify Host: ${COOLIFY_HOST}`);
  console.log(`📦 Application UUID: ${APP_UUID}\n`);

  try {
    console.log('🔄 Triggering Coolify deployment...');
    const response = await fetch(
      `${COOLIFY_HOST}/api/v1/deploy?uuid=${APP_UUID}&force=true`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${COOLIFY_TOKEN}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
      }
    );

    const data = await response.json().catch(() => ({}));
    console.log(`Deploy Status: ${response.status}`);
    console.log('Deploy Response:', JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log('\n✅ Deployment successfully triggered!');
      console.log('🌐 Application URL: http://188.132.198.144:3060');
      console.log('📊 Coolify Dashboard: http://188.132.198.144:8000');
    } else {
      console.error('❌ Deployment trigger failed:', data);
    }
  } catch (err) {
    console.error('❌ Deployment failed:', err.message);
    process.exit(1);
  }
}

deploy();
