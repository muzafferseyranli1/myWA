import test from 'node:test';
import assert from 'node:assert/strict';
import { SocketRegistry } from '../mobile/src/lib/socket-registry';
test('mobile screens subscribe independently while the shared socket stays connected', () => {
  const registry = new SocketRegistry(); let list=0, chat=0, refreshed=0;
  const listRef={current:{onChatUpdated:()=>list++,onReconnect:()=>refreshed++}};
  const chatRef={current:{onNewMessage:()=>chat++,onReconnect:()=>refreshed++}};
  const removeList=registry.subscribe(listRef); registry.subscribe(chatRef);
  registry.dispatch('onChatUpdated'); registry.dispatch('onNewMessage'); assert.equal(list,1); assert.equal(chat,1);
  removeList(); registry.dispatch('onChatUpdated'); registry.dispatch('onNewMessage'); assert.equal(list,1); assert.equal(chat,2);
  chatRef.current.onNewMessage=()=>chat+=10; registry.dispatch('onNewMessage'); assert.equal(chat,12);
  const calls: string[]=[]; const socket={emit:(event:string,id:string)=>calls.push(event+':'+id)};
  registry.join('active@g.us',socket); registry.join('active@g.us',socket); registry.leave('active@g.us',socket);
  calls.length=0; registry.reconnect(socket); assert.deepEqual(calls,['join_chat:active@g.us']); assert.equal(refreshed,1);
  registry.leave('active@g.us',socket); assert.equal(calls[1],'leave_chat:active@g.us');
  registry.join('other@g.us',socket); registry.clearRooms(); calls.length=0; registry.reconnect(socket); assert.equal(calls.length,0);
});
