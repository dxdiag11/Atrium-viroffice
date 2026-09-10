// Read sprites at native dimensions; no assumptions about the one-pixel export variance.
const spriteCache = new Map();
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
Object.assign(globalThis,{loadImage,loadCharacter,drawCharacter});
