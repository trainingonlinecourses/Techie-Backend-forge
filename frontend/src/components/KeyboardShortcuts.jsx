import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Keyboard shortcuts for the learning platform:
 * - j / → : Next lesson
 * - k / ← : Previous lesson
 * - h     : Home
 * - /     : Focus search
 * - ?     : Show shortcuts help
 * - Esc   : Close modals / blur input
 */
export default function KeyboardShortcuts({ prevLesson, nextLesson }) {
  const navigate = useNavigate();

  const handler = useCallback((e) => {
    // Don't fire when typing in an input/textarea
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }

    switch (e.key) {
      case 'j':
      case 'ArrowRight':
        if (nextLesson && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          navigate(`/lessons/${nextLesson.id}`);
        }
        break;
      case 'k':
      case 'ArrowLeft':
        if (prevLesson && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          navigate(`/lessons/${prevLesson.id}`);
        }
        break;
      case 'h':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          navigate('/');
        }
        break;
      case '/':
        e.preventDefault();
        document.querySelector('.searchwrap input')?.focus();
        break;
      case '?':
        e.preventDefault();
        showShortcutsHelp();
        break;
      default:
        break;
    }
  }, [navigate, prevLesson, nextLesson]);

  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler]);

  return null; // Purely side-effect component
}

function showShortcutsHelp() {
  // Remove existing help overlay if any
  const existing = document.getElementById('shortcuts-help');
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement('div');
  overlay.id = 'shortcuts-help';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 200;
    background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
    display: grid; place-items: center;
    animation: fadeIn 0.2s ease-out;
  `;

  const card = document.createElement('div');
  card.style.cssText = `
    background: var(--surface); border: 1px solid var(--line2);
    border-radius: 16px; padding: 28px 32px; max-width: 420px; width: 90%;
    box-shadow: 0 24px 60px rgba(0,0,0,0.6);
    animation: scaleIn 0.25s ease-out;
  `;

  card.innerHTML = `
    <h3 style="font-family: var(--disp); font-size: 18px; margin-bottom: 16px; color: var(--amber);">
      ⌨ Keyboard Shortcuts
    </h3>
    <div style="display: grid; gap: 8px; font-size: 13px;">
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--mut);">Next lesson</span>
        <kbd style="font-family: var(--mono); background: var(--bg2); border: 1px solid var(--line); border-radius: 5px; padding: 2px 8px; font-size: 11px; color: var(--amber);">j</kbd>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--mut);">Previous lesson</span>
        <kbd style="font-family: var(--mono); background: var(--bg2); border: 1px solid var(--line); border-radius: 5px; padding: 2px 8px; font-size: 11px; color: var(--amber);">k</kbd>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--mut);">Go home</span>
        <kbd style="font-family: var(--mono); background: var(--bg2); border: 1px solid var(--line); border-radius: 5px; padding: 2px 8px; font-size: 11px; color: var(--amber);">h</kbd>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--mut);">Focus search</span>
        <kbd style="font-family: var(--mono); background: var(--bg2); border: 1px solid var(--line); border-radius: 5px; padding: 2px 8px; font-size: 11px; color: var(--amber);">/</kbd>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--mut);">Show this help</span>
        <kbd style="font-family: var(--mono); background: var(--bg2); border: 1px solid var(--line); border-radius: 5px; padding: 2px 8px; font-size: 11px; color: var(--amber);">?</kbd>
      </div>
    </div>
    <p style="font-family: var(--mono); font-size: 10px; color: var(--dim); margin-top: 16px; text-align: center;">
      Press ? again or click outside to close
    </p>
  `;

  overlay.appendChild(card);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.addEventListener('keydown', function closeHelp(e) {
    if (e.key === 'Escape' || e.key === '?') {
      overlay.remove();
      document.removeEventListener('keydown', closeHelp);
    }
  });

  document.body.appendChild(overlay);
}
