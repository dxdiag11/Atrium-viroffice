// Read sprites at native dimensions; no assumptions about the one-pixel export variance.
const spriteCache = new Map();
const portraitCache = new Map();

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
      return entry;
    })
    .catch(err=>{spriteCache.delete(id);throw err;});
  spriteCache.set(id,entry);
  return entry.promise;
}
function drawCharacter(context, id, x, y, direction, seated, speaking, walking, now, size=72) {
  const entry=spriteCache.get(characterById(id).id);
  if (!entry || !entry.move) return false;
  const talk=!!entry.talk && (seated || (speaking && !walking));
  const img=talk?entry.talk:entry.move;
  const beat=Math.floor(now/230)%2;
  const column=talk?(seated?(speaking?beat:0):2+beat):walking&&!seated?[1,2,3,2][Math.floor(now/135)%4]:0;
  const f=spriteFrame(img.naturalWidth,img.naturalHeight,direction,column);
  context.drawImage(img,f.x,f.y,f.w,f.h,x-size/2,y-size+5,size,size);
  return true;
}
Object.assign(globalThis,{loadImage,loadCharacter,drawCharacter,loadPortrait});
