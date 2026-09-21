const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, require: id => {
      if (id in mocks) return mocks[id];
      throw new Error(`Unexpected import ${id}`);
    }, console, process, URL, Blob, AbortController, AbortSignal, setTimeout, clearTimeout, ...globals,
  }, { filename: file });
  return module.exports;
}
const logger = { audioLogger: { log() {}, warn() {}, error() {} } };
const offline = { getSyncOfflineTrackUrl: () => null, isTrackOffline: () => false };
const track = id => ({ id: `ytm:${id}`, provider: 'ytm', providerTrackId: id, title: id, artist: 'Artist', duration: 180 });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function tick(p, ms) {
  p.elapse(ms);
  const [id, fn] = p.timers.entries().next().value;
  p.timers.delete(id);
  fn();
}

function tail(p, position = 201.9, end = 202) {
  p.audio.currentTime = position;
  p.audio.buffered = { length: 1, start: () => 0, end: () => end };
  p.audio.emit('timeupdate');
}

test('buffered verified tail with missing ended advances once after no progress', () => {
  const p = player(202);
  p.manager.setQueue([track('a'), track('b'), track('c')]);
  p.audio.emit('playing');
  tail(p);
  tick(p, 5000);
  assert.equal(p.state.currentTrack.id, 'ytm:a');
  tick(p, 7000);
  assert.equal(p.state.currentTrack.id, 'ytm:b');
  for (const fn of p.audio.handlers.ended) fn();
  assert.equal(p.state.currentTrack.id, 'ytm:b');
  p.manager.pause();
});

test('tail fallback does not skip an unbuffered tail or catalog-only duration', () => {
  for (const duration of [202, null]) {
    const p = player(duration);
    p.manager.setQueue([track('a'), track('b')]);
    p.audio.emit('playing');
    tail(p, 201.9, duration ? 201.9 : 202);
    tick(p, 12000);
    assert.equal(p.state.currentTrack.id, 'ytm:a');
    p.manager.pause();
  }
});

test('tail fallback respects pause, active seek, continuing progress, and repeat', () => {
  for (const action of ['pause', 'seek', 'progress', 'repeat']) {
    const p = player(202);
    p.manager.setQueue([track('a'), track('b')]);
    p.audio.emit('playing');
    tail(p);
    if (action === 'pause') { p.manager.pause(); p.elapse(12000); }
    if (action === 'seek') { p.audio.seeking = true; p.audio.emit('seeking'); p.elapse(12000); }
    if (action === 'progress') { p.audio.currentTime = 202; tick(p, 12000); }
    if (action === 'repeat') { p.manager.setRepeatMode('track'); tick(p, 12000); }
    p.audio.emit('timeupdate');
    assert.equal(p.state.currentTrack.id, 'ytm:a');
    if (action === 'repeat') assert.equal(p.audio.currentTime, 0);
    p.manager.pause();
  }
});

test('silent mid-track hang refreshes without skipping even without duration or media events', () => {
  const p = player();
  p.manager.setQueue([track('a'), track('b')]);
  p.audio.emit('playing');
  p.audio.currentTime = 100;
  tick(p, 60000); // delayed callback sees progress, so does not retry
  assert.equal(p.manager.recoveryAttempts, 0);
  tick(p, 40000);
  assert.equal(p.state.currentTrack.id, 'ytm:a');
  assert.ok(p.audio.src.includes('refresh=1'));
  assert.equal(p.manager.pendingSeekTime, 100);
  p.audio.emit('stalled');
  assert.equal(p.delays.at(-1), 40000);
  p.manager.pause();
});

