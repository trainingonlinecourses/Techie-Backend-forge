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

/** Split into utterance-sized chunks at sentence boundaries (TTS engines choke on huge strings). */
function chunkText(text, max = 220) {
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

export default function AudioPlayer({ body, title }) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [rate, setRate] = useState(1);
  const stopRef = useRef(false);

  useEffect(() => {
    // Changing lessons must stop any narration immediately.
    return () => { if (supported) window.speechSynthesis.cancel(); };
  }, [body, supported]);

  if (!supported) return null;

  function speak(rateOverride) {
    const synth = window.speechSynthesis;
    synth.cancel();
    stopRef.current = false;

    const full = toSpeechText(`# ${title || ''}\n\n${body || ''}`);
    if (!full) return;

    for (const chunk of chunkText(full)) {
      const u = new SpeechSynthesisUtterance(chunk);
      u.rate = rateOverride ?? rate;
      u.pitch = 1;
      u.lang = 'en-US';
      // Pick a voice that matches the language once voices are loaded.
      const voices = synth.getVoices();
      const v = voices.find((x) => x.lang?.startsWith('en') && /natural|google|samantha/i.test(x.name))
        || voices.find((x) => x.lang?.startsWith('en'));
      if (v) u.voice = v;
      u.onend = () => {
        if (!stopRef.current && !synth.speaking && !synth.pending) {
          setPlaying(false);
          setPaused(false);
        }
      };
      synth.speak(u);
    }
    setPlaying(true);
    setPaused(false);
  }

  function pauseResume() {
    const synth = window.speechSynthesis;
    if (paused) {
      synth.resume();
      setPaused(false);
    } else {
      synth.pause();
      setPaused(true);
    }
  }

  function stop() {
    stopRef.current = true;
    window.speechSynthesis.cancel();
    setPlaying(false);
    setPaused(false);
  }

  function changeRate(r) {
    setRate(r);
    if (playing) {
      // Restart at the new speed (simplest robust way to apply rate mid-playback).
      speak(r);
    }
  }

  return (
    <div className="audio-player" role="region" aria-label="Lesson audio narration">
      <button className="audio-btn" onClick={playing ? pauseResume : speak} title={playing ? 'Pause narration' : 'Listen to this lesson'}>
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
    </div>
  );
}
