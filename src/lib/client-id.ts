// Operation IDs work when the app is served over HTTP as well as HTTPS.
export function newClientId(): string {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}
