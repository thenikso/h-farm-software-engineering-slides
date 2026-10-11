// Shared slide engine for the weekly HTML decks (Weeks 1–5).
// Each deck sets <body data-week="04"> and loads this file at the end of <body>.
// Optional per-deck data, set in an inline script before this file:
//   window.SPOKEN_GISTS = [[...], ...]  short glance cues for the rehearsal script
//
// Stepped reveals: elements marked data-cue (or data-cue="1") appear on the
// first press of E, data-cue="2" on the second, and so on. Pressing E after
// the last step hides them all again, so the slide can be replayed.
(() => {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  const week =
    document.body.dataset.week ||
    (/week-(\d\d)/.exec(location.pathname) || [])[1] ||
    '';
  const weekShort = String(Number(week) || week);

  const slides = [...document.querySelectorAll('.slide')];
  const slideFromHash = () => {
    const match = /^#([1-9]\d*)$/.exec(location.hash);
    const number = match && Number(match[1]);
    return number && number <= slides.length ? number - 1 : 0;
  };
  const $ = (selector) => document.querySelector(selector);
  const rail = $('#rail');
  const railSeg = $('#rail-seg');
  const railFill = $('#rail-progress');
  const railCurrent = $('#rail-current');
  const pos = $('#pos');
  const emph = $('#emph');
  const nLoc = $('#n-loc');
  const nTitle = $('#n-title');
  const nBody = $('#n-body');
  const panel = $('#notes');
  const isNotesView =
    new URLSearchParams(location.search).get('view') === 'notes';
  let i = slideFromHash(),
    lock = 0,
    seg = null,
    shownIndex = -1,
    step = 0;

  const cueStep = (el) => Math.max(1, Number(el.dataset.cue) || 1);
  const cuesOf = (s) => [...s.querySelectorAll('[data-cue]')];
  const stepsOf = (s) => cuesOf(s).reduce((m, el) => Math.max(m, cueStep(el)), 0);

  // Facilitator timing is kept out of the student PDF. Every slide receives
  // a facilitator section even when timing is its only private prompt.
  slides.forEach((s) => {
    const sn = s.querySelector('.sn');
    if (!sn) return;
    let fn = sn.querySelector(':scope > .fn');
    if (!fn) {
      fn = document.createElement('div');
      fn.className = 'fn';
      sn.append(fn);
    }
    const t = document.createElement('p');
    t.className = 'n-time';
    t.innerHTML = `<span>${s.dataset.min} min</span><span>${s.dataset.block} · to ${s.dataset.target}</span>`;
    fn.append(t);
  });

  // Each spoken paragraph can begin with a deliberately short glance cue.
  // The full script remains untouched underneath as a safety net.
  const gists = window.SPOKEN_GISTS || [];
  slides.forEach((s, slideIndex) => {
    if (!gists[slideIndex]) return;
    const fn = s.querySelector('.sn > .fn');
    if (!fn) return;
    const scriptHeading = [...fn.querySelectorAll(':scope > h3')].find(
      (heading) => heading.textContent.trim() === 'Say · rehearsal script',
    );
    if (!scriptHeading) return;
    let paragraph = scriptHeading.nextElementSibling;
    let gistIndex = 0;
    while (
      paragraph?.tagName === 'P' &&
      !paragraph.classList.contains('n-time')
    ) {
      const gist = gists[slideIndex][gistIndex];
      if (gist) {
        const label = document.createElement('span');
        label.className = 'spoken-gist';
        label.textContent = gist;
        paragraph.prepend(label);
      }
      gistIndex += 1;
      paragraph = paragraph.nextElementSibling;
    }
  });

  // Describe a deferred hint or emphasis in private notes, not the PDF.
  slides.forEach((s) => {
    const steps = stepsOf(s);
    if (!steps) return;
    const fn = s.querySelector('.sn > .fn');
    if (!fn) return;
    const n = document.createElement('p');
    n.className = 'n-cue';
    n.innerHTML =
      steps > 1
        ? `This slide reveals in <b>${steps} steps</b>. Press <b>E</b> for each step; E after the last one hides them again.`
        : s.querySelector('.reveal[data-cue]')
          ? 'This slide has a <b>hint or example</b>. Let students try first, then press <b>E</b> if it would help.'
          : 'This slide holds <b>deferred emphasis</b>. Let the room read the sentence first, then press <b>E</b>.';
    fn.prepend(n);
  });

  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- cross-tab sync ----------------------------------------------------
  // Present on one screen, keep the notes open on another. Only the slide
  // index and the reveal step travel; each tab renders its own view.
  const channel =
    'BroadcastChannel' in self ? new BroadcastChannel(`week-${week}-deck`) : null;
  let quiet = false; // suppress echo while applying a remote message
  const send = (msg) => {
    if (channel && !quiet) channel.postMessage(msg);
  };

  // A smooth scroll across several slides passes over the ones in between,
  // and the observer would report each of them as the current slide. That
  // would also wipe a reveal just set. `scrollend` tells us when the
  // scroll has actually settled; the timeout is only a fallback.
  const hasScrollEnd = 'onscrollend' in window;
  if (hasScrollEnd)
    addEventListener('scrollend', () => {
      lock = 0;
    });

  const setStep = (n) => {
    const s = slides[i];
    const steps = stepsOf(s);
    step = Math.max(0, Math.min(steps, n));
    document.body.classList.toggle('cued', step > 0);
    cuesOf(s).forEach((el) =>
      el.classList.toggle('cue-pending', cueStep(el) > step),
    );
    emph.textContent =
      (s.querySelector('.reveal[data-cue]') ? 'Hint' : 'Cue') +
      (steps > 1 ? ` ${step}/${steps}` : '');
  };

  const go = (n) => {
    i = Math.max(0, Math.min(slides.length - 1, n));
    const behavior = reduced() ? 'auto' : 'smooth';
    lock =
      performance.now() +
      (behavior === 'smooth' ? (hasScrollEnd ? 8000 : 900) : 0);
    if (!isNotesView) slides[i].scrollIntoView({ behavior, block: 'start' });
    sync();
    send({ t: 'go', i });
  };

  const sync = () => {
    const s = slides[i];
    if (location.hash !== `#${s.id}`) {
      const url = new URL(location.href);
      url.hash = s.id;
      history.replaceState(history.state, '', url);
    }
    // a new slide always starts unrevealed, so the cue can be used again
    if (i !== shownIndex) {
      if (shownIndex >= 0) slides[shownIndex].classList.remove('current');
      s.classList.add('current');
      shownIndex = i;
      const wasCued = step > 0;
      setStep(0);
      if (wasCued) send({ t: 'cue', step: 0 });
    }
    pos.textContent = `${i + 1}/${slides.length}`;
    emph.hidden = !stepsOf(s);
    document.body.dataset.mode = s.dataset.mode;
    railFill.style.strokeDashoffset = (
      100 -
      ((i + 1) / slides.length) * 100
    ).toFixed(1);
    railCurrent.textContent = String(i + 1);

    // cross-fade the segment only when it actually changes
    if (s.dataset.seg !== seg) {
      seg = s.dataset.seg;
      if (reduced() || !rail) {
        railSeg.textContent = seg;
      } else {
        rail.classList.add('swap');
        setTimeout(() => {
          railSeg.textContent = seg;
          rail.classList.remove('swap');
        }, 180);
      }
    }

    const modeWord = {
      teach: 'Explanation',
      work: 'Your turn',
      gate: 'Pause',
    }[s.dataset.mode];
    nLoc.textContent = `Week ${week} · ${s.dataset.seg} · ${modeWord}`;
    const h = s.querySelector('h1, h2');
    nTitle.textContent = h ? h.textContent.trim() : '';
    const sn = s.querySelector('.sn');
    nBody.innerHTML = sn ? sn.innerHTML : '<p>No notes for this slide.</p>';
    document.title = `${i + 1}/${slides.length} · ${s.dataset.seg} · Week ${weekShort}`;
  };

  slides[i].scrollIntoView({ behavior: 'instant', block: 'start' });

  const io = new IntersectionObserver(
    (entries) => {
      if (performance.now() < lock) return;
      const v = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!v) return;
      i = slides.indexOf(v.target);
      sync();
    },
    { threshold: [0.5, 0.75] },
  );
  slides.forEach((s) => io.observe(s));

  const setNotes = (open) => {
    document.body.classList.toggle('notes-open', open);
    panel.setAttribute('aria-hidden', String(!open));
    requestAnimationFrame(() =>
      slides[i].scrollIntoView({ behavior: 'auto', block: 'start' }),
    );
  };
  // E reveals the next step; after the last step it hides everything again.
  const advanceCue = () => {
    const steps = stepsOf(slides[i]);
    if (!steps) return;
    setStep(step >= steps ? 0 : step + 1);
    send({ t: 'cue', step });
  };

  if (channel) {
    channel.onmessage = ({ data }) => {
      quiet = true;
      if (data.t === 'go' && data.i !== i) go(data.i);
      else if (data.t === 'cue') setStep(data.step);
      else if (data.t === 'hello') channel.postMessage({ t: 'state', i, step });
      else if (data.t === 'state') {
        if (data.i !== i) go(data.i);
        setStep(data.step);
      }
      quiet = false;
    };
    channel.postMessage({ t: 'hello' }); // ask whoever is already open where we are
  }

  // the notes tab is a second window on the same origin
  $('#open-notes-window').onclick = () => {
    const url = new URL(location.href);
    url.searchParams.set('view', 'notes');
    window.open(url, `week-${week}-notes`);
  };

  if (isNotesView) {
    document.body.classList.add('view-notes', 'notes-open');
    panel.setAttribute('aria-hidden', 'false');
    $('#notes-btn').hidden = true;
    $('#open-notes-window').hidden = true;
    const warn = $('#sync-off');
    if (!channel && warn) {
      warn.hidden = false;
      warn.textContent =
        'This tab cannot follow the presenting tab. Cross-tab sync needs a shared origin. Serve the deck over http rather than opening the file directly.';
    }
  }

  $('#prev').onclick = () => go(i - 1);
  $('#next').onclick = () => go(i + 1);
  addEventListener('hashchange', () => go(slideFromHash()));
  $('#notes-btn').onclick = () =>
    setNotes(!document.body.classList.contains('notes-open'));
  $('#close-notes').onclick = () => setNotes(false);
  emph.onclick = advanceCue;

  addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') {
      setNotes(false);
      return;
    }
    if (k === 'n') {
      e.preventDefault();
      setNotes(!document.body.classList.contains('notes-open'));
      return;
    }
    if (k === 'e') {
      e.preventDefault();
      advanceCue();
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      go(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      go(slides.length - 1);
      return;
    }
    if (
      ['ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key) ||
      (e.key === ' ' && !e.shiftKey)
    ) {
      e.preventDefault();
      go(i + 1);
      return;
    }
    if (
      ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key) ||
      (e.key === ' ' && e.shiftKey)
    ) {
      e.preventDefault();
      go(i - 1);
    }
  });

  sync();
})();
