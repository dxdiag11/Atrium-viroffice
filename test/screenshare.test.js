const test=require('node:test');
const assert=require('node:assert/strict');
require('../world-travel'); // pulls in geom/office/recreation/maps globals (getMap, etc.)
require('../public/screenshare-core.js');

test('office rooms tag exactly the meeting table and creative studio seats',()=>{
  const m=getMap('office');
  assert.deepEqual([...m.roomSeats.keys()].sort(),['creative-studio','meeting-main']);
  assert.equal(m.roomSeats.get('meeting-main').length,12);
  assert.equal(m.roomSeats.get('creative-studio').length,4);
  for(const [seatId,roomId] of m.seatRoom) assert.ok(m.roomSeats.get(roomId).includes(seatId));
  for(const [roomId,seatIds] of m.roomSeats) for(const seatId of seatIds) assert.equal(m.seatRoom.get(seatId),roomId);
  assert.equal(getMap('recreation').roomSeats,undefined);
});

test('roomChannel keys are stable and distinct per map/room',()=>{
  assert.equal(roomChannel('office','meeting-main'),'room:office:meeting-main');
  assert.notEqual(roomChannel('office','meeting-main'),roomChannel('office','creative-studio'));
  assert.notEqual(roomChannel('office','meeting-main'),roomChannel('recreation','meeting-main'));
});

test('startPresenting locks the room to one id at a time',()=>{
  const presenters=new Map();
  const state=startPresenting(presenters,'room:office:meeting-main',{id:'a',name:'Alex',kind:'screen'});
  assert.equal(state.id,'a');
  assert.equal(startPresenting(presenters,'room:office:meeting-main',{id:'b',name:'Budi',kind:'window'}),null);
  assert.equal(presenterFor(presenters,'room:office:meeting-main').id,'a');
});

test('the same id may re-start (kind change) without being treated as a takeover',()=>{
  const presenters=new Map();
  startPresenting(presenters,'ch',{id:'a',name:'Alex',kind:'screen'});
  const again=startPresenting(presenters,'ch',{id:'a',name:'Alex',kind:'window'});
  assert.equal(again.kind,'window');
});

test('stopPresenting only releases the current presenter\'s own id',()=>{
  const presenters=new Map();
  startPresenting(presenters,'ch',{id:'a',name:'Alex',kind:'screen'});
  assert.equal(stopPresenting(presenters,'ch','b'),false);
  assert.ok(presenterFor(presenters,'ch'));
  assert.equal(stopPresenting(presenters,'ch','a'),true);
  assert.equal(presenterFor(presenters,'ch'),null);
});

test('rooms are independent locks',()=>{
  const presenters=new Map();
  startPresenting(presenters,'room:office:meeting-main',{id:'a',name:'Alex',kind:'screen'});
  const state=startPresenting(presenters,'room:office:creative-studio',{id:'b',name:'Budi',kind:'window'});
  assert.equal(state.id,'b');
});

test('room chat is remembered up to ROOM_CHAT_MAX, oldest dropped first',()=>{
  const roomChat=new Map();
  for(let i=0;i<ROOM_CHAT_MAX+5;i++) rememberRoomMessage(roomChat,'ch',makeRoomMessage({from:'a',name:'Alex',color:'#fff',text:'msg'+i}));
  const list=roomChat.get('ch');
  assert.equal(list.length,ROOM_CHAT_MAX);
  assert.equal(list[0].text,'msg5');
  assert.equal(list[list.length-1].text,'msg'+(ROOM_CHAT_MAX+4));
});

test('room chat channels are independent ring buffers',()=>{
  const roomChat=new Map();
  rememberRoomMessage(roomChat,'a',makeRoomMessage({text:'hi'}));
  assert.equal(roomChat.get('b'),undefined);
});
