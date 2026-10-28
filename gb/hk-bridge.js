'use strict';
/* 氷見亀樹の漢字ひと筆: window.GAMEBULL_STAGE_BRIDGE on the real GameBull Stage Mode API.
 *
 * The client's own seam (their docs/GAMEBULL_INTEGRATION_EN.txt, section B): their gamebull-provider.js takes this
 * object when it has getContext / startAttempt / completeAttempt (+ openReward), and their gamebull-session.js
 * validates every answer. Their contract was a proposal, not a GameBull API, so this file maps it onto the API the
 * other Stage Mode games use (gamebull-whitelabel ADR-0086, contracts/stage-mode.ts; the Stance and Niigata ports):
 *
 *   getContext        GET  /play/games/{gameId}/context?tenantSlug   (Bearer bootToken) -> stageMode, lives.count
 *   startAttempt      POST /play/plays {bootToken, stage}            1 Life on the server (PAID). Their requests only
 *                                                                     ever ask for nextStage (start, next, retry)
 *   completeAttempt   POST /play/stage-clears {sessionToken, playTimeMs} -> status, progress, the all-clear reward
 *   openReward        closes the game into the GameBull app's coupon (gamebull:close + to: /coupons/<id>, trap W18)
 *
 * What their contract asks that the API does not have, and what this file does instead:
 *  - idempotent starts (requestId): the API has no idempotency key. A start answer is kept per requestId in
 *    sessionStorage (with its play token, which never goes into THEIR storage), so a resend of the same requestId
 *    returns the same attempt with no second Life; a request still in flight is awaited, not sent again. A start whose
 *    answer was lost for good (network / 5xx) is never re-sent: the resend gets a definitive answer with fresh Lives
 *    from /context and a message that a Life may have been used (as on Stance);
 *  - move proof: GameBull does not replay moves. Their moves are replayed here with their own KanjiPuzzle before a
 *    clear is reported (not authoritative: it runs in the browser);
 *  - rulesetVersion / level hash pinning: the server does not know it; their version is echoed back;
 *  - deadlineAt: GameBull requires a time per attempt (maxAttemptSeconds, max 3540 s); their game shows it and stops.
 * Lives are never subtracted here: the balance is the server's (/context lives.count after every call).
 * Only active on a Stage Mode launch (client-hooks.js opens window.__hkGate.stage); otherwise every call is refused.
 */
