import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('new-install example defines every required runtime variable and pins WAHA content', () => {
  const example=fs.readFileSync('.env.example','utf8');
  for(const key of ['DATABASE_URL','JWT_SECRET','APP_URL','ADMIN_PASSWORD','WAHA_API_KEY','WAHA_WEBHOOK_SECRET','WAHA_IMAGE','WAHA_WEBHOOK_URL','UPLOAD_QUOTA_MB']) {
    assert.match(example,new RegExp(`^${key}=`, 'm'),`${key} must be documented for a new install`);
  }
  const image=example.match(/^WAHA_IMAGE=(.+)$/m)![1].trim();
  assert.match(image,/^devlikeapro\/waha@sha256:[a-f0-9]{64}$/);
  assert.ok(fs.readFileSync('docker-compose.yml','utf8').includes('${WAHA_IMAGE:?WAHA_IMAGE digest is required}'));
});