function player(verifiedDuration = null) {
  let now = 100000;
  class Clock extends Date { static now() { return now; } }
  const timers = new Map();
  let timerId = 0;
  class Audio {
    constructor() { this.handlers = {}; this.style = {}; this.paused = true; this.currentTime = 0; this.readyState = 0; this.playbackRate = 1; this.promises = []; }
    set src(value) { this._src = value; this.currentTime = 0; this.readyState = 0; this.paused = true; this.error = null; this.ended = false; }
    get src() { return this._src; }
    setAttribute() {}
    addEventListener(name, fn) { (this.handlers[name] ||= []).push(fn); }
    emit(name) { if (name === "playing") { this.paused = false; this.readyState = 3; } if (name === "ended") { this.paused = true; this.ended = true; } for (const fn of this.handlers[name] || []) fn(); }
    play() { return new Promise((resolve, reject) => this.promises.push({ resolve, reject })); }
    pause() { this.paused = true; this.emit('pause'); }
    load() { throw new Error('Redundant load at transition'); }
  }
  const state = {};
  const document = { visibilityState: 'hidden', body: { contains: () => true }, addEventListener() {} };
  const window = { addEventListener() {}, location: { href: 'https://example.test/' } };
  const controls = {};
  let mediaSessionRegistrations = 0;
  const warmed = [];
  const metadataWarmed = [];
  const delays = [];
  let request;
  const manager = load('src/audio/AudioManager.ts', {
    './queue': load('src/audio/queue.ts'),
    './preload': {
      prewarmNextTrack: async track => { warmed.push(track.id); return true; },
      prewarmTrackMetadata: async track => { metadataWarmed.push(track.id); return true; },
      retainPreparedTracks() {}, getResolvedDuration: () => verifiedDuration,
      getPreparedTrackUrl: () => null,
      rememberResolvedDuration: (id, duration) => { verifiedDuration = duration; },
    },
    './mediaSession': { setupMediaSession: handlers => { mediaSessionRegistrations++; Object.assign(controls, handlers); }, updateMediaMetadata() {}, setMediaSessionPlaybackState() {}, setMediaSessionPosition() {} },
    './logger': logger,
    '@/services/offline-storage': offline,
  }, {
    window, document, navigator: {}, Audio, Date: Clock, localStorage: { removeItem() {}, setItem() {} },
    setTimeout: (fn, ms) => { delays.push(ms); timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
    fetch: (url, options) => new Promise(resolve => { request = { resolve, signal: options?.signal }; }),
  }).audioManager;
  manager.setStoreSync({ setState: partial => Object.assign(state, partial), getState: () => state });
  manager.setAutoplay(false);
  return { manager, state, controls, timers, document, warmed, metadataWarmed, delays, elapse: ms => { now += ms; }, mediaSessionRegistrations: () => mediaSessionRegistrations, audio: window.__cloudbeats_audio__, request: () => request };
}

test('loading stays distinct from playing; next begins synchronously and warms its successor', async () => {
  const p = player();
  p.manager.setQueue([track('a'), track('b')]);
  p.audio.emit('play');
  assert.equal(p.state.status, 'LOADING');
  assert.equal(p.state.isPlaying, false);
  p.audio.emit('playing');
  assert.equal(p.state.status, 'PLAYING');
  p.audio.emit('ended');
  await flush();
  assert.ok(p.audio.src.includes('/stream?id=b'));
  assert.ok(p.warmed.includes('ytm:b'));
  assert.equal(p.state.currentTime, 0);
  assert.equal(p.state.status, 'LOADING');
});

test('old play promise cannot mark a newly selected song as playing', async () => {
  const p = player();
  p.manager.setQueue([track('a'), track('b')]);
  const old = p.audio.promises[0];
  await p.manager.next();
  old.resolve();
  await flush();
  assert.equal(p.state.currentTrack.id, 'ytm:b');
  assert.equal(p.state.status, 'LOADING');
});

test('pending previous playback does not block next; pause cancels recovery', async () => {
  const p = player();
  p.manager.setQueue([track('a'), track('b')]);
  p.audio.currentTime = 10;
  await p.manager.previous();
  await p.manager.next();
  assert.equal(p.state.currentTrack.id, 'ytm:b');
  p.manager.pause();
  assert.equal(p.timers.size, 0);
  p.audio.promises.at(-1).resolve();
  await flush();
  assert.equal(p.state.status, 'PAUSED');
});

test('lock-screen previous cancels pending recommendations and ignores their late response', async () => {
  const p = player();
  p.manager.setQueue([track('a'), track('b')], 1);
  p.manager.setAutoplay(true);
  await p.manager.next();
  const request = p.request();
  assert.ok(request);
  await p.controls.onPrevious();
  assert.equal(request.signal.aborted, true);
  request.resolve({ ok: true, json: async () => ({ tracks: [track('c')] }) });
  await flush();
  assert.equal(p.state.currentTrack.id, 'ytm:a');
});

test('stalled loading has bounded recovery; foreground retries paused audio', () => {
  const p = player();
  p.manager.setQueue([track('a')]);
  const before = p.audio.promises.length;
  p.manager.reconcileBackgroundState();
  assert.equal(p.audio.promises.length, before + 1);
  for (let i = 0; i < 3; i++) {
    const entry = p.timers.entries().next().value;
    if (entry) { p.timers.delete(entry[0]); entry[1](); }
  }
  assert.equal(p.state.status, 'ERROR');
  assert.equal(p.timers.size, 0);
});

test('stalled during opening preserves the full resolver budget', () => {
  const p = player();
  p.manager.setQueue([track('a')]);
  assert.equal(p.delays.at(-1), 40000);
  p.audio.emit('stalled');
  assert.equal(p.delays.at(-1), 40000);
  assert.equal(p.timers.size, 1);
  p.manager.pause();
});

test('waiting during opening keeps resolver budget; active buffering uses stall budget', () => {
  const p = player();
  p.manager.setQueue([track('a'), track('b')]);
  p.audio.emit('waiting');
  assert.equal(p.delays.at(-1), 40000);
  p.audio.emit('playing');
  p.audio.emit('waiting');
  assert.equal(p.delays.at(-1), 12000);
  p.manager.pause();
});

test('stuck playback re-registers every lock-screen action before recovery', () => {
  const p = player();
  p.manager.setQueue([track('a'), track('b')]);
  const before = p.mediaSessionRegistrations();
  p.audio.emit('waiting');
  assert.ok(p.mediaSessionRegistrations() > before);
  p.controls.onNext();
  assert.equal(p.state.currentTrack.id, 'ytm:b');
  const afterNext = p.mediaSessionRegistrations();
  p.audio.emit('stalled');
  assert.ok(p.mediaSessionRegistrations() > afterNext);
  p.manager.pause();
});

test('foreground near catalog or native duration cannot skip an unfinished song', () => {
  for (const duration of [null, 202]) {
    const p = player(duration);
    p.manager.setQueue([track('a'), track('b')]);
    p.audio.emit('playing');
    p.audio.duration = duration || 180;
    p.audio.currentTime = p.audio.duration - 0.2;
    p.audio.paused = true;
    p.manager.reconcileBackgroundState();
    assert.equal(p.state.currentTrack.id, 'ytm:a');
    p.manager.pause();
  }
});

test('Media Session never receives an invalid zero playback rate', () => {
  let position;
  const media = load('src/audio/mediaSession.ts', { './logger': logger }, {
    window: {}, navigator: { mediaSession: { setPositionState: value => { position = value; } } },
  });
  media.setMediaSessionPosition(2, 180, 0);
  assert.equal(position.playbackRate, 1);
});

test('Media Session maps iOS seek buttons to previous and next tracks', () => {
  const actions = {};
  const calls = [];
  const media = load('src/audio/mediaSession.ts', { './logger': logger }, {
    window: {}, navigator: { mediaSession: { setActionHandler: (name, handler) => { actions[name] = handler; } } },
  });
  media.setupMediaSession({
    onPlay() {}, onPause() {}, onNext: () => calls.push('next'), onPrevious: () => calls.push('previous'),
    onSeekTo() {}, onSeekForward() {}, onSeekBackward() {},
  });
  actions.seekforward();
  actions.seekbackward();
  assert.deepEqual(calls, ['next', 'previous']);
});

test('queued lock-screen navigation burst loads only one new source', () => {
  const p = player();
  p.manager.setQueue([track('a'), track('b'), track('c'), track('d')]);
  p.controls.onNext();
  p.controls.onNext();
  p.controls.onNext();
  assert.equal(p.state.currentTrack.id, 'ytm:b');
});

test('rapid in-app navigation remains available', () => {
  const p = player();
  p.manager.setQueue([track('a'), track('b'), track('c'), track('d')]);
  p.manager.next();
  p.manager.next();
  p.manager.next();
  assert.equal(p.state.currentTrack.id, 'ytm:d');
});

test('watchdog waits beyond Python opening budget and refreshes exactly once', () => {
  const p = player();
  p.manager.setQueue([track('a')]);
  assert.equal(p.delays.at(-1), 40000);
  const initial = p.audio.src;
  p.manager.reconcileBackgroundState();
  assert.equal(p.audio.src, initial);
  assert.equal(p.manager.recoveryAttempts, 0);
  const runTimer = () => {
    const [id, fn] = p.timers.entries().next().value;
    p.timers.delete(id); fn();
  };
  runTimer();
  assert.ok(p.audio.src.includes('&refresh=1'));
  assert.equal(p.manager.recoveryAttempts, 1);
  runTimer();
  assert.equal(p.state.status, 'ERROR');
  assert.equal(p.timers.size, 0);
});

test('retry promises from an old source cannot overwrite a new track', async () => {
  const p = player();
  p.manager.setQueue([track('a'), track('b')]);
  p.manager.recoverPlayback();
  const retry = p.audio.promises.at(-1);
  p.manager.next();
  retry.resolve();
  await flush();
  assert.equal(p.state.currentTrack.id, 'ytm:b');
  assert.equal(p.state.status, 'LOADING');
});

test('failed songs are skipped but repeated failure stops after three tracks', () => {
  const p = player();
  p.manager.setQueue([track('a'), track('b'), track('c'), track('d')]);
  p.manager.setRepeatMode('queue');
  for (let i = 0; i < 6; i++) p.manager.recoverPlayback();
  assert.equal(p.state.currentTrack.id, 'ytm:c');
  assert.equal(p.state.status, 'ERROR');
  assert.equal(p.timers.size, 0);
});

test('changing Play Next prepares the new successor immediately', () => {
  const p = player();
  p.manager.setQueue([track('a'), track('b')]);
  p.manager.playNextInQueue(track('c'));
  assert.equal(p.warmed.at(-1), 'ytm:c');
});

test('two upcoming tracks prepare prefix for nearest and metadata for second', () => {
  const p = player();
  p.manager.setQueue([track('a'), track('b'), track('c')]);
  assert.equal(p.warmed.at(-1), 'ytm:b');
  assert.equal(p.metadataWarmed.at(-1), 'ytm:c');
});

test('manual next bypasses repeat-track while normal end repeats it', () => {
  const p = player();
  p.manager.setQueue([track('a'), track('b')]);
  p.manager.setRepeatMode('track');
  p.audio.emit('ended');
  assert.equal(p.state.currentTrack.id, 'ytm:a');
  p.controls.onNext();
  assert.equal(p.state.currentTrack.id, 'ytm:b');
});

test('shuffle preserves the current track while changing preparation order', () => {
  const { QueueManager } = load('src/audio/queue.ts');
  const queue = new QueueManager([track('a'), track('b'), track('c')], 1);
  queue.setShuffle(true);
  assert.equal(queue.getCurrentTrack().id, 'ytm:b');
  queue.setShuffle(false);
  assert.equal(queue.getCurrentTrack().id, 'ytm:b');
});

function warmer(fetch) {
  return load('src/audio/preload.ts', { './logger': logger, '@/services/offline-storage': offline }, { fetch });
}
const resolved = () => Response.json({ status: 'warmed', url: 'https://resolver.test/stream' });
const preparedAudio = range => range === 'bytes=0-0'
  ? new Response('a', { status: 206, headers: { 'Content-Type': 'audio/mp4', 'Content-Range': 'bytes 0-0/4' } })
  : new Response('abcd', { status: 206, headers: { 'Content-Type': 'audio/mp4', 'Content-Range': 'bytes 0-3/4' } });

test('prewarm resolves and retains one complete local audio URL', async () => {
  const calls = [];
  const preload = warmer(async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? resolved() : preparedAudio(options.headers.Range);
  });
  preload.retainPreparedTracks(['ytm:b']);
  const first = preload.prewarmNextTrack(track('b'));
  assert.equal(preload.prewarmNextTrack(track('b')), first);
  assert.equal(await first, true);
  assert.equal(await preload.prewarmNextTrack(track('b')), true);
  assert.equal(calls.length, 3);
  assert.equal(calls[1].options.headers.Range, 'bytes=0-0');
  assert.equal(calls[2].options.headers.Range, 'bytes=0-3');
  assert.ok(preload.getPreparedTrackUrl('ytm:b').startsWith('blob:'));
});

