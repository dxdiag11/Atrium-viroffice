const {randomUUID}=require('node:crypto');
require('./public/geom.js');
require('./public/office.js');
require('./public/recreation.js');
require('./public/maps.js');

// One bounded record per connected player. Clock and delivery are injected for race tests.
class WorldTravel {
  constructor(players,send,broadcast,now=Date.now) {
    Object.assign(this,{players,send,broadcast,now});
    this.records=new Map();
  }
  record(id) {
    if(!this.records.has(id)) this.records.set(id,{pending:null,terminal:null,cooldown:0,armed:true,lastRequest:-Infinity});
    return this.records.get(id);
  }
  result(id,transitionId,status,reason) {
    const p=this.players[id];
    const value={transitionId,status,reason,player:p?{...p}:null};
    this.send(id,'travel-result',value);
    return value;
  }
  moved(id) {
    const p=this.players[id],r=this.record(id);
    if(!getMap(p.mapId).portals.some(portal=>inPortal(p,portal))) r.armed=true;
  }
  request(id,data) {
    const p=this.players[id];if(!p) return;
    const r=this.record(id),now=this.now();
    if(now-r.lastRequest<200) return;
    r.lastRequest=now;
    const portal=getMap(p.mapId).portals.find(q=>q.id===data?.portalId);
    if(!worldVersion(p,{...data,mapId:data?.mapId??p.mapId}) || !portal || !inPortal(p,portal) ||
      p.seat!==null || p.transitioning || !r.armed || now<r.cooldown) {
      return this.result(id,null,'rejected','Portal belum dapat digunakan.');
    }
    const transitionId=randomUUID();
    r.pending={transitionId,targetMapId:portal.targetMapId,targetSpawnId:portal.targetSpawnId,expiresAt:now+10000};
    r.terminal=null;p.transitioning=true;
    this.send(id,'travel-prepared',{...r.pending});
  }
  commit(id,data) {
    const p=this.players[id];if(!p || typeof data?.transitionId!=='string') return;
    const r=this.record(id),t=r.pending;
    if(r.terminal?.transitionId===data.transitionId) {
      return this.result(id,data.transitionId,r.terminal.status,r.terminal.reason);
    }
    if(!t || t.transitionId!==data.transitionId) return this.result(id,data.transitionId,'rejected','Perjalanan tidak aktif.');
    if(this.now()>=t.expiresAt) return this.cancel(id,data,'Waktu persiapan habis.');
    const target=getMap(t.targetMapId),spawn=arrivalPosition(target,t.targetSpawnId,this.players,id);
    if(!spawn) return this.cancel(id,data,'Pintu tujuan penuh. Coba lagi.');
    Object.assign(p,{mapId:target.id,mapRevision:p.mapRevision+1,x:spawn.x,y:spawn.y,direction:spawn.direction,seat:null,transitioning:true});
    r.pending=null;r.armed=false;r.cooldown=this.now()+750;r.unlockAt=this.now()+5000;
    r.terminal={transitionId:t.transitionId,status:'committed'};
    this.broadcast('player-map-changed',{...p});
    return this.result(id,t.transitionId,'committed');
  }
  cancel(id,data,reason='Perpindahan dibatalkan.') {
    const p=this.players[id];if(!p) return;
    const r=this.record(id),t=r.pending;
    if(!t || t.transitionId!==data?.transitionId) {
      if(r.terminal?.transitionId===data?.transitionId) return this.result(id,data.transitionId,r.terminal.status,r.terminal.reason);
      return;
    }
    p.transitioning=false;r.pending=null;r.armed=false;r.cooldown=this.now()+750;
    r.terminal={transitionId:t.transitionId,status:'cancelled',reason};
    return this.result(id,t.transitionId,'cancelled',reason);
  }
  finish(id,data) {
    const p=this.players[id],r=this.records.get(id);
    if(p && r?.terminal?.transitionId===data?.transitionId && !r.pending) {
      p.transitioning=false;r.unlockAt=0;
    }
  }
  tick() {
    const now=this.now();
    for(const [id,r] of this.records) {
      if(r.pending && now>=r.pending.expiresAt) this.cancel(id,r.pending,'Waktu persiapan habis.');
      if(r.unlockAt && now>=r.unlockAt) {
        this.players[id].transitioning=false;r.unlockAt=0;
        this.result(id,r.terminal.transitionId,r.terminal.status);
      }
    }
  }
  sync(id) {
    if(!this.players[id]) return;
    const r=this.records.get(id);
    this.send(id,'world-sync',{players:this.players,travel:r?.pending?{...r.pending,status:'prepared'}:r?.terminal||null});
  }
  remove(id) {this.records.delete(id);}
}
module.exports={WorldTravel};
