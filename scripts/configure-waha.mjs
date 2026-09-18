// Run during the maintenance window, after saving the old session configuration.
const base = (process.env.WAHA_API_URL || 'http://mywa-waha:3000').replace(/\/+$/, '');
const name = process.env.WAHA_SESSION_NAME || 'default';
if (!process.env.WAHA_API_KEY) throw new Error('WAHA_API_KEY is required');
const headers = { 'Content-Type':'application/json', 'X-Api-Key':process.env.WAHA_API_KEY };
async function request(suffix, options={}) {
  const res=await fetch(base+suffix,{...options,headers,signal:AbortSignal.timeout(15000)});
  if(!res.ok) throw new Error(`WAHA HTTP ${res.status}`);
  return res.json();
}
try {
  const session=await request(`/api/sessions/${encodeURIComponent(name)}`);
  if (session.config?.webhooks?.length) {
    await request(`/api/sessions/${encodeURIComponent(name)}`,{method:'PUT',body:JSON.stringify({name,config:{...session.config,webhooks:[]}})});
    const updated=await request(`/api/sessions/${encodeURIComponent(name)}`);
    if(updated.config?.webhooks?.length) throw new Error('Session webhooks were not removed');
  }
  console.log('Session webhook configuration verified; global signed webhook is the sole configuration');
} catch(error) { console.error(error.message); process.exitCode=1; }