test('dropping a prepared track revokes its local URL', async () => {
  let count = 0;
  const preload = warmer(async (url, options) => ++count === 1 ? resolved() : preparedAudio(options.headers.Range));
  preload.retainPreparedTracks(['ytm:b']);
  assert.equal(await preload.prewarmNextTrack(track('b')), true);
  assert.ok(preload.getPreparedTrackUrl('ytm:b'));
  preload.retainPreparedTracks(['ytm:c']);
  assert.equal(preload.getPreparedTrackUrl('ytm:b'), null);
});

test('prewarm rejects errors and truncated downloads, with failure cooldown', async () => {
  for (const response of [new Response('', { status: 502 }), new Response('abc', { status: 200, headers: { 'content-type': 'audio/mp4', 'content-length': '10' } })]) {
    let count = 0;
    const preload = warmer(async () => ++count === 1 ? resolved() : response);
    preload.retainPreparedTracks(['ytm:b']);
    assert.equal(await preload.prewarmNextTrack(track('b')), false);
    assert.equal(await preload.prewarmNextTrack(track('b')), false);
    assert.equal(count, 2);
  }
});

test('changing next track aborts its preparation and ignores late resolution', async () => {
  let release;
  let signal;
  const preload = warmer((url, options) => { signal = options.signal; return new Promise(resolve => { release = resolve; }); });
  preload.retainPreparedTracks(['ytm:b']);
  const first = preload.prewarmNextTrack(track('b'));
  preload.retainPreparedTracks(['ytm:c']);
  assert.equal(signal.aborted, true);
  release(resolved());
  assert.equal(await first, false);
});

