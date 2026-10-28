// GameBull hooks into the client's page. A classic script the build puts right AFTER their top.js (their last script),
// so their files stay exactly as delivered: their top-level functions (loadLevel, result, confirmPaidRetry,
// submitVerifiedClear, refreshPlatformUI, platformMessage...) are globals this file wraps, and their top-level
// `let`s / `const`s (game, levelIndex, stageSession, dialog, gameAudio...) are shared with every classic script.
// The GameBull shell (main.tsx, a module) talks only to window.HKClient below.
//
// Which flow a launch gets is the SERVER's call, as on Niigata (GameBull's Stage Mode Integration Guide):
//  - /context has `stageMode`: the client's own Stage Mode, exactly as they built it (their TOP, 1-life entry, paid
//    retry, results, all-clear voucher), through window.GAMEBULL_STAGE_BRIDGE (gb/hk-bridge.js). GameBull draws nothing;
//  - `stageMode` is null: the GameBull flow (lobby, tournaments, Score Challenge). A run, as set for this game:
//     - starts at stage 1 (the same stages for every player) and plays their stages in order;
//     - every stage has strokes x 2 s (their path count), shown in a GameBull clock pill; it starts when the stage is
//       on screen with no dialog open (their first-stage guide stays theirs);
//     - 3 hearts. A heart is lost on a reset (their やり直す / R key, on a stage already started), on a dead end (their
//       「もうひと息」 case, reset for them) and when the stage time reaches 0 (0 held 0.7 s); the stage then restarts with
//       its full time. The 3rd heart lost ends the run;
//     - a clear plays their brush reveal (the clock stops on the winning stroke), then the next stage;
//     - score = stages cleared x 1000 + 10 per second left on each cleared stage.
//    Their stage session is never connected in this flow: a run drives it locally (phase / attempt) so their own
//    move(), loadLevel() and clock guards work unchanged; nothing is sent to the bridge.
(function () {
  "use strict";
  var gate = window.__hkGate = window.__hkGate || { stage: false };
  var hooks = { onLock: null, onZero: null, onResume: null, onEnd: null };   // set by the shell
  var HEARTS = 3, STAGE_POINTS = 1000, BONUS_PER_SECOND = 10, SECONDS_PER_STROKE = 2;
  var R = null;            // the current GameBull run, null under the lobby / in their Stage Mode
  var last = null;         // the last run's facts
  var quiet = false;       // under the GameBull board: their music stays stopped
  var devStage = 0;        // localhost build only: ?devSeconds=N gives every stage N seconds (set by the shell)
  var log = function (s) { console.log("[HK-GB] " + s); };

  function stageMs(i) { return (devStage > 0 ? devStage : KANJI_LEVELS[i].edges.length * SECONDS_PER_STROKE) * 1000; }
  function total() { return R ? R.cleared * STAGE_POINTS + R.bonus : 0; }
  function live() { return !!R && !R.held && !R.locked && !R.ended; }
  function deadline() { return R.limitEndsAt ? Math.min(R.stageEndsAt, R.limitEndsAt) : R.stageEndsAt; }
  function remainingMs() {
    if (!R) return 0;
    if (R.zero) return 0;
    if (R.solved) return R.leftAtClear;
    if (R.held || !R.clockOn) return R.limitEndsAt ? Math.min(stageMs(R.stage), Math.max(0, R.limitEndsAt - Date.now())) : stageMs(R.stage);
    return Math.max(0, deadline() - Date.now());
  }

  // Their stage session, driven locally for a run: their move() needs phase 'playing' and an attempt, their
  // loadLevel() needs the attempt's stage, and their frame() ends the stage at attempt.deadlineAt (game.state
  // 'expired', then their result()), which is the run's stage clock.
  function localAttempt(i, phase) {
    stageSession.pendingStart = null; stageSession.pendingClear = null; stageSession.lastResult = null;
    stageSession.attempt = { id: "gamebull-run", stage: i + 1, startedAt: Date.now(), deadlineAt: null };
    stageSession.phase = phase;
  }
  function runLoad(i) {
    localAttempt(i, "playing");
    R.stage = i; R.solved = false; R.clockOn = false; R.zero = false;
    clientLoad(i);   // their loadLevel: board reset, their first-stage guide on stage 1 (once per device)
    if (R.held) stageSession.phase = "ready";
    startClock();
    log("Stage " + (i + 1) + " 「" + KANJI_LEVELS[i].char + "」 loaded: " + Math.round(stageMs(i) / 1000) + " s (" + KANJI_LEVELS[i].edges.length +
      " strokes x " + SECONDS_PER_STROKE + " s); run score " + total() + ", hearts " + R.hearts + ".");
  }
  // The stage clock starts when the stage is on screen and no dialog (their guide) covers it.
  function startClock() {
    if (!R || R.held || R.clockOn || R.locked || R.ended || R.solved || dialog.open) return;
    R.clockOn = true; R.stageEndsAt = Date.now() + stageMs(R.stage);
    stageSession.attempt.deadlineAt = deadline();
  }

  // ---- their functions, wrapped ----
  var clientLoad = loadLevel;
  // Their clear: in a run nothing is reported to the bridge; the run counts it and plays their brush reveal.
  var clientSubmit = submitVerifiedClear;
  submitVerifiedClear = function () {
    if (!R) return clientSubmit.apply(this, arguments);
    if (R.ended || R.solved) return;
    var left = R.clockOn ? Math.max(0, deadline() - Date.now()) : stageMs(R.stage), secs = Math.floor(left / 1000);
    R.solved = true; R.leftAtClear = left;
    stageSession.attempt.deadlineAt = null; stageSession.phase = "submitting";   // their clock stops, their やり直す greys out
    R.cleared++; R.seconds += secs; R.bonus += secs * BONUS_PER_SECOND; R.strokes += game.all.size;
    log("Stage " + (R.stage + 1) + " cleared with " + secs + " s left: +" + STAGE_POINTS + " +" + secs * BONUS_PER_SECOND + "; run: " + R.cleared + " stages, score " + total() + ".");
    gameAudio.clear(); beginVictory();   // their clear sound and brush reveal (their submitVerifiedClear's success path)
    if (R.target > 0 && total() >= R.target) {
      R.locked = true; hooks.onLock && hooks.onLock("target");
      log("Challenge target " + R.target + " reached at " + total() + "; ending in 0.9 s.");
      setTimeout(function () { end("target"); }, 900);
    } else if (R.stage + 1 >= KANJI_LEVELS.length) {
      R.locked = true; hooks.onLock && hooks.onLock("all");
      setTimeout(function () { end("all-cleared"); }, 2700);
    }
  };
  // Their result() (their frame() calls it one beat after the end of a stage) opens their result dialog; in a run the
  // run rules take over.
  var clientResult = result;
  result = function () {
    if (!R) return clientResult.apply(this, arguments);
    if (R.ended) return;
    if (game.state === "won" && R.solved) { if (!R.locked) runLoad(R.stage + 1); return; }   // after their brush reveal
    if (game.state === "lost") {
      if (R.locked) return;
      log("Stage " + (R.stage + 1) + ": dead end (" + game.used.size + "/" + game.all.size + " strokes); it is reset, which costs a heart.");
      loseHeart("dead end");
      var at = R.stage;
      if (!R.locked) setTimeout(function () { if (live() && R.stage === at && game.state === "lost") runLoad(at); }, 600);
      return;
    }
    if (game.state === "expired") timeUp();
  };
  // Their やり直す (button, R key) asks for a paid retry; in a run it resets the stage for a heart (an untouched stage
  // resets for free: nothing changes).
  var clientRetry = confirmPaidRetry;
  confirmPaidRetry = function () {
    if (!R) return clientRetry.apply(this, arguments);
    if (!live() || R.solved || !["ready", "playing"].includes(game.state) || game.used.size === 0) return;
    loseHeart("reset (their やり直す)");
    if (!R.locked) runLoad(R.stage);
  };
  // Their first-stage guide (a dialog, once per device) waits for the GO on a challenge: shown under the 5..1 intro
  // it would hide the countdown. The stage clock starts only once it is closed either way (startClock).
  var clientGuide = maybeShowTutorial;
  maybeShowTutorial = function () { if (R && R.held) return; return clientGuide.apply(this, arguments); };
  // Their header pieces that belong to their Stage Mode stay out of a run: their life count, their tiny GameBull clock
  // (the run's clock is the GameBull pill), their sound button (the GameBull mute is on screen), their ？ (its text is
  // their Stage Mode rules: lives per start / retry, voucher).
  var clientRefresh = refreshPlatformUI;
  refreshPlatformUI = function () {
    clientRefresh.apply(this, arguments);
    if (R) { var c = $("stage-clock"); if (c) c.hidden = true; }
  };
  function runHud(on) {
    [".life-pill", "#sound", "#help"].forEach(function (sel) { var e = document.querySelector(sel); if (e) e.style.visibility = on ? "hidden" : ""; });
    if (!on) { var c = $("stage-clock"); if (c && !stageSession.attempt) c.hidden = true; }
  }
  // Their signature (top-left) goes back to their TOP screen; outside their Stage Mode their TOP is never shown.
  document.addEventListener("click", function (e) {
    if (gate.stage) return;
    var a = e.target && e.target.closest && e.target.closest(".brand");
    if (a) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // A heart lost: the 3rd one ends the run.
  function loseHeart(why) {
    if (!R || R.ended) return;
    R.hearts = Math.max(0, R.hearts - 1);
    log("Heart lost on stage " + (R.stage + 1) + " (" + why + "): " + R.hearts + " left.");
    if (R.hearts <= 0) { R.locked = true; stageSession.phase = "failed"; hooks.onLock && hooks.onLock("hearts"); setTimeout(function () { end("hearts"); }, 700); }
  }
  // Time at 0 (their frame() ended the stage at the attempt's deadline, or the challenge limit passed): hold "0" for
  // 0.7 s (the shell's countdown), then the challenge ends, or a heart is lost and the stage restarts with its full time.
  function timeUp() {
    if (!R || R.locked || R.ended) return;
    var limit = !!R.limitEndsAt && Date.now() >= R.limitEndsAt - 50;
    R.locked = true; R.zero = true; stageSession.phase = "failed"; stageSession.attempt.deadlineAt = null;
    if (dialog.open) close();
    log(limit ? "Challenge time limit reached." : "Stage " + (R.stage + 1) + " time is up.");
    var after = function () {
      if (!R || R.ended) return;
      if (limit) { end("time"); return; }
      R.hearts = Math.max(0, R.hearts - 1);
      log("Heart lost on stage " + (R.stage + 1) + " (time up): " + R.hearts + " left.");
      if (R.hearts <= 0) { hooks.onLock && hooks.onLock("hearts"); end("hearts"); return; }
      R.locked = false; R.zero = false;
      runLoad(R.stage);
      hooks.onResume && hooks.onResume();
    };
    if (limit) hooks.onLock && hooks.onLock("time");   // a stage time-up with hearts left is not the run's end
    if (hooks.onZero) hooks.onZero(after); else setTimeout(after, 700);
  }
  function end(reason) {
    if (!R || R.ended) return;
    R.ended = true; R.locked = true;
    stageSession.phase = "failed"; if (stageSession.attempt) stageSession.attempt.deadlineAt = null;
    if (dialog.open) close();
    quiet = true; gameAudio.pause();
    last = { reason: reason, hearts: R.hearts, stages: R.cleared, stagePoints: R.cleared * STAGE_POINTS, seconds: R.seconds, bonus: R.bonus,
      strokes: R.strokes, total: total(), reached: R.stage + 1, playMs: Math.round(performance.now() - R.startedAt) };
    log("Run end '" + reason + "': " + last.stages + " stages cleared (x" + STAGE_POINTS + " = " + last.stagePoints + "), " + last.seconds +
      " s left in total (x" + BONUS_PER_SECOND + " = " + last.bonus + "), total " + last.total + "; last stage on screen " + last.reached + ".");
    hooks.onEnd && hooks.onEnd(last);
  }
  setInterval(function () {
    if (!R) return;
    startClock();
    // The challenge limit can also pass during their brush reveal (no stage clock then).
    if (R.limitEndsAt && Date.now() >= R.limitEndsAt && !R.locked && !R.ended) timeUp();
  }, 100);

  // ---- sound ----
  // The GameBull mute is their own all-sound switch (their 「すべて消音」: BGM and brush / effect volumes to 0, the
  // volumes remembered in their rememberedVolumes, saved under their key 'kanji-hitofude-audio'). Their default is ON.
  // Under the GameBull board their music stays stopped: their unlock (on every tap, on focus) is held there.
  var theirUnlock = gameAudio.unlock;
  gameAudio.unlock = function () { if (quiet && !gate.stage) return Promise.resolve(false); return theirUnlock.apply(gameAudio, arguments); };
  function soundOn() { return !!(gameAudio.settings.bgm || gameAudio.settings.brush); }
  function setSound(on) {
    ["bgm", "brush"].forEach(function (k) {
      if (on) gameAudio.setVolume(k, rememberedVolumes[k] || (k === "bgm" ? .24 : .55));
      else { if (gameAudio.settings[k]) rememberedVolumes[k] = gameAudio.settings[k]; gameAudio.setVolume(k, 0); }
    });
    if (on) gameAudio.unlock();
  }

  // ---- their Stage Mode: the server's error codes in words ----
  // Their platformMessage() knows their own codes; for the others the bridge sends gbMessage (gb/hk-bridge.js).
  var clientMessage = platformMessage, generic = clientMessage({ code: "\u0000" });
  platformMessage = function (error) {
    var theirs = clientMessage(error);
    return theirs === generic && error && error.gbMessage ? error.gbMessage : theirs;
  };

  // ---- localhost autoplay: their own move(), along an Euler path found on their board (Hierholzer) ----
  var plan = null;
  function solveFromHere() {
    var adj = {}, used = new Set(game.used), k = function (p) { return p[0] + "," + p[1]; };
    game.edges.forEach(function (e) {
      var key = game.key(e[0], e[1]); if (used.has(key)) return;
      (adj[k(e[0])] = adj[k(e[0])] || []).push([e[1], key]); (adj[k(e[1])] = adj[k(e[1])] || []).push([e[0], key]);
    });
    var stack = [game.position.slice()], path = [];
    while (stack.length) {
      var v = stack[stack.length - 1], list = adj[k(v)] || [], next = null;
      while (list.length) { var c = list.pop(); if (!used.has(c[1])) { used.add(c[1]); next = c[0]; break; } }
      if (next) stack.push(next); else path.push(stack.pop());
    }
    path.reverse();
    if (path.length - 1 !== game.all.size - game.used.size) return null;
    var moves = []; for (var i = 1; i < path.length; i++) moves.push([path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]]);
    return moves;
  }

  window.HKClient = {
    hooks: hooks,
    // Under the lobby: stage 1 on their game screen (their TOP never shows in the GameBull flow), no run.
    park: function () {
      R = null; gate.stage = false; quiet = false;
      if (dialog.open) close();
      runHud(false);
      stageSession.phase = "boot"; stageSession.attempt = null;
      showPlayArea();
      victorySerial++; completionInk.cancel();
      levelIndex = 0; game = new KanjiPuzzle(KANJI_LEVELS[0]); reset(); resize();
    },
    // A run: stage 1 on, strokes x 2 s per stage; a challenge may cap the whole run (limitMs) and holds the board under
    // the 5..1 GO intro (hold).
    start: function (opt) {
      opt = opt || {};
      devStage = opt.devStageSeconds || 0;
      R = { target: opt.target || 0, limitMs: opt.limitMs || 0, limitEndsAt: 0, held: !!opt.hold, locked: false, zero: false, ended: false,
        hearts: HEARTS, stage: 0, clockOn: false, stageEndsAt: 0, solved: false, leftAtClear: 0, cleared: 0, seconds: 0, bonus: 0, strokes: 0,
        startedAt: performance.now() };
      gate.stage = false; plan = null; quiet = false;
      if (dialog.open) close();
      showPlayArea(); runHud(true);
      runLoad(0);
      gameAudio.unlock().then(function () { gameAudio.begin(); });   // their entrance cue (their TOP はじめる)
      if (!R.held) this.go();
    },
    go: function () {
      if (!R) return;
      R.held = false; R.startedAt = performance.now();
      if (stageSession.phase === "ready") stageSession.phase = "playing";
      if (R.limitMs) R.limitEndsAt = Date.now() + R.limitMs;
      clientGuide();   // their guide, if this device has not seen it (stage 1 only, their rule)
      log("Run started at stage " + (R.stage + 1) + (R.limitMs ? "; challenge limit " + Math.round(R.limitMs / 1000) + " s." : "."));
      startClock();
    },
    totalScore: function () { return R ? total() : last ? last.total : 0; },
    remaining: function () { return R && !R.ended ? remainingMs() / 1000 : 0; },
    clockRunning: function () { return !!R && R.clockOn && !R.solved && !R.zero && !R.ended; },
    isRunning: live,
    hearts: function () { return R ? R.hearts : last ? last.hearts : HEARTS; },
    soundOn: soundOn,
    setSound: setSound,
    // The server says Stage Mode (/context stageMode): the client's own Stage Mode, exactly as they built it, through
    // the bridge (their TOP is already on screen: はじめる opens their 1-life entry).
    enterStageMode: function () {
      R = null; gate.stage = true; quiet = false; plan = null;
      runHud(false);
      if ($("top-screen").hidden) goPlatformHome();
      log("Stage Mode launch: the client's own Stage Mode takes over (their TOP, their GAMEBULL_STAGE_BRIDGE session).");
    },
    autoStep: function () {
      if (!live() || R.solved || animation || dialog.open || !["ready", "playing"].includes(game.state)) return;
      if (!plan || plan.stage !== R.stage || plan.at !== game.used.size) { var p = solveFromHere(); plan = p ? { stage: R.stage, at: game.used.size, moves: p } : null; }
      if (!plan || !plan.moves.length) { var any = game.available()[0]; if (any) move(any[0], any[1]); return; }
      var d = plan.moves.shift(); plan.at++; move(d[0], d[1]);
    },
  };
  window.dispatchEvent(new Event("hkclient-ready"));
})();
