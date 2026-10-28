'use strict';
function createGameBullProvider(config,host=globalThis){
  const bridge=host.GAMEBULL_STAGE_BRIDGE;
  if(bridge&&['getContext','startAttempt','completeAttempt'].every(k=>typeof bridge[k]==='function'))return {kind:'gamebull',getContext:x=>bridge.getContext(x),startAttempt:x=>bridge.startAttempt(x),completeAttempt:x=>bridge.completeAttempt(x),openReward:typeof bridge.openReward==='function'?x=>bridge.openReward(x):undefined};
  const hostname=host.location?.hostname;
  if(config.enableLocalDemo===true&&['127.0.0.1','localhost','[::1]','::1'].includes(hostname)){let storage;try{storage=host.localStorage;}catch{}return new LocalStageDemo(KANJI_LEVELS,KanjiPuzzle,{storage,initialLives:config.localDemoInitialLives,version:config.rulesetVersion});}
  const unavailable=()=>Promise.reject(Object.assign(new Error('integration.bridge_unavailable'),{code:'integration.bridge_unavailable',definitive:true}));
  return {kind:'gamebull',getContext:unavailable,startAttempt:unavailable,completeAttempt:unavailable};
}
if(typeof module!=='undefined')module.exports=createGameBullProvider;
