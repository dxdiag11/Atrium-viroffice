// Traced against the selected 1499 × 1049 night artwork. Feet are the anchors.
function buildRecreation() {
  const rect = (x,y,w,h) => [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
  const walkable = [
    [[635,0],[788,0],[793,115],[850,201],[898,291],[974,318],[1007,585],[952,630],[879,678],[850,809],[802,847],[570,847],[509,798],[445,669],[396,620],[278,605],[281,551],[407,540],[455,491],[465,365],[472,302],[534,227],[600,137]],
    // Barracks and its south doorway.
    [[89,130],[389,130],[413,174],[407,424],[368,479],[302,493],[300,565],[206,565],[206,485],[123,457],[85,414]],
    // Second barracks doorway, east wall between the two torch pillars.
    rect(405,305,80,75),
    // Bathroom hall, both doorways, and interiors.
    rect(151,535,285,65), rect(205,578,68,257),
    rect(80,721,112,119), rect(180,791,57,44),
    rect(284,723,107,117), rect(248,791,55,44),
    // Party floor with a wide central doorway and access behind the DJ.
    [[1036,108],[1361,108],[1394,170],[1410,252],[1450,275],[1441,572],[1409,651],[1400,754],[1341,793],[1250,814],[1132,799],[1040,780],[1012,743],[1008,661],[980,619],[944,607],[931,570],[951,391],[932,328],[977,306],[1009,200]],
    rect(865,319,160,65), rect(865,576,170,68),
  ];
  const collisions = [
    // Beds remain solid; each anchor is at the right edge, facing into its aisle.
    ...[108,210,313].flatMap(x=>[[x,149,45,105],[x,324,45,103]]),
    [89,132,11,160],[393,173,16,66],[119,452,45,21],[316,454,48,24],
    [570,344,33,47],[763,344,30,46],
    // DJ desk, speakers, plants and counter.
    [1128,149,151,47],[1099,201,207,27],[1056,127,32,60],[1321,126,32,61],
    [1101,181,24,21],[1279,181,24,21],[1378,261,52,270],
    // Bathroom fixtures; the front of each toilet stays accessible.
    [94,730,23,36],[153,751,25,35],[296,750,25,36],[356,730,23,36],
    // Central lounge: backrests, table, shelves and plants.
    [605,643,177,55],[584,708,14,95],[784,708,15,95],
    [672,735,39,45],[565,673,28,35],[793,675,27,35],
    [798,792,27,31],
    // Booth backrests and tables. Seats are on the inward-facing cushions.
    [1036,651,18,94],[1053,635,20,15],[1053,751,20,14],
    [1102,654,45,86],[1266,654,44,86],
    [1370,651,18,94],[1344,635,27,15],[1344,752,29,14],
    [1008,606,25,36],[1174,754,36,37],[1397,639,28,39],
  ];
  collisions.walkable=walkable;
  collisions.polygons=[];
  const seats=[];
  const add=(id,x,y,dir,kind,sx,sy)=>seats.push({id,x,y,dir,kind,game:false,standPoints:[{x:sx,y:sy}]});
  for (const [n,cx,cy] of [[1,677,273],[2,541,525],[3,829,525]]) {
    // Octagonal table outline excludes all six actual chair cushions.
    collisions.polygons.push(Array.from({length:8},(_,i)=>{
      const a=(i+.5)*Math.PI/4; return [cx+49*Math.cos(a),cy+49*Math.sin(a)];
    }));
    const slots=[[0,-62,'down'],[53,-31,'left'],[53,31,'left'],[0,62,'up'],[-53,31,'right'],[-53,-31,'right']];
    slots.forEach(([dx,dy,dir],i)=>add(`table-${n}-${i+1}`,cx+dx,cy+dy,dir,'chair',cx+dx*1.45,cy+dy*1.45));
  }
  [291,334,376,418,461,503].forEach((y,i)=>add(`bar-${i+1}`,1361,y,'right','stool',1335,y));
  [108,210,313].forEach((x,i)=>{
    add(`bed-north-${i+1}`,x+61,223,'right','bed-edge',x+83,223);
    add(`bed-south-${i+1}`,x+61,394,'right','bed-edge',x+83,394);
  });
  add('toilet-west',106,781,'down','toilet',106,808);
  add('toilet-east',367,781,'down','toilet',367,808);
  for (const [id,x,dir,sx] of [['west',611,'right',638],['east',771,'left',744]]) {
    [735,776].forEach((y,i)=>add(`lounge-${id}-${i+1}`,x,y,dir,'sofa',sx,y));
  }
  for (const [id,x,dir,sx] of [['west',1075,'right',1091],['east',1347,'left',1327]]) {
    [665,701,737].forEach((y,i)=>add(`booth-${id}-${i+1}`,x,y,dir,'sofa',sx,y));
  }
  seats.find(s=>s.id==='table-2-6').standPoints=[{x:466,y:504}];
  seats.find(s=>s.id==='bed-north-3').standPoints=[{x:374,y:270}];
  return {id:'recreation',name:'Recreation',width:1499,height:1049,
    image:'/assets/maps/atrium-cave-recreation-night.png',walkable,collisions,seats,
    spawn:{x:708,y:136},arrivals:{entrance:{x:708,y:136,direction:'down'}},
    portals:[{id:'to-office',trigger:rect(649,12,125,43),targetMapId:'office',targetSpawnId:'entrance'}],
    landmarks:[{id:'dance-floor',x:1174,y:414},{id:'behind-dj',x:1200,y:133},
      {id:'bath-hall',x:238,y:685},{id:'barracks',x:270,y:284},{id:'lounge',x:690,y:813}],
  };
}
Object.assign(globalThis,{buildRecreation});
