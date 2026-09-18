"use client";

import { useEffect } from "react";
import { initAudioEngine } from "@/player/audio-engine";
import { useMediaSession } from "@/player/media-session";

/**
 * GlobalAudioEngine — mounted once at the root layout.
 * Initializes the audio engine and media session.
 * Renders nothing to the DOM.
 */
export function GlobalAudioEngine() {
  useEffect(() => {
    initAudioEngine();
  }, []);

  useMediaSession();

  return null;
}
