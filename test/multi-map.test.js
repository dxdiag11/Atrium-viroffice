const test=require('node:test');
const assert=require('node:assert/strict');
const {WorldTravel}=require('../world-travel');
const player=(id,mapId='office',x=748,y=1010)=>({id,name:id,mapId,mapRevision:0,x,y,seat:null,direction:'down',transitioning:false,dnd:false});
function harness() {
  let now=1000;const players={a:player('a')},events=[];
  const world=new WorldTravel(players,(id,event,data)=>events.push({id,event,data}),(event,data)=>events.push({event,data}),()=>now);
  const prepare=(id='a')=>{
    const p=players[id];world.request(id,{portalId:p.mapId==='office'?'to-recreation':'to-office',mapId:p.mapId,mapRevision:p.mapRevision});
    return world.records.get(id)?.pending;
  };
  return {players,events,world,prepare,advance:ms=>{now+=ms;world.tick();}};
}
test('allowlist, final recreation asset and explicit furniture inventory',()=>{
  assert.equal(getMap('../../etc/passwd'),null);assert.equal(getMap('__proto__'),null);
  assert.equal(getMap('office').seats.length,51);
  assert.equal(getMap('office').seats.filter(s=>s.game).length,18);
  const m=getMap('recreation');
  assert.equal(m.image,'/assets/maps/atrium-cave-recreation-night.png');
  assert.deepEqual([m.width,m.height],[1499,1049]);
  assert.deepEqual(Object.fromEntries(['chair','stool','toilet','bed-edge','sofa'].map(k=>[k,m.seats.filter(s=>s.kind===k).length])),
    {chair:18,stool:6,toilet:2,'bed-edge':6,sofa:10});
  assert.deepEqual(m.seats.filter(s=>s.kind==='sofa').map(s=>s.id),[
    'lounge-west-1','lounge-west-2','lounge-east-1','lounge-east-2',
    'booth-west-1','booth-west-2','booth-west-3','booth-east-1','booth-east-2','booth-east-3']);
  assert.equal(new Set(m.seats.map(s=>s.id)).size,42);assert.ok(m.seats.every(s=>!s.game));
});
test('recreation seats, all stand paths, areas and both portal triggers are reachable with actual radius',()=>{
  for(const id of ['office','recreation']) {
    const m=getMap(id),step=4,cols=Math.ceil(m.width/step),seen=new Set();
    const queue=[[Math.round(m.spawn.x/step),Math.round(m.spawn.y/step)]];
    seen.add(queue[0][1]*cols+queue[0][0]);
    for(let h=0;h<queue.length;h++) {
      const [x,y]=queue[h];
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx=x+dx,ny=y+dy,key=ny*cols+nx;
        if(nx<0||ny<0||nx*step>=m.width||ny*step>=m.height||seen.has(key)) continue;
        if(canTraverse({x:x*step,y:y*step},{x:nx*step,y:ny*step},RADIUS,m.collisions)) {seen.add(key);queue.push([nx,ny]);}
      }
    }
    const reachable=p=>queue.some(([x,y])=>Math.hypot(x*step-p.x,y*step-p.y)<8 && canTraverse({x:x*step,y:y*step},p,RADIUS,m.collisions));
    for(const s of [...m.seats,...m.landmarks||[],...Object.values(m.arrivals)]) {
      assert.ok(canMove(s.x,s.y,RADIUS,m.collisions),'blocked '+id+' '+s.id);
      assert.ok(reachable(s),'unreachable '+id+' '+s.id);
      if(s.standPoints) {
        assert.ok(safeStand(m,s,{},null),'no stand '+s.id);
        if(id==='recreation') for(const p of s.standPoints) assert.ok(reachable(p)&&canTraverse(s,p,RADIUS,m.collisions),'stand '+s.id);
      }
    }
    for(const portal of m.portals) assert.ok(queue.some(([x,y])=>inPortal({x:x*step,y:y*step},portal)),'portal '+id);
  }
});
test('recreation rock, water, beds, tables, DJ and bathroom fixtures are solid',()=>{
  const m=getMap('recreation');
  for(const [x,y] of [[20,20],[445,110],[1200,901],[500,920],[320,650],[135,203],[235,378],
    [677,273],[541,525],[829,525],[1190,169],[1400,405],[106,744],[366,744],[692,758],[1120,697]]) {
    assert.equal(canMove(x,y,RADIUS,m.collisions),false,`${x},${y}`);
  }
});
test('travel is atomic, duplicate commit is idempotent and stale revisions cannot interact',()=>{
  const h=harness(),t=h.prepare();assert.ok(t);assert.equal(h.players.a.transitioning,true);
  h.world.commit('a',t);const p={...h.players.a};
  assert.equal(p.mapId,'recreation');assert.equal(p.mapRevision,1);assert.equal(p.direction,'down');
  assert.equal(worldVersion(p,{mapId:'office',mapRevision:0}),false);
  assert.equal(worldVersion(p,{mapId:'recreation',mapRevision:0}),false);
  h.world.commit('a',t);assert.deepEqual(h.players.a,p);
  assert.equal(h.events.filter(e=>e.event==='player-map-changed').length,1);
  assert.equal(h.events.at(-1).data.status,'committed');
  h.world.cancel('a',t);assert.equal(h.events.at(-1).data.status,'committed');
  h.world.finish('a',t);assert.equal(h.players.a.transitioning,false);
});
test('invalid requests and foreign transition IDs do not teleport or freeze',()=>{
  const h=harness();h.players.a.y=910;assert.equal(h.prepare(),null);assert.equal(h.players.a.transitioning,false);
  h.advance(250);h.players.a.y=1010;
  h.world.request('a',{portalId:'to-recreation',mapRevision:-1});assert.equal(h.players.a.transitioning,false);
  h.advance(250);const t=h.prepare();
  h.world.commit('a',{transitionId:'foreign'});assert.equal(h.players.a.mapId,'office');
  h.world.commit('a',t);assert.equal(h.players.a.mapId,'recreation');
});
test('prepare expiry cancels at source; commit timeout unlocks at destination; records clean up',()=>{
  const h=harness(),t=h.prepare();h.advance(10000);
  assert.equal(h.players.a.mapId,'office');assert.equal(h.players.a.transitioning,false);
  h.world.commit('a',t);assert.equal(h.events.at(-1).data.status,'cancelled');
  h.players.a.y=970;h.world.moved('a');h.advance(800);h.players.a.y=1010;
  const next=h.prepare();h.world.commit('a',next);h.advance(5000);
  assert.equal(h.players.a.mapId,'recreation');assert.equal(h.players.a.transitioning,false);
  h.world.sync('a');assert.equal(h.events.at(-1).data.travel.status,'committed');
  h.world.remove('a');assert.equal(h.world.records.size,0);
});
test('simultaneous arrivals are separated and portal requires leaving trigger and cooldown',()=>{
  const h=harness();h.players.b=player('b');const a=h.prepare('a'),b=h.prepare('b');
  h.world.commit('a',a);h.world.commit('b',b);
  assert.ok(Math.hypot(h.players.a.x-h.players.b.x,h.players.a.y-h.players.b.y)>=RADIUS*2+2);
  assert.ok(!getMap('recreation').portals.some(q=>inPortal(h.players.a,q)));
  h.world.finish('a',a);h.players.a.y=35;h.advance(800);assert.equal(h.prepare('a'),null);
  h.players.a.y=100;h.world.moved('a');h.advance(250);h.players.a.y=35;
  const back=h.prepare('a');assert.ok(back);h.world.commit('a',back);
  assert.equal(h.players.a.mapId,'office');assert.equal(h.players.a.direction,'up');assert.equal(h.players.a.mapRevision,2);
});
test('full arrival cancels without moving source, and occupied stand points keep the seat',()=>{
  const h=harness(),m=getMap('recreation');let n=0;
  for(let dx=-4;dx<=4;dx++)for(let dy=-4;dy<=4;dy++) {const id='crowd'+n++;h.players[id]=player(id,'recreation',708+dx*20,136+dy*20);}
  const t=h.prepare();h.world.commit('a',t);
  assert.equal(h.players.a.mapId,'office');assert.equal(h.players.a.transitioning,false);
  assert.equal(h.events.at(-1).data.status,'cancelled');
  const seat=m.seats[0],point=seat.standPoints[0];
  assert.equal(safeStand(m,seat,{other:player('other','recreation',point.x,point.y)},'a'),null);
  assert.ok(safeStand(m,seat,{other:player('other','office',point.x,point.y)},'a'));
});
test('audio matrix gates cross-map proximity, global radio, deduplication and DND',()=>{
  for(const same of [true,false])for(const dnd of [true,false])for(const distance of [0,80,200,350,9999])for(const transmitting of [true,false]) {
    const proximity=voiceGain(distance,dnd,same),radio=radioGain(distance,transmitting,dnd,same);
    assert.equal(proximity,dnd||!same?0:falloff(distance));
    assert.equal(radio,dnd||!transmitting||same&&falloff(distance)>0?0:RADIO_LEVEL);
    assert.ok(!(proximity>0&&radio>0));
  }
});
