import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext.jsx';
import { useProgress } from '../hooks/useProgress.js';
import Markdown from '../components/Markdown.jsx';
import Quiz from '../components/Quiz.jsx';
import CodeEditor from '../components/CodeEditor.jsx';
import KeyboardShortcuts from '../components/KeyboardShortcuts.jsx';

export default function LessonPage() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { progress, toggle } = useProgress();
  const [lesson, setLesson] = useState(null);
  const [curriculum, setCurriculum] = useState(null);
  const [error, setError] = useState(null);
  const [scrollPct, setScrollPct] = useState(0);
  const [showTop, setShowTop] = useState(false);
  const [activeToc, setActiveToc] = useState(null);
  const [toast, setToast] = useState(null);
  const articleRef = useRef(null);

  useEffect(() => {
    setLesson(null);
    setError(null);
    api.get(`/content/lessons/${lessonId}`).then((res) => setLesson(res.data)).catch((e) => {
      const staticMode = !e.response?.data?.message;
      setError(
        staticMode
          ? 'Lesson content is only available when the Spring Boot backend is connected. Host it via the render.yaml blueprint or run it locally (see the README Deployment section), then refresh.'
          : (e.response?.data?.message || 'Lesson not found')
      );
    });
    api.get('/content/curriculum').then((res) => setCurriculum(res.data)).catch(() => {});
    window.scrollTo(0, 0);
  }, [lessonId]);

  // Reading progress bar + scroll-spy TOC + back-to-top visibility.
  useEffect(() => {
    function onScroll() {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      setScrollPct(max > 0 ? Math.min(100, (el.scrollTop / max) * 100) : 0);
      setShowTop(el.scrollTop > 600);
      const headings = articleRef.current?.querySelectorAll('h2, h3');
      if (headings) {
        let current = null;
        for (const h of headings) {
          if (h.getBoundingClientRect().top <= 96) current = h.id || slug(h.textContent);
        }
        setActiveToc(current);
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [lesson]);

  const toc = useMemo(() => {
    if (!lesson) return [];
    const lines = lesson.body.split('\n');
    const out = [];
    for (const line of lines) {
      const m = /^(#{2,3})\s+(.*)/.exec(line);
      if (m) {
        out.push({ level: m[1].length, text: m[2].replace(/[`*]/g, ''), id: slug(m[2]) });
      }
    }
    return out;
  }, [lesson]);

  const nav = useMemo(() => {
    if (!Array.isArray(curriculum) || !lesson) return { prev: null, next: null };
    const all = curriculum.flatMap((m) => m.lessons);
    const idx = all.findIndex((l) => l.id === lesson.lesson.id);
    return { prev: idx > 0 ? all[idx - 1] : null, next: idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null };
  }, [curriculum, lesson]);

  function flash(msg) {
    setToast(msg);
    window.clearTimeout(flash._t);
    flash._t = window.setTimeout(() => setToast(null), 2000);
  }

  async function onToggle() {
    await toggle(l?.id, completed);
    flash(completed ? 'Marked as unread' : '✓ Lesson marked complete');
  }

  async function markAndContinue() {
    if (!completed && user) {
      await toggle(l.id, false);
      flash('✓ Lesson marked complete');
    }
    if (nav.next) navigate(`/lessons/${nav.next.id}`);
  }

  if (error) return <div className="call warn"><div className="ct">⚠ Lesson unavailable</div><p>{error}</p></div>;
  if (!lesson) return <div className="page-loading">Loading lesson…</div>;

  const l = lesson.lesson;
  const completed = !!progress[l.id];

  return (
    <div className="page lesson">
      <div className="readbar" style={{ width: `${scrollPct}%` }} />
      <div className="crumbs">
        <Link to="/">Academy</Link> <span className="sep">/</span>
        <Link to={`/modules/${l.moduleId}`}>{l.moduleTitle}</Link> <span className="sep">/</span>
        <span>{l.title}</span>
      </div>

      <div className="pagehead">
        {l.capstone && <div className="capbadge">CAPSTONE PROJECT</div>}
        <div className="meta-chips">
          <span className="chip amber">LESSON {l.order}</span>
          <span className="chip blue">⏱ {l.minutes} min</span>
          {l.topics.slice(0, 5).map((t) => (
            <span key={t} className="chip">{t}</span>
          ))}
        </div>
        <h1 className="ptitle">{l.title}</h1>
        <p className="lede">{l.summary}</p>
        <div className="head-actions">
          {user ? (
            <>
              <button className={`btn ${completed ? 'donebtn' : 'primary'}`} onClick={onToggle}>
                {completed ? '✓ Completed — mark as unread' : 'Mark lesson complete'}
              </button>
              {nav.next && (
                <button className="btn ghost" onClick={markAndContinue}>
                  {completed ? 'Next lesson →' : 'Mark complete & continue →'}
                </button>
              )}
            </>
          ) : (
            <Link to="/login" className="btn primary">Sign in to track progress</Link>
          )}
        </div>
      </div>

      <div className="lesson-layout">
        <article className="lesson-body" ref={articleRef}>
          <Markdown>{lesson.body}</Markdown>

          {/* Interactive Quiz */}
          <div className="lesson-quiz-section">
            <Quiz lessonId={lessonId} onComplete={(result) => {
              if (result.passed) {
                flash('🎉 Quiz passed! Great job!');
              }
            }} />
          </div>

          {/* Practice Code Editor */}
          <div className="lesson-code-section">
            <h3>💻 Practice Code</h3>
            <p className="code-description">Try writing code to reinforce what you learned:</p>
            <CodeEditor 
              initialCode={extractCodeExample(lesson.body)}
              language="java"
              onChange={(code) => console.log('Code updated:', code.length, 'chars')}
            />
          </div>

          <div className="docsbox">
            <div className="db-title">⚑ OFFICIAL DOCUMENTATION</div>
            <p>Read the authoritative reference for this lesson:</p>
            <ul>
              {lesson.docs.map((d) => (
                <li key={d}>
                  <a href={d} target="_blank" rel="noreferrer">
                    {d.replace(/^https?:\/\//, '').replace(/\/$/, '')} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {user && (
            <div className="lesson-complete-cta">
              {nav.next ? (
                <button className="btn primary" onClick={markAndContinue}>
                  {completed ? `Continue to next lesson →` : `Mark complete & continue →`}
                </button>
              ) : (
                <div className="call ok">
                  <div className="ct">🏁 You finished the curriculum!</div>
                  <p>That was the last lesson. Review any module from the sidebar or ask the AI tutor about anything you missed.</p>
                </div>
              )}
            </div>
          )}

          <div className="pn">
            {nav.prev ? (
              <Link to={`/lessons/${nav.prev.id}`} className="prev">
                <span className="dir">← PREVIOUS</span>
                <span className="nm">{nav.prev.title}</span>
              </Link>
            ) : <span />}
            {nav.next ? (
              <Link to={`/lessons/${nav.next.id}`} className="next">
                <span className="dir">NEXT →</span>
                <span className="nm">{nav.next.title}</span>
              </Link>
            ) : null}
          </div>
        </article>

        {toc.length > 0 && (
          <aside className="toc">
            <div className="toc-title">ON THIS PAGE</div>
            {toc.map((h) => (
              <a
                key={h.id}
                href={`#${h.id}`}
                className={activeToc === h.id ? 'active' : ''}
                style={{ paddingLeft: h.level === 3 ? 24 : 12 }}
              >
                {h.text}
              </a>
            ))}
          </aside>
        )}
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
      <KeyboardShortcuts prevLesson={nav.prev} nextLesson={nav.next} />
      {showTop && (
        <button className="totop" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to top">↑</button>
      )}
    </div>
  );
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
}

function extractCodeExample(body) {
  // Extract ALL Java code blocks from the lesson body
  const codeBlockRegex = /```java\n([\s\S]*?)```/g;
  const blocks = [];
  let match;
  while ((match = codeBlockRegex.exec(body)) !== null) {
    if (match[1] && match[1].trim().length > 20) {
      blocks.push(match[1].trim());
    }
  }

  if (blocks.length > 0) {
    // Pick the block with the most println/executable lines — most interactive
    let best = blocks[0];
    let bestScore = -1;
    for (const block of blocks) {
      const lines = block.split('\n').length;
      const printCount = (block.match(/System\.out\.print/g) || []).length;
      const hasMain = block.includes('public static void main') ? 5 : 0;
      const score = lines * 2 + printCount * 3 + hasMain;
      if (score > bestScore) {
        bestScore = score;
        best = block;
      }
    }
    return best;
  }

  // Fallback based on module keywords in the body
  const lowerBody = body.toLowerCase();
  if (lowerBody.includes('array') || lowerBody.includes('indexed')) {
    return `public class ArraysDemo {
    public static void main(String[] args) {
        String[] languages = {"Java", "Python", "JavaScript", "Go", "Rust"};
        System.out.println("We have " + languages.length + " languages:");
        for (int i = 0; i < languages.length; i++) {
            System.out.println("  " + (i + 1) + ". " + languages[i]);
        }
    }
}`;
  }
  if (lowerBody.includes('loop') || lowerBody.includes('iteration')) {
    return `public class LoopDemo {
    public static void main(String[] args) {
        System.out.println("Counting with for loop:");
        for (int i = 1; i <= 10; i++) {
            System.out.println("  " + i + " x 5 = " + (i * 5));
        }
        System.out.println("\nWhile loop — summing 1 to 100:");
        int sum = 0, n = 1;
        while (n <= 100) { sum += n; n++; }
        System.out.println("Sum = " + sum);
    }
}`;
  }
  if (lowerBody.includes('string')) {
    return `public class StringDemo {
    public static void main(String[] args) {
        String name = "BackendForge Academy";
        System.out.println("Length: " + name.length());
        System.out.println("Uppercase: " + name.toUpperCase());
        System.out.println("Contains 'Forge': " + name.contains("Forge"));
        System.out.println("Replace: " + name.replace("Backend", "Front"));
        System.out.println("Substring(0,6): " + name.substring(0, 6));
    }
}`;
  }
  if (lowerBody.includes('class') || lowerBody.includes('object') || lowerBody.includes('oop')) {
    return `class Animal {
    String name;
    int age;
    Animal(String name, int age) { this.name = name; this.age = age; }
    void speak() { System.out.println(name + " says hello!"); }
}

class Dog extends Animal {
    Dog(String name, int age) { super(name, age); }
    @Override
    void speak() { System.out.println(name + " barks!"); }
}

public class OopDemo {
    public static void main(String[] args) {
        Animal cat = new Animal("Whiskers", 3);
        Dog rex = new Dog("Rex", 5);
        cat.speak();  // Whiskers says hello!
        rex.speak();  // Rex barks!
        System.out.println(cat instanceof Animal);  // true
    }
}`;
  }
  if (lowerBody.includes('exception') || lowerBody.includes('try') || lowerBody.includes('catch')) {
    return `public class ExceptionDemo {
    public static void main(String[] args) {
        try {
            int result = divide(10, 0);
            System.out.println("Result: " + result);
        } catch (ArithmeticException e) {
            System.out.println("Error: " + e.getMessage());
        }
        try {
            int[] arr = {1, 2, 3};
            System.out.println(arr[10]);
        } catch (ArrayIndexOutOfBoundsException e) {
            System.out.println("Array index out of bounds!");
        }
        System.out.println("Program continues after exceptions.");
    }
    static int divide(int a, int b) {
        if (b == 0) throw new ArithmeticException("Cannot divide by zero");
        return a / b;
    }
}`;
  }
  if (lowerBody.includes('stream') || lowerBody.includes('lambda')) {
    return `import java.util.*;
import java.util.stream.*;

public class StreamDemo {
    public static void main(String[] args) {
        List<String> names = Arrays.asList("Alice", "Bob", "Charlie", "Diana");
        List<String> result = names.stream()
            .filter(n -> n.length() > 3)
            .map(String::toUpperCase)
            .sorted()
            .collect(Collectors.toList());
        System.out.println("Long names (sorted, uppercase): " + result);

        int sum = IntStream.rangeClosed(1, 100).sum();
        System.out.println("Sum 1-100: " + sum);
    }
}`;
  }
  if (lowerBody.includes('map') || lowerBody.includes('hash')) {
    return `import java.util.*;

public class MapDemo {
    public static void main(String[] args) {
        Map<String, Integer> scores = new HashMap<>();
        scores.put("Alice", 95);
        scores.put("Bob", 87);
        scores.put("Charlie", 92);
        System.out.println("Alice's score: " + scores.get("Alice"));
        System.out.println("All scores: " + scores);
        scores.putIfAbsent("Diana", 88);
        scores.computeIfPresent("Bob", (k, v) -> v + 5);
        System.out.println("After updates: " + scores);
    }
}`;
  }
  if (lowerBody.includes('collection') || lowerBody.includes('list') || lowerBody.includes('set')) {
    return `import java.util.*;

public class CollectionDemo {
    public static void main(String[] args) {
        List<String> list = new ArrayList<>(Arrays.asList("Java", "Python", "Go"));
        list.add("Rust");
        System.out.println("List: " + list);

        Set<Integer> set = new HashSet<>(Set.of(1, 2, 3, 3, 4));
        System.out.println("Set (no duplicates): " + set);

        Collections.sort(list);
        System.out.println("Sorted: " + list);
    }
}`;
  }
  // Ultimate fallback — still useful code, not Hello World
  return `public class Playground {
    public static void main(String[] args) {
        // --- Try editing this code! ---
        String topic = "Java Programming";
        int year = 2025;
        double pi = 3.14159;
        boolean learning = true;

        System.out.println("Topic: " + topic);
        System.out.println("Year: " + year);
        System.out.println("Pi to 2 decimals: " + String.format("%.2f", pi));
        System.out.println("Still learning? " + learning);

        System.out.println("\n--- Try: arrays, loops, classes, streams! ---");
    }
}`;
}
