'use strict';
(() => {
  const home=document.getElementById('top-screen'),art=document.getElementById('top-art'),layer=document.getElementById('top-effects'),screen=document.getElementById('game-screen'),g=layer.getContext('2d');
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const low=(navigator.deviceMemory&&navigator.deviceMemory<=2)||(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=2)||navigator.connection?.saveData;
  const petals=Array.from({length:low?3:5},(_,i)=>({side:i%2,phase:(i*.217+.12)%1,seconds:12+(i*2.13)%8,size:5+(i*1.7)%5,sway:5+i*1.3,rotation:i*1.8,blur:i===2}));
  let frame=0,last=0,clock=0,previous=0,slowFrames=0;
  // The only paths used here follow visible gold in the supplied artwork.
  const curves=[[[640,568],[795,548],[805,784],[660,785]],[[355,980],[315,1020],[313,1080],[357,1120]]];
  const contacts=[[746,613],[720,770],[355,980],[357,1120]];
  function bezier(p,t){const u=1-t;return [0,1].map(k=>u*u*u*p[0][k]+3*u*u*t*p[1][k]+3*u*t*t*p[2][k]+t*t*t*p[3][k]);}
  function glow(x,y,r,alpha){const light=g.createRadialGradient(x,y,0,x,y,r);light.addColorStop(0,`rgba(255,245,208,${alpha})`);light.addColorStop(.24,`rgba(255,214,128,${alpha*.5})`);light.addColorStop(1,'rgba(255,207,112,0)');g.fillStyle=light;g.fillRect(x-r,y-r,r*2,r*2);}
  // Rounded-rectangle perimeter in artwork coordinates; never crosses the button lettering.
  function borderPoint(t){const x=133,y=1277,w=675,h=132,r=64,straight=w-2*r,vertical=h-2*r,arc=Math.PI*r/2,length=2*straight+2*vertical+4*arc;let d=(t%1)*length;
    const pieces=[straight,arc,vertical,arc,straight,arc,vertical,arc];let part=0;while(d>pieces[part]&&part<7)d-=pieces[part++];
    if(part===0)return[x+r+d,y];if(part===2)return[x+w,y+r+d];if(part===4)return[x+w-r-d,y+h];if(part===6)return[x,y+h-r-d];
    const centers={1:[x+w-r,y+r,-Math.PI/2],3:[x+w-r,y+h-r,0],5:[x+r,y+h-r,Math.PI/2],7:[x+r,y+r,Math.PI]};const [cx,cy,a]=centers[part];return[cx+r*Math.cos(a+d/r),cy+r*Math.sin(a+d/r)];
  }
  function paint(t){g.clearRect(0,0,941,1672);
    // Gentle ten-second breathing light, limited to the existing upper-left ray.
    const ray=g.createRadialGradient(20,0,0,30,40,410);ray.addColorStop(0,`rgba(255,230,174,${.025+.018*(1+Math.sin(t*Math.PI/5))})`);ray.addColorStop(1,'rgba(255,230,174,0)');g.fillStyle=ray;g.fillRect(0,0,440,460);
    for(let i=0;i<curves.length;i++){const phase=(t/(i?9:8)+i*.47)%1,p=bezier(curves[i],phase);glow(...p,17,.6);glow(...p,4,.76);for(const c of contacts){const distance=Math.hypot(c[0]-p[0],c[1]-p[1]);if(distance<28)glow(...c,29,(1-distance/28)*.42);}}
    // One subtle pass every nine seconds, followed by a long quiet interval.
    const sweep=(t%9)/2.4;if(sweep<1){const fade=Math.sin(sweep*Math.PI);for(let i=0;i<5;i++)glow(...borderPoint((sweep-i*.006+1)%1),9,.15*fade*(1-i/5));}
    const count=slowFrames>24?3:petals.length;
    for(const p of petals.slice(0,count)){const f=(t/p.seconds+p.phase)%1,y=-35+f*1742,base=p.side?899:42,x=base+Math.sin(f*8+p.rotation)*p.sway;
      if(p.side&&y<150)continue; // Keep the audio icon clear.
      g.save();g.translate(x,y);g.rotate(p.rotation+f*(p.side?-2.2:2.7));g.globalAlpha=p.blur?.3:.53;g.filter=p.blur?'blur(2px)':'none';g.fillStyle='#fff7df';g.beginPath();g.moveTo(-p.size,0);g.bezierCurveTo(-p.size*.4,-p.size*.8,p.size*.7,-p.size*.5,p.size,0);g.bezierCurveTo(p.size*.5,p.size*.65,-p.size*.2,p.size*.5,-p.size,0);g.fill();g.restore();
    }
  }
  function active(){return !home.hidden&&!document.hidden&&!motion.matches;}
  function tick(now){frame=0;if(!active())return;if(previous){const delta=now-previous;if(delta>65)slowFrames++;clock+=Math.min(delta,100)/1000;}previous=now;if(now-last>=1000/(low?24:30)){paint(clock);last=now;}frame=requestAnimationFrame(tick);}
  function sync(){if(frame)cancelAnimationFrame(frame);frame=0;previous=0;art.dataset.effects=active()?'running':'stopped';if(active())frame=requestAnimationFrame(tick);else g.clearRect(0,0,941,1672);}
  function fit(){const r=art.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,low?1:1.5);layer.width=Math.round(r.width*dpr);layer.height=Math.round(r.height*dpr);g.setTransform(layer.width/941,0,0,layer.height/1672,0,0);if(active())paint(clock);}
  function showHome(){screen.hidden=true;screen.inert=true;home.hidden=false;document.body.classList.add('at-top');fit();sync();document.getElementById('top-start').focus({preventScroll:true});}
  function start(){showStageEntry('start');}
  function bind(id,action){const b=document.getElementById(id);b.addEventListener('click',()=>{b.classList.remove('tapped');void b.offsetWidth;b.classList.add('tapped');setTimeout(()=>b.classList.remove('tapped'),340);action();});}
  bind('top-start',()=>{const b=document.getElementById('top-start');b.disabled=true;gameAudio.unlock().then(()=>gameAudio.begin());setTimeout(()=>{start();b.disabled=false;},motion.matches?0:120);});bind('top-help',()=>document.getElementById('help').click());bind('top-sound',openSound);
  document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();showHome();});
  document.addEventListener('visibilitychange',sync);window.addEventListener('pagehide',()=>{if(frame)cancelAnimationFrame(frame);frame=0;previous=0;});window.addEventListener('pageshow',sync);motion.addEventListener('change',sync);window.addEventListener('game:visibility',sync);
  new ResizeObserver(fit).observe(art);fit();sync();
})();