test('preparation survives when next track becomes current', async () => {
  let release;
  let signal;
  const preload = warmer((url, options) => {
    signal = options.signal;
    return new Promise(resolve => { release = resolve; });
  });
  preload.retainPreparedTracks(['ytm:b', 'ytm:c']);
  const preparingB = preload.prewarmNextTrack(track('b'));
  preload.retainPreparedTracks(['ytm:b', 'ytm:c', 'ytm:d']);
  assert.equal(signal.aborted, false);
  release(new Response('', { status: 502 }));
  assert.equal(await preparingB, false);
});

test('second upcoming track resolves metadata without fetching audio', async () => {
  const calls = [];
  const preload = warmer(async (url, options) => {
    calls.push({ url, options });
    return resolved();
  });
  preload.retainPreparedTracks(['ytm:b', 'ytm:c']);
  assert.equal(await preload.prewarmTrackMetadata(track('c')), true);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes('/api/resolve/'));
});

test('diagnostics persist in production, redact URLs, and cap history', () => {
  const storage = new Map();
  const diagnostics = load('src/audio/logger.ts', {}, {
    window: {}, document: { visibilityState: 'hidden' }, process: { env: { NODE_ENV: 'production' } },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  }).audioLogger;
  for (let i = 0; i < 205; i++) diagnostics.log('event', { trackId: 'ytm:a', url: 'https://cdn.test/?sig=secret' });
  const report = JSON.parse(diagnostics.exportDiagnostics());
  assert.equal(report.events.length, 200);
  assert.ok(!JSON.stringify(report).includes('secret'));
  assert.equal(storage.size, 1);
  diagnostics.clear();
  assert.equal(JSON.parse(diagnostics.exportDiagnostics()).events.length, 0);
});

