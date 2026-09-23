import { maybeTenant } from './tenant';

/**
 * The tenant's own WhatsApp identity. Outgoing messages carry the owner's push
 * name, which must never become the name of somebody else's chat or contact.
 */
function self() {
  return maybeTenant()?.self ?? { phone: null, lid: null, name: null };
}
export function isSelfId(id?: string | null) {
  if (!id) return false;
  const { phone, lid } = self();
  return (!!phone && id.includes(phone)) || (!!lid && id === lid);
}
export function isSelfName(name?: string | null) {
  const own = self().name;
  return !!own && name === own;
}
