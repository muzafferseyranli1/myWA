import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
let text=fs.existsSync('.env')?fs.readFileSync('.env','utf8'):fs.readFileSync('.env.example','utf8');
const values=parseEnv(text);
const pinned=parseEnv(fs.readFileSync('.env.example','utf8')).WAHA_IMAGE;
for (const [key,value] of Object.entries({WAHA_API_KEY:randomBytes(32).toString('hex'),WAHA_WEBHOOK_SECRET:randomBytes(32).toString('hex'),WAHA_IMAGE:pinned})) {
  if(values[key]) continue; // Existing credentials are preserved, never rotated.
  const line=new RegExp(`^${key}=.*$`,'m');
  text=line.test(text)?text.replace(line,`${key}=${value}`):text+`\n${key}=${value}\n`;
}
fs.writeFileSync('.env',text,{mode:0o600});
console.log('Missing WAHA settings initialized in .env; existing values preserved. No services were changed.');
