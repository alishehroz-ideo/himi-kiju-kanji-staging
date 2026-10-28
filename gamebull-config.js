'use strict';
// GameBull-owned deployment configuration. No API secret or boot token belongs here.
window.GAMEBULL_GAME_CONFIG=Object.freeze({
  gameId:'HIMI_KIJU_KANJI_HITOFUDE', // Proposed identifier: confirm/register in GameBull.
  rulesetVersion:'himi-kanji600-challenge2-20261027',
  totalStages:600,
  lifeCostPerAttempt:1,
  freeReplays:false,
  allowStageSelection:false,
  enableLocalDemo:false, // Strict loopback only. Delivery game/ sets this to false.
  localDemoInitialLives:10,
  requestTimeoutMs:15000
});
