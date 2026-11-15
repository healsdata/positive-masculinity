// Vertical swipe feed for curated YouTube Shorts.
// - Scroll-snap container = native swipe / wheel / trackpad.
// - Only the visible slide gets a YouTube player (IFrame API); others show a thumbnail.
// - A transparent "shield" over the player keeps swipes/wheel on our scroller
//   (otherwise the iframe swallows them) and turns taps into unmute / play-pause.

(() => {
  const feed = document.getElementById('feed');
  if (!feed) return;

  const START_ID = feed.dataset.start;
  const INDEX_URL = feed.dataset.index;
  const SITE_TITLE = feed.dataset.siteTitle || document.title;
  const TAGS_BASE = feed.dataset.tagsBase || '/tags/';
  const TAG = new URLSearchParams(location.search).get('tag');

  const $ = (sel) => document.querySelector(sel);
  const shuffleBtn = $('[data-shuffle]');
  const soundBtn = $('[data-sound]');
  const feedLabel = $('[data-feed-label]');
  const gridLink = $('[data-grid-link]');
  const prevBtn = $('[data-prev]');
  const nextBtn = $('[data-next]');

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode etc. */ } },
  };

  const norm = (s) => String(s).toLowerCase().trim().replace(/\s+/g, '-');
  const thumb = (id) => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
  const watchUrl = (id) => `https://www.youtube.com/shorts/${encodeURIComponent(id)}`;

  let all = [];            // every short, newest first (from index.json)
  let order = [];          // current play order
  let slides = [];         // DOM nodes, parallel to `order`
  let active = -1;
  let player = null;
  let shuffle = store.get('pm:shuffle') === '1';
  let soundOn = false;     // not persisted: browsers need a fresh gesture per visit anyway
  let observer = null;

  // ---------- data ----------

  function readCurrent() {
    try { return JSON.parse(document.getElementById('current-short').textContent); }
    catch { return null; }
  }

  async function loadIndex() {
    try {
      const res = await fetch(INDEX_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      if (Array.isArray(data) && data.length) return data;
    } catch (e) {
      console.warn('Could not load feed index; showing this short only.', e);
    }
    const cur = readCurrent();
    return cur ? [cur] : [];
  }

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildOrder(startId) {
    let list = TAG ? all.filter((s) => (s.tags || []).some((t) => norm(t) === norm(TAG))) : all.slice();
    const start = all.find((s) => s.id === startId);
    if (start && !list.includes(start)) list.unshift(start);
    if (shuffle) {
      const rest = shuffled(list.filter((s) => s !== start));
      list = start ? [start, ...rest] : rest;
    }
    return list;
  }

  // ---------- rendering ----------

  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.className = v;
      else n.setAttribute(k, v);
    }
    for (const c of children) if (c) n.appendChild(c);
    return n;
  }

  function renderSlide(item, i) {
    const shield = el('button', { class: 'shield', type: 'button', 'aria-label': 'Tap for sound / play / pause' });
    shield.addEventListener('click', () => onShieldTap(i));

    const tags = (item.tags || []).map((t) =>
      el('a', { class: 'chip', href: `${TAGS_BASE}${encodeURIComponent(norm(t))}/`, text: `#${t}` }));

    const channel = item.channel
      ? (item.channel_url
        ? el('a', { class: 'channel', href: item.channel_url, target: '_blank', rel: 'noopener', text: item.channel })
        : el('div', { class: 'channel', text: item.channel }))
      : null;

    return el('section', { class: 'slide', 'data-i': String(i) }, [
      el('div', { class: 'frame' }, [
        el('img', { class: 'poster', src: thumb(item.id), alt: '', loading: i < 2 ? 'eager' : 'lazy', decoding: 'async' }),
        el('div', { class: 'player-slot' }),
        shield,
        el('div', { class: 'hint', text: '🔇 Tap for sound' }),
        el('div', { class: 'error' }, [
          el('p', { text: 'This short can’t be played here.' }),
          el('a', { class: 'btn', href: watchUrl(item.id), target: '_blank', rel: 'noopener', text: 'Open on YouTube ↗' }),
        ]),
      ]),
      el('div', { class: 'info' }, [
        el('h2', { class: 'title', text: item.title }),
        channel,
        item.note ? el('p', { class: 'note', text: item.note }) : null,
        tags.length ? el('div', { class: 'chips' }, tags) : null,
        el('a', { class: 'yt-link', href: watchUrl(item.id), target: '_blank', rel: 'noopener', text: 'YouTube ↗' }),
      ]),
    ]);
  }

  function render(startId) {
    destroyPlayer();
    if (observer) observer.disconnect();
    active = -1;
    order = buildOrder(startId);
    slides = order.map(renderSlide);
    feed.replaceChildren(...slides);

    const startIdx = Math.max(0, order.findIndex((s) => s.id === startId));
    feed.scrollTop = slides[startIdx] ? slides[startIdx].offsetTop : 0;

    observer = new IntersectionObserver(onIntersect, { root: feed, threshold: 0.6 });
    slides.forEach((s) => observer.observe(s));
    updateControls();
  }

  function updateControls() {
    shuffleBtn.textContent = shuffle ? '⇄ Shuffled' : '⇄ Newest';
    shuffleBtn.setAttribute('aria-pressed', String(shuffle));
    soundBtn.textContent = soundOn ? '🔊' : '🔇';
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.title = soundOn ? 'Mute (m)' : 'Sound on (m)';
    document.body.classList.toggle('sound-on', soundOn);
    if (TAG) {
      feedLabel.textContent = `#${TAG}`;
      gridLink.href = `${TAGS_BASE}${encodeURIComponent(norm(TAG))}/`;
    }
  }

  // ---------- activation ----------

  function onIntersect(entries) {
    for (const e of entries) {
      if (e.isIntersecting) activate(Number(e.target.dataset.i));
    }
  }

  function activate(i) {
    if (i === active || !order[i]) return;
    destroyPlayer();
    active = i;
    const item = order[i];
    slides[i].classList.add('is-active');
    prevBtn.disabled = i <= 0;
    nextBtn.disabled = i >= slides.length - 1;

    const qs = TAG ? `?tag=${encodeURIComponent(TAG)}` : '';
    try { history.replaceState(null, '', item.url + qs); } catch { /* file:// etc. */ }
    document.title = `${item.title} · ${SITE_TITLE}`;

    whenYT().then(() => { if (active === i) mountPlayer(i); });
  }

  function mountPlayer(i) {
    const item = order[i];
    const slide = slides[i];
    const target = el('div');
    slide.querySelector('.player-slot').appendChild(target);
    let startedAt = 0;

    player = new YT.Player(target, {
      host: 'https://www.youtube-nocookie.com',
      videoId: item.id,
      width: '100%',
      height: '100%',
      playerVars: { autoplay: 1, mute: 1, playsinline: 1, rel: 0, controls: 0, modestbranding: 1, iv_load_policy: 3 },
      events: {
        onReady: (e) => {
          startedAt = Date.now();
          if (soundOn) { e.target.unMute(); e.target.setVolume(100); }
          e.target.playVideo();
        },
        onStateChange: (e) => {
          const S = YT.PlayerState;
          if (e.data === S.PLAYING) slide.classList.add('is-playing');
          if (e.data === S.ENDED) next(1);
          // Some browsers (iOS) pause instead of allowing an un-muted autoplay.
          // Fall back to muted playback so the feed keeps moving.
          if (e.data === S.PAUSED && soundOn && Date.now() - startedAt < 1500) {
            e.target.mute(); e.target.playVideo();
            soundOn = false; updateControls();
          }
        },
        onError: () => slide.classList.add('has-error'),
      },
    });
  }

  function destroyPlayer() {
    if (player) { try { player.destroy(); } catch { /* already gone */ } }
    player = null;
    const prev = slides[active];
    if (prev) {
      prev.classList.remove('is-active', 'is-playing', 'is-paused');
      prev.querySelector('.player-slot').replaceChildren();
    }
  }

  let ytReady = null;
  function whenYT() {
    if (ytReady) return ytReady;
    ytReady = new Promise((resolve) => {
      if (window.YT && window.YT.Player) return resolve();
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(); };
      document.head.appendChild(el('script', { src: 'https://www.youtube.com/iframe_api', async: '' }));
    });
    return ytReady;
  }

  // ---------- interaction ----------

  function next(delta) {
    const target = slides[active + delta];
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setSound(on) {
    soundOn = on;
    if (player && player.unMute) {
      if (on) { player.unMute(); player.setVolume(100); player.playVideo(); }
      else player.mute();
    }
    updateControls();
  }

  function onShieldTap(i) {
    if (i !== active || !player || !player.getPlayerState) return;
    if (!soundOn) return setSound(true);       // first tap = sound on (Reels-style)
    const playing = player.getPlayerState() === YT.PlayerState.PLAYING;
    if (playing) player.pauseVideo(); else player.playVideo();
    slides[i].classList.toggle('is-paused', playing);
  }

  shuffleBtn.addEventListener('click', () => {
    shuffle = !shuffle;
    store.set('pm:shuffle', shuffle ? '1' : '0');
    render(order[active] ? order[active].id : START_ID);
  });
  soundBtn.addEventListener('click', () => setSound(!soundOn));
  prevBtn.addEventListener('click', () => next(-1));
  nextBtn.addEventListener('click', () => next(1));

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, textarea')) return;
    switch (e.key) {
      case 'ArrowDown': case 'j': case 'PageDown': e.preventDefault(); next(1); break;
      case 'ArrowUp': case 'k': case 'PageUp': e.preventDefault(); next(-1); break;
      case 'm': setSound(!soundOn); break;
      case 's': shuffleBtn.click(); break;
      case ' ': if (active >= 0) { e.preventDefault(); onShieldTap(active); } break;
      case 'Escape': if (!document.fullscreenElement) location.href = gridLink.href; break;
    }
  });

  // ---------- go ----------

  loadIndex().then((data) => {
    all = data;
    if (!all.length) return;
    render(START_ID);
  });
})();
