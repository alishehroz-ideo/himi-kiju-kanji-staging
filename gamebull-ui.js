'use strict';
let platformOpening=false,platformEntryBusy=false,platformClearBusy=false;
const safeText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function platformMessage(error){const code=error?.code||'';return ({'integration.bridge_unavailable':'GameBullとの接続を確認できません。GameBullから開き直してください。','play.no_lives':'ライフがありません。GameBullでライフをご確認ください。','stage.daily_limit_reached':'本日の挑戦回数の上限です。進行状況はGameBullに保存されています。','stage.not_playable':'開始できるステージが更新されました。GameBullから開き直してください。','stage.stage_not_playable':'開始できるステージが更新されました。GameBullから開き直してください。','stage.invalid_moves':'この挑戦のクリアは受け付けられませんでした。','stage.invalid_attempt':'この挑戦を確認できませんでした。','play.session_token_expired':'挑戦の有効期限が切れました。もう一度開始してください。','reward.unavailable':'ギフト券の受け取りはGameBullでご確認ください。'}[code])||'GameBullから結果を確認できませんでした。通信状態をご確認ください。';}
function refreshPlatformUI(){
  const context=stageSession.context,count=$('life-count');if(count)count.textContent=context?(context.lives>999?'999+':String(context.lives)):'—';
  if($('life-label'))$('life-label').textContent=stageSession.isDemo?'テスト用':'ライフ';
  const instruction=document.querySelector('footer p:first-child');if(instruction)instruction.textContent=stageSession.isDemo?'テスト用ライフ・報酬なし｜スワイプ・矢印で移動':'スワイプ・矢印・線を指でなぞって移動';
  const b=$('restart');if(b){b.disabled=['starting','submitting'].includes(stageSession.phase)||stageSession.phase==='allCleared';b.querySelector('span').textContent=stageSession.pendingClear?'結果を再確認':stageSession.phase==='cleared'?'次の問題':'やり直す';}
  const clock=$('stage-clock');if(clock){clock.hidden=!stageSession.attempt?.deadlineAt;if(!clock.hidden){const seconds=Math.max(0,Math.ceil((stageSession.attempt.deadlineAt-Date.now())/1000));clock.textContent=`残り ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}}
}
function showPlayArea(){ $('top-screen').hidden=true;$('game-screen').hidden=false;$('game-screen').inert=false;document.body.classList.remove('at-top');window.dispatchEvent(new Event('game:visibility'));resize();canvas.focus({preventScroll:true});}
function goPlatformHome(){if(dialog.open)close();$('game-screen').hidden=true;$('game-screen').inert=true;$('top-screen').hidden=false;document.body.classList.add('at-top');window.dispatchEvent(new Event('game:visibility'));$('top-start').focus({preventScroll:true});}
function demoNotice(){return stageSession.isDemo?'<p class="demo-notice">ローカルテストです。ライフは模擬データで、ギフト券は発行されません。</p>':'';}
async function showStageEntry(reason='start'){
  if(platformOpening||platformEntryBusy)return;platformOpening=true;
  try{
    if(stageSession.phase==='playing'&&stageSession.canPlay&&['ready','playing'].includes(game.state)&&reason==='start'){if(dialog.open)close();showPlayArea();return;}
    if(['boot','unavailable','allCleared'].includes(stageSession.phase)){open('<h2>進行状況を確認しています</h2><p>GameBullに接続しています。</p>');await stageSession.bootstrap();}
    refreshPlatformUI();
    if(stageSession.pendingClear){showClearRecovery();return;}
    if(stageSession.context?.nextStage===null){renderAllCleared();return;}
    const recovering=!!stageSession.pendingStart,stage=stageSession.context.nextStage;
    open(`<span class="stamp">GameBull ステージモード</span><h2>${recovering?'開始結果を再確認':`第${stage}問に挑戦`}</h2><p>${recovering?'同じ開始処理を確認します。新しい挑戦は追加しません。':'開始には1ライフ必要です。<br>やり直しにも1ライフ必要です。'}</p><div class="entry-life">残りライフ <strong>${stageSession.context.lives}</strong></div>${demoNotice()}<div class="actions"><button id="paid-begin" class="primary" ${!recovering&&stageSession.context.lives<1?'disabled':''}>${recovering?'開始結果を確認':'1ライフで開始'}</button><button id="entry-cancel">戻る</button></div>`);
    $('paid-begin').onclick=()=>beginPaidAttempt(reason);$('entry-cancel').onclick=close;
  }catch(error){open(`<h2>接続を確認してください</h2><p>${safeText(platformMessage(error))}</p><div class="actions"><button id="entry-check" class="primary">再確認</button><button id="entry-back">戻る</button></div>`);$('entry-check').onclick=()=>showStageEntry(reason);$('entry-back').onclick=close;}
  finally{platformOpening=false;}
}
async function beginPaidAttempt(reason){
  if(platformEntryBusy)return;platformEntryBusy=true;const button=$('paid-begin');if(button)button.disabled=true;
  try{const attempt=await stageSession.start(reason);if(dialog.open)close();showPlayArea();loadLevel(attempt.stage-1);refreshPlatformUI();}
  catch(error){refreshPlatformUI();const uncertain=!!stageSession.pendingStart;open(`<h2>${uncertain?'開始結果を確認できません':'開始できませんでした'}</h2><p>${safeText(platformMessage(error))}</p>${uncertain?'<p>同じ開始処理の再確認で、ライフの二重消費を防ぎます。</p>':''}<div class="actions">${uncertain?'<button id="start-recover" class="primary">同じ開始結果を確認</button>':''}<button id="entry-error-close">戻る</button></div>`);if($('start-recover'))$('start-recover').onclick=()=>beginPaidAttempt(reason);$('entry-error-close').onclick=close;}
  finally{platformEntryBusy=false;}
}
function confirmPaidRetry(){
  if(stageSession.pendingClear){showClearRecovery();return;}
  if(stageSession.pendingStart){showStageEntry('retry');return;}
  if(stageSession.phase==='cleared'){showStageEntry('next');return;}
  if(stageSession.phase==='allCleared'){renderAllCleared();return;}
  if(!['playing','failed','ready'].includes(stageSession.phase))return;
  open('<h2>やり直しますか？</h2><p>やり直すと、1ライフを使って<br>この問題を最初から開始します。</p><div class="actions"><button id="retry-keep" class="primary" autofocus>続ける</button><button id="retry-paid">1ライフでやり直す</button></div>');$('retry-keep').onclick=close;$('retry-paid').onclick=()=>beginPaidAttempt('retry');$('retry-keep').focus();
}
function restorePendingClear(){
  const receipt=stageSession.pendingClear;if(!receipt)return;
  if(game.level.id===receipt.stage&&game.state==='won')return;
  victorySerial++;completionInk.cancel();game=new KanjiPuzzle(KANJI_LEVELS[receipt.stage-1]);levelIndex=receipt.stage-1;
  for(const delta of receipt.moves)if(!game.move(...delta))throw Object.assign(new Error('stage.invalid_moves'),{code:'stage.invalid_moves'});
  if(game.state!=='won')throw Object.assign(new Error('stage.invalid_moves'),{code:'stage.invalid_moves'});animation=null;gesture=null;resultPending=0;canvas.dataset.completion='none';showPlayArea();update();resize();
}
function showClearRecovery(){open('<h2>クリア結果を再確認</h2><p>この挑戦の結果をGameBullに再確認します。<br>ライフの追加消費はありません。</p><div class="actions"><button id="clear-recover" class="primary">クリア結果を確認</button><button id="clear-later">戻る</button></div>');$('clear-recover').onclick=()=>submitVerifiedClear();$('clear-later').onclick=close;}
async function submitVerifiedClear(){
  if(platformClearBusy)return;platformClearBusy=true;
  try{
    if(stageSession.pendingClear)restorePendingClear();
    open('<h2>クリアを確認しています</h2><p>GameBullへの記録が完了するまでお待ちください。</p>');
    const moves=game.path.slice(1).map((p,i)=>[p[0]-game.path[i][0],p[1]-game.path[i][1]]),response=await stageSession.complete(moves);
    refreshPlatformUI();if(dialog.open)close();
    if(['CLEARED','ALREADY_CLEARED'].includes(response.status)){showPlayArea();gameAudio.clear();$('status').textContent=`第${game.level.id}問のクリアを記録しました。`;beginVictory();}
    else{game.state='rejected';$('status').textContent=response.status==='TIME_EXCEEDED'?'GameBullの挑戦時間を過ぎました。':'この挑戦はクリアとして記録されませんでした。';renderStageResult();}
  }catch(error){refreshPlatformUI();if(stageSession.pendingClear){open(`<h2>クリア結果を確認できません</h2><p>${safeText(platformMessage(error))}</p><p>再確認でライフは消費しません。</p><div class="actions"><button id="clear-retry" class="primary">同じ結果を再確認</button><button id="clear-back">戻る</button></div>`);$('clear-retry').onclick=()=>submitVerifiedClear();$('clear-back').onclick=close;}else{game.state='rejected';$('status').textContent=platformMessage(error);renderStageResult();}}
  finally{platformClearBusy=false;}
}
function resultSignature(){return '<div class="result-artist"><span class="artist-signature" role="img" aria-label="書家 氷見亀樹"></span></div>';}
function renderAllCleared(){
  if(stageSession.context?.highestCleared!==600||stageSession.context.nextStage!==null){open('<h2>進行状況を確認してください</h2><p>GameBullの達成記録を確認できません。</p>');return;}
  const reward=stageSession.context?.reward;let message='全600ステージ、おみごとです。',rewardButton='';
  if(stageSession.isDemo)message+='ローカルテストのため、ギフト券は発行されません。';
  else if(reward?.status==='ISSUED'){message+='ギフト券がGameBullから発行されました。';rewardButton='<button id="view-reward" class="primary">GameBullでギフト券を見る</button>';}
  else if(reward?.status==='ALREADY_CLAIMED'){message+='報酬は受け取り済みです。';rewardButton='<button id="view-reward" class="primary">GameBullで確認する</button>';}
  else if(reward?.status==='OUT_OF_STOCK')message+='報酬はGameBull側で準備中です。GameBullでご確認ください。';
  else message+='報酬についてはGameBullでご確認ください。';
  open(`<span class="stamp">全600ステージ達成</span><h2>文字の旅、完結。</h2><p>${safeText(message)}</p>${reward?.title&&!stageSession.isDemo?`<p>${safeText(reward.title)}</p>`:''}<div class="actions">${rewardButton}<button id="result-home">TOPへ</button></div>${resultSignature()}`);
  if($('view-reward'))$('view-reward').onclick=async()=>{try{await stageSession.openReward();}catch(error){$('status').textContent=platformMessage(error);}};$('result-home').onclick=goPlatformHome;
}
function renderStageResult(){
  if(stageSession.phase==='allCleared'){renderAllCleared();return;}
  const won=game.state==='won'&&stageSession.phase==='cleared';
  open(won?`<div class="finished-char calligraphy-char">${game.level.char}</div><span class="stamp">正解・一筆完成</span><h2>第${game.level.id}問、完成です。</h2><p>クリア ${stageSession.context.highestCleared} / 600問<br>次の問題の開始には1ライフ必要です。</p><div class="actions"><button id="next-paid" class="primary">次の問題へ（1ライフ）</button><button id="result-home">TOPへ</button></div>${resultSignature()}`:`<h2>${game.state==='lost'?'もうひと息。':'挑戦を終了しました'}</h2><p>${game.state==='lost'?'まだ道が残っています。通る順番を考えてみよう。':safeText($('status').textContent)}</p><p>再挑戦には1ライフ必要です。</p><div class="actions"><button id="again-paid" class="primary">やり直す（1ライフ）</button><button id="result-home">TOPへ</button></div>${resultSignature()}`);
  if($('next-paid'))$('next-paid').onclick=()=>showStageEntry('next');if($('again-paid'))$('again-paid').onclick=confirmPaidRetry;$('result-home').onclick=goPlatformHome;
}
