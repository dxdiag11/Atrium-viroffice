const mapImages=new Map();
function decodedImage(src) {
  if(!mapImages.has(src)) mapImages.set(src,loadImage(src).then(async img=>{
    if(img.decode) await img.decode();return img;
  }).catch(err=>{mapImages.delete(src);throw err;}));
  return mapImages.get(src);
}
function deadline(promise,ms,message) {
  let timer;
  return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),ms);})]).finally(()=>clearTimeout(timer));
}
const travelDelay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function panelFit(vw,vh) {
  const scale=Math.max(.70*vw/1800,1.10*vh/2400),width=Math.ceil(1800*scale),height=Math.ceil(2400*scale);
  return {width,height,left:-Math.round(.02*vw),right:vw-width+Math.round(.02*vw),y:Math.floor((vh-height)/2)};
}

class MapTransition {
  constructor({socket,apply,sync,resetMovement,status}) {
    Object.assign(this,{socket,apply,sync,resetMovement,status});
    this.state='idle';this.generation=0;this.progress=0;
    this.el=document.getElementById('map-transition');
    this.panels=[...this.el.querySelectorAll('img')];
    window.addEventListener('resize',()=>this.layout());
  }
  get busy() {return this.state!=='idle';}
  setState(state) {this.state=state;this.el.dataset.state=state;}
  prefetch() {
    return Promise.all([
      decodedImage('/assets/transitions/root-fern-left.png'),
      decodedImage('/assets/transitions/root-fern-right.png'),
    ]);
  }
  layout() {
    const fit=panelFit(innerWidth,innerHeight),p=this.progress;
    this.panels.forEach((img,i)=>{
      const open=i?innerWidth+4:-fit.width-4,closed=i?fit.right:fit.left;
      Object.assign(img.style,{width:fit.width+'px',height:fit.height+'px',transform:`translate(${open+(closed-open)*p}px,${fit.y}px)`});
    });
    this.el.style.backgroundColor=this.fallback?`rgba(20,22,28,${p})`:'transparent';
  }
  async animate(to,ms,token) {
    const from=this.progress,start=performance.now();
    // Timer drives progress even when rAF/transitionend is suspended in hidden tabs.
    while(token===this.generation) {
      const t=Math.min(1,(performance.now()-start)/ms);
      const ease=to===1?t*t*(3-2*t):1-(1-t)**3;
      this.progress=from+(to-from)*ease;this.layout();
      if(t===1) break;
      await travelDelay(16);
    }
  }
  receive(result) {
    if(result.transitionId!==this.id) return;
    this.result=result;
    this.resolveResult?.(result);
  }
  reset() {
    this.generation++;this.id=null;this.result=null;this.resolveResult=null;
    this.progress=0;this.el.hidden=true;this.setState('idle');this.resetMovement();
  }
  run(prepared) {
    if(this.busy) return this.promise;
    this.id=prepared.transitionId;this.result=null;
    this.promise=this.execute(prepared,++this.generation);
    return this.promise;
  }
  async execute(prepared,token) {
    this.setState('preparing');this.resetMovement();
    const resultPromise=new Promise(resolve=>{this.resolveResult=resolve;});
    const destination=deadline(decodedImage(getMap(prepared.targetMapId).image),6500,'Background tujuan gagal dimuat.');
    // Attach rejection immediately, including while the panels are loading.
    const ready=destination.then(image=>({image}),error=>({error}));
    this.fallback=matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!this.fallback) {
      try {await deadline(this.prefetch(),1500,'Panel tidak tersedia.');}
      catch {this.fallback=true;}
    }
    if(token!==this.generation) return;
    this.panels.forEach(img=>{img.hidden=this.fallback;});
    this.el.hidden=false;this.setState('closing');
    await this.animate(1,this.fallback?100:450,token);
    if(token!==this.generation) return;
    this.setState('covered');const coveredAt=performance.now();
    this.status('Memuat '+getMap(prepared.targetMapId).name+'…');
    try {
      const asset=await ready;
      if(token!==this.generation) return;
      if(asset.error) this.socket.emit('travel-cancel',{transitionId:this.id});
      else if(!this.result) this.socket.emit('travel-commit',{transitionId:this.id});
      let result=this.result;
      if(!result) {
        try {result=await deadline(resultPromise,3500,'Menunggu konfirmasi server…');}
        catch {
          this.setState('recovery');
          const sync=await this.sync();
          if(sync.travel?.status==='prepared') {
            this.socket.emit('travel-cancel',{transitionId:this.id});
            await travelDelay(250);
            const settled=await this.sync();
            result={...settled.travel,player:settled.players[this.socket.id]};
          } else result={...sync.travel,player:sync.players[this.socket.id]};
        }
      }
      if(token!==this.generation) return;
      if(!result?.player || result.player.transitioning && result.status==='prepared') throw new Error('State belum dapat dipastikan.');
      await this.apply(result.player);
      if(token!==this.generation) return;
      await travelDelay(Math.max(0,120-(performance.now()-coveredAt)));
      // A paint opportunity while covered; the scene and camera already use the destination.
      await travelDelay(32);
      this.setState('opening');
      await this.animate(0,this.fallback?120:500,token);
      if(token!==this.generation) return;
      this.socket.emit('travel-finished',{transitionId:this.id});
      this.status(asset.error?.message || result.reason || '');
    } catch(err) {
      if(token!==this.generation) return;
      // Rejoin is the existing authoritative recovery when even world-sync fails.
      this.status('Koneksi perlu dipulihkan. Masuk kembali ke office.');
      this.socket.disconnect();this.socket.connect();
    } finally {
      if(token===this.generation) this.reset();
    }
  }
}
Object.assign(globalThis,{decodedImage,deadline,panelFit,MapTransition});
