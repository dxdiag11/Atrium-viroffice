const {test,expect}=require('@playwright/test');

async function join(page,name='Explorer') {
  await page.goto('/');await page.locator('#name').fill(name);
  await expect(page.locator('#join')).toBeEnabled();await page.locator('#join').click();
  await expect(page.locator('#gate')).toBeHidden();
  await page.evaluate(()=>{
    window.travelFrames=[];
    const capture=()=>{
      if(transition.busy) window.travelFrames.push({at:performance.now(),state:transition.state,map:players[myId]?.mapId,
        progress:transition.progress,width:innerWidth,height:innerHeight});
      requestAnimationFrame(capture);
    };requestAnimationFrame(capture);
  });
}
// Walk the real collision graph in valid segments. Portals themselves use keyboard input.
async function walkTo(page,target) {
  await page.evaluate(async target=>{
    const me=players[myId],step=8,cols=Math.ceil(map.width/step);
    const start=[Math.round(me.x/step),Math.round(me.y/step)],key=(x,y)=>y*cols+x;
    const q=[start],parents=new Map([[key(...start),null]]);let goal;
    for(let h=0;h<q.length;h++) {
      const [x,y]=q[h],p={x:x*step,y:y*step};
      if(Math.hypot(p.x-target.x,p.y-target.y)<16 && canTraverse(p,target,RADIUS,map.collisions)){goal=[x,y];break;}
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx=x+dx,ny=y+dy,k=key(nx,ny);
        if(nx<0||ny<0||nx*step>=map.width||ny*step>=map.height||parents.has(k))continue;
        if(canTraverse(p,{x:nx*step,y:ny*step},RADIUS,map.collisions)){parents.set(k,[x,y]);q.push([nx,ny]);}
      }
    }
    if(!goal)throw Error('No route to '+JSON.stringify(target));
    const route=[target];for(let node=goal;node;node=parents.get(key(...node)))route.push({x:node[0]*step,y:node[1]*step});
    route.reverse();
    for(const point of route) {
      if(!canTraverse(me,point,RADIUS,map.collisions))throw Error('Invalid step');
      me.x=me.rx=point.x;me.y=me.ry=point.y;sentX=point.x;sentY=point.y;
      socket.emit('move',worldPayload(point));
    }
    await new Promise(resolve=>socket.emit('world-sync') && setTimeout(resolve,100));
  },target);
}
async function travel(page,target='recreation') {
  await walkTo(page,target==='recreation'?{x:748,y:970}:{x:708,y:92});
  const key=target==='recreation'?'s':'w';
  await page.keyboard.down(key);
  await page.waitForFunction(()=>transition.busy);
  await page.keyboard.up(key);
  await page.waitForFunction(target=>players[myId]?.mapId===target&&!worldLocked(),target);
}
async function coverage(page) {
  return page.evaluate(()=>{
    const c=document.createElement('canvas');c.width=innerWidth;c.height=innerHeight;const cctx=c.getContext('2d');
    const fit=panelFit(innerWidth,innerHeight);
    for(let i=0;i<2;i++)cctx.drawImage(transition.panels[i],i?fit.right:fit.left,fit.y,fit.width,fit.height);
    const pixels=cctx.getImageData(0,0,c.width,c.height).data;let uncovered=0;
    for(let i=3;i<pixels.length;i+=4)if(pixels[i]!==255)uncovered++;
    return uncovered;
  });
}
test('two clients travel, render and communicate across maps without rebuilding voice peers',async({page,context},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await join(page,'Ayu');const other=await context.newPage();await join(other,'Bima');
  await page.waitForFunction(()=>Object.keys(peers).length===1);
  await page.evaluate(()=>window.originalPeer=Object.values(peers)[0].pc);
  await travel(page);
  await expect(page.locator('#map-name')).toHaveText('Recreation');
  await expect(other.locator('#location-roster')).toContainText('Ayu · Recreation');
  expect(await page.evaluate(()=>Object.values(peers)[0].pc===window.originalPeer)).toBe(true);
  expect(await page.evaluate(()=>Object.values(players).filter(p=>sameMap(p,players[myId])).length)).toBe(1);
  await page.evaluate(()=>socket.emit('chat',{text:'Halo lintas map'}));
  await expect(other.locator('#chat-log')).toContainText('Halo lintas map');
  await page.keyboard.down('t');
  await other.waitForFunction(()=>radioHolder&&players[radioHolder].name==='Ayu');
  await page.keyboard.up('t');await other.waitForFunction(()=>radioHolder===null);
  await page.screenshot({path:info.outputPath('recreation.png')});
  await travel(page,'office');
  const frames=await page.evaluate(()=>window.travelFrames);
  const swaps=frames.filter((f,i)=>i&&f.map!==frames[i-1].map);
  expect(swaps.length).toBe(2);expect(swaps.every(f=>f.state==='covered'&&f.progress===1)).toBe(true);
  await info.attach('transition-frames',{body:JSON.stringify(frames),contentType:'application/json'});
  expect(errors).toEqual([]);
});

