import { createHash } from 'node:crypto';
// Resolves a selected tag to immutable content, independently verifying the registry digest.
const tag=process.argv[2] || 'latest';
const tokenResponse=await fetch('https://auth.docker.io/token?service=registry.docker.io&scope=repository:devlikeapro/waha:pull',{signal:AbortSignal.timeout(15000)});
if(!tokenResponse.ok) throw new Error(`Registry authentication HTTP ${tokenResponse.status}`);
const {token}=await tokenResponse.json();
const response=await fetch(`https://registry-1.docker.io/v2/devlikeapro/waha/manifests/${encodeURIComponent(tag)}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json'},signal:AbortSignal.timeout(15000)});
if(!response.ok) throw new Error(`Registry manifest HTTP ${response.status}`);
const bytes=Buffer.from(await response.arrayBuffer());
const digest='sha256:'+createHash('sha256').update(bytes).digest('hex');
if(digest!==response.headers.get('docker-content-digest')) throw new Error('Registry content digest mismatch');
console.log(`devlikeapro/waha@${digest}`);
