const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function route(name, fetch) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, `../src/app/api/${name}/[trackId]/route.ts`), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports: module.exports, module, fetch, Response, Headers, AbortSignal, AbortController, setTimeout, clearTimeout,
    process: { env: { RESOLVER_SERVICE_URL: 'https://resolver.test' } },
    console: { warn() {}, error() {} },
    require: id => {
      if (id === 'next/server') {
        return {
          NextResponse: {
            json: (body, init) => Response.json(body, init),
            redirect: (url, init) => new Response(null, {
              status: typeof init === 'number' ? init : (init?.status || 307),
              headers: new Headers({ Location: url, ...(init?.headers || {}) }),
            }),
          },
        };
      }
      if (id === '@/audio/vault') {
        return { maskStreamUrl: x => `vlt_${x}`, unmaskStreamUrl: x => x.slice(4) };
      }
      return { audiusProvider: {} };
    },
  });
  return module.exports;
}
const request = query => ({ nextUrl: new URL(`https://app.test/api/stream/ytm:abcdefghijk?${query}`), headers: new Headers({ Range: 'bytes=0-3' }), signal: new AbortController().signal });
const params = { params: Promise.resolve({ trackId: 'ytm:abcdefghijk' }) };

test('stream redirects to resolver by default without proxying audio bytes', async () => {
  let fetched = false;
  const api = route('stream', async () => {
    fetched = true;
    return new Response('audio');
  });
  const result = await api.GET(request('audio=true&refresh=1'), params);
  assert.equal(result.status, 307);
  assert.equal(result.headers.get('Location'), 'https://resolver.test/stream?id=abcdefghijk&refresh=1');
  assert.equal(result.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(fetched, false);
});

test('stream forwards refresh and range when proxy=1 is explicitly set', async () => {
  const api = route('stream', async (url, options) => {
    assert.equal(new URL(url).searchParams.get('refresh'), '1');
    assert.equal(options.headers.Range, 'bytes=0-3');
    assert.equal(options.cache, 'no-store');
    return new Response('abcd', { status: 206, headers: { 'Content-Range': 'bytes 0-3/100', 'Cache-Control': 'private, no-store' } });
  });
  const result = await api.GET(request('audio=true&refresh=1&proxy=1'), params);
  assert.equal(result.status, 206);
  assert.equal(result.headers.get('content-range'), 'bytes 0-3/100');
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
});

test('failed audio response is closed before a real refresh retry when proxying', async () => {
  let calls = 0;
  let cancelled = false;
  const api = route('stream', async url => {
    if (++calls === 1) return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 403 });
    assert.equal(cancelled, true);
    assert.equal(new URL(url).searchParams.get('refresh'), '1');
    return new Response('audio');
  });
  const result = await api.GET(request('audio=true&proxy=1'), params);
  assert.equal(await result.text(), 'audio');
  assert.equal(calls, 2);
});

test('416 and rate limits do not trigger unnecessary resolver retries when proxying', async () => {
  for (const status of [416, 429, 503, 504]) {
    let calls = 0;
    const api = route('stream', async () => { calls++; return new Response('', { status, headers: { 'Retry-After': '2' } }); });
    const result = await api.GET(request('audio=true&proxy=1'), params);
    assert.equal(result.status, status);
    assert.equal(result.headers.get('retry-after'), '2');
    assert.equal(calls, 1);
  }
});

test('prewarm errors stay errors instead of reporting success', async () => {
  const api = route('resolve', async () => new Response('unavailable', { status: 504 }));
  const result = await api.POST(request(''), params);
  assert.equal(result.status, 504);
  assert.equal((await result.json()).status, 'error');
});

test('resolve forwards refresh and exposes signed URL expiration', async () => {
  const api = route('resolve', async url => {
    assert.equal(new URL(url).searchParams.get('refresh'), '1');
    return Response.json({ url: 'https://resolver.test/stream?sig=test', expiresAt: 12345 });
  });
  const result = await api.GET(request('refresh=1'), params);
  assert.equal((await result.json()).expiresAt, 12345);
});

test('metadata response returns masked vault stream URL', async () => {
  const api = route('stream', async () => Response.json({ status: 'warmed', url: 'https://resolver.test/stream?id=abcdefghijk&exp=123', duration: 180 }));
  const result = await api.GET(request(''), params);
  const data = await result.json();
  assert.ok(data.source.url.startsWith('/stream-vault/stream?id=abcdefghijk&vault=vlt_'));
  assert.equal(data.source.type, 'vault');
  assert.equal(data.source.duration, 180);
});
