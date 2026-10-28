'use strict';
class InkCompletion {
  constructor(){this.cancel();}
  cancel(){this.char='';this.startTime=null;this.pausedAt=null;this.resultAt=0;this.reduced=false;}
  start(char,now,reduced=false){this.char=char;this.startTime=now;this.pausedAt=null;this.reduced=reduced;this.resultAt=now+(reduced?1000:2700);}
  pause(now){if(this.startTime!==null&&this.pausedAt===null)this.pausedAt=now;}
  resume(now){if(this.pausedAt===null)return 0;const delta=Math.max(0,now-this.pausedAt);this.startTime+=delta;this.resultAt+=delta;this.pausedAt=null;return delta;}
  state(now){
    if(this.startTime===null)return {aux:1,core:1,brush:0,seal:0,done:false,animating:false};
    const elapsed=Math.max(0,(this.pausedAt??now)-this.startTime),smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
    if(this.reduced)return {aux:0,core:0,brush:1,seal:1,done:true,animating:false};
    return {aux:1-smooth(elapsed/360),core:1-smooth((elapsed-220)/780),brush:smooth((elapsed-380)/900),seal:smooth((elapsed-1100)/350),done:elapsed>=1450,animating:this.pausedAt===null&&elapsed<1450};
  }
  paint(ctx,width,height,now){
    const s=this.state(now);if(!s.brush)return;
    ctx.save();ctx.globalAlpha=s.brush;ctx.fillStyle='#20231f';
    const size=Math.min(width*.78,height*.7,300);ctx.font=`${size}px "Hitofude Brush", "Yu Mincho", serif`;ctx.textAlign='left';ctx.textBaseline='alphabetic';
    const m=ctx.measureText(this.char),left=m.actualBoundingBoxLeft||0,right=m.actualBoundingBoxRight||m.width,ascent=m.actualBoundingBoxAscent||size*.8,descent=m.actualBoundingBoxDescent||0;
    ctx.fillText(this.char,width/2+(left-right)/2,height/2-8+(ascent-descent)/2);
    if(s.seal){ctx.globalAlpha=s.seal;ctx.translate(width-43,height-43);ctx.rotate(-.075);ctx.strokeStyle='#a04f3e';ctx.fillStyle='#a04f3e';ctx.lineWidth=1.3;ctx.strokeRect(-15,-19,30,38);ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='14px "Yu Mincho",serif';ctx.fillText('正',0,-8);ctx.fillText('解',0,8);}
    ctx.restore();
  }
}
if(typeof module!=='undefined')module.exports=InkCompletion;
