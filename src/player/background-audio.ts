"use client";

/**
 * Screen Wake Lock Utility
 * Keeps the screen awake during full-screen player or lyrics display if requested by the user.
 */

let wakeLockSentinel: any = null;

export async function requestScreenWakeLock() {
  if (typeof window === "undefined") return;
  if ("wakeLock" in navigator) {
    try {
      wakeLockSentinel = await (navigator as any).wakeLock.request("screen");
    } catch {
      // Wake lock request failed or not permitted
    }
  }
}

export function releaseScreenWakeLock() {
  if (wakeLockSentinel) {
    try {
      wakeLockSentinel.release();
      wakeLockSentinel = null;
    } catch {
      // ignore
    }
  }
}