test('pause during recommendation loading prevents a late result from restarting audio', async () => {
  const p = player();
  p.manager.setQueue([track('a')]);
  p.manager.setAutoplay(true);
  p.manager.next();
  const request = p.request();
  p.manager.pause();
  const before = p.audio.promises.length;
  request.resolve({ ok: true, json: async () => ({ tracks: [track('b')] }) });
  await flush();
  assert.equal(p.audio.promises.length, before);
  assert.equal(p.state.status, 'PAUSED');
  assert.equal(p.state.isBuffering, false);
});

test('foreground while resolver is still loading does not spend a retry or replace its URL', () => {
  const p = player();
  p.manager.setQueue([track('a')]);
  const url = p.audio.src;
  p.manager.reconcileBackgroundState();
  p.manager.reconcileBackgroundState();
  assert.equal(p.audio.src, url);
  assert.equal(p.manager.recoveryAttempts, 0);
  p.manager.pause();
});

test('overlarge prepared responses are cancelled before reading their bodies', async () => {
  let cancelled = false;
  let count = 0;
  const preload = warmer(async () => ++count === 1 ? resolved() : new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
    status: 206, headers: { 'content-type': 'audio/mp4', 'content-range': `bytes 0-0/${25 * 1024 * 1024}` },
  }));
  preload.retainPreparedTracks(['ytm:b']);
  assert.equal(await preload.prewarmNextTrack(track('b')), false);
  assert.equal(cancelled, true);
});

