'use strict';
const gameAudio=new CalligraphyAudio();
const rememberedVolumes={bgm:gameAudio.settings.bgm||.24,brush:gameAudio.settings.brush||.55};
function audioStatus(){
  if(!gameAudio.supported)return 'このブラウザでは音を再生できません。';
  if(!gameAudio.settings.bgm&&!gameAudio.settings.brush)return 'すべての音を消音しています。';
  if(!gameAudio.running)return '画面の操作後に音を有効にします。';
  return gameAudio.settings.bgm?'和風BGMを再生中です。':'筆音・効果音が有効です。';
}
function refreshAudioUI(){
  const button=document.getElementById('sound');if(!button)return;
  const muted=!gameAudio.settings.bgm&&!gameAudio.settings.brush;button.classList.toggle('muted',muted);button.title=audioStatus();button.dataset.audio=muted?'muted':gameAudio.running?'running':'waiting';
  const status=document.getElementById('audio-status');if(status)status.textContent=audioStatus();
  for(const kind of ['bgm','brush']){
    const range=document.getElementById('volume-'+kind),label=document.getElementById('volume-value-'+kind),toggle=document.getElementById('toggle-'+kind),v=Math.round(gameAudio.settings[kind]*100);
    if(range)range.value=v;if(label)label.textContent=v+'%';
    if(toggle){toggle.textContent=(kind==='bgm'?'BGM':'筆音・効果音')+'：'+(v?'オン':'オフ');toggle.setAttribute('aria-pressed',String(v>0));}
  }
  const all=document.getElementById('mute-all');if(all)all.textContent=muted?'音を戻す':'すべて消音';
}
gameAudio.changed=refreshAudioUI;
function openSound(){
  open('<span class="stamp">音の設定</span><h2>静かな、書の時間。</h2><p>琴と尺八をイメージした和風BGMと、<br>筆音と、完成を祝う和風ファンファーレ。</p><div class="audio-settings"><div class="audio-row"><button id="toggle-bgm" aria-pressed="true">BGM：オン</button><label for="volume-bgm">BGM音量 <output id="volume-value-bgm">24%</output></label><input id="volume-bgm" aria-label="BGM音量" type="range" min="0" max="100" step="1"></div><div class="audio-row"><button id="toggle-brush" aria-pressed="true">筆音・効果音：オン</button><label for="volume-brush">筆音・効果音の音量 <output id="volume-value-brush">55%</output></label><input id="volume-brush" aria-label="筆音・効果音の音量" type="range" min="0" max="100" step="1"></div></div><p id="audio-status" role="status"></p><div class="actions"><button id="sound-done" class="primary">ゲームに戻る</button><button id="preview-clear">クリア音を試す</button><button id="mute-all">すべて消音</button></div>');
  for(const kind of ['bgm','brush']){
    document.getElementById('volume-'+kind).oninput=e=>{const v=Number(e.target.value)/100;if(v>0)rememberedVolumes[kind]=v;gameAudio.setVolume(kind,v);gameAudio.unlock();};
    document.getElementById('toggle-'+kind).onclick=()=>{if(gameAudio.settings[kind]){rememberedVolumes[kind]=gameAudio.settings[kind];gameAudio.setVolume(kind,0);}else{gameAudio.setVolume(kind,rememberedVolumes[kind]);gameAudio.unlock();}};
  }
  document.getElementById('mute-all').onclick=()=>{
    if(gameAudio.settings.bgm||gameAudio.settings.brush){for(const k of ['bgm','brush']){if(gameAudio.settings[k])rememberedVolumes[k]=gameAudio.settings[k];gameAudio.setVolume(k,0);}}
    else{for(const k of ['bgm','brush'])gameAudio.setVolume(k,rememberedVolumes[k]);gameAudio.unlock();}
  };
  document.getElementById('preview-clear').onclick=async()=>{await gameAudio.unlock();if(!gameAudio.effectVoices.size)gameAudio.clear();};
  document.getElementById('sound-done').onclick=close;
  if(!gameAudio.supported)document.querySelectorAll('.audio-settings button,.audio-settings input,#preview-clear,#mute-all').forEach(b=>b.disabled=true);
  refreshAudioUI();
}
document.getElementById('sound').onclick=openSound;
// Audio starts only from a trusted user interaction, in accordance with browser autoplay rules.
for(const event of ['pointerdown','keydown'])document.addEventListener(event,e=>{if(e.isTrusted&&!document.hidden)gameAudio.unlock();},{capture:true,passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)gameAudio.pause();else gameAudio.foreground();});
window.addEventListener('blur',()=>gameAudio.pause());window.addEventListener('focus',()=>gameAudio.foreground());window.addEventListener('pagehide',()=>gameAudio.pause());
refreshAudioUI();
