'use strict';
class GameBullSession {
  constructor(provider,{storage,uuid,now=()=>Date.now(),timeoutMs=15000,gameId='HIMI_KIJU_KANJI_HITOFUDE',rulesetVersion='himi-kanji600-challenge2-20261027'}={}){
    if(storage===undefined){try{storage=globalThis.sessionStorage;}catch{storage=null;}}
    this.provider=provider;this.storage=storage;this.uuid=uuid||(()=>globalThis.crypto.randomUUID());this.now=now;this.timeoutMs=timeoutMs;this.gameId=gameId;this.version=rulesetVersion;
    this.phase='boot';this.context=null;this.attempt=null;this.pendingStart=null;this.pendingClear=null;this.lastResult=null;this.scope=null;this.flight=null;this.flightKind=null;
  }
  error(code,definitive=false){return Object.assign(new Error(code),{code,definitive});}
  get isDemo(){return this.provider.kind==='demo';}
  get canPlay(){return this.phase==='playing'&&this.attempt&&(!this.attempt.deadlineAt||this.now()<this.attempt.deadlineAt);}
  get expired(){return this.phase==='playing'&&this.attempt?.deadlineAt&&this.now()>=this.attempt.deadlineAt;}
  _single(kind,action){if(this.flight)return this.flightKind===kind?this.flight:Promise.reject(this.error('stage.operation_busy',true));this.flightKind=kind;this.flight=Promise.resolve().then(action).finally(()=>{this.flight=null;this.flightKind=null;});return this.flight;}
  async _call(name,payload){let timer;try{return await Promise.race([Promise.resolve().then(()=>this.provider[name](payload)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(this.error('connection.uncertain')),this.timeoutMs);})]);}finally{clearTimeout(timer);}}
  _context(c){
    if(!c||c.totalStages!==600||c.rulesetVersion!==this.version||!Number.isInteger(c.highestCleared)||c.highestCleared<0||c.highestCleared>600||c.nextStage!==(c.highestCleared===600?null:c.highestCleared+1)||!Number.isInteger(c.lives)||c.lives<0||c.lives>1e9||typeof c.progressScope!=='string'||!c.progressScope||c.progressScope.length>200)throw this.error('integration.invalid_context');
    return JSON.parse(JSON.stringify(c));
  }
  _key(){return `kanji-gb-pending:${this.gameId}:${this.version}:${encodeURIComponent(this.scope)}`;}
  _save(){if(!this.scope)return;try{if(this.pendingStart||this.pendingClear)this.storage?.setItem(this._key(),JSON.stringify({pendingStart:this.pendingStart,pendingClear:this.pendingClear}));else this.storage?.removeItem(this._key());}catch{}}
  _load(){try{const x=JSON.parse(this.storage?.getItem(this._key())||'{}');if(x.pendingStart&&x.pendingStart.gameId===this.gameId&&x.pendingStart.rulesetVersion===this.version&&['start','next','retry'].includes(x.pendingStart.reason)&&x.pendingStart.stage===this.context.nextStage&&typeof x.pendingStart.requestId==='string'&&x.pendingStart.requestId.length>0&&x.pendingStart.requestId.length<=128)this.pendingStart=x.pendingStart;if(x.pendingClear&&this._validReceipt(x.pendingClear)&&x.pendingClear.stage<=this.context.highestCleared+1)this.pendingClear=x.pendingClear;}catch{}}
  _validReceipt(r){return r&&r.gameId===this.gameId&&r.rulesetVersion===this.version&&typeof r.requestId==='string'&&r.requestId.length>0&&r.requestId.length<=128&&typeof r.attemptId==='string'&&r.attemptId.length>0&&r.attemptId.length<=200&&Number.isInteger(r.stage)&&r.stage>=1&&r.stage<=600&&Number.isFinite(r.playTimeMs)&&r.playTimeMs>=0&&Array.isArray(r.moves)&&r.moves.length>0&&r.moves.length<=3000&&r.moves.every(d=>Array.isArray(d)&&d.length===2&&d.every(Number.isInteger)&&Math.abs(d[0])+Math.abs(d[1])===1);}
  bootstrap(){return this._single('bootstrap',async()=>{
    try{const c=this._context(await this._call('getContext',{gameId:this.gameId,rulesetVersion:this.version}));this.context=c;this.scope=c.progressScope;this.attempt=null;this.pendingStart=null;this.pendingClear=null;this._load();this.phase=this.pendingClear?'clearUncertain':this.pendingStart?'startUncertain':c.nextStage===null?'allCleared':'ready';return c;}catch(e){this.phase='unavailable';throw e;}
  });}
  start(reason='start'){return this._single('start',async()=>{
    if(!this.context||['submitting','clearUncertain','allCleared','unavailable','boot'].includes(this.phase)||this.pendingClear)throw this.error('stage.not_ready',true);
    const previousPhase=this.phase,previousAttempt=this.attempt;
    const request=this.pendingStart||{gameId:this.gameId,rulesetVersion:this.version,stage:this.context.nextStage,requestId:this.uuid(),reason,previousAttemptId:this.attempt?.id||null};
    if(!Number.isInteger(request.stage)||request.stage!==this.context.nextStage)throw this.error('stage.not_playable',true);
    this.pendingStart=request;this._save();this.phase='starting';
    try{
      const response=await this._call('startAttempt',request),c=this._context(response?.context);
      if(typeof response.attemptId!=='string'||!response.attemptId||response.attemptId.length>200||response.stage!==request.stage||response.lifeCost!==1||c.nextStage!==request.stage||c.highestCleared!==request.stage-1||c.progressScope!==this.scope)throw this.error('integration.invalid_attempt');
      const deadline=response.deadlineAt==null?null:Date.parse(response.deadlineAt);if(deadline!==null&&!Number.isFinite(deadline))throw this.error('integration.invalid_deadline');
      this.attempt={id:response.attemptId,stage:response.stage,startedAt:this.now(),deadlineAt:deadline};this.context=c;this.pendingStart=null;this.lastResult=null;this._save();this.phase='playing';return this.attempt;
    }catch(e){if(e?.definitive===true){if(e.context){try{const c=this._context(e.context);if(c.progressScope===this.scope)this.context=c;}catch{}}this.pendingStart=null;this._save();this.attempt=previousAttempt;this.phase=this.context.nextStage===null?'allCleared':previousAttempt&&previousPhase==='playing'&&this.context.nextStage===previousAttempt.stage?'playing':'ready';}else this.phase='startUncertain';throw e;}
  });}
  complete(moves){return this._single('complete',async()=>{
    let receipt=this.pendingClear;
    if(!receipt){if(!this.canPlay)throw this.error('stage.no_active_attempt',true);receipt={gameId:this.gameId,rulesetVersion:this.version,requestId:this.uuid(),attemptId:this.attempt.id,stage:this.attempt.stage,playTimeMs:Math.max(0,Math.floor(this.now()-this.attempt.startedAt)),moves:JSON.parse(JSON.stringify(moves))};if(!this._validReceipt(receipt))throw this.error('stage.invalid_moves',true);this.pendingClear=receipt;this._save();}
    this.phase='submitting';
    try{
      const response=await this._call('completeAttempt',receipt),status=response?.status;let c=this._context(response?.context);if(c.highestCleared<this.context.highestCleared)c=this._context(await this._call('getContext',{gameId:this.gameId,rulesetVersion:this.version}));if(c.highestCleared<this.context.highestCleared)throw this.error('integration.stale_context');
      if(c.progressScope!==this.scope||response.stage!==receipt.stage||!['CLEARED','ALREADY_CLEARED','TIME_EXCEEDED','REJECTED'].includes(status))throw this.error('integration.invalid_clear');
      if(status==='CLEARED'&&c.highestCleared<receipt.stage)throw this.error('integration.invalid_progress');
      if(status==='ALREADY_CLEARED'&&c.highestCleared<receipt.stage)throw this.error('integration.invalid_progress');
      if(['REJECTED','TIME_EXCEEDED'].includes(status)&&c.highestCleared>=receipt.stage)throw this.error('integration.invalid_progress');
      this.context=c;this.lastResult=JSON.parse(JSON.stringify({...response,context:c}));this.pendingClear=null;this._save();this.phase=['CLEARED','ALREADY_CLEARED'].includes(status)?(c.nextStage===null?'allCleared':'cleared'):'failed';return this.lastResult;
    }catch(e){if(e?.definitive===true){this.pendingClear=null;this._save();this.phase='failed';}else this.phase='clearUncertain';throw e;}
  });}
  fail(){if(this.phase==='playing')this.phase='failed';}
  async openReward(){if(this.isDemo||this.context?.highestCleared!==600||typeof this.provider.openReward!=='function')throw this.error('reward.unavailable',true);return this.provider.openReward({gameId:this.gameId,rulesetVersion:this.version});}
}
if(typeof module!=='undefined')module.exports=GameBullSession;
