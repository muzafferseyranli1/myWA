import { tenantTest } from './helpers/tenant';
const test = tenantTest();
import assert from 'node:assert/strict';
import {tokenizeMessage} from '../src/lib/message-text';
import {mediaView,providerFileUrl,verifyMediaToken} from '../server/lib/media';
test('WhatsApp text is formatted without executing HTML or unsafe URLs',()=>{
 const parts=tokenizeMessage('*Başlık* _italik_ ~eski~ `kod` @905331234567 https://example.com/path. <script>alert(1)</script> javascript:alert(1)');
 assert.deepEqual(parts.filter(p=>['bold','italic','strike','code'].includes(p.kind)).map(p=>p.text),['Başlık','italik','eski','kod']);
 assert.deepEqual(parts.filter(p=>p.kind==='link').map(p=>p.text),['https://example.com/path']);
 assert.ok(parts.some(p=>p.kind==='text'&&p.text.includes('<script>')));
});
test('media links are scoped, temporary, stable within a period and never reveal the WAHA key',()=>{
 process.env.JWT_SECRET='media-unit-test';
 const m={id:'message-one',messageType:'IMAGE',mediaUrl:'http://private:3000/api/files/test.png'};
 const first=mediaView(m),second=mediaView(m);
 assert.equal(first.mediaUrl,second.mediaUrl);
 const token=new URL(first.mediaUrl,'http://localhost').searchParams.get('token')!;
 // The token names the tenant it was issued for and grants only this message.
 assert.equal(verifyMediaToken(token,'message-one'),'unit-tenant');
 assert.equal(verifyMediaToken(token,'message-two'),null);
 assert.equal(providerFileUrl(m.mediaUrl,'http://127.0.0.1:3000'),'http://127.0.0.1:3000/api/files/test.png');
 assert.throws(()=>providerFileUrl('http://evil/secret','http://localhost'));
 assert.throws(()=>providerFileUrl('http://evil/api/files/a%2f..%2fsecret','http://localhost'));
});
