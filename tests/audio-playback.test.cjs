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
    }, console, process, URL, Blob, AbortController, setTimeout, clearTimeout, ...globals,
  }, { filename: file });
  return module.exports;
}
const logger = { audioLogger: { log() {}, warn() {}, error() {} } };
const offline = { getSyncOfflineTrackUrl: () => null, isTrackOffline: () => false };
const track = id => ({ id: `ytm:${id}`, provider: 'ytm', providerTrackId: id, title: id, artist: 'Artist', duration: 180 });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function player() {
  const timers = new Map();
  let timerId = 0;
  class Audio {
    constructor() { this.handlers = {}; this.style = {}; this.paused = true; this.currentTime = 0; this.readyState = 0; this.playbackRate = 1; this.promises = []; }
    setAttribute() {}
    addEventListener(name, fn) { (this.handlers[name] ||= []).push(fn); }
    emit(name) { for (const fn of this.handlers[name] || []) fn(); }
    play() { return new Promise((resolve, reject) => this.promises.push({ resolve, reject })); }
    pause() { this.paused = true; this.emit('pause'); }
    load() { throw new Error('Redundant load at transition'); }
  }
  const state = {};
  const document = { visibilityState: 'hidden', body: { contains: () => true }, addEventListener() {} };
  const window = { addEventListener() {}, location: { href: 'https://example.test/' } };
  const controls = {};
  let request;
  const manager = load('src/audio/AudioManager.ts', {
    './queue': load('src/audio/queue.ts'),
    './preload': { prewarmNextTrack: async () => true, retainPreparedTracks() {}, getPreparedTrackUrl: id => id === 'ytm:b' ? 'blob:prepared-b' : null },
    './mediaSession': { setupMediaSession: handlers => Object.assign(controls, handlers), updateMediaMetadata() {}, setMediaSessionPlaybackState() {}, setMediaSessionPosition() {} },
    './logger': logger,
    '@/services/offline-storage': offline,
  }, {
    window, document, navigator: {}, Audio, localStorage: { removeItem() {}, setItem() {} },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
    fetch: (url, options) => new Promise(resolve => { request = { resolve, signal: options?.signal }; }),
  }).audioManager;
  manager.setStoreSync({ setState: partial => Object.assign(state, partial), getState: () => state });
  manager.setAutoplay(false);
  return { manager, state, controls, timers, document, audio: window.__cloudbeats_audio__, request: () => request };
}

test('loading stays distinct from playing; automatic next consumes the prepared source', async () => {
  const p = player();
  p.manager.setQueue([track('a'), track('b')]);
  p.audio.emit('play');
  assert.equal(p.state.status, 'LOADING');
  assert.equal(p.state.isPlaying, false);
  p.audio.emit('playing');
  assert.equal(p.state.status, 'PLAYING');
  p.audio.emit('ended');
  await flush();
  assert.equal(p.audio.src, 'blob:prepared-b');
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

test('preparation rejects failed/partial data, deduplicates, and releases unused blobs', async () => {
  let calls = 0;
  let response = new Response('failed', { status: 503 });
  const revoked = [];
  const preload = load('src/audio/preload.ts', { './logger': logger, '@/services/offline-storage': offline }, {
    fetch: async () => { calls++; return response; },
    URL: { createObjectURL: () => 'blob:complete', revokeObjectURL: url => revoked.push(url) },
  });
  preload.retainPreparedTracks(['ytm:b']);
  assert.equal(await preload.prewarmNextTrack(track('b')), false);
  assert.equal(preload.getPreparedTrackUrl('ytm:b'), null);
  response = new Response('partial', { status: 206, headers: { 'content-type': 'audio/mp4' } });
  assert.equal(await preload.prewarmNextTrack(track('b')), false);
  response = new Response('audio', { headers: { 'content-type': 'audio/mp4', 'content-length': '5' } });
  const first = preload.prewarmNextTrack(track('b'));
  assert.equal(preload.prewarmNextTrack(track('b')), first);
  assert.equal(await first, true);
  assert.equal(calls, 3);
  assert.equal(preload.getPreparedTrackUrl('ytm:b'), 'blob:complete');
  preload.retainPreparedTracks(['ytm:c']);
  assert.deepEqual(revoked, ['blob:complete']);
});

test('Media Session never receives an invalid zero playback rate', () => {
  let position;
  const media = load('src/audio/mediaSession.ts', { './logger': logger }, {
    window: {}, navigator: { mediaSession: { setPositionState: value => { position = value; } } },
  });
  media.setMediaSessionPosition(2, 180, 0);
  assert.equal(position.playbackRate, 1);
});