for(const [width,height] of [[390,844],[844,390],[1920,1080],[3440,1440]]) {
  test(`opaque panels and covered swap at ${width}x${height}`,async({page},info)=>{
    await page.setViewportSize({width,height});await join(page);
    await page.evaluate(()=>transition.prefetch());expect(await coverage(page)).toBe(0);
    await travel(page);
    const frames=await page.evaluate(()=>window.travelFrames);
    const swap=frames.find((f,i)=>i&&f.map!==frames[i-1].map);
    expect(swap.state).toBe('covered');expect(swap.progress).toBe(1);
    expect(frames.some(f=>f.state==='closing'&&f.progress>0&&f.progress<1)).toBe(true);
    expect(frames.some(f=>f.state==='opening'&&f.progress>0&&f.progress<1)).toBe(true);
    await page.screenshot({path:info.outputPath('arrival.png')});
    await info.attach('frames',{body:JSON.stringify(frames),contentType:'application/json'});
  });
}
test('resize mid-animation, held movement, chat focus and PTT keyup remain safe',async({page})=>{
  await join(page);await walkTo(page,{x:748,y:970});
  await page.keyboard.down('t');await page.keyboard.down('s');
  await page.waitForFunction(()=>transition.state==='closing');
  await page.setViewportSize({width:844,height:390});
  await page.keyboard.up('t');
  await page.keyboard.press('Enter');await expect(page.locator('#chat-input')).toBeFocused();
  await page.waitForFunction(()=>!worldLocked()&&players[myId].mapId==='recreation');
  expect(await page.evaluate(()=>radioHolder)).toBe(null);
  const pos=await page.evaluate(()=>({x:players[myId].x,y:players[myId].y}));
  await page.keyboard.up('s');expect(pos.y).toBe(136);
  expect(await coverage(page)).toBe(0);
});
test('reduced motion uses an opaque fade with the same covered commit',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await join(page);await travel(page);
  const frames=await page.evaluate(()=>window.travelFrames);
  expect(await page.evaluate(()=>transition.fallback)).toBe(true);
  expect(frames.filter((f,i)=>i&&f.map!==frames[i-1].map).every(f=>f.progress===1&&f.state==='covered')).toBe(true);
});
test('panel failure falls back; destination failure cancels and unlocks at source',async({page})=>{
  await page.route('**/assets/transitions/*.png',route=>route.abort());
  await join(page);await travel(page);expect(await page.evaluate(()=>transition.fallback)).toBe(true);
  await travel(page,'office');
  await page.route('**/assets/maps/atrium-cave-recreation-night.png',route=>route.abort());
  await page.evaluate(()=>mapImages.delete(getMap('recreation').image));
  await walkTo(page,{x:748,y:970});await page.keyboard.down('s');
  await page.waitForFunction(()=>transition.busy);await page.keyboard.up('s');
  await page.waitForFunction(()=>!worldLocked());
  expect(await page.evaluate(()=>players[myId].mapId)).toBe('office');
  await expect(page.locator('#travel-status')).toContainText('Background');
});
test('lost commit result recovers with authoritative sync and disconnect closes the cover',async({page})=>{
  await join(page);
  await page.evaluate(()=>socket.off('travel-result'));
  await travel(page);expect(await page.evaluate(()=>players[myId].mapRevision)).toBe(1);
  await walkTo(page,{x:708,y:92});await page.keyboard.down('w');
  await page.waitForFunction(()=>transition.state==='closing');await page.keyboard.up('w');
  await page.evaluate(()=>socket.disconnect());
  await expect(page.locator('#map-transition')).toBeHidden();await expect(page.locator('#gate')).toBeVisible();
  await page.evaluate(()=>socket.connect());await expect(page.locator('#join')).toBeEnabled();
  await page.locator('#join').click();await expect(page.locator('#gate')).toBeHidden();
  expect(await page.evaluate(()=>players[myId].mapId)).toBe('office');
});
