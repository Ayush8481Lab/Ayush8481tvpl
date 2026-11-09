// ─── Diagnostic state (module-scope, resets on isolate restart) ───
let schemaReady = false;
let schemaError = null;
let lastInsertOk = null;
let lastInsertError = null;

// ============================================================
// BLOCKED / ERROR PAGE (shared by token-error + browser block)
// ============================================================
function buildBlockedPage({ asn, org, locationHtml, serverTime, descHtml }) {
  const desc = descHtml || `This content is <strong>not allowed in a web browser</strong>.<br>
      <strong>Solution :</strong> Open in IPTV player —
      <span class="player-hint">TiviMate</span>
      <span class="player-hint">OTT Navigator</span>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AyushTV8481.m3u</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }

  :root {
    --bg: #08060f;
    --text: #ece9f7;
    --muted: rgba(236,233,247,.55);
    --purple: #a855f7;
    --pink: #ec4899;
  }

  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Inter, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }

  .page {
    position: fixed; inset: 0;
    z-index: 2;
    overflow-y: auto;
    overflow-x: hidden;
    transition: opacity .7s ease, visibility .7s ease;
  }
  .page.hidden {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    z-index: 1;
  }

  .bg-layer {
    position: fixed; inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(100px);
    mix-blend-mode: screen;
    will-change: transform;
    animation: float 24s ease-in-out infinite;
  }

  @keyframes float {
    0%, 100% { transform: translate3d(0,0,0) scale(1); }
    33%      { transform: translate3d(80px,-60px,0) scale(1.18); }
    66%      { transform: translate3d(-66px,50px,0) scale(.88); }
  }

  .grid {
    position: absolute; inset: 0;
    -webkit-mask-image: radial-gradient(circle at 50% 45%, #000 5%, transparent 76%);
    mask-image: radial-gradient(circle at 50% 45%, #000 5%, transparent 76%);
  }

  .particles {
    position: absolute; inset: 0;
    overflow: hidden;
  }
  .particles i {
    position: absolute;
    left: var(--x);
    top: var(--y);
    width: var(--s);
    height: var(--s);
    border-radius: 50%;
    background: hsl(var(--hue) 92% 74%);
    box-shadow: 0 0 10px hsl(var(--hue) 92% 66% / .85);
    opacity: 0;
    will-change: transform, opacity;
  }

  .noise {
    position: absolute; inset: 0;
    mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }

  .vignette {
    position: absolute; inset: 0;
  }

  #page1 .aurora {
    position: absolute;
    top: -60%; left: -30%;
    width: 160%; height: 220%;
    mix-blend-mode: screen;
    filter: blur(70px);
    opacity: .6;
    background: conic-gradient(from 0deg at 50% 50%,
      transparent 0deg,
      rgba(168,85,247,.18) 55deg,
      transparent 120deg,
      rgba(236,72,153,.15) 175deg,
      transparent 235deg,
      rgba(34,211,238,.12) 295deg,
      transparent 360deg);
    animation: p1AuroraSpin 55s linear infinite;
  }
  @keyframes p1AuroraSpin { to { transform: rotate(360deg); } }

  #page1 .mesh {
    position: absolute; inset: 0;
    mix-blend-mode: screen;
    background:
      radial-gradient(ellipse 80% 55% at 18% 8%,  rgba(124,58,237,.28), transparent 62%),
      radial-gradient(ellipse 65% 55% at 82% 92%, rgba(219,39,119,.24), transparent 62%),
      radial-gradient(ellipse 55% 45% at 50% 50%, rgba(14,116,144,.2),  transparent 62%),
      radial-gradient(ellipse 45% 40% at 88% 18%, rgba(245,158,11,.1),  transparent 65%);
    animation: p1MeshShift 22s ease-in-out infinite alternate;
  }
  @keyframes p1MeshShift {
    0%   { transform: translate3d(0,0,0) scale(1); }
    100% { transform: translate3d(-30px,20px,0) scale(1.06); }
  }

  #page1 .b1 { width: 520px; height: 520px; top: -190px; left: -170px;
               background: radial-gradient(circle, #7c3aed, transparent 70%); opacity: .55; }
  #page1 .b2 { width: 580px; height: 580px; bottom: -230px; right: -190px;
               background: radial-gradient(circle, #db2777, transparent 70%); opacity: .55; animation-delay: -8s; }
  #page1 .b3 { width: 460px; height: 460px; top: 38%; left: 55%;
               background: radial-gradient(circle, #0e7490, transparent 70%); opacity: .45; animation-delay: -14s; }
  #page1 .b4 { width: 300px; height: 300px; top: 6%; right: 8%;
               background: radial-gradient(circle, #f59e0b, transparent 70%); opacity: .25; animation-delay: -5s; }

  #page1 .grid {
    background-image:
      linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
    background-size: 62px 62px;
    animation: p1GridDrift 40s linear infinite;
  }
  @keyframes p1GridDrift {
    to { background-position: 62px 62px, 62px 62px; }
  }

  #page1 .particles i {
    animation: p1Rise var(--dur) ease-in-out infinite;
    animation-delay: var(--del);
  }
  @keyframes p1Rise {
    0%, 100% { opacity: 0; transform: translate3d(0, 0, 0) scale(.4); }
    18%, 82% { opacity: .85; }
    50%      { opacity: 1; transform: translate3d(34px, -46px, 0) scale(1); }
  }

  #page1 .noise { opacity: .04; }

  #page1 .vignette {
    background: radial-gradient(ellipse at 50% 45%, transparent 30%, rgba(3,2,10,.85) 100%);
  }

  #page1 .rotating-glow {
    position: absolute;
    top: 50%; left: 50%;
    width: 520px; height: 520px;
    margin: -260px 0 0 -260px;
    border-radius: 50%;
    background: conic-gradient(from 0deg,
      rgba(168,85,247,.3),
      rgba(236,72,153,.24),
      rgba(34,211,238,.18),
      rgba(245,158,11,.16),
      rgba(168,85,247,.3));
    filter: blur(85px);
    z-index: 1;
    pointer-events: none;
    animation: glowSpin 34s linear infinite;
  }
  @keyframes glowSpin { to { transform: rotate(360deg); } }

  #page2 .dog-gif {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    filter: saturate(1.12) contrast(1.03) brightness(.98);
    transform: scale(1.04);
    animation: dogKenBurns 26s ease-in-out infinite alternate;
    user-select: none;
    pointer-events: none;
  }
  @keyframes dogKenBurns {
    0%   { transform: scale(1.04) translate3d(0, 0, 0); }
    100% { transform: scale(1.12) translate3d(-1.5%, -1.5%, 0); }
  }

  #page2 .dog-scrim {
    position: absolute; inset: 0;
    background:
      radial-gradient(ellipse at 50% 45%,
        rgba(0,0,0,.14) 0%,
        rgba(0,0,0,.30) 62%,
        rgba(0,0,0,.52) 100%),
      linear-gradient(180deg, rgba(0,0,0,.18), rgba(0,0,0,.34));
  }

  #page2 .scanlines {
    position: absolute; inset: 0;
    pointer-events: none;
    background: repeating-linear-gradient(
      0deg,
      rgba(0,0,0,.10) 0px,
      rgba(0,0,0,.10) 1px,
      transparent 1px,
      transparent 3px
    );
    animation: scanlineMove 8s linear infinite;
    opacity: .35;
  }
  @keyframes scanlineMove {
    from { background-position: 0 0; }
    to   { background-position: 0 100vh; }
  }

  #page2 .scan-beam {
    position: absolute;
    left: 0; right: 0;
    height: 150px;
    pointer-events: none;
    background: linear-gradient(180deg,
      transparent,
      rgba(255,255,255,.04),
      rgba(255,255,255,.07),
      rgba(255,255,255,.04),
      transparent);
    animation: beamMove 6.5s ease-in-out infinite;
  }
  @keyframes beamMove {
    0%, 100% { top: -150px; }
    50%      { top: 100%; }
  }

  #page2 .noise { opacity: .05; }

  #page2 .vignette {
    background: radial-gradient(ellipse at 50% 45%, transparent 22%, rgba(0,0,0,.55) 100%);
  }

  #page1 {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .provider-card {
    position: relative;
    z-index: 2;
    width: 100%;
    max-width: 380px;
    padding: 42px 32px 36px;
    border-radius: 22px;
    text-align: center;
    background: rgba(255,255,255,.045);
    border: 1px solid rgba(255,255,255,.09);
    backdrop-filter: blur(26px) saturate(160%);
    -webkit-backdrop-filter: blur(26px) saturate(160%);
    box-shadow:
      0 34px 90px -30px rgba(0,0,0,.9),
      0 0 0 1px rgba(255,255,255,.04) inset,
      0 0 100px -25px rgba(168,85,247,.42);
    animation: cardIn .85s cubic-bezier(.16,1,.3,1) both;
  }

  .provider-card::before {
    content: "";
    position: absolute;
    top: -1px; left: 16%; right: 16%;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--purple), var(--pink), transparent);
  }

  @keyframes cardIn {
    from { opacity: 0; transform: translateY(28px) scale(.97); }
    to   { opacity: 1; transform: none; }
  }

  .tv-icon-wrap {
    position: relative;
    width: 96px;
    height: 96px;
    margin: 0 auto 26px;
    display: grid;
    place-items: center;
    border-radius: 24px;
    background: linear-gradient(135deg, rgba(168,85,247,.24), rgba(236,72,153,.15));
    border: 1px solid rgba(196,181,253,.3);
    box-shadow:
      0 0 40px rgba(168,85,247,.4),
      inset 0 1px 0 rgba(255,255,255,.14);
  }
  .tv-icon-wrap::after {
    content: "";
    position: absolute;
    inset: -12px;
    border-radius: 30px;
    border: 1px solid rgba(168,85,247,.2);
    animation: haloPulse 4s ease-out infinite;
  }
  @keyframes haloPulse {
    0%   { transform: scale(.94); opacity: .85; }
    100% { transform: scale(1.18); opacity: 0; }
  }
  .tv-icon-wrap svg {
    width: 46px; height: 46px;
    stroke: url(#tvGrad);
    fill: none;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 10px rgba(196,181,253,.4));
  }

  .file-name {
    margin: 0 0 30px;
    font-size: clamp(24px, 5.5vw, 30px);
    font-weight: 800;
    letter-spacing: -.03em;
    line-height: 1.15;
    background: linear-gradient(100deg, #fff 10%, #c4b5fd 55%, #f9a8d4 92%);
    -webkit-background-clip: text; background-clip: text;
    color: transparent;
    word-break: break-word;
  }

  .load-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    padding: 16px 24px;
    font: inherit;
    font-size: 15px;
    font-weight: 800;
    letter-spacing: .01em;
    color: #fff;
    border: 0;
    border-radius: 12px;
    cursor: pointer;
    overflow: hidden;
    isolation: isolate;
    background: linear-gradient(135deg, var(--purple), var(--pink) 58%, #f97316);
    box-shadow:
      0 14px 40px -10px rgba(168,85,247,.85),
      0 0 0 1px rgba(255,255,255,.16) inset,
      0 -3px 0 rgba(0,0,0,.28) inset;
    transition: transform .28s cubic-bezier(.16,1,.3,1),
                box-shadow .28s ease;
  }
  .load-btn::after {
    content: "";
    position: absolute; top: 0; left: -130%;
    width: 65%; height: 100%;
    background: linear-gradient(100deg, transparent, rgba(255,255,255,.55), transparent);
    transform: skewX(-22deg);
    animation: sweep 3.4s ease-in-out infinite;
  }
  @keyframes sweep {
    0%, 58% { left: -130%; }
    100%    { left: 165%; }
  }
  .load-btn:hover {
    transform: translateY(-2px) scale(1.01);
    box-shadow:
      0 20px 55px -10px rgba(236,72,153,.9),
      0 0 0 1px rgba(255,255,255,.26) inset,
      0 -3px 0 rgba(0,0,0,.28) inset;
  }
  .load-btn:active { transform: translateY(0) scale(.99); }
  .load-btn:focus-visible { outline: 2px solid #c4b5fd; outline-offset: 4px; }
  .load-btn svg {
    width: 17px; height: 17px;
    fill: currentColor;
    flex-shrink: 0;
  }

  #page2 {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .error-content {
    position: relative;
    z-index: 2;
    width: 100%;
    max-width: 620px;
    text-align: center;
    animation: errIn .9s cubic-bezier(.16,1,.3,1) both;
  }

  .error-content::before {
    content: "";
    position: absolute;
    inset: -34px -46px;
    z-index: -1;
    border-radius: 44px;
    background: radial-gradient(ellipse at center,
      rgba(0,0,0,.58) 0%,
      rgba(0,0,0,.42) 45%,
      rgba(0,0,0,.14) 72%,
      transparent 88%);
    filter: blur(16px);
    pointer-events: none;
  }

  @keyframes errIn {
    from { opacity: 0; transform: translateY(28px) scale(.97); }
    to   { opacity: 1; transform: none; }
  }

  .error-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: .24em;
    text-transform: uppercase;
    color: #fecaca;
    background: rgba(0,0,0,.35);
    border: 1px solid rgba(255,255,255,.22);
    padding: 6px 15px;
    border-radius: 999px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  .led {
    width: 6px; height: 6px; border-radius: 50%;
    background: #ef4444;
    box-shadow: 0 0 9px #ef4444;
    animation: blink 1.7s ease-in-out infinite;
  }
  @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: .3; } }

  .error-code {
    font-size: clamp(96px, 22vw, 168px);
    font-weight: 900;
    line-height: .92;
    letter-spacing: -.06em;
    margin: 18px 0 8px;
    background: linear-gradient(115deg, #fecaca 4%, #f472b6 36%, #a855f7 70%, #22d3ee 100%);
    -webkit-background-clip: text; background-clip: text;
    color: transparent;
    filter: drop-shadow(0 6px 18px rgba(0,0,0,.9))
            drop-shadow(0 0 34px rgba(0,0,0,.75));
  }

  .error-title {
    margin: 0 0 14px;
    font-size: clamp(24px, 5vw, 34px);
    font-weight: 800;
    letter-spacing: -.02em;
    color: #ffffff;
    text-shadow:
      0 2px 8px rgba(0,0,0,.95),
      0 0 22px rgba(0,0,0,.85);
  }

  .error-desc {
    margin: 0 auto;
    max-width: 520px;
    font-size: 14.5px;
    line-height: 1.85;
    color: rgba(255,255,255,.9);
    text-shadow:
      0 1px 6px rgba(0,0,0,.95),
      0 0 16px rgba(0,0,0,.8);
  }

  .error-desc strong {
    color: #f9a8d4;
    font-weight: 800;
  }

  .player-hint {
    display: inline-block;
    padding: 2px 9px;
    margin: 2px 3px 0;
    border-radius: 6px;
    background: rgba(168,85,247,.16);
    border: 1px solid rgba(196,181,253,.38);
    color: #e9d5ff;
    font-weight: 700;
    font-size: 0.92em;
    white-space: nowrap;
    text-shadow: 0 1px 2px rgba(0,0,0,.9);
  }

  .eq-stage {
    position: relative;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 4px;
    height: 70px;
    max-width: 420px;
    margin: 34px auto 0;
    padding: 0 6px;
  }

  .eq-stage::before {
    content: "";
    position: absolute;
    left: 0; right: 0; bottom: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,.28), transparent);
  }

  .eq {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 4px;
    width: 100%;
    height: 100%;
  }

  .eq span {
    flex: 1;
    max-width: 7px;
    height: 100%;
    border-radius: 99px;
    background: linear-gradient(180deg, #67e8f9, #a855f7 52%, #f472b6);
    box-shadow:
      0 0 10px rgba(168,85,247,.55),
      0 0 4px rgba(244,114,182,.6);
    transform: scaleY(.1);
    transform-origin: bottom;
    animation: bounce var(--d) ease-in-out infinite alternate;
    animation-delay: var(--del);
  }

  @keyframes bounce {
    0%   { transform: scaleY(.08); opacity: .55; }
    35%  { transform: scaleY(.85); opacity: .9; }
    100% { transform: scaleY(1);   opacity: 1; }
  }

  /* ============================================================
     REQUESTED FROM INFO — pure light green (hacker style)
     Values are server-injected from request.cf, frozen at the
     moment the request was received.
  ============================================================ */
  .request-info {
    margin: 28px auto 0;
    max-width: 640px;
    padding: 0 8px;
    background: transparent;
    text-align: center;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: clamp(11px, 2.6vw, 13px);
    line-height: 1.9;
    letter-spacing: .02em;
    color: #4ade80;
    text-shadow:
      0 0 10px rgba(74, 222, 128, 0.55),
      0 0 22px rgba(74, 222, 128, 0.25),
      0 1px 3px rgba(0,0,0,.95);
    animation: infoIn .9s cubic-bezier(.16,1,.3,1) .35s both;
  }

  @keyframes infoIn {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: none; }
  }

  .request-info .ri-line { display: block; }
  .request-info .ri-asn {
    color: #22c55e;
    font-weight: 800;
  }
  .request-info .ri-org {
    color: #4ade80;
    font-weight: 700;
  }
  .request-info .ri-loc {
    color: #86efac;
    font-weight: 500;
  }
  .request-info .ri-time {
    color: #22c55e;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 420px) {
    .provider-card { padding: 34px 24px 28px; border-radius: 18px; }
    .tv-icon-wrap { width: 82px; height: 82px; border-radius: 20px; margin-bottom: 22px; }
    .tv-icon-wrap svg { width: 40px; height: 40px; }
    .file-name { margin-bottom: 26px; }
    #page1 .rotating-glow { width: 380px; height: 380px; margin: -190px 0 0 -190px; }
    .error-content::before { inset: -26px -20px; border-radius: 32px; }
    .eq-stage { height: 56px; max-width: 340px; gap: 3px; }
    .eq { gap: 3px; }
    .request-info { font-size: 11px; padding: 0 4px; }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: .01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .01ms !important;
    }
  }
</style>
</head>
<body>

<audio id="audio" loop preload="auto"
       src="https://p.scdn.co/mp3-preview/c2bad324c332e74b24b59299da9d6bfc410e299d"></audio>

<div class="page" id="page1">
  <div class="bg-layer" aria-hidden="true">
    <div class="aurora"></div>
    <div class="mesh"></div>
    <div class="blob b1"></div>
    <div class="blob b2"></div>
    <div class="blob b3"></div>
    <div class="blob b4"></div>
    <div class="grid"></div>
    <div class="particles" data-page="1"></div>
    <div class="noise"></div>
    <div class="vignette"></div>
  </div>

  <div class="rotating-glow" aria-hidden="true"></div>

  <div class="provider-card">
    <div class="tv-icon-wrap">
      <svg viewBox="0 0 24 24">
        <defs>
          <linearGradient id="tvGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#c4b5fd"/>
            <stop offset="100%" stop-color="#f9a8d4"/>
          </linearGradient>
        </defs>
        <rect x="2.2" y="6.4" width="19.6" height="12.6" rx="2.4"/>
        <path d="M7.2 2.8l4.8 3.6 4.8-3.6"/>
        <path d="M8.6 22h6.8"/>
        <path d="M9.6 10.4h4.8"/>
      </svg>
    </div>

    <h1 class="file-name">AyushTV8481.m3u</h1>

    <button class="load-btn" id="loadBtn" type="button">
      <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      <span>Load Playlist</span>
    </button>
  </div>
</div>

<div class="page hidden" id="page2">
  <div class="bg-layer" aria-hidden="true">
    <img
      class="dog-gif"
      src="https://media.tenor.com/fjFefVXbjosAAAAM/funny-dog-dance-dancing-dog.gif"
      alt=""
      loading="eager"
      draggable="false"
    />
    <div class="dog-scrim"></div>
    <div class="scanlines"></div>
    <div class="scan-beam"></div>
    <div class="noise"></div>
    <div class="vignette"></div>
  </div>

  <div class="error-content">
    <span class="error-badge"><span class="led"></span>403 · Forbidden</span>
    <div class="error-code">403</div>
    <h1 class="error-title">Access Denied</h1>
    <p class="error-desc">${desc}</p>

    <div class="eq-stage" aria-hidden="true">
      <div class="eq" id="eq"></div>
    </div>

    <div class="request-info">
      <div class="ri-line">
        Requested from <span class="ri-asn">${asn}</span> <span class="ri-org">${org}</span>${locationHtml}
      </div>
      <div class="ri-line">
        at <span class="ri-time">${serverTime}</span>
      </div>
    </div>
  </div>
</div>

<script>
(function () {
  "use strict";

  const audio   = document.getElementById('audio');
  const loadBtn = document.getElementById('loadBtn');
  const page1   = document.getElementById('page1');
  const page2   = document.getElementById('page2');
  const eq      = document.getElementById('eq');

  audio.loop   = true;
  audio.volume = 0.85;

  document.querySelectorAll('.particles').forEach(function (layer) {
    for (let i = 0; i < 46; i++) {
      const p = document.createElement('i');
      p.style.setProperty('--x',   (Math.random() * 100).toFixed(2) + '%');
      p.style.setProperty('--y',   (Math.random() * 100).toFixed(2) + '%');
      p.style.setProperty('--s',   (1.2 + Math.random() * 2.4).toFixed(2) + 'px');
      p.style.setProperty('--dur', (9 + Math.random() * 14).toFixed(2) + 's');
      p.style.setProperty('--del', (-Math.random() * 20).toFixed(2) + 's');
      p.style.setProperty('--hue', Math.floor(260 + Math.random() * 100));
      layer.appendChild(p);
    }
  });

  const BAR_COUNT = 28;
  for (let i = 0; i < BAR_COUNT; i++) {
    const bar = document.createElement('span');
    const centreBias = 1 - Math.abs((i / (BAR_COUNT - 1)) - 0.5) * 0.9;
    const dur = (0.55 + Math.random() * 0.85) / centreBias;
    bar.style.setProperty('--d',   dur.toFixed(2) + 's');
    bar.style.setProperty('--del', (-Math.random() * 1.6).toFixed(2) + 's');
    eq.appendChild(bar);
  }

  let triggered = false;

  loadBtn.addEventListener('click', function () {
    if (triggered) return;
    triggered = true;

    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(function () {});

    page1.classList.add('hidden');
    page2.classList.remove('hidden');

    audio.addEventListener('ended', function () {
      audio.currentTime = 0;
      audio.play().catch(function () {});
    });
  });

  document.addEventListener('click', function () {
    if (triggered && audio.paused) audio.play().catch(function () {});
  });

  audio.addEventListener('pause', function () {
    if (triggered && !audio.ended) {
      setTimeout(function () {
        if (triggered && audio.paused) audio.play().catch(function () {});
      }, 350);
    }
  });
})();
</script>
</body>
</html>`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathParts = url.pathname.substring(1).split('/');

    let pathToken = "";
    let action = "";

    if (pathParts[0] === 'credit') {
        action = 'credit';
        pathToken = pathParts[1];
    } else {
        pathToken = pathParts[0];
        action = pathParts[1];
    }

    const workerBase = `${url.origin}/${pathToken}`;

    if (!pathToken) {
      return new Response("Token required. Format: /<token> or /credit/<token>", { status: 400 });
    }

    // ============================================================
    // SHARED HELPERS (moved up so token-error page can use them)
    // ============================================================
    const nowMs = Date.now();
    const istDateObj = new Date(nowMs + 19800000);
    const istDateString = istDateObj.toISOString().split('T')[0];
    const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    const buildBlockPageData = () => {
      const asnStr = request.cf?.asn ? `AS${request.cf.asn}` : 'Unknown ASN';
      const orgStr = request.cf?.asOrganization || 'Unknown Provider';
      const cityStr = request.cf?.city || '';
      const regionStr = request.cf?.region || '';
      const countryStr = request.cf?.country || '';
      let locStr = [cityStr, regionStr].filter(Boolean).join(', ');
      if (!locStr && countryStr) locStr = countryStr;
      const locationHtml = locStr ? `, <span class="ri-loc">${escapeHtml(locStr)}</span>` : '';

      const istNow = new Date(nowMs + 19800000);
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const pad2 = (n) => String(n).padStart(2, '0');
      const hh = istNow.getUTCHours();
      const ampm = hh >= 12 ? 'pm' : 'am';
      const h12 = hh % 12 || 12;
      const serverTime = `${pad2(istNow.getUTCDate())} ${months[istNow.getUTCMonth()]} ${istNow.getUTCFullYear()}, ${pad2(h12)}:${pad2(istNow.getUTCMinutes())}:${pad2(istNow.getUTCSeconds())} ${ampm} IST`;

      return { asn: escapeHtml(asnStr), org: escapeHtml(orgStr), locationHtml, serverTime };
    };

    // ============================================================
    // 1. Verify Access Token — invalid token → same blocked page
    // ============================================================
    try {
      const accessReq = await fetch("https://raw.githubusercontent.com/Ayush8481Lab/Sar/refs/heads/main/app/data/access.json", {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const accessData = await accessReq.json();
      if (!accessData.tokens || !accessData.tokens.includes(pathToken)) {
        const data = buildBlockPageData();
        const html = buildBlockedPage({
          ...data,
          descHtml: 'You are <strong>not allowed</strong> access this content.<br>Please take permission from <strong>Developer</strong>.'
        });
        return new Response(html, {
          status: 403,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "CDN-Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"
          }
        });
      }
    } catch (err) {
      return new Response("Error validating access token.", { status: 500 });
    }

    // ============================================================
    // 2. BLOCK DATA CENTER PROVIDERS (Amazon / Cloudflare / Google)
    // ============================================================
    const BLOCKED_KEYWORDS = ["amazon", "cloudflare", "google"];
    const asOrgRaw = (request.cf?.asOrganization || '').toLowerCase();
    const isBlockedOrg = BLOCKED_KEYWORDS.some(kw => asOrgRaw.includes(kw));
    const allowBypass = url.searchParams.get('allow') === '1';

    if (isBlockedOrg && !allowBypass) {
      return new Response(
        `Access denied. Requests from ${request.cf?.asOrganization || 'data centers'} are not permitted.`,
        {
          status: 403,
          headers: {
            "Content-Type": "text/plain",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    // ============================================================
    // D1 BINDING CHECK + SCHEMA INIT
    // ============================================================
    const hasD1 = !!(env && env.LOGS_DB);
    if (hasD1 && !schemaReady) {
      try {
        await env.LOGS_DB.prepare(
          "CREATE TABLE IF NOT EXISTS logs (" +
          "id INTEGER PRIMARY KEY AUTOINCREMENT," +
          "token TEXT NOT NULL," +
          "date TEXT NOT NULL," +
          "ts TEXT NOT NULL," +
          "ua TEXT," +
          "ip TEXT," +
          "geo TEXT," +
          "action TEXT," +
          "colo TEXT" +
          ")"
        ).run();
        await env.LOGS_DB.prepare(
          "CREATE INDEX IF NOT EXISTS idx_logs_token_date ON logs(token, date)"
        ).run();
        await env.LOGS_DB.prepare(
          "CREATE INDEX IF NOT EXISTS idx_logs_date ON logs(date)"
        ).run();
        schemaReady = true;
        schemaError = null;
      } catch (e) {
        schemaError = String(e && e.message ? e.message : e);
      }
    }

    // ============================================================
    // CLIENT DETECTION
    // ============================================================
    const uaRaw = request.headers.get('user-agent') || '';
    const uaLower = uaRaw.toLowerCase();
    const acceptHeader = (request.headers.get('accept') || '').toLowerCase();
    const secFetchDest = request.headers.get('sec-fetch-dest');
    const isPlayerUA = /tivimate|exoplayer|vlc|kodi|iptv|smarters|player|mpv|ffmpeg|lavf|libvlc|miplay|xj/;
    const isBrowser = !isPlayerUA.test(uaLower) && ((secFetchDest === 'document') || acceptHeader.includes('text/html'));
    const forceNoCache = url.searchParams.get('nocache') === '1';
    const isDebug = url.searchParams.get('debug') === '1';

    // ============================================================
    // LOG READ / WRITE
    // ============================================================
    const cacheKey = (token, date) => `https://dummy.internal.local/logs/${token}/${date}`;

    const getLogsForDate = async (token, dateStr) => {
      if (hasD1 && schemaReady) {
        try {
          const res = await env.LOGS_DB.prepare(
            "SELECT ts, ua, ip, geo, action, colo FROM logs WHERE token = ? AND date = ? ORDER BY id DESC LIMIT 1000"
          ).bind(token, dateStr).all();
          return res.results || [];
        } catch (e) {
          return [];
        }
      }
      try {
        const res = await caches.default.match(new Request(cacheKey(token, dateStr)));
        if (res) return (await res.json()).reverse();
      } catch (e) {}
      return [];
    };

    const appendLog = async (token, dateStr, entry) => {
      if (hasD1 && schemaReady) {
        try {
          const cutoff = new Date(Date.now() + 19800000 - 8 * 86400000).toISOString().split('T')[0];
          await env.LOGS_DB.batch([
            env.LOGS_DB.prepare(
              "INSERT INTO logs (token, date, ts, ua, ip, geo, action, colo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            ).bind(token, dateStr, entry.ts, entry.ua, entry.ip, entry.geo, entry.action, entry.colo),
            env.LOGS_DB.prepare("DELETE FROM logs WHERE date < ?").bind(cutoff)
          ]);
          lastInsertOk = Date.now();
          lastInsertError = null;
        } catch (e) {
          lastInsertError = String(e && e.message ? e.message : e);
          if (lastInsertError.toLowerCase().includes('no such table')) {
            schemaReady = false;
          }
        }
        return;
      }
      try {
        const logs = await getLogsForDate(token, dateStr);
        logs.unshift(entry);
        const capped = logs.slice(0, 1000);
        await caches.default.put(
          new Request(cacheKey(token, dateStr)),
          new Response(JSON.stringify(capped.slice().reverse()), {
            headers: { "Cache-Control": `max-age=${8 * 86400}` }
          })
        );
      } catch (e) {}
    };

    // ============================================================
    // IP → "[AS45609 Bharti Airtel Limited, Lucknow, Uttar Pradesh, IN]"
    // ============================================================
    const buildGeoFromCF = (cf) => {
      if (!cf) return '';
      const asn = cf.asn ? `AS${cf.asn}` : '';
      const org = cf.asOrganization || '';
      const asnPart = [asn, org].filter(Boolean).join(' ');
      const parts = [asnPart, cf.city, cf.region, cf.countryCode].filter(Boolean);
      return parts.length ? `[${parts.join(', ')}]` : '';
    };

    const lookupIP = async (ip, cf) => {
      const cfGeo = buildGeoFromCF(cf);
      if (cfGeo) return cfGeo;
      if (!ip || ip === 'unknown' || ip === '::1' || ip.startsWith('127.') || ip === 'localhost') return '';
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(
          `http://ip-api.com/json/${ip}?fields=status,countryCode,regionName,city,as`,
          { signal: controller.signal }
        );
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'success') {
            const parts = [data.as, data.city, data.regionName, data.countryCode].filter(Boolean);
            return parts.length ? `[${parts.join(', ')}]` : '';
          }
        }
      } catch (e) {}
      return '';
    };

    // ============================================================
    // LOG THE REQUEST (skip credit page + debug)
    // ============================================================
    if (action !== 'credit' && !isDebug) {
      const xff = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
      const cfIP = request.headers.get('cf-connecting-ip') || '';
      const clientIP = xff || cfIP || request.headers.get('x-real-ip') || 'unknown';

      ctx.waitUntil((async () => {
        const geo = await lookupIP(clientIP, request.cf);
        const istNow = new Date(Date.now() + 19800000);
        const tsStr = istNow.toISOString().replace('T', ' ').substring(0, 19) + ' IST';
        await appendLog(pathToken, istDateString, {
          ts: tsStr,
          ua: uaRaw || 'Unknown',
          ip: clientIP,
          geo: geo,
          action: action || 'playlist',
          colo: request.cf?.colo || '?'
        });
      })());
    }

    // ============================================================
    // --- Helper: generic cached cookie --- (unchanged)
    // ============================================================
    const getCachedCookie = async (fetchUrl, cacheKeyUrl, prefix) => {
      const cache = caches.default;
      const req = new Request(cacheKeyUrl);
      const cachedRes = await cache.match(req);
      if (cachedRes) return await cachedRes.text();

      try {
          const res = await fetch(fetchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (res.ok) {
              const data = await res.json();
              let cookieStr = "";
              if (Array.isArray(data)) {
                  const cookieObj = data.find(item => item.cookie);
                  if (cookieObj) cookieStr = cookieObj.cookie;
              }
              if (cookieStr) {
                  cookieStr = cookieStr.replace(/exp=/g, '~exp=').replace(/acl=/g, '~acl=').replace(/hmac=/g, '~hmac=').replace(/~~/g, '~');
                  cookieStr = cookieStr.replace(/^(hdnea=|__hdnea__=|\?|&)+/, '');
                  cookieStr = prefix + cookieStr;

                  const match = /exp=(\d+)/.exec(cookieStr);
                  if (match && match[1]) {
                      const expTimestamp = parseInt(match[1], 10);
                      const currentSec = Math.floor(Date.now() / 1000);
                      const ttl = (expTimestamp - 3000) - currentSec;

                      if (ttl > 0) {
                          ctx.waitUntil(cache.put(req, new Response(cookieStr, { headers: { "Cache-Control": `max-age=${ttl}` } })));
                      }
                  }
                  return cookieStr;
              }
          }
      } catch (e) {}
      return "";
    };

    // ============================================================
    // --- Helper: SonyLiv rotating cookie --- (unchanged)
    // ============================================================
    const getSonyLivCookie = async () => {
      const cache = caches.default;
      const req = new Request("https://dummy.internal.local/cookie/sonyliv");
      const cachedRes = await cache.match(req);
      if (cachedRes) return await cachedRes.text();

      const idReq = new Request("https://dummy.internal.local/state/sonylivid");
      let nextId = "1090542909";
      const idRes = await cache.match(idReq);
      if (idRes) nextId = await idRes.text();

      try {
          const res = await fetch(`https://ayushlivser.onrender.com/api/https://apiv2.sonyliv.com/AGL/5.0/A/ENG/MWEB/IN/UP/CONTENT/VIDEOURL/VOD/${nextId}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (res.ok) {
              const data = await res.json();
              const videoUrl = data?.resultObj?.videoURL || "";

              const match = /hdnea=(exp=\d+~acl=[^~]+~.*?hmac=[a-f0-9]+)/.exec(videoUrl);
              if (match) {
                  const cookieStr = "hdnea=" + match[1];
                  const expMatch = /exp=(\d+)/.exec(cookieStr);
                  if (expMatch && expMatch[1]) {
                      const expTimestamp = parseInt(expMatch[1], 10);
                      const currentSec = Math.floor(Date.now() / 1000);
                      const ttl = (expTimestamp - 3000) - currentSec;

                      if (ttl > 0) {
                          ctx.waitUntil(cache.put(req, new Response(cookieStr, { headers: { "Cache-Control": `max-age=${ttl}` } })));

                          const nextNextId = (nextId === "1090542909") ? "1090545339" : "1090542909";
                          ctx.waitUntil(cache.put(idReq, new Response(nextNextId, { headers: { "Cache-Control": `max-age=31536000` } })));
                      }
                  }
                  return cookieStr;
              }
          }
      } catch (e) {}
      return "";
    };

    // ============================================================
    // COUNT (D1 → COUNT(*), cache → stored counter)
    // ============================================================
    const cache = caches.default;
    const rlCacheUrl = new URL(`https://dummy.internal.local/ratelimit/${pathToken}/${istDateString}`);
    const rlRequest = new Request(rlCacheUrl.href);

    let reqCount = 0;
    let countError = null;
    if (hasD1 && schemaReady) {
      try {
        const r = await env.LOGS_DB.prepare(
          "SELECT COUNT(*) as c FROM logs WHERE token = ? AND date = ?"
        ).bind(pathToken, istDateString).first();
        reqCount = r?.c || 0;
      } catch (e) {
        countError = String(e && e.message ? e.message : e);
      }
    } else {
      const cachedLimit = await cache.match(rlRequest);
      if (cachedLimit) reqCount = parseInt(await cachedLimit.text(), 10) || 0;
    }

    // ============================================================
    // DEBUG ENDPOINT — /<token>?debug=1
    // ============================================================
    if (isDebug) {
      let testResult = null;
      if (url.searchParams.get('test') === '1' && hasD1 && schemaReady) {
        try {
          await env.LOGS_DB.prepare(
            "INSERT INTO logs (token, date, ts, ua, ip, geo, action, colo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
          ).bind(
            pathToken, istDateString,
            new Date(Date.now() + 19800000).toISOString().replace('T', ' ').substring(0, 19) + ' IST',
            'TEST-UA', 'TEST-IP', 'TEST-GEO', 'test', request.cf?.colo || '?'
          ).run();
          testResult = { ok: true, message: "Test row inserted. Open /credit/<token> to see it." };
        } catch (e) {
          testResult = { ok: false, error: String(e && e.message ? e.message : e) };
        }
      }

      const todayLogs = await getLogsForDate(pathToken, istDateString);

      let rawCount = null, rawRows = null, rawError = null;
      if (hasD1 && schemaReady) {
        try {
          const cr = await env.LOGS_DB.prepare(
            "SELECT COUNT(*) as c FROM logs WHERE token = ?"
          ).bind(pathToken).first();
          rawCount = cr?.c || 0;
          if (url.searchParams.get('raw') === '1') {
            const rr = await env.LOGS_DB.prepare(
              "SELECT id, date, ts, action, colo FROM logs WHERE token = ? ORDER BY id DESC LIMIT 20"
            ).bind(pathToken).all();
            rawRows = rr.results || [];
          }
        } catch (e) {
          rawError = String(e && e.message ? e.message : e);
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        colo: request.cf?.colo || 'unknown',
        token: pathToken,
        action: action || 'playlist',
        isBrowser,
        ua: uaRaw,
        asOrganization: request.cf?.asOrganization || null,
        asn: request.cf?.asn || null,
        blocked: isBlockedOrg,
        allowBypass,
        hasD1,
        schemaReady,
        schemaError,
        countError,
        lastInsertError,
        lastInsertOk: lastInsertOk ? new Date(lastInsertOk + 19800000).toISOString().replace('T',' ').substring(0,19) + ' IST' : null,
        reqCount,
        todayLogsCount: todayLogs.length,
        todayLast5: todayLogs.slice(0, 5),
        rawD1Count: rawCount,
        rawD1Rows: rawRows,
        rawError,
        testResult,
        logKey: `logs/${pathToken}/${istDateString}`,
        warning: !hasD1
          ? 'D1 NOT BOUND — bind a D1 database as LOGS_DB.'
          : (!schemaReady
              ? 'D1 BOUND but schema not ready. See schemaError.'
              : null),
        hint: hasD1 && schemaReady && todayLogs.length === 0
          ? 'D1 ready but 0 logs today. Hit the PLAYLIST URL /' + pathToken + '?nocache=1 (not /credit), or use ?test=1.'
          : null
      }, null, 2), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "CDN-Cache-Control": "no-store" }
      });
    }

    // ============================================================
    // 3. Credit Endpoint — HTML dashboard (last 7 days)
    // ============================================================
    if (action === "credit") {
      if (url.searchParams.get('raw') === '1') {
        return new Response(`${reqCount} / Unlimited`, {
          status: 200,
          headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" }
        });
      }

      const today = new Date(nowMs + 19800000);
      const dates = [];
      for (let i = 0; i < 7; i++) {
        dates.push(new Date(today.getTime() - i * 86400000).toISOString().split('T')[0]);
      }

      let allLogs = [];
      let queryError = null;
      if (hasD1 && schemaReady) {
        try {
          const results = await Promise.all(
            dates.map(d =>
              env.LOGS_DB.prepare(
                "SELECT ts, ua, ip, geo, action, colo FROM logs WHERE token = ? AND date = ? ORDER BY id DESC LIMIT 1000"
              ).bind(pathToken, d).all()
            )
          );
          allLogs = results.map(r => (r && Array.isArray(r.results)) ? r.results : []);
        } catch (e) {
          queryError = String(e && e.message ? e.message : e);
          allLogs = dates.map(() => []);
        }
      } else {
        allLogs = await Promise.all(dates.map(d => getLogsForDate(pathToken, d)));
      }

      const counts = dates.map((d, i) => i === 0 ? Math.max(reqCount, allLogs[0].length) : allLogs[i].length);
      const totalLogs = counts.reduce((a, b) => a + b, 0);
      const generatedAt = new Date(Date.now() + 19800000).toISOString().replace('T', ' ').substring(0, 19) + ' IST';

      let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Usage Logs · ${escapeHtml(pathToken)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background: #0d1117; color: #c9d1d9; padding: 20px; margin: 0; line-height: 1.5; }
  h1 { color: #58a6ff; font-size: 22px; margin: 0 0 16px; }
  h2 { color: #58a6ff; font-size: 18px; margin: 28px 0 12px; }
  h3 { color: #79c0ff; font-size: 15px; margin: 0 0 10px; }
  .summary { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; }
  .summary div { margin: 4px 0; }
  .day { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 14px 16px; margin: 12px 0; }
  .entry { font-size: 12.5px; padding: 6px 0; border-bottom: 1px solid #21262d; word-break: break-all; }
  .entry:last-child { border-bottom: none; }
  .ts { color: #79c0ff; } .ua { color: #ffa657; } .ip { color: #7ee787; } .geo { color: #d2a8ff; }
  .action { color: #f778ba; } .colo { color: #6e7681; font-size: 11px; }
  .count { color: #ff7b72; font-weight: 600; }
  code { background: #21262d; padding: 2px 6px; border-radius: 4px; color: #c9d1d9; }
  .empty { color: #6e7681; font-style: italic; }
  .warn { background: #3d1d1d; border: 1px solid #f85149; color: #ff7b72; padding: 14px 16px; border-radius: 8px; margin-bottom: 16px; line-height: 1.6; }
  .info { background: #1d2d3d; border: 1px solid #58a6ff; color: #79c0ff; padding: 14px 16px; border-radius: 8px; margin-bottom: 16px; line-height: 1.6; }
  .ok { color: #7ee787; }
  .badge-ok { background:#1a3a1a; border:1px solid #2ea043; color:#7ee787; padding:2px 8px; border-radius:6px; font-size:12px; }
  .badge-bad { background:#3d1d1d; border:1px solid #f85149; color:#ff7b72; padding:2px 8px; border-radius:6px; font-size:12px; }
  a { color: #58a6ff; }
  .generated { color: #6e7681; font-size: 11px; margin-top: 8px; }
</style>
</head>
<body>
<h1>Usage Logs · <code>${escapeHtml(pathToken)}</code></h1>`;

      if (!hasD1) {
        html += `<div class="warn"><strong>⚠️ D1 NOT BOUND.</strong> Bind a D1 database as <code>LOGS_DB</code> in Pages → Settings → Functions → Bindings.</div>`;
      } else if (!schemaReady) {
        html += `<div class="warn"><strong>⚠️ Schema not ready.</strong> Error: <code>${escapeHtml(schemaError || 'unknown')}</code></div>`;
      } else if (queryError) {
        html += `<div class="warn"><strong>⚠️ D1 query failed on this render.</strong> <code>${escapeHtml(queryError)}</code></div>`;
      } else if (countError) {
        html += `<div class="warn"><strong>⚠️ COUNT(*) failed.</strong> <code>${escapeHtml(countError)}</code></div>`;
      }

      if (hasD1 && schemaReady && totalLogs === 0) {
        html += `<div class="info"><strong>ℹ️ No logs yet.</strong>
          Only requests to <a href="/${escapeHtml(pathToken)}?nocache=1"><code>/${escapeHtml(pathToken)}?nocache=1</code></a> create log rows — visiting <code>/credit/${escapeHtml(pathToken)}</code> does not.<br>
          Visit <a href="/${escapeHtml(pathToken)}?nocache=1">the playlist URL</a> now (cache-busted), then come back here. Or use <a href="/${escapeHtml(pathToken)}?debug=1&test=1">?debug=1&test=1</a> to force a test row.</div>`;
      }

      html += `<div class="summary">
  <div>Backend: ${hasD1 && schemaReady
    ? '<span class="badge-ok">D1 (global) ✓</span>'
    : '<span class="badge-bad">' + (hasD1 ? 'D1 bound, schema not ready' : 'D1 not bound') + '</span>'}</div>
  <div>Rendered from colo: <code>${escapeHtml(request.cf?.colo || '?')}</code></div>
  <div>Today's logged requests: <span class="count">${counts[0]}</span> / Unlimited</div>
  <div>7‑day total logged calls: <span class="count">${totalLogs}</span></div>
  <div style="margin-top:8px;">
    <a href="/${escapeHtml(pathToken)}?nocache=1">Hit playlist (cache-busted)</a> ·
    <a href="?debug=1">Debug JSON</a> ·
    <a href="?debug=1&test=1">Insert test row</a> ·
    <a href="?debug=1&raw=1">Raw D1 rows</a>
  </div>
  <div class="generated">Generated: ${generatedAt} · <a href="">Refresh</a></div>
</div>
<h2>Last 7 Days</h2>`;

      for (let i = 0; i < dates.length; i++) {
        const date = dates[i];
        const logs = allLogs[i] || [];
        html += `<div class="day"><h3>Date - ${date} - <span class="count">${counts[i]} calls</span></h3>`;
        if (logs.length === 0) {
          html += `<div class="entry empty">No calls recorded.</div>`;
        } else {
          logs.forEach(l => {
            html += `<div class="entry">` +
              `<span class="ts">${escapeHtml(l.ts)}</span> · ` +
              `<span class="ua">${escapeHtml(l.ua || 'Unknown')}</span> · ` +
              `<span class="ip">${escapeHtml(l.ip)}</span> ` +
              `<span class="geo">${escapeHtml(l.geo || '')}</span> · ` +
              `<span class="action">${escapeHtml(l.action || 'playlist')}</span> ` +
              `<span class="colo">[${escapeHtml(l.colo || '?')}]</span>` +
              `</div>`;
          });
          if (counts[i] > logs.length) {
            html += `<div class="entry empty">…and ${counts[i] - logs.length} more (display capped at 1000/day)</div>`;
          }
        }
        html += `</div>`;
      }
      html += `</body></html>`;

      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          "CDN-Cache-Control": "no-store"
        }
      });
    }

    // 4. Catchup Redirect Handler (JioTV Catchup ONLY)
    if (action === "catchup.mpd" || action === "catchup") {
      const targetUrl = url.searchParams.get("url");
      const start = url.searchParams.get("start");
      const end = url.searchParams.get("end");

      if (!targetUrl) return new Response("Missing url parameter", { status: 400 });

      let startSec = parseInt(start, 10);
      let endSec = parseInt(end, 10);
      const currentSec = Math.floor(Date.now() / 1000);

      if (endSec > currentSec) endSec = currentSec;
      if (startSec > endSec) startSec = endSec - 3600;

      let finalCatchupUrl = targetUrl;
      const getUTCString = (utcSeconds) => {
        const d = new Date(utcSeconds * 1000);
        const pad = (n) => (n < 10 ? '0' + n : n);
        return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
      };

      finalCatchupUrl += `?begin=${getUTCString(startSec)}&end=${getUTCString(endSec)}`;

      const cpCookie = await getCachedCookie("https://ayushsupercompro.onrender.com/cookies/cp.json", "https://dummy.internal.local/cookie/cp", "__hdnea__=");
      if (cpCookie) finalCatchupUrl += `&${cpCookie}`;

      return Response.redirect(finalCatchupUrl, 302);
    }

    // ============================================================
    // BLOCKED BROWSER PAGE (default player-hint message)
    // ============================================================
    if (isBrowser && !forceNoCache && !allowBypass) {
      const data = buildBlockPageData();
      const html = buildBlockedPage(data);
      return new Response(html, {
        status: 403,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          "CDN-Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

    // 5. Fetch Core Data
    const fetchJson = async (target) => {
      try {
        const res = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) return null;
        return await res.json();
      } catch (err) { return null; }
    };

    const ts = Date.now();
    const [
      mbCookie, slivCookie, standardData, dictUrlsData, catchupData, jioStbData, customPlaylistData
    ] = await Promise.all([
      getCachedCookie("https://ayushsupercompro.onrender.com/cookies/mb.json", "https://dummy.internal.local/cookie/mb", "__hdnea__="),
      getSonyLivCookie(),
      fetchJson(`https://raw.githubusercontent.com/Ayush8481Lab/Mm/refs/heads/main/Forayush.json?t=${ts}`),
      fetchJson(`https://raw.githubusercontent.com/live4wap/links/refs/heads/main/jiomb?t=${ts}`),
      fetchJson(`https://raw.githubusercontent.com/Ayush8481Lab/Mm/refs/heads/main/AyushCatchup.json?t=${ts}`),
      fetchJson(`https://ayushsup.onrender.com/jiostb.json`),
      fetchJson(`https://raw.githubusercontent.com/Ayush8481pro/NULL/refs/heads/main/playlist/${pathToken}.json?t=${ts}`)
    ]);

    let masterToken = mbCookie || "";

    const urlsDict = new Map();
    if (dictUrlsData) {
      const parseUrls = (res, isFailed) => {
        (Array.isArray(res) ? res : []).forEach(item => {
          const id = String(item.channel_id || "");
          const name = String(item.channel_name || "").toLowerCase();
          const fUrl = isFailed ? item.error_details?.final_url : item.result_details?.final_url;
          if (fUrl) { if (id) urlsDict.set(id, fUrl); if (name) urlsDict.set(name, fUrl); }
        });
      };
      parseUrls(dictUrlsData.failed_results, true);
      parseUrls(dictUrlsData.successful_results, false);
    }

    const catchupDict = new Map();
    if (catchupData && Array.isArray(catchupData)) {
        catchupData.forEach(item => {
            if (item.id && item.baseUrl) catchupDict.set(String(item.id), item.baseUrl);
        });
    }

    const jioStbDict = new Map();
    if (jioStbData && Array.isArray(jioStbData)) {
        jioStbData.forEach(item => {
            if (item.channel_id && item.url) jioStbDict.set(String(item.channel_id), item.url);
        });
    }

    let rawChannels = [];
    if (standardData && Array.isArray(standardData)) rawChannels.push(...standardData);

    let finalChannels = [];
    rawChannels.forEach(c => {
      const cid = String(c.id || c.channel_id || "");
      const cname = String(c.name || "").toLowerCase();
      if (c.stream_url && !c.url) c.url = c.stream_url;
      if (c.key_id && !c.keyId) c.keyId = c.key_id;

      if (c.url && c.url.includes('jiotvpllive.cdn.jio.com')) {
          if (jioStbDict.has(cid)) c.url = jioStbDict.get(cid);
      }

      const overrideUrl = urlsDict.get(cid) || urlsDict.get(cname);
      if (overrideUrl) c.url = overrideUrl;

      let finalUrl = c.url || "";

      if (finalUrl.includes('dishmt.slivcdn.com')) {
          c.isSonyLiv = true;
          if (slivCookie) finalUrl += (finalUrl.includes('?') ? '&' : '?') + slivCookie;
      }
      else if (masterToken && finalUrl.includes('.jio.com') && !finalUrl.includes('st=') && !finalUrl.includes('hdnea')) {
          const cleanToken = masterToken.startsWith('?') ? masterToken.substring(1) : masterToken;
          finalUrl = finalUrl + (finalUrl.includes('?') ? '&' : '?') + cleanToken;
      }
      c.url = finalUrl;

      if (c.url) {
        finalChannels.push({ ...c });
      }
    });

    // 6. Apply Custom Playlist Sorting & Filtering
    if (customPlaylistData && Array.isArray(customPlaylistData) && customPlaylistData.length > 0) {
        const channelMap = new Map();
        finalChannels.forEach(c => channelMap.set(String(c.id || c.channel_id), c));

        const sortedChannels = [];
        customPlaylistData.forEach(item => {
            const cid = String(item.Id);
            if (channelMap.has(cid)) {
                const matchedChannel = { ...channelMap.get(cid) };
                if (item.Cat) matchedChannel.category = item.Cat;
                sortedChannels.push(matchedChannel);
            }
        });
        if (sortedChannels.length > 0) finalChannels = sortedChannels;
    }

    // 7. Generate Final M3U Playlist
    let m3u = `#EXTM3U x-tvg-url="https://epg.ayush848694.workers.dev/${pathToken}"\n\n`;

    finalChannels.forEach(c => {
      const name = (c.name || "Unknown Channel").replace(/"/g, '');
      const group = c.category || c.group || c.group_title || "Others";

      let extinf = `#EXTINF:-1 tvg-id="${c.id || ''}" tvg-name="${name}" tvg-logo="${c.logo || ''}" group-title="${group}"`;

      if (c.isSonyLiv) {
          const parts = c.url.split('?');
          const baseUrl = parts[0];
          const queryParams = parts[1] || '';

          const catchupBase = baseUrl.replace('master.m3u8', 'master-archive.m3u8');
          const catchupSource = `${catchupBase}?startTime={utc}&endTime={utcend}${queryParams ? '&' + queryParams : ''}`;

          extinf += ` catchup="default" catchup-days="8" catchup-source="${catchupSource}"`;
      } else {
          const catchupUrl = catchupDict.get(String(c.id));
          if (catchupUrl) {
              const encUrl = encodeURIComponent(catchupUrl);
              const catchupSource = `${workerBase}/catchup.mpd?url=${encUrl}&start={utc}&end={utcend}`;
              extinf += ` catchup="default" catchup-days="8" catchup-source="${catchupSource}"`;
          }
      }

      m3u += `${extinf},${name}\n`;

      let licenseKey = "";
      let licenseType = "clearkey";
      let hasLicense = false;

      if (c.licenseurl && typeof c.licenseurl === "string" && c.licenseurl.trim() !== "" && c.licenseurl !== "null") {
          licenseKey = c.licenseurl.trim();
          licenseType = "com.widevine.alpha";
          hasLicense = true;
      }
      else if (c.license && typeof c.license === "string" && c.license.trim() !== "" && c.license !== "null") {
          licenseKey = c.license.trim();
          hasLicense = true;
      }
      else if (Array.isArray(c.keys) && c.keys.length > 0) {
          licenseKey = c.keys.join(",");
          hasLicense = true;
      }
      else if (c.keyId && c.key && c.keyId !== "null" && c.key !== "null" && c.keyId !== "" && c.key !== "") {
          licenseKey = `${c.keyId}:${c.key}`;
          hasLicense = true;
      }

      if (hasLicense) {
        if (c.url.includes('.mpd')) m3u += `#KODIPROP:inputstream.adaptive.manifest_type=mpd\n`;
        m3u += `#KODIPROP:inputstream.adaptive.license_type=${licenseType}\n`;
        m3u += `#KODIPROP:inputstream.adaptive.license_key=${licenseKey}\n`;
      }

      if (c.url && c.url.includes("liveserverayush2.onrender.com")) {
        m3u += `#EXTVLCOPT:http-user-agent=com.graymatrix.did;Android TV;5.82.6(203230929);Android(10);Xiaomi(Redmi Note 8 Pro)\n`;
      }

      m3u += `${c.url}\n\n`;
    });

    // 8. Cache count increment (only when D1 not in use)
    if (!(hasD1 && schemaReady)) {
      const nextCount = reqCount + 1;
      const nextMidnightIST = new Date(istDateObj);
      nextMidnightIST.setUTCHours(23, 59, 59, 999);
      const secondsToMidnight = Math.floor((nextMidnightIST.getTime() - istDateObj.getTime()) / 1000);
      ctx.waitUntil(cache.put(rlRequest, new Response(nextCount.toString(), {
        headers: { "Cache-Control": `max-age=${secondsToMidnight}` }
      })));
    }

    // 9. Return Response (players / ?nocache=1 only — browsers returned earlier)
    const responseHeaders = {
        "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Content-Disposition": "attachment; filename=\"Ayush@8481\"",
        "Vary": "User-Agent, Accept, Sec-Fetch-Dest",
        "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
        "CDN-Cache-Control": "no-store"
    };

    return new Response(m3u, { headers: responseHeaders });
  }
};
