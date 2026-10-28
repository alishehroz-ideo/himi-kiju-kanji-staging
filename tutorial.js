'use strict';
class FirstQuestionTutorial {
  constructor(storage){if(storage===undefined){try{storage=globalThis.localStorage;}catch{storage=null;}}this.storage=storage;this.seen=false;try{this.seen=storage?.getItem('kanji-hitofude-tutorial-v1')==='seen';}catch{}}
  shouldIntroduce(game,{visible=true,dialogOpen=false}={}){return !this.seen&&visible&&!dialogOpen&&game.level.id===1&&game.state==='ready'&&game.used.size===0;}
  markSeen(){this.seen=true;try{this.storage?.setItem('kanji-hitofude-tutorial-v1','seen');}catch{}}
  state(game){
    if(game.level.id!==1||game.state==='won')return null;
    const auxiliary=[...game.all].filter(k=>!game.core.has(k)),remaining=auxiliary.filter(k=>!game.used.has(k)).length;
    if(game.state==='lost')return {stage:'stuck',remaining,message:remaining?'金色の補助線が残っています。やり直して、先に四角を一周しよう。':'道が残っています。「やり直す」からもう一度。'};
    if(!remaining)return {stage:'core',remaining,message:'補助線は通れました。つづけて黒い道を「終」までなぞろう。'};
    return {stage:'auxiliary',remaining,message:game.used.size?'金色の点線も、すべて一度ずつ通ろう。四角を一周して始点へ。':'まずは金色の四角を一周して、始点に戻ろう。'};
  }
}
if(typeof module!=='undefined')module.exports=FirstQuestionTutorial;
