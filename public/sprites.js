// Read sprites at native dimensions; no assumptions about the one-pixel export variance.
const spriteCache = new Map();
const portraitCache = new Map();

function prepareFrames(img, isTalk=false) {
  const frames=[];
  for(let row=0;row<3;row++) for(let col=0;col<4;col++) {
    const source=document.createElement('canvas');
    source.width=Math.ceil(img.naturalWidth/4);source.height=Math.ceil(img.naturalHeight/3);
    const sc=source.getContext('2d',{willReadFrequently:true});
    const f=spriteFrame(img.naturalWidth,img.naturalHeight,['down','left','right'][row],col);
    sc.drawImage(img,f.x,f.y,f.w,f.h,0,0,source.width,source.height);
    const w=source.width,h=source.height,pixels=sc.getImageData(0,0,w,h).data;
    const labels=new Uint32Array(w*h),queue=new Int32Array(w*h);
    let component=0,best=null;
    for(let start=0;start<w*h;start++) {
      if(labels[start]||pixels[start*4+3]<96)continue;
      component++;let head=0,tail=1,minX=w,maxX=0,minY=h,maxY=0;
      queue[0]=start;labels[start]=component;
      while(head<tail){
        const n=queue[head++],x=n%w,y=Math.floor(n/w);
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
        for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
          const nx=x+dx,ny=y+dy,k=ny*w+nx;
          if(nx<0||nx>=w||ny<0||ny>=h||labels[k]||pixels[k*4+3]<96)continue;
          labels[k]=component;queue[tail++]=k;
        }
      }
      if(!best||tail>best.area)best={area:tail,component,minX,maxX,minY,maxY};
    }
    if(!best)throw new Error('Empty animation frame');
    const top=best.minY,bottom=best.maxY;
    let left=w,right=0;
    if(top>=bottom) throw new Error('Empty animation frame');
    // Anchor to the lower legs/feet, so a raised hand never shifts the torso sideways.
    for(let y=Math.floor(bottom-(bottom-top)*.18);y<=bottom;y++) {
      for(let x=0;x<w;x++) if(labels[y*w+x]===best.component){left=Math.min(left,x);right=Math.max(right,x);}
    }
    const footX=(left+right)/2;
    const scale=(isTalk&&col<2?126:144)/(bottom-top+1);
    const frame=document.createElement('canvas');frame.width=192;frame.height=164;
    const fc=frame.getContext('2d');fc.imageSmoothingEnabled=true;fc.imageSmoothingQuality='high';
    const sx=Math.max(0,best.minX-2),sy=Math.max(0,top-2);
    const sw=Math.min(w,best.maxX+3)-sx,sh=Math.min(h,bottom+3)-sy;
    fc.drawImage(source,sx,sy,sw,sh,96+(sx-footX)*scale,156+(sy-bottom-1)*scale,sw*scale,sh*scale);
    frames.push(frame);
  }
  return frames;
}

// Picker portraits use the visible idle silhouette, not the export's uneven padding.
// This only prepares UI thumbnails; the game's animation sheets stay untouched.
function loadPortrait(id) {
  id=characterById(id).id;
  if (portraitCache.has(id)) return portraitCache.get(id);
  const promise=loadImage('/assets/characters/'+id+'/move.png').then(img=>{
    const source=document.createElement('canvas');
    source.width=Math.floor(img.naturalWidth/4);
    source.height=Math.floor(img.naturalHeight/3);
    const sc=source.getContext('2d',{willReadFrequently:true});
    sc.drawImage(img,0,0);
    const {width:w,height:h}=source;
    const pixels=sc.getImageData(0,0,w,h).data;
    const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);
    let best=null;
    // Largest connected silhouette excludes detached export noise around the sprite.
    for(let start=0;start<w*h;start++) {
      if(seen[start] || pixels[start*4+3]<96) continue;
      let head=0,tail=1,minX=w,minY=h,maxX=0,maxY=0;
      queue[0]=start;seen[start]=1;
      while(head<tail) {
        const p=queue[head++],x=p%w,y=Math.floor(p/w);
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
        for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nx=x+dx,ny=y+dy,n=ny*w+nx;
          if(nx<0||nx>=w||ny<0||ny>=h||seen[n]||pixels[n*4+3]<96) continue;
          seen[n]=1;queue[tail++]=n;
        }
      }
      if(!best || tail>best.area) best={area:tail,minX,minY,maxX,maxY};
    }
    if(!best) throw new Error('Empty character portrait: '+id);
    const x=Math.max(0,best.minX-2),y=Math.max(0,best.minY-2);
    const sw=Math.min(w,best.maxX+3)-x,sh=Math.min(h,best.maxY+3)-y;
    const portrait=document.createElement('canvas');portrait.width=240;portrait.height=280;
    const pc=portrait.getContext('2d');
    const scale=Math.min(200/sw,244/sh),dw=sw*scale,dh=sh*scale;
    pc.imageSmoothingQuality='high';
    pc.drawImage(source,x,y,sw,sh,(240-dw)/2,264-dh,dw,dh);
    return portrait.toDataURL('image/png');
  }).catch(err=>{portraitCache.delete(id);throw err;});
  portraitCache.set(id,promise);
  return promise;
}
function loadImage(src) {
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('Cannot load '+src));
    img.src=src;
  });
}
function loadCharacter(id) {
  id=characterById(id).id;
  if (spriteCache.has(id)) return spriteCache.get(id).promise;
  const entry={move:null,talk:null,promise:null};
  entry.promise=Promise.all(['move','sit-talk'].map(file=>loadImage('/assets/characters/'+id+'/'+file+'.png'+(id==='male-001' && file==='sit-talk'?'?v=alpha-1':''))))
    .then(([move,talk])=>{
      entry.move=move;
      // Reject opaque backgrounds if a future sprite export loses its alpha.
      const probe=document.createElement('canvas');probe.width=probe.height=1;
      const pc=probe.getContext('2d',{willReadFrequently:true});
      pc.drawImage(talk,0,0,1,1,0,0,1,1);
      entry.talk=pc.getImageData(0,0,1,1).data[3]<32?talk:null;
      entry.moveFrames=prepareFrames(move);
      entry.talkFrames=entry.talk?prepareFrames(talk,true):null;
      return entry;
    })
    .catch(err=>{spriteCache.delete(id);throw err;});
  spriteCache.set(id,entry);
  return entry.promise;
}
function drawCharacter(context, id, x, y, direction, seated, speaking, walking, now, size=64) {
  const entry=spriteCache.get(characterById(id).id);
  if (!entry || !entry.move) return false;
  const talk=!!entry.talk && (seated || (speaking && !walking));
  const beat=Math.floor(now/230)%2;
  const column=talk?(seated?(speaking?beat:0):2+beat):walking&&!seated?[1,2,3,2][Math.floor(now/135)%4]:0;
  const row=direction==='left'?1:direction==='right'?2:0;
  const frame=(talk?entry.talkFrames:entry.moveFrames)[row*4+column];
  const scale=size/144;
  context.imageSmoothingEnabled=true;
  context.imageSmoothingQuality='high';
  context.drawImage(frame,x-96*scale,y-156*scale,192*scale,164*scale);
  return true;
}
Object.assign(globalThis,{loadImage,loadCharacter,drawCharacter,loadPortrait});
