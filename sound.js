'use strict';
// Original procedural music and paper/brush noise. No external recordings or network requests.
class CalligraphyAudio {
  constructor({host=globalThis,storage}={}){
    if(storage===undefined){try{storage=host.localStorage;}catch{storage=null;}}
    this.host=host;this.storage=storage;this.settings={bgm:.24,brush:.55};
    try{const s=JSON.parse(storage?.getItem('kanji-hitofude-audio')||'{}');for(const k of ['bgm','brush'])if(Number.isFinite(s[k]))this.settings[k]=Math.max(0,Math.min(1,s[k]));}catch{}
    this.context=null;this.ready=false;this.voices=new Set();this.cache=new Map();this.timer=null;this.pauseTimer=null;this.paused=false;this.step=0;this.nextTime=0;this.changed=()=>{};
    this.effectVoices=new Set();this.celebratingUntil=0;
    this.supported=!!(host.AudioContext||host.webkitAudioContext);
  }
  save(){try{this.storage?.setItem('kanji-hitofude-audio',JSON.stringify(this.settings));}catch{}}
  setVolume(kind,value){if(!['bgm','brush'].includes(kind)||!Number.isFinite(value))return;this.settings[kind]=Math.max(0,Math.min(1,value));this.save();this.apply();if(kind==='bgm'&&!this.settings.bgm)this.stopVoices();this.changed();}
  get running(){return this.ready&&this.context?.state==='running'&&!this.paused;}
  async unlock(){
    if(!this.supported||this.host.document?.hidden||(!this.settings.bgm&&!this.settings.brush))return false;
    try{
      if(!this.context)this.create();
      if(this.pauseTimer){this.host.clearTimeout(this.pauseTimer);this.pauseTimer=null;}
      this.paused=false;await this.context.resume();this.apply();this.startScheduler();this.changed();return this.running;
    }catch{if(!this.ready){try{this.context?.close()?.catch(()=>{});}catch{}this.context=null;this.supported=false;}this.changed();return false;}
  }
  create(){
    const Ctor=this.host.AudioContext||this.host.webkitAudioContext,c=this.context=new Ctor({latencyHint:'interactive'});
    this.master=c.createGain();this.master.gain.value=.75;this.master.connect(c.destination);
    this.music=c.createGain();this.music.connect(this.master);
    this.brushBus=c.createGain();this.brushBus.connect(this.master);
    this.room=c.createConvolver();this.room.buffer=this.noiseBuffer(1.5,true);const wet=c.createGain();wet.gain.value=.23;this.room.connect(wet);wet.connect(this.music);
    this.brushEnvelope=c.createGain();this.brushEnvelope.gain.value=0;
    const noise=c.createBufferSource();noise.buffer=this.noiseBuffer(2.1,false);noise.loop=true;
    const high=c.createBiquadFilter();high.type='highpass';high.frequency.value=620;
    this.brushFilter=c.createBiquadFilter();this.brushFilter.type='lowpass';this.brushFilter.frequency.value=4100;
    noise.connect(high);high.connect(this.brushFilter);this.brushFilter.connect(this.brushEnvelope);this.brushEnvelope.connect(this.brushBus);noise.start();this.noise=noise;
    c.onstatechange=()=>this.changed();this.ready=true;this.apply();
  }
  noiseBuffer(seconds,impulse){
    const c=this.context,length=Math.ceil(c.sampleRate*seconds),b=c.createBuffer(impulse?2:1,length,c.sampleRate);
    let seed=impulse?14271:7351;
    for(let ch=0;ch<b.numberOfChannels;ch++){const out=b.getChannelData(ch);let low=0;for(let i=0;i<length;i++){seed=(1664525*seed+1013904223)>>>0;const white=seed/2147483648-1;low=.94*low+.06*white;out[i]=impulse?(white*.18+low)*Math.pow(1-i/length,3.4):(white*.32+low*.45);}}
    return b;
  }
  pluckBuffer(midi){
    if(this.cache.has(midi))return this.cache.get(midi);
    const c=this.context,frequency=440*Math.pow(2,(midi-69)/12),period=Math.max(3,Math.round(c.sampleRate/frequency)),length=Math.ceil(c.sampleRate*3.4),buffer=c.createBuffer(1,length,c.sampleRate),out=buffer.getChannelData(0);
    let seed=21811+midi*317;
    for(let i=0;i<period;i++){seed=(1664525*seed+1013904223)>>>0;out[i]=(seed/2147483648-1)*.43;}
    let mean=0;for(let i=0;i<period;i++)mean+=out[i]/period;for(let i=0;i<period;i++)out[i]-=mean;
    for(let i=period;i<length;i++)out[i]=.996*(out[i-period]+out[i-period+1])*.5;
    const fade=Math.min(70,period);for(let i=0;i<fade;i++)out[i]*=i/fade;
    const release=Math.round(c.sampleRate*.08);for(let i=0;i<release;i++)out[length-release+i]*=1-i/release;
    this.cache.set(midi,buffer);return buffer;
  }
  apply(){
    if(!this.context)return;const t=this.context.currentTime;
    for(const [param,value]of [[this.master.gain,this.paused?0:.75],[this.music.gain,this.settings.bgm],[this.brushBus.gain,this.settings.brush]]){param.cancelScheduledValues(t);param.setTargetAtTime(value,t,.025);}
    if(!this.settings.brush){this.stopBrush();this.stopEffects();}
  }
  connectVoice(node,gain,time,end,effect=false){
    const c=this.context;node.connect(gain);let pan;
    const bus=effect?this.brushBus:this.music,voices=effect?this.effectVoices:this.voices;
    if(c.createStereoPanner){pan=c.createStereoPanner();pan.pan.value=this.step%2?.16:-.16;gain.connect(pan);pan.connect(bus);if(!effect)pan.connect(this.room);}else{gain.connect(bus);if(!effect)gain.connect(this.room);}
    voices.add(node);node.onended=()=>{voices.delete(node);try{node.disconnect();gain.disconnect();pan?.disconnect();}catch{}};node.start(time);node.stop(end);
  }
  koto(midi,time,velocity=.7,effect=false){
    const c=this.context,node=c.createBufferSource(),gain=c.createGain();node.buffer=this.pluckBuffer(midi);gain.gain.setValueAtTime(.28*velocity,time);this.connectVoice(node,gain,time,time+(effect?2.5:3.4),effect);
  }
  begin(){
    if(!this.running||this.host.document?.hidden||!this.settings.brush)return false;
    const c=this.context,t=c.currentTime+.015;
    this.stopEffects();this.stopVoices();this.celebratingUntil=t+1.3;
    // Two soft koto-like plucks and a tiny bell: an entrance cue, distinct from completion.
    for(const [note,delay,volume]of [[62,0,.17],[69,.14,.13]]){
      const node=c.createBufferSource(),gain=c.createGain();node.buffer=this.pluckBuffer(note);
      gain.gain.setValueAtTime(volume,t+delay);gain.gain.setTargetAtTime(0,t+delay+.06,.2);
      this.connectVoice(node,gain,t+delay,t+1.3,true);
    }
    for(const [ratio,volume]of [[1,.045],[2.76,.01]]){
      const node=c.createOscillator(),gain=c.createGain();node.type='sine';node.frequency.value=1174.66*ratio;
      gain.gain.setValueAtTime(0,t+.14);gain.gain.linearRampToValueAtTime(volume,t+.152);gain.gain.setTargetAtTime(0,t+.17,.15);
      this.connectVoice(node,gain,t+.14,t+1.3,true);
    }
    return true;
  }
  clear(){
    if(!this.running||!this.settings.brush)return false;
    const c=this.context,t=c.currentTime+.025;
    this.stopBrush();this.stopVoices();this.celebratingUntil=t+3.2;
    // Original rising yo-pentatonic phrase, followed by a bright suzu-like resolution.
    for(const [note,delay,v]of [[62,0,.8],[67,.19,.85],[69,.38,.9],[74,.64,1],[69,.65,.4],[62,.66,.45]])this.koto(note,t+delay,v,true);
    for(const [ratio,volume]of [[1,.13],[2.76,.035],[4.07,.017]]){
      const node=c.createOscillator(),gain=c.createGain();node.type='sine';node.frequency.value=587.33*ratio;
      gain.gain.setValueAtTime(0,t+.64);gain.gain.linearRampToValueAtTime(volume,t+.652);gain.gain.setTargetAtTime(0,t+.67,.45);
      this.connectVoice(node,gain,t+.64,t+3.2,true);
    }
    return true;
  }
  stopEffects(){const end=this.context?this.context.currentTime+.045:undefined;for(const n of this.effectVoices){try{n.stop(end);}catch{}}this.effectVoices.clear();this.celebratingUntil=0;}
  flute(midi,time){
    const c=this.context,frequency=440*Math.pow(2,(midi-69)/12);
    for(const [ratio,volume]of [[1,.065],[2,.009],[3,.003]]){
      const node=c.createOscillator(),gain=c.createGain();node.type='sine';node.frequency.value=frequency*ratio;node.detune.setValueAtTime(-3,time);node.detune.linearRampToValueAtTime(2,time+2);
      gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(volume,time+.42);gain.gain.setTargetAtTime(0,time+1.35,.3);this.connectVoice(node,gain,time,time+3.1);
    }
  }
  startScheduler(){
    if(!this.running||this.timer)return;this.nextTime=this.context.currentTime+.1;this.tick();this.timer=this.host.setInterval(()=>this.tick(),120);
  }
  tick(){
    if(!this.running)return;const c=this.context,beat=60/66;
    if(this.nextTime<c.currentTime-.4)this.nextTime=c.currentTime+.1;
    let guard=0;
    while(this.nextTime<c.currentTime+.65&&guard++<8){
      const s=this.step%64,t=this.nextTime;
      if(this.settings.bgm&&t>=this.celebratingUntil){
        // D yo-pentatonic notes; spaced phrases without percussion.
        if(s%8===0)this.koto([50,55,57,50,50,55,57,50][Math.floor(s/8)],t,.8);
        if([2,5].includes(s%8)){const motif=[62,64,67,69,71,69,67,64];this.koto(motif[(Math.floor(s/8)*2+(s%8===5?1:0))%8],t,.58);}
        if(s%16===11)this.koto([57,62,59,57][Math.floor(s/16)],t,.43);
        if(s%16===4)this.flute([69,67,64,62][Math.floor(s/16)],t+.15);
      }
      this.nextTime+=beat;this.step++;
    }
  }
  brush(tracing=false){
    if(!this.running||!this.settings.brush)return;
    const t=this.context.currentTime,g=this.brushEnvelope.gain;
    g.cancelScheduledValues(t);g.setTargetAtTime(tracing ? .16 : .125,t,.009);g.setTargetAtTime(0,t+(tracing ? .09 : .115),.026);
    this.brushFilter.frequency.setTargetAtTime(tracing?3700:4300,t,.02);
  }
  stopBrush(){if(!this.context)return;const t=this.context.currentTime,g=this.brushEnvelope.gain;g.cancelScheduledValues(t);g.setTargetAtTime(0,t,.012);}
  stopVoices(){const end=this.context?this.context.currentTime+.045:undefined;for(const n of this.voices){try{n.stop(end);}catch{}}this.voices.clear();}
  pause(){
    this.paused=true;if(this.timer){this.host.clearInterval(this.timer);this.timer=null;}this.stopBrush();this.stopVoices();this.stopEffects();this.apply();
    if(this.context){if(this.pauseTimer)this.host.clearTimeout(this.pauseTimer);this.pauseTimer=this.host.setTimeout(()=>{this.pauseTimer=null;if(this.paused)this.context.suspend().catch(()=>{});},70);}
    this.changed();
  }
  async foreground(){if(this.context&&!this.host.document?.hidden)await this.unlock();}
  dispose(){this.pause();if(this.pauseTimer)this.host.clearTimeout(this.pauseTimer);this.noise?.stop();this.context?.close();}
}
if(typeof module!=='undefined')module.exports=CalligraphyAudio;