(function () {
  const ENV = window.HIMI_GB || {};
  const gate = window.__hkGate = window.__hkGate || { stage: false };
  const log = (...a) => console.log('[HK-STAGE]', ...a);
  const q = new URLSearchParams(location.search);
  // The GameBull app launches with ?tenantSlug&bootToken&gameId&returnUrl&apiBase (use-launch-game.ts); the other
  // ports' SDK also accepts sessionToken / token, in that order (playbook section 2).
  const token = q.get('bootToken') || q.get('sessionToken') || q.get('token') || '';
  const tenant = q.get('tenantSlug') || '';
  const api = ((ENV.dev && q.get('devApi')) || ENV.apiBase || '').replace(/\/+$/, '');
  const jwtPayload = t => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return null; } };
  const player = (jwtPayload(token) || {}).globalUserId || 'unknown';
  // Their progressScope: stable, non-secret (tenant + game + GameBull user id), never the token.
  const scope = (tenant + ':' + ENV.gameId + ':' + player).slice(0, 200);
  const KEY = 'himi-gb:v1:' + scope;

  // Server codes -> wording for their messages (their platformMessage() covers their own codes; client-hooks.js shows
  // gbMessage for the rest). Wording follows the same client's Niigata / Stance Stage Mode screens.
  const MESSAGES = {
    'play.no_lives': 'ライフがありません。GameBullでライフをご確認ください。',
    'stage.daily_limit_reached': '本日の挑戦回数の上限です。進行状況はGameBullに保存されています。',
    'stage.stage_not_playable': '開始できるステージが更新されました。GameBullから開き直してください。',
    'stage.all_cleared': '全600ステージをクリア済みです。',
    'play.session_token_expired': '挑戦の有効期限が切れました。もう一度開始してください。',
    'play.session_token_invalid': 'GameBullへの接続に失敗しました。GameBullのゲーム画面から開き直してください。',
    'guest.session_invalid': 'GameBullへの接続に失敗しました。GameBullのゲーム画面から開き直してください。',
    'play.mode_not_enabled': 'このゲームのステージモードをGameBull側で有効にしてください。',
    'stage.mode_required': 'ステージモードはGameBullのゲーム画面の「Play Stage Mode」から開いてください。',
    'stage.total_mismatch': 'ステージ数がゲームと一致しません（全600問）。GameBullの管理画面で600ステージに設定してください。',
    'stage.start_unknown': '前回の開始結果を確認できませんでした。ライフが使われた可能性があります。残りライフを確認して、もう一度開始してください。',
    'stage.launch_required': 'GameBullのゲーム画面から開いてください。',
  };
  const err = (code, definitive, extra) => Object.assign(new Error(code), { code, definitive: !!definitive, gbMessage: MESSAGES[code] }, extra || {});

  /* ── storage (sessionStorage, this tab only; the play token never leaves this object) ── */
  const blank = () => ({ starts: {}, sent: {}, attempts: {}, reward: null });
  let store = blank();
  try { const s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (s && s.starts && s.attempts) store = Object.assign(blank(), s); } catch { /* private mode */ }
  function save() {
    const ids = Object.keys(store.starts); if (ids.length > 30) for (const k of ids.slice(0, ids.length - 30)) delete store.starts[k];
    const at = Object.keys(store.attempts); if (at.length > 30) for (const k of at.slice(0, at.length - 30)) delete store.attempts[k];
    try { sessionStorage.setItem(KEY, JSON.stringify(store)); } catch { /* private mode */ }
  }

  /* ── server ── */
  let n = 0;
  async function request(path, { method = 'GET', body, bearer } = {}) {
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 30000);
    const headers = { Accept: 'application/json' };
    if (bearer) headers.Authorization = 'Bearer ' + bearer;
    if (body) headers['Content-Type'] = 'application/json';
    // GETs are cache-busted with a unique URL (a cached /context showed lives one play behind, playbook section 3).
    const url = api + path + (method === 'GET' ? (path.includes('?') ? '&' : '?') + '_ts=' + Date.now() + '-' + (++n) : '');
    let response, data;
    try {
      response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: abort.signal,
        cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
    } catch { throw err('network', false); }
    finally { clearTimeout(timer); }
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok) {
      // Codes arrive nested ({error:{code}}) or top-level ({code}) (playbook section 3, error shapes).
      const code = (data && data.error && data.error.code) || (data && typeof data.code === 'string' && data.code) || 'http_' + response.status;
      throw err(code, response.status < 500, { httpStatus: response.status });
    }
    if (!data || typeof data !== 'object') throw err('bad_response', false);
    return data;
  }

  let last = null;   // the last /context
  function rewardFor(m) {
    if (m.highestCleared < ENV.totalStages) return null;
    // The clear that finished stage 600 carried the server's verdict; afterwards /context only says rewardClaimed.
    if (store.reward) return { status: store.reward.status, title: store.reward.title || (m.reward && m.reward.title) || undefined };
    if (m.rewardClaimed) return { status: 'ALREADY_CLAIMED', title: (m.reward && m.reward.title) || undefined };
    return m.reward ? { status: 'OUT_OF_STOCK', title: m.reward.title || undefined } : { status: 'NONE_CONFIGURED' };
  }
  function contextOf(data, override) {
    const m = Object.assign({}, data.stageMode, override || {});
    const lives = data.lives && Number.isInteger(data.lives.count) && data.lives.count >= 0 ? data.lives.count : 0;
    return { rulesetVersion: ENV.rulesetVersion, progressScope: scope, totalStages: m.totalStages, highestCleared: m.highestCleared,
      nextStage: m.nextStage, lives, reward: rewardFor(m) };
  }
  async function readContext() {
    if (!api || !token || !tenant) throw err('stage.launch_required', true);
    const data = await request('/play/games/' + encodeURIComponent(ENV.gameId) + '/context?tenantSlug=' + encodeURIComponent(tenant), { bearer: token });
    const m = data.stageMode;
    // stageMode is sent only for a "Play Stage Mode" launch (boot token mode STAGE_CLEAR); "Game Start" gets null.
    if (!m) throw err('stage.mode_required', true);
    if (m.totalStages !== ENV.totalStages) throw err('stage.total_mismatch', true);
    const h = m.highestCleared;
    if (!Number.isInteger(h) || h < 0 || h > m.totalStages || m.nextStage !== (h >= m.totalStages ? null : h + 1)) throw err('bad_context', false);
    last = data;
    return data;
  }
  // After a definitive refusal their session takes error.context to refresh the Lives it shows.
  async function withContext(e) { try { e.context = contextOf(await readContext()); } catch { /* keep theirs */ } return e; }
  const closed = () => Promise.reject(err('stage.mode_required', true));

  /* ── their contract ── */
  const inflight = {};
  async function getContext(req) {
    if (!gate.stage) return closed();
    const data = await readContext();
    const c = contextOf(data);
    log(`Build v${ENV.build}. /context: cleared ${c.highestCleared}/${c.totalStages}, next ${c.nextStage}, ${c.lives} Lives, ` +
      `${data.stageMode.maxAttemptSeconds} s per attempt (asked for ${req && req.gameId} / ${req && req.rulesetVersion}).`);
    return c;
  }

  function startAttempt(req) {
    if (!gate.stage) return closed();
    const id = req && req.requestId;
    if (typeof id !== 'string' || !id) return Promise.reject(err('stage.invalid_attempt', true));
    if (store.starts[id]) { log(`Start ${id.slice(0, 8)}: answered before, same attempt (no second Life).`); return Promise.resolve(JSON.parse(JSON.stringify(store.starts[id]))); }
    if (inflight[id]) return inflight[id];
    return (inflight[id] = doStart(req).finally(() => { delete inflight[id]; }));
  }
  async function doStart(req) {
    const id = req.requestId, stage = req.stage;
    if (store.sent[id]) {
      // Sent before and the answer never came: the API cannot look it up. Never sent again (a second Life).
      delete store.sent[id]; save();
      log(`Start ${id.slice(0, 8)} for stage ${stage}: earlier answer lost; not resent, Lives re-read.`);
      throw await withContext(err('stage.start_unknown', true));
    }
    store.sent[id] = { stage, at: Date.now() }; save();
    let data;
    try { data = await request('/play/plays', { method: 'POST', body: { bootToken: token, stage } }); }
    catch (e) {
      if (e.definitive) { delete store.sent[id]; save(); throw await withContext(e); }
      throw e;   // unknown: their session keeps the same requestId and asks again (the branch above)
    }
    const sm = data.stageMode, deadline = Date.parse(sm && sm.deadlineAt), expires = Date.parse(data.expiresAt);
    if (typeof data.playToken !== 'string' || !data.playToken || !sm || sm.stage !== stage || !Number.isFinite(deadline) || !(sm.maxAttemptSeconds > 0)) {
      delete store.sent[id]; save(); throw err('bad_response', false);
    }
    if (sm.kind !== 'PAID') log(`Stage ${stage} start is ${sm.kind} (their rules expect a paid start; free replays should be off).`);
    const startedAt = Date.now(), attemptId = (crypto.randomUUID ? crypto.randomUUID() : startedAt + '-' + Math.random().toString(36).slice(2));
    // The local end of the attempt, so a clock difference with the server never gives extra time.
    const end = Math.min(deadline, Number.isFinite(expires) ? expires : Infinity, startedAt + sm.maxAttemptSeconds * 1000);
    store.attempts[attemptId] = { token: data.playToken, stage, startedAt, kind: sm.kind, clear: null, result: null };
    let c;
    try { c = contextOf(await readContext()); }
    catch { c = contextOf(last, { highestCleared: stage - 1, nextStage: stage }); c.lives = Math.max(0, c.lives - 1); log('Lives not re-read after the start; showing the previous balance minus 1 until the next call.'); }
    const response = { attemptId, stage, lifeCost: 1, deadlineAt: new Date(end).toISOString(), context: c };
    store.starts[id] = response; delete store.sent[id]; save();
    log(`Stage ${stage} started (${sm.kind}, ${sm.maxAttemptSeconds} s), ${c.lives} Lives left.`);
    return JSON.parse(JSON.stringify(response));
  }

  function completeAttempt(receipt) {
    if (!gate.stage) return closed();
    const id = receipt && receipt.attemptId;
    if (inflight['c:' + id]) return inflight['c:' + id];
    return (inflight['c:' + id] = doComplete(receipt).finally(() => { delete inflight['c:' + id]; }));
  }
  const STATUS = { CLEARED: 'CLEARED', ALREADY_CLEARED: 'ALREADY_CLEARED', REPLAY: 'ALREADY_CLEARED', TIME_EXCEEDED: 'TIME_EXCEEDED' };
  async function doComplete(receipt) {
    const a = store.attempts[receipt.attemptId];
    if (!a || a.stage !== receipt.stage) throw await withContext(err('stage.invalid_attempt', true));
    if (!a.result) {
      // Their moves on their own engine: every path once, ending where their rules say (their reference-validation.cjs).
      const g = new KanjiPuzzle(KANJI_LEVELS[a.stage - 1]);
      const ok = Array.isArray(receipt.moves) && receipt.moves.length === g.all.size && receipt.moves.every(d => Array.isArray(d) && g.move(d[0], d[1])) && g.state === 'won';
      if (!ok) { log(`Stage ${a.stage}: moves do not solve the stage; not reported.`); throw await withContext(err('stage.invalid_moves', true)); }
      // The same body on every resend (the server answers a repeat with its stored verdict).
      if (!a.clear) { a.clear = { sessionToken: a.token, playTimeMs: Math.max(0, Math.floor(receipt.playTimeMs)) }; save(); }
      let data;
      try { data = await request('/play/stage-clears', { method: 'POST', body: a.clear }); }
      catch (e) {
        log(`Stage ${a.stage} clear not confirmed (${e.code}).`);
        if (e.definitive) { a.clear = null; save(); throw await withContext(e); }
        throw e;   // unknown: their session resends the same receipt
      }
      if (!STATUS[data.status] || data.stage !== a.stage) throw err('bad_response', false);
      a.result = data;
      if (data.reward) store.reward = { status: data.reward.status, title: data.reward.title || null, redeemUrl: data.reward.redeemUrl || null };
      save();
      log(`Stage ${a.stage} clear: ${data.status} (${data.highestCleared}/${data.totalStages} cleared${data.reward ? ', reward ' + data.reward.status : ''}).`);
    }
    const d = a.result;
    let base;
    try { base = await readContext(); } catch { base = last; }
    const m = base.stageMode, h = Math.max(m.highestCleared, d.status === 'TIME_EXCEEDED' ? 0 : d.highestCleared);
    return { status: STATUS[d.status], stage: a.stage, context: contextOf(base, { highestCleared: h, nextStage: h >= m.totalStages ? null : h + 1 }) };
  }

  async function openReward() {
    if (!gate.stage) return closed();
    const r = store.reward;
    let url = null; try { url = r && r.redeemUrl ? new URL(r.redeemUrl) : null; } catch { url = null; }
    const path = url && /^\/coupons\/[^/?#]+$/.exec(url.pathname);
    // Inside the app the frame has no allow-popups: close the game and let the app open the coupon. Outside it, the link.
    if (window.parent !== window) {
      const msg = { type: 'gamebull:close' }; if (path) msg.to = path[0];
      log('Voucher: closing the game into the GameBull app ' + JSON.stringify(msg) + ' (through the loading page relay).');
      window.parent.postMessage(msg, location.origin);
    } else if (url && url.protocol === 'https:') window.open(url.href, '_blank', 'noopener,noreferrer');
    return { opened: true };
  }

  window.GAMEBULL_STAGE_BRIDGE = { getContext, startAttempt, completeAttempt, openReward };
})();
