const MAPS = (()=>{
  const office=buildOffice();
  Object.assign(office,{id:'office',name:'Office',arrivals:{entrance:{x:748,y:941,direction:'up'}},
    portals:[{id:'to-recreation',trigger:[[677,994],[814,994],[814,1049],[677,1049]],targetMapId:'recreation',targetSpawnId:'entrance'}]});
  const offsets={up:[0,24],down:[0,-24],left:[24,0],right:[-24,0]};
  const roomSeats=new Map(),seatRoom=new Map();
  office.seats.forEach((s,i)=>{
    s.id=`office-${i}`;s.kind='chair';
    const [dx,dy]=offsets[s.dir];
    s.standPoints=[{x:s.x+dx,y:s.y+dy},{x:s.x,y:s.y}];
    if (s.room) {
      seatRoom.set(i,s.room);
      if (!roomSeats.has(s.room)) roomSeats.set(s.room,[]);
      roomSeats.get(s.room).push(i);
    }
  });
  Object.assign(office,{roomSeats,seatRoom});
  return new Map([['office',office],['recreation',buildRecreation()]]);
})();
function getMap(id) { return MAPS.get(id) || null; }
function sameMap(a,b) { return !!a && !!b && a.mapId===b.mapId; }
function inPortal(p,portal) { return pointInPolygon(p.x,p.y,portal.trigger); }
function worldVersion(p,data) { return !!data && data.mapId===p.mapId && data.mapRevision===p.mapRevision; }
function freePosition(map,point,players,exceptId) {
  return canMove(point.x,point.y,RADIUS,map.collisions) &&
    !Object.values(players).some(p=>p.id!==exceptId && p.mapId===map.id && Math.hypot(p.x-point.x,p.y-point.y)<RADIUS*2+2);
}
function arrivalPosition(map,id,players,exceptId) {
  const origin=map.arrivals[id];
  if (!origin) return null;
  for(let ring=0;ring<=4;ring++) for(let dx=-ring;dx<=ring;dx++) for(let dy=-ring;dy<=ring;dy++) {
    if (ring && Math.abs(dx)!==ring && Math.abs(dy)!==ring) continue;
    const p={x:origin.x+dx*20,y:origin.y+dy*20,direction:origin.direction};
    if (freePosition(map,p,players,exceptId) && !map.portals.some(portal=>
      [[0,0],[-RADIUS,-RADIUS],[RADIUS,RADIUS],[-RADIUS,RADIUS],[RADIUS,-RADIUS]].some(([x,y])=>inPortal({x:p.x+x,y:p.y+y},portal)))) return p;
  }
  return null;
}
function safeStand(map,seat,players,id) {
  return seat.standPoints.find(p=>freePosition(map,p,players,id) && canTraverse(seat,p,RADIUS,map.collisions)) || null;
}
Object.assign(globalThis,{getMap,sameMap,inPortal,worldVersion,freePosition,arrivalPosition,safeStand});
