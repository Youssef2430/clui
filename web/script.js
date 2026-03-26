/* ═══════════════════════════════════════════════════════════════
   Clui Landing Page — Enhanced Interactions
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Theme Management ──────────────────────────────────────────
  const root = document.documentElement;

  function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function getStoredTheme() {
    try { return localStorage.getItem('clui-theme'); } catch { return null; }
  }

  function setTheme(theme) {
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem('clui-theme', theme); } catch {}

    // Sync the floating demo screenshot to page theme
    const demoFloat = document.querySelector('.demo-float');
    if (demoFloat) {
      if (theme === 'dark') {
        demoFloat.classList.add('show-dark');
      } else {
        demoFloat.classList.remove('show-dark');
      }
    }
  }

  // Initialize theme
  const stored = getStoredTheme();
  setTheme(stored || getSystemTheme());

  // Listen for system changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!getStoredTheme()) {
      setTheme(e.matches ? 'dark' : 'light');
    }
  });

  // Theme toggle button
  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('.theme-toggle');
    if (!toggle) return;
    const current = root.getAttribute('data-theme') || getSystemTheme();
    setTheme(current === 'dark' ? 'light' : 'dark');
  });

  // ── Scroll Reveal ─────────────────────────────────────────────
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

  // Trigger hero reveals immediately with stagger
  document.querySelectorAll('.hero .reveal').forEach((el, i) => {
    setTimeout(() => el.classList.add('visible'), i * 90);
  });

  // ── Keyboard Press Animation ──────────────────────────────────
  const optKey = document.getElementById('kbdOption');
  const spaceKey = document.getElementById('kbdSpace');

  if (optKey && spaceKey) {
    function pressKeys() {
      optKey.classList.add('pressed');
      spaceKey.classList.add('pressed');
      setTimeout(() => {
        optKey.classList.remove('pressed');
        spaceKey.classList.remove('pressed');
      }, 380);
    }

    setTimeout(() => {
      pressKeys();
      setInterval(pressKeys, 3000);
    }, 1500);
  }

  // ── Subtle parallax on demo frame ─────────────────────────────
  const demoFrame = document.querySelector('.hero-demo-frame');
  if (demoFrame) {
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const rect = demoFrame.getBoundingClientRect();
          const viewH = window.innerHeight;
          if (rect.top < viewH && rect.bottom > 0) {
            const progress = (viewH - rect.top) / (viewH + rect.height);
            const shift = (progress - 0.5) * 20;
            demoFrame.style.transform = `translateY(${shift}px)`;
          }
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  // ── Nav shadow on scroll ──────────────────────────────────────
  const nav = document.querySelector('nav');
  if (nav) {
    let navTicking = false;
    window.addEventListener('scroll', () => {
      if (!navTicking) {
        requestAnimationFrame(() => {
          if (window.scrollY > 20) {
            nav.style.boxShadow = '0 1px 8px rgba(0,0,0,.06)';
          } else {
            nav.style.boxShadow = 'none';
          }
          navTicking = false;
        });
        navTicking = true;
      }
    });
  }

  // ── Smooth anchor scroll ──────────────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id === '#') return;
      const target = document.querySelector(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ── Terminal Install Animation ────────────────────────────────
  const terminal = document.getElementById('installTerminal');
  if (terminal) {
    const body = terminal.querySelector('.terminal-body');
    const restartBtn = terminal.querySelector('.terminal-restart');

    // Each step: { text, delay (ms before showing), type }
    const lines = [
      { text: '<span class="term-prompt">~ $</span> <span class="term-cmd">brew tap Youssef2430/clui</span>', delay: 400 },
      { text: '<span class="term-info">==></span> Tapping Youssef2430/clui...', delay: 600 },
      { text: '<span class="term-success">✓</span> <span class="term-info">Tapped 1 cask (Youssef2430/clui/clui)</span>', delay: 900 },
      { text: '', delay: 300 },
      { text: '<span class="term-prompt">~ $</span> <span class="term-cmd">brew install --cask clui</span>', delay: 500 },
      { text: '<span class="term-info">==></span> Downloading Clui.dmg...', delay: 700 },
      { text: '<span class="term-info">######################################## 100.0%</span>', delay: 1200 },
      { text: '<span class="term-info">==></span> Installing Cask clui', delay: 600 },
      { text: '<span class="term-info">==></span> Moving App \'Clui.app\' to \'/Applications/Clui.app\'', delay: 500 },
      { text: '<span class="term-success">✓</span> clui was successfully installed!', delay: 400 },
      { text: '', delay: 300 },
      { text: '<span class="term-prompt">~ $</span> <span class="term-cmd">open -a Clui</span>', delay: 600 },
      { text: '<span class="term-success">✓</span> Clui is running · Press <span class="term-cmd">⌥ Space</span> to summon', delay: 800 },
    ];

    let animTimeout = null;
    let lineEls = [];

    function runTerminal() {
      // Clear previous
      lineEls.forEach(el => el.remove());
      lineEls = [];
      if (restartBtn) restartBtn.classList.remove('visible');

      // Remove old cursor
      const oldCursor = body.querySelector('.terminal-cursor');
      if (oldCursor) oldCursor.remove();

      let totalDelay = 0;

      lines.forEach((line, i) => {
        totalDelay += line.delay;

        animTimeout = setTimeout(() => {
          // Remove cursor from previous line
          const prev = body.querySelector('.terminal-cursor');
          if (prev) prev.remove();

          const div = document.createElement('div');
          div.className = 'terminal-line';
          if (line.text === '') {
            div.innerHTML = '&nbsp;';
          } else {
            div.innerHTML = line.text;
            // Add cursor to command lines (last line or lines with prompt)
            if (i === lines.length - 1) {
              // no cursor on last line
            } else if (line.text.includes('term-prompt')) {
              const cursor = document.createElement('span');
              cursor.className = 'terminal-cursor';
              div.appendChild(cursor);
            }
          }

          // Insert before restart button
          if (restartBtn) {
            body.insertBefore(div, restartBtn);
          } else {
            body.appendChild(div);
          }
          lineEls.push(div);

          // Trigger visible after paint
          requestAnimationFrame(() => {
            div.classList.add('visible');
          });

          // Show restart on last line
          if (i === lines.length - 1 && restartBtn) {
            setTimeout(() => restartBtn.classList.add('visible'), 600);
          }
        }, totalDelay);
      });
    }

    // Start when terminal scrolls into view
    const termObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setTimeout(runTerminal, 400);
          termObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    termObserver.observe(terminal);

    // Restart button
    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        runTerminal();
      });
    }
  }

})();
