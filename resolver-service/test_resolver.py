"""Run with: python -m unittest discover -s resolver-service -p 'test_*.py'."""
import asyncio
import importlib.util
import os
from pathlib import Path
import threading
import time
import unittest
from unittest.mock import patch, AsyncMock

import httpx

os.environ.setdefault("STREAM_SECRET", "local-test-secret-not-for-deployment")
os.environ["FORCE_IPV4"] = "false"
spec = importlib.util.spec_from_file_location("resolver", Path(__file__).with_name("main.py"))
resolver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resolver)
VIDEO = "abcdefghijk"
DATA = {"url": "https://cdn.example/audio", "mimeType": "audio/mp4", "itag": 140, "title": "Test", "duration": 180}


class ResolverTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        resolver.cache.clear()
        resolver.error_cache.clear()
        resolver.inflight.clear()
        resolver.rate_store.clear()

    async def asyncTearDown(self):
        await asyncio.gather(*list(resolver.inflight.values()), return_exceptions=True)
        # Workers in tests finish quickly; wait for actual completion before unpatching fixtures.
        await asyncio.sleep(0.06)

    async def test_one_unavailable_client_does_not_cancel_success(self):
        def client(url, name):
            if name == "MWEB":
                raise ValueError("video unavailable")
            time.sleep(0.02)
            return DATA.copy()
        with patch.object(resolver, "_try_client", side_effect=client):
            self.assertEqual(await resolver.resolve_in_thread(VIDEO), DATA)
        self.assertNotIn(VIDEO, resolver.error_cache)

    async def test_concurrent_callers_share_one_job(self):
        calls = []
        def client(url, name):
            calls.append(name)
            time.sleep(0.02)
            return DATA.copy()
        with patch.object(resolver, "_try_client", side_effect=client):
            results = await asyncio.gather(*(resolver.resolve_in_thread(VIDEO) for _ in range(12)))
        self.assertEqual(len(calls), 4)
        self.assertEqual(len(results), 12)

    async def test_cancelling_preload_does_not_cancel_playback(self):
        def client(url, name):
            time.sleep(0.02)
            return DATA.copy()
        with patch.object(resolver, "_try_client", side_effect=client):
            preload = asyncio.create_task(resolver.resolve_in_thread(VIDEO))
            playback = asyncio.create_task(resolver.resolve_in_thread(VIDEO))
            await asyncio.sleep(0.005)
            preload.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await preload
            self.assertEqual(await playback, DATA)

    async def test_transient_failure_is_not_negative_cached(self):
        with patch.object(resolver, "_try_client", side_effect=OSError("temporary network error")):
            with self.assertRaises(resolver.HTTPException) as caught:
                await resolver.resolve_in_thread(VIDEO)
            self.assertEqual(caught.exception.status_code, 502)
        self.assertNotIn(VIDEO, resolver.error_cache)
        with patch.object(resolver, "_try_client", return_value=DATA.copy()):
            self.assertEqual(await resolver.resolve_in_thread(VIDEO), DATA)

    async def test_unavailable_requires_all_clients_and_refresh_bypasses_it(self):
        with patch.object(resolver, "_try_client", side_effect=ValueError("video unavailable")):
            with self.assertRaises(resolver.HTTPException) as caught:
                await resolver.resolve_in_thread(VIDEO)
            self.assertEqual(caught.exception.status_code, 404)
        self.assertIn(VIDEO, resolver.error_cache)
        with patch.object(resolver, "_try_client", return_value=DATA.copy()):
            await resolver.resolve_in_thread(VIDEO, force_refresh=True)
        self.assertNotIn(VIDEO, resolver.error_cache)
        self.assertEqual(resolver.get_cached_stream(VIDEO), DATA)

    async def test_resolution_timeout_does_not_cache_error(self):
        def slow(url, name):
            time.sleep(0.03)
            return DATA.copy()
        with patch.object(resolver, "RESOLVE_TIMEOUT", 0.005), patch.object(resolver, "_try_client", side_effect=slow):
            with self.assertRaises(resolver.HTTPException) as caught:
                await resolver.resolve_in_thread(VIDEO)
            self.assertEqual(caught.exception.status_code, 504)
        self.assertNotIn(VIDEO, resolver.error_cache)
        self.assertNotIn(VIDEO, resolver.cache)

    async def test_worker_admission_is_bounded(self):
        with patch.object(resolver, "resolver_slots", threading.BoundedSemaphore(0)):
            with self.assertRaises(resolver.HTTPException) as caught:
                await resolver.resolve_in_thread(VIDEO)
            self.assertEqual(caught.exception.status_code, 503)
        self.assertNotIn(VIDEO, resolver.error_cache)

    async def test_expired_cdn_url_is_not_reused(self):
        resolver.set_cached_stream(VIDEO, {**DATA, "url": "https://cdn.example/audio?expire=1"})
        self.assertIsNone(resolver.get_cached_stream(VIDEO))

    async def test_success_clears_old_error(self):
        resolver.set_error_cache(VIDEO, 404, "old error")
        resolver.set_cached_stream(VIDEO, DATA.copy())
        self.assertEqual(resolver.get_cached_stream(VIDEO), DATA)
        self.assertNotIn(VIDEO, resolver.error_cache)