test('reported iPhone case: verified 202s song at 236s advances without ended', () => {
  const p = player(202);
  p.manager.setQueue([track('a'), track('b'), track('c')]);
  p.audio.duration = 999;
  p.audio.emit('playing');
  p.audio.currentTime = 236;
  p.audio.emit('timeupdate');
  assert.equal(p.state.currentTrack.id, 'ytm:b');
  assert.equal(p.audio.currentTime, 0);
  // A late ended callback from the former source cannot skip B.
  for (const fn of p.audio.handlers.ended) fn();
  assert.equal(p.state.currentTrack.id, 'ytm:b');
  p.manager.pause();
});

test('timer fallback rechecks audio position and never counts listening wall time', () => {
  const p = player(202);
  p.manager.setQueue([track('a'), track('b')]);
  p.audio.emit('playing');
  p.audio.currentTime = 100; // still buffering or not at the end
  let [id, fn] = p.timers.entries().next().value;
  p.timers.delete(id); fn();
  assert.equal(p.state.currentTrack.id, 'ytm:a');
  p.audio.currentTime = 205;
  [id, fn] = p.timers.entries().next().value;
  p.timers.delete(id); fn();
  assert.equal(p.state.currentTrack.id, 'ytm:b');
  p.manager.pause();
});

test('catalog duration alone never triggers early skipping', () => {
  const p = player();
  p.manager.setQueue([track('a'), track('b')]);
  p.audio.emit('playing');
  p.audio.currentTime = 236;
  p.audio.emit('timeupdate');
  assert.equal(p.state.currentTrack.id, 'ytm:a');
  p.manager.pause();
});

test('seek before boundary and pause do not auto advance; seek is bounded by verified duration', () => {
  const p = player(202);
  p.manager.setQueue([track('a'), track('b')]);
  p.audio.emit('playing');
  p.manager.seek(999);
  assert.equal(p.audio.currentTime, 202);
  p.audio.seeking = true;
  p.audio.currentTime = 236;
  p.audio.emit('timeupdate');
  assert.equal(p.state.currentTrack.id, 'ytm:a');
  p.audio.seeking = false;
  p.manager.seek(100);
  p.audio.emit('seeked');
  assert.equal(p.state.currentTrack.id, 'ytm:a');
  p.manager.pause();
  p.audio.currentTime = 236;
  p.audio.emit('timeupdate');
  assert.equal(p.state.currentTrack.id, 'ytm:a');
  assert.equal(p.timers.size, 0);
});

test('foreground overrun is handled before treating unpaused audio as healthy', () => {
  const p = player(202);
  p.manager.setQueue([track('a'), track('b')]);
  p.audio.emit('playing');
  p.audio.currentTime = 236;
  p.manager.reconcileBackgroundState();
  assert.equal(p.state.currentTrack.id, 'ytm:b');
  p.manager.pause();
});

test('fallback respects repeat-track and does not skip twice', () => {
  const p = player(202);
  p.manager.setQueue([track('a'), track('b')]);
  p.manager.setRepeatMode('track');
  p.audio.emit('playing');
  p.audio.currentTime = 236;
  p.audio.emit('timeupdate');
  assert.equal(p.state.currentTrack.id, 'ytm:a');
  assert.equal(p.audio.currentTime, 0);
  p.audio.emit('timeupdate');
  assert.equal(p.state.currentTrack.id, 'ytm:a');
  p.manager.pause();
});

test('late duration response for previous track cannot set current track boundary', async () => {
  const p = player();
  p.manager.setQueue([track('a'), track('b')]);
  const old = p.request();
  p.manager.next();
  old.resolve({ ok: true, json: async () => ({ status: 'warmed', trackId: 'ytm:a', duration: 202 }) });
  await flush();
  assert.equal(p.manager.resolvedDuration, null);
  p.manager.pause();
});
