import React, { useEffect, useRef, useState } from 'react';

/**
 * Convert lesson markdown into clean, speakable text:
 * - code fences become a short spoken cue (the learner reads code in the editor)
 * - tables, images and markdown decorations are stripped
 * - headings become spoken section announcements
 */
export function toSpeechText(md) {
  if (!md) return '';
  const lines = md.split('\n');
  const out = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (!inFence) out.push('Code example — follow along in the editor below.');
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const t = line.trim();
    if (!t) continue;
    if (/^\|/.test(t)) continue;                    // table rows
    if (/^!\[/.test(t)) continue;                   // images
    if (/^[-*+]\s\[[ x]\]/.test(t)) continue;       // task lists
    if (/^#{1,6}\s/.test(t)) {
      out.push(t.replace(/^#{1,6}\s+/, '').replace(/[`*_~]/g, '') + '.');
      continue;
    }
    if (/^>\s?/.test(t)) { out.push(t.replace(/^>\s?/, '').replace(/[`*_~]/g, '')); continue; }
    // links → keep label only
    let s = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    s = s.replace(/[`*_~]{1,3}/g, '');
    s = s.replace(/^\s*[-*+]\s+/, '');
    if (s) out.push(s);
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

/** Split into utterance-sized chunks at sentence boundaries.
 *  Kept well under Chrome's ~15s per-utterance cap at 0.9x–1x speed. */
export function chunkText(text, max = 180) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + ' ' + s).length > max && cur) {
      chunks.push(cur.trim());
      cur = s;
    } else {
      cur = (cur ? cur + ' ' : '') + s;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

/**
 * Sequential narration engine.
 *
 * Why not queue all chunks at once? Two documented Chromium bugs break that:
 *  1. Utterance objects that are not referenced from JS can be garbage-collected
 *     before (or mid) speech → narration silently dies. We keep the current
 *     utterance in a ref.
 *  2. Long mass-queued utterances get cut off when the queue drains
 *     (the "speech stops after N seconds" bug). We speak exactly one chunk at
 *     a time and advance from onend.
 * A watchdog interval also nudges synthesis awake if the browser auto-pauses.
 * All speech errors are surfaced in the UI instead of failing silently.
 */
export default function AudioPlayer({ body, title }) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState(null);
  const [rate, setRate] = useState(1);
  const queueRef = useRef([]);        // remaining chunks
  const utterRef = useRef(null);      // ← retained utterance (GC protection)
  const watchdogRef = useRef(null);   // auto-resume interval
  const startCheckRef = useRef(null); // "did playback actually start" timer
  const stopRef = useRef(false);
  const pausedRef = useRef(false);    // mirror of `paused` for timers
  const rateRef = useRef(1);          // rate readable inside callbacks without stale closures

  function clearWatchdog() {
    if (watchdogRef.current) {
      clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
    if (startCheckRef.current) {
      clearTimeout(startCheckRef.current);
      startCheckRef.current = null;
    }
  }

  /** Stop everything — safe to call from effects/cleanup paths. */
  function hardStop(withState = true) {
    stopRef.current = true;
    clearWatchdog();
    if (supported) window.speechSynthesis.cancel();
    utterRef.current = null;
    queueRef.current = [];
    pausedRef.current = false;
    if (withState) {
      setPlaying(false);
      setPaused(false);
    }
  }

  // Changing lessons must stop any narration immediately (no setState during unmount).
  useEffect(() => {
    return () => {
      stopRef.current = true;
      clearWatchdog();
      if (supported) window.speechSynthesis.cancel();
    };
  }, [body, supported]);

  // Voices load asynchronously in Chrome — warm them up so the first click has a voice.
  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    synth.getVoices();
    const warm = () => synth.getVoices();
    synth.addEventListener?.('voiceschanged', warm);
    return () => synth.removeEventListener?.('voiceschanged', warm);
  }, [supported]);

  function pickVoice() {
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((v) => v.lang?.startsWith('en') && /natural|google|samantha|aria|jenny/i.test(v.name)) ||
      voices.find((v) => v.lang?.startsWith('en')) ||
      voices[0] ||
      null
    );
  }

  function startWatchdog() {
    clearWatchdog();
    watchdogRef.current = setInterval(() => {
      // Chromium occasionally flips itself into the paused state mid-utterance.
      if (window.speechSynthesis.paused && !stopRef.current) {
        window.speechSynthesis.resume();
      }
    }, 5000);
  }

  function speakNext(r) {
    if (stopRef.current) return;
    const synth = window.speechSynthesis;
    const chunk = queueRef.current.shift();

    if (chunk === undefined) {
      // Queue finished cleanly.
      clearWatchdog();
      utterRef.current = null;
      setPlaying(false);
      setPaused(false);
      return;
    }

    const u = new SpeechSynthesisUtterance(chunk);
    utterRef.current = u; // ← keep a reference: Chromium GCs unreferenced utterances mid-speech
    u.rate = r;
    u.pitch = 1;
    u.lang = 'en-US';
    const v = pickVoice();
    if (v) u.voice = v;

    u.onstart = () => {
      // Playback genuinely began — cancel the "never started" check.
      if (startCheckRef.current) {
        clearTimeout(startCheckRef.current);
        startCheckRef.current = null;
      }
    };
    u.onend = () => {
      if (!stopRef.current) speakNext(r);
    };
    u.onerror = (e) => {
      const kind = e?.error || '';
      // cancel()/interrupted are us stopping — not failures.
      if (stopRef.current || kind === 'interrupted' || kind === 'canceled' || kind === 'interrupt') return;
      setError(
        kind === 'not-allowed'
          ? 'Audio was blocked by the browser — click the Listen button again to allow it.'
          : `Narration failed in this browser${kind ? ` (${kind})` : ''}. Chrome and Edge work best.`
      );
      hardStop();
    };

    synth.speak(u);
    startWatchdog();
  }

  function speak(rateOverride) {
    const synth = window.speechSynthesis;
    synth.cancel(); // clear any half-dead queue from a previous attempt
    stopRef.current = false;
    setError(null);
    pausedRef.current = false;

    const full = toSpeechText(`# ${title || ''}\n\n${body || ''}`);
    if (!full) return;

    // Defensive: the click handler used to pass the MouseEvent straight through
    // (onClick={speak}), which coerced to NaN and killed the utterance with
    // "The provided float value is non-finite" before any sound played.
    const r = typeof rateOverride === 'number' && Number.isFinite(rateOverride) ? rateOverride : rateRef.current;
    queueRef.current = chunkText(full, 180);
    setPlaying(true);
    setPaused(false);

    // Deferred start: Chromium processes cancel() asynchronously, and a speak()
    // in the same tick can be swallowed as "interrupted". A short delay makes
    // the first utterance reliable (verified in real browsers).
    setTimeout(() => {
      if (stopRef.current) return;
      // "Never actually started" detector: if the engine reports no activity
      // shortly after we begin, say so instead of showing a lying Pause button.
      startCheckRef.current = setTimeout(() => {
        if (!stopRef.current && !window.speechSynthesis.speaking && !window.speechSynthesis.pending && !pausedRef.current) {
          setError('No narration started — this browser has no speech voices installed or audio is blocked. Chrome and Edge work best.');
          hardStop();
        }
      }, 3000);
      speakNext(r);
    }, 80);
  }

  function pauseResume() {
    const synth = window.speechSynthesis;
    if (paused) {
      synth.resume();
      pausedRef.current = false;
      startWatchdog();
      setPaused(false);
    } else {
      clearWatchdog(); // a deliberate pause must not be "resumed" by the watchdog
      synth.pause();
      pausedRef.current = true;
      setPaused(true);
    }
  }

  function stop() {
    setError(null);
    hardStop();
  }

  function changeRate(r) {
    setRate(r);
    rateRef.current = r;
    if (playing) {
      // Restart at the new speed — the only reliable way to apply rate mid-playback.
      speak(r);
    }
  }

  if (!supported) return null;

  return (
    <div className="audio-player" role="region" aria-label="Lesson audio narration">
      <button
        className="audio-btn"
        onClick={() => (playing ? pauseResume() : speak())}
        title={playing ? 'Pause narration' : 'Listen to this lesson'}
      >
        {playing && !paused ? '⏸ Pause' : '🔊 Listen'}
      </button>
      {playing && (
        <button className="audio-btn ghost" onClick={stop} title="Stop narration">■ Stop</button>
      )}
      <div className="audio-rate" role="group" aria-label="Narration speed">
        {[0.9, 1, 1.25, 1.5].map((r) => (
          <button
            key={r}
            className={`audio-rate-btn ${rate === r ? 'active' : ''}`}
            onClick={() => changeRate(r)}
            title={`${r}x speed`}
          >
            {r}x
          </button>
        ))}
      </div>
      {error && <span className="audio-err">⚠ {error}</span>}
    </div>
  );
}