class Body(httpx.AsyncByteStream):
    def __init__(self, data):
        self.data = data
        self.closed = False

    async def __aiter__(self):
        yield self.data

    async def aclose(self):
        self.closed = True


class StreamTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        resolver.rate_store.clear()
        self.api = httpx.AsyncClient(transport=httpx.ASGITransport(app=resolver.app), base_url="http://test")

    async def asyncTearDown(self):
        await self.api.aclose()
        await resolver.http_client.aclose()

    def upstream(self, handler):
        resolver.http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    async def test_range_refresh_and_stream_cleanup(self):
        body = Body(b"abcd")
        def handler(request):
            self.assertEqual(request.headers["range"], "bytes=0-3")
            self.assertEqual(request.headers["accept-encoding"], "identity")
            return httpx.Response(206, headers={"content-type": "audio/mp4", "content-range": "bytes 0-3/100", "content-length": "4"}, stream=body)
        self.upstream(handler)
        with patch.object(resolver, "resolve_in_thread", new_callable=AsyncMock, return_value=DATA) as resolve:
            response = await self.api.get(f"/stream?id={VIDEO}&refresh=1", headers={"Range": "bytes=0-3"})
            resolve.assert_awaited_once_with(VIDEO, force_refresh=True)
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, b"abcd")
        self.assertEqual(response.headers["content-range"], "bytes 0-3/100")
        self.assertTrue(body.closed)

    async def test_expired_upstream_is_closed_and_resolved_again(self):
        bodies = []
        def handler(request):
            body = Body(b"expired" if not bodies else b"audio")
            bodies.append(body)
            return httpx.Response(403 if len(bodies) == 1 else 200, stream=body)
        self.upstream(handler)
        with patch.object(resolver, "resolve_in_thread", new_callable=AsyncMock, return_value=DATA) as resolve:
            response = await self.api.get(f"/stream?id={VIDEO}")
            self.assertEqual(resolve.await_count, 2)
            self.assertEqual(resolve.await_args.kwargs, {"force_refresh": True})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"audio")
        self.assertTrue(all(body.closed for body in bodies))

    async def test_unsatisfiable_range_is_preserved_without_reresolve(self):
        self.upstream(lambda request: httpx.Response(416, headers={"content-range": "bytes */100"}, stream=Body(b"")))
        with patch.object(resolver, "resolve_in_thread", new_callable=AsyncMock, return_value=DATA) as resolve:
            response = await self.api.get(f"/stream?id={VIDEO}", headers={"Range": "bytes=1000-"})
            self.assertEqual(resolve.await_count, 1)
        self.assertEqual(response.status_code, 416)
        self.assertEqual(response.headers["content-range"], "bytes */100")

    async def test_head_uses_head_and_closes_upstream(self):
        body = Body(b"")
        def handler(request):
            self.assertEqual(request.method, "HEAD")
            return httpx.Response(200, headers={"content-length": "100"}, stream=body)
        self.upstream(handler)
        with patch.object(resolver, "resolve_in_thread", new_callable=AsyncMock, return_value=DATA):
            response = await self.api.head(f"/stream?id={VIDEO}")
        self.assertEqual(response.content, b"")
        self.assertEqual(response.headers["content-length"], "100")
        self.assertTrue(body.closed)

    async def test_header_wait_has_total_deadline(self):
        async def handler(request):
            await asyncio.sleep(1)
            return httpx.Response(200, stream=Body(b""))
        self.upstream(handler)
        with patch.object(resolver, "STREAM_OPEN_TIMEOUT", 0.01), patch.object(resolver, "resolve_in_thread", new_callable=AsyncMock, return_value=DATA):
            response = await self.api.get(f"/stream?id={VIDEO}")
        self.assertEqual(response.status_code, 504)


if __name__ == "__main__":
    unittest.main()
