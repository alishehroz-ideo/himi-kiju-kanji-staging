'use strict';
// Development-only, explicitly simulated ledger. Never authoritative for GameBull.
class LocalStageDemo {
  constructor(levels,Puzzle,{storage,initialLives=10,version='himi-kanji600-challenge2-20261027',uuid}={}){this.kind='demo';this.levels=levels;this.Puzzle=Puzzle;this.storage=storage;this.initialLives=initialLives;this.version=version;this.uuid=uuid||(()=>globalThis.crypto.randomUUID());this.key='himi-kanji-gamebull-local-demo-v1';this.memory=null;}
  _read(){let value;try{value=JSON.parse(this.storage?.getItem(this.key)||'null');}catch{}return value||this.memory||{highestCleared:0,lives:this.initialLives,starts:{},clears:{},attempts:{},rewardCount:0};}
  _write(data){this.memory=data;try{this.storage?.setItem(this.key,JSON.stringify(data));}catch{}}
  _context(d){return {rulesetVersion:this.version,progressScope:'loopback-demo-only',totalStages:600,highestCleared:d.highestCleared,nextStage:d.highestCleared===600?null:d.highestCleared+1,lives:d.lives,reward:d.highestCleared===600?{status:'DEMO_COMPLETE',title:'ローカルテスト完了'}:null};}
  _error(code,data){throw Object.assign(new Error(code),{code,definitive:true,...(data?{context:this._context(data)}:{})});}
  async getContext(){return this._context(this._read());}
  async startAttempt(request){const d=this._read();if(d.starts[request.requestId])return JSON.parse(JSON.stringify(d.starts[request.requestId]));if(request.rulesetVersion!==this.version||request.stage!==d.highestCleared+1||request.stage>600)this._error('stage.not_playable');if(d.lives<1)this._error('play.no_lives',d);if(request.previousAttemptId&&d.attempts[request.previousAttemptId])d.attempts[request.previousAttemptId].superseded=true;
    d.lives--;const id=this.uuid();d.attempts[id]={stage:request.stage,superseded:false};const response={attemptId:id,stage:request.stage,lifeCost:1,deadlineAt:null,context:this._context(d)};d.starts[request.requestId]=response;this._write(d);return JSON.parse(JSON.stringify(response));}
  async completeAttempt(request){const d=this._read();if(d.clears[request.attemptId])return JSON.parse(JSON.stringify(d.clears[request.attemptId]));const attempt=d.attempts[request.attemptId];if(!attempt||attempt.stage!==request.stage||attempt.superseded||request.rulesetVersion!==this.version)this._error('stage.invalid_attempt');
    const g=new this.Puzzle(this.levels[request.stage-1]);if(!Array.isArray(request.moves)||request.moves.length!==g.all.size)this._error('stage.invalid_moves');for(const delta of request.moves)if(!Array.isArray(delta)||!g.move(...delta))this._error('stage.invalid_moves');if(g.state!=='won')this._error('stage.invalid_moves');
    let status='ALREADY_CLEARED';if(request.stage===d.highestCleared+1){d.highestCleared++;status='CLEARED';if(d.highestCleared===600&&d.rewardCount===0)d.rewardCount=1;}else if(request.stage>d.highestCleared)this._error('stage.not_playable');
    const response={status,stage:request.stage,context:this._context(d)};d.clears[request.attemptId]=response;this._write(d);return JSON.parse(JSON.stringify(response));}
}
if(typeof module!=='undefined')module.exports=LocalStageDemo;
