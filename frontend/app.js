const configuredApi = window.KINOMIR_API_URL || '/api';
const API = (configuredApi.includes('__') ? 'http://localhost:8000/api' : configuredApi).replace(/\/$/, '');
const API_TIMEOUT_MS = 10000;
const app = document.querySelector('#app');
const {t, language, setLanguage, translateServerMessage} = window.kinoordoI18n;
const token = () => localStorage.getItem('kinomir_token');
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const safeExternalUrl = value => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? esc(url.href) : ''; }
  catch { return ''; }
};
const absoluteUrl = value => { try { return new URL(value, location.origin).href; } catch { return location.origin; } };
const seoDescription = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 160);

function setSeoMeta(selector, attribute, value) {
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement('meta');
    const match = selector.match(/meta\[(name|property)="([^"]+)"\]/);
    if (match) node.setAttribute(match[1], match[2]);
    document.head.appendChild(node);
  }
  node.setAttribute(attribute, value);
}

function updateSeo({title, description, canonical = '/', image = '/social-card.svg', type = 'website', robots = 'index,follow,max-image-preview:large'}) {
  const canonicalUrl = absoluteUrl(canonical);
  const imageUrl = absoluteUrl(image);
  document.title = title;
  setSeoMeta('meta[name="description"]', 'content', seoDescription(description));
  setSeoMeta('meta[name="robots"]', 'content', robots);
  setSeoMeta('meta[property="og:type"]', 'content', type);
  setSeoMeta('meta[property="og:title"]', 'content', title);
  setSeoMeta('meta[property="og:description"]', 'content', seoDescription(description));
  setSeoMeta('meta[property="og:url"]', 'content', canonicalUrl);
  setSeoMeta('meta[property="og:image"]', 'content', imageUrl);
  setSeoMeta('meta[name="twitter:card"]', 'content', 'summary_large_image');
  setSeoMeta('meta[name="twitter:title"]', 'content', title);
  setSeoMeta('meta[name="twitter:description"]', 'content', seoDescription(description));
  setSeoMeta('meta[name="twitter:image"]', 'content', imageUrl);
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
  link.href = canonicalUrl;
}

function applyRouteSeo(route, params) {
  const kyrgyz = language() === 'ky';
  if (!route) return updateSeo({
    title:kyrgyz ? 'КиноОрдо — кыргыз тасмалары' : 'КиноОрдо — кыргызское кино',
    description:kyrgyz ? 'Кыргыз тасмалары, рейтингдер жана мыйзамдуу көрүү булактары.' : 'Современный каталог кыргызских фильмов, рейтингов и легальных источников просмотра.',
  });
  if (route === 'catalog') {
    const query = params.get('q');
    return updateSeo({title:query ? `${query} — ${t('catalog_title')} — КиноОрдо` : `${t('catalog_title')} — КиноОрдо`, description:t('search_placeholder'), canonical:`/#/catalog${params.size ? `?${params}` : ''}`});
  }
  if (route === 'rights-holders' || route === 'takedown-policy') {
    const title = route === 'rights-holders' ? t('rights_holders') : t('takedown');
    return updateSeo({title:`${title} — КиноОрдо`, description:title, canonical:`/#/${route}`});
  }
  updateSeo({title:`КиноОрдо — ${t('account')}`, description:t('profile_intro'), canonical:'/', robots:'noindex,nofollow'});
}
const fieldLabels = () => ({username:t('username'), email:'Email', password:t('password'), non_field_errors:t('request_failed')});
const HTTP_ERRORS = {
  0: {get title(){return t('network_title')}, get message(){return t('network_message')}},
  401: {get title(){return t('unauthorized_title')}, get message(){return t('unauthorized_message')}},
  403: {get title(){return t('forbidden_title')}, get message(){return t('forbidden_message')}},
  404: {get title(){return t('not_found_title')}, get message(){return t('not_found_message')}},
  429: {get title(){return t('throttled_title')}, get message(){return t('throttled_message')}},
  500: {get title(){return t('server_title')}, get message(){return t('server_message')}},
};

class ApiError extends Error {
  constructor(messages, status, code = '', retryAfter = 0) {
    super(messages[0] || t('request_failed'));
    this.name = 'ApiError';
    this.messages = messages;
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function errorDetails(error) {
  const status = Number(error?.status) || 0;
  if (error?.code === 'timeout') {
    return {status, title: t('timeout_title'), message: error.message};
  }
  if (status === 429) {
    const wait = Number(error?.retryAfter) || 0;
    return {
      status,
      title: HTTP_ERRORS[429].title,
      message: HTTP_ERRORS[429].message,
    };
  }
  const preset = status >= 500 ? HTTP_ERRORS[500] : HTTP_ERRORS[status];
  return {
    status,
    title: preset?.title || t('request_failed'),
    message: preset?.message || error?.message || t('try_again'),
  };
}

function apiMessages(data) {
  if (!data || typeof data !== 'object') return [t('request_error')];
  const labels = fieldLabels();
  const messages = [];
  Object.entries(data).forEach(([field, value]) => {
    const values = Array.isArray(value) ? value : [value];
    values.forEach(message => { const translated = translateServerMessage(message); messages.push(field === 'detail' || field === 'non_field_errors' ? translated : `${labels[field] || field}: ${translated}`); });
  });
  return messages.length ? messages : [t('request_error')];
}

async function api(path, options = {}) {
  const headers = {'Content-Type':'application/json', 'Accept-Language':language(), ...(options.headers || {})};
  if (token()) headers.Authorization = `Token ${token()}`;
  const pageSignal = options.signal || window.pageSignal;
  const requestController = new AbortController();
  let timedOut = false;
  const abortRequest = () => requestController.abort();
  if (pageSignal?.aborted) abortRequest();
  else pageSignal?.addEventListener('abort', abortRequest, {once: true});
  const timeout = setTimeout(() => { timedOut = true; requestController.abort(); }, API_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${API}${path}`, {...options, headers, signal: requestController.signal});
  } catch (error) {
    if (!timedOut && pageSignal?.aborted) throw error;
    if (timedOut) throw new ApiError([t('timeout_message')], 0, 'timeout');
    throw new ApiError([HTTP_ERRORS[0].message], 0, 'network');
  } finally {
    clearTimeout(timeout);
    pageSignal?.removeEventListener('abort', abortRequest);
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token()) {
      localStorage.removeItem('kinomir_token');
      setAuthControls();
    }
    const preset = response.status >= 500 ? HTTP_ERRORS[500] : HTTP_ERRORS[response.status];
    const retryAfter = Number(response.headers.get('Retry-After')) || 0;
    const messages = response.status === 429 && retryAfter
      ? [HTTP_ERRORS[429].message]
      : (preset ? [preset.message] : apiMessages(data));
    throw new ApiError(messages, response.status, response.status === 429 ? 'throttled' : '', retryAfter);
  }
  return data;
}

function toast(message, kind = 'info') {
  const node = document.querySelector('#toast');
  if (!node) return;
  window.clearTimeout(window.toastTimer);
  node.textContent = message;
  node.dataset.kind = kind;
  node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  node.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');
  node.classList.add('show');
  window.toastTimer = window.setTimeout(() => node.classList.remove('show'), 3500);
}

function notifyError(error) {
  const details = errorDetails(error);
  toast(`${details.title}. ${details.message}`, 'error');
}

function renderPageError(error) {
  const details = errorDetails(error);
  const statusLabel = details.status ? t('error_status', {status:details.status}) : t('network_error');
  const loginAction = details.status === 401 ? `<a class="btn" href="#/login">${t('nav_login')}</a>` : '';
  app.removeAttribute('aria-busy');
  app.innerHTML = `<section class="page-error" role="alert" aria-live="assertive">
    <div class="page-error-code">${statusLabel}</div>
    <h1>${esc(details.title)}</h1>
    <p>${esc(details.message)}</p>
    <div class="page-error-actions">${loginAction}<button class="btn${loginAction ? ' secondary' : ''}" id="page-retry" type="button">${t('retry_loading')}</button><a class="text-link" href="#/catalog">${t('go_catalog')}</a></div>
  </section>`;
  document.querySelector('#page-retry')?.addEventListener('click', router);
}

function poster(movie) {
  return `<div class="poster">${movie.poster ? `<img src="${esc(movie.poster)}" alt="${t('poster')}: ${esc(movie.title)}" loading="lazy" decoding="async">` : `<span class="placeholder">${esc(movie.title.slice(0,1))}</span>`}<span class="badge">${esc(movie.age_rating || '0+')}</span></div>`;
}

function replaceBrokenPoster(image) {
  if (!(image instanceof HTMLImageElement) || !image.matches('.poster img')) return;
  const wrapper = image.closest('.poster');
  const title = image.alt.replace(/^[^:]+:\s*/, '');
  image.remove();
  wrapper.insertAdjacentHTML('afterbegin', `<span class="placeholder" role="img" aria-label="${t('poster_unavailable')}: ${esc(title)}">${esc(title.slice(0, 1) || 'К')}</span>`);
}

function movieCard(movie) {
  const rating = movie.rating_avg ? `★ ${Number(movie.rating_avg).toFixed(1)}` : t('no_rating');
  return `<a class="card" href="#/movie/${encodeURIComponent(movie.slug)}">${poster(movie)}<h3>${esc(movie.title)}</h3><div class="card-meta"><div class="meta">${movie.year} · ${esc(movie.country)}</div><div class="rating">${rating}</div></div></a>`;
}

function continueCard(entry) {
  const movie = entry.movie;
  const percent = Math.max(0, Math.min(100, Number(entry.progress_percent) || 0));
  return `<article class="continue-card" data-history-slug="${esc(movie.slug)}">
    <a class="continue-card-link" href="#/movie/${encodeURIComponent(movie.slug)}">
      ${poster(movie)}
      <div class="continue-card-copy"><h3>${esc(movie.title)}</h3><div class="meta">${t('continue_from', {time:formatTime(entry.position_seconds)})}</div>
        <div class="watch-progress" role="progressbar" aria-label="${t('watch_progress')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>
      </div>
    </a>
    <button class="history-remove" type="button" data-remove-history="${esc(movie.slug)}" aria-label="${t('remove_history')}: ${esc(movie.title)}" title="${t('remove_history')}">×</button>
  </article>`;
}

const homeCollections = () => [
  {id:'popular', title:t('popular'), eyebrow:t('kyrgyz_cinema'), sort:'popular'},
  {id:'newest', title:t('newest'), eyebrow:t('new_movies'), sort:'newest'},
  {id:'rating', title:t('top_rating'), eyebrow:t('audience_choice'), sort:'rating'},
];

function skeletonCards(count = 6) {
  return Array.from({length: count}, () => `
    <div class="card-skeleton" aria-hidden="true">
      <div class="skeleton skeleton-poster"></div>
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-meta"></div>
    </div>`).join('');
}

function homeShell() {
  return `
    <section class="hero hero-skeleton" id="home-hero" aria-busy="true" aria-label="${t('hero_loading')}">
      <div class="hero-content">
        <div class="skeleton skeleton-kicker"></div>
        <div class="skeleton skeleton-heading"></div>
        <div class="skeleton skeleton-copy"></div>
        <div class="skeleton skeleton-button"></div>
      </div>
    </section>
    ${token() ? `<section class="section continue-section" id="continue-section" aria-labelledby="continue-title" hidden>
      <div class="section-head"><div><div class="eyebrow">${t('watch_history')}</div><h2 id="continue-title">${t('continue_watching')}</h2></div><button class="history-clear" id="history-clear" type="button">${t('clear_history')}</button></div>
      <div class="continue-grid" id="continue-grid"></div>
    </section>` : ''}
    <div class="home-collections">
      ${homeCollections().map(collection => `
        <section class="section collection" aria-labelledby="${collection.id}-title">
          <div class="section-head">
            <div><div class="eyebrow">${collection.eyebrow}</div><h2 id="${collection.id}-title">${collection.title}</h2></div>
            <a href="#/catalog">${t('all_catalog')}</a>
          </div>
          <div class="grid" id="${collection.id}-grid" aria-live="polite" aria-busy="true">${skeletonCards()}</div>
        </section>`).join('')}
    </div>`;
}

function renderContinueWatching(result) {
  const section = document.querySelector('#continue-section');
  const grid = document.querySelector('#continue-grid');
  if (!section || !grid || result.status !== 'fulfilled' || !result.value.length) return;
  let entries = result.value;
  const render = () => {
    section.hidden = entries.length === 0;
    grid.innerHTML = entries.map(continueCard).join('');
    grid.querySelectorAll('[data-remove-history]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await api(`/watch-history/${encodeURIComponent(button.dataset.removeHistory)}/`, {method:'DELETE'});
        entries = entries.filter(entry => entry.movie.slug !== button.dataset.removeHistory);
        render();
      } catch (error) { button.disabled = false; notifyError(error); }
    }));
  };
  document.querySelector('#history-clear')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try { await api('/watch-history/', {method:'DELETE'}); entries = []; render(); toast(t('history_cleared')); }
    catch (error) { event.currentTarget.disabled = false; notifyError(error); }
  });
  render();
}

function renderHero(movie) {
  const target = document.querySelector('#home-hero');
  if (!movie) {
    target.className = 'hero hero-empty';
    target.removeAttribute('aria-busy');
    target.setAttribute('aria-label', t('hero_empty_label'));
    target.innerHTML = `<div class="hero-content"><div class="eyebrow">${t('kyrgyz_cinema')}</div><h1>${t('hero_empty_title')}</h1><p>${t('hero_empty_text')}</p><a class="btn secondary" href="#/catalog">${t('open_catalog')}</a></div>`;
    return;
  }

  const heroImage = movie.banner || movie.poster;
  target.className = 'hero';
  target.removeAttribute('aria-busy');
  target.removeAttribute('aria-label');
  if (heroImage) target.style.setProperty('--hero-image', `url("${heroImage.replace(/["\\]/g, '\\$&')}")`);
  target.innerHTML = `<div class="hero-content"><div class="eyebrow">${t('recommended')}</div><h1>${esc(movie.title)}</h1><div class="hero-meta"><span>${movie.year}</span><span>${esc(movie.country)}</span><span>${esc(movie.age_rating || '0+')}</span>${movie.rating_avg ? `<span>★ ${Number(movie.rating_avg).toFixed(1)}</span>` : ''}</div><p>${esc(movie.description)}</p><a class="btn" href="#/movie/${encodeURIComponent(movie.slug)}">${t('details')}</a></div>`;
}

function renderCollection(collection, result) {
  const target = document.querySelector(`#${collection.id}-grid`);
  if (!target) return;
  target.removeAttribute('aria-busy');

  if (result.status === 'rejected') {
    target.innerHTML = `<div class="collection-state"><strong>${t('collection_error')}</strong><span>${esc(result.reason.message)}</span><button class="btn secondary" data-retry="${collection.id}">${t('retry')}</button></div>`;
    target.querySelector('[data-retry]')?.addEventListener('click', () => loadCollection(collection));
    return;
  }

  const movies = result.value.results.slice(0, 6);
  target.innerHTML = movies.length
    ? movies.map(movieCard).join('')
    : `<div class="collection-state"><strong>${t('collection_empty')}</strong><span>${t('collection_empty_text')}</span></div>`;
}

async function loadCollection(collection) {
  const target = document.querySelector(`#${collection.id}-grid`);
  if (!target) return;
  target.setAttribute('aria-busy', 'true');
  target.innerHTML = skeletonCards();
  const result = await Promise.allSettled([api(`/movies/?sort=${collection.sort}&page_size=6`)]);
  renderCollection(collection, result[0]);
}

function setAuthControls() {
  document.querySelector('#auth-controls').innerHTML = token()
    ? `<a class="profile-link" href="#/profile">${t('nav_profile')}</a><button class="btn secondary" id="logout">${t('nav_logout')}</button>`
    : `<a class="btn secondary" href="#/login">${t('nav_login')}</a>`;
  document.querySelector('#logout')?.addEventListener('click', async () => {
    try { await api('/auth/logout/', {method:'POST'}); } catch (_) {}
    localStorage.removeItem('kinomir_token'); setAuthControls(); location.hash = '#/'; toast(t('logged_out'));
  });
}

async function home() {
  app.innerHTML = homeShell();
  const collections = homeCollections();
  const [results, historyResult] = await Promise.all([
    Promise.allSettled(collections.map(collection => api(`/movies/?sort=${collection.sort}&page_size=6`))),
    token() ? Promise.allSettled([api('/watch-history/')]).then(items => items[0]) : Promise.resolve({status:'fulfilled', value:[]}),
  ]);
  const popularMovies = results[0].status === 'fulfilled' ? results[0].value.results : [];
  renderHero(popularMovies.find(movie => movie.is_featured) || popularMovies[0]);
  collections.forEach((collection, index) => renderCollection(collection, results[index]));
  renderContinueWatching(historyResult);
}

function catalogLink(apiUrl, label, className = 'btn secondary') {
  if (!apiUrl) return '';
  const params = new URL(apiUrl, location.origin).searchParams;
  params.delete('page_size');
  return `<a class="${className}" href="#/catalog?${params.toString()}">${label}</a>`;
}

async function catalog(params = new URLSearchParams()) {
  const apiParams = new URLSearchParams(params);
  apiParams.set('page_size', '4');
  const [genres, data] = await Promise.all([api('/genres/'), api(`/movies/?${apiParams}`)]);
  const query = params.get('q') || '';
  const selectedGenre = params.get('genre') || '';
  const year = params.get('year') || '';
  const sort = params.get('sort') || 'newest';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const totalPages = Math.max(1, Math.ceil(data.count / 4));
  const genreOptions = genres.map(genre => `<option value="${esc(genre.slug)}"${genre.slug === selectedGenre ? ' selected' : ''}>${esc(genre.name)}</option>`).join('');
  const sortOptions = [
    ['newest', t('sort_newest')],
    ['title', t('sort_title')],
    ['rating', t('sort_rating')],
  ].map(([value, label]) => `<option value="${value}"${value === sort ? ' selected' : ''}>${label}</option>`).join('');
  const resultContent = data.results.length
    ? `<div id="catalog-grid" class="grid">${data.results.map(movieCard).join('')}</div>`
    : `<div id="catalog-grid" class="collection-state"><strong>${t('nothing_found')}</strong><span>${t('nothing_found_text')}</span></div>`;
  const pagination = data.previous || data.next ? `<nav class="pagination" aria-label="${t('pages')}">${catalogLink(data.previous, t('back'))}<span>${t('page_of', {page,total:totalPages})}</span>${catalogLink(data.next, t('next'))}</nav>` : '';

  app.innerHTML = `<section class="section catalog-section"><div class="section-head"><div><div class="eyebrow">${t('catalog_collection')}</div><h1>${t('catalog_title')}</h1></div><span class="catalog-summary" id="catalog-summary" role="status" aria-live="polite">${t('found',{count:data.count})}</span></div><form class="filters" id="filters" aria-describedby="catalog-summary"><label class="sr-only" for="catalog-search">${t('filter_search')}</label><input class="field" id="catalog-search" name="q" value="${esc(query)}" placeholder="${t('search_placeholder')}"><label class="sr-only" for="catalog-genre">${t('filter_genre')}</label><select class="field" id="catalog-genre" name="genre"><option value="">${t('all_genres')}</option>${genreOptions}</select><label class="sr-only" for="catalog-year">${t('filter_year')}</label><input class="field" id="catalog-year" name="year" type="number" min="1888" max="2100" value="${esc(year)}" placeholder="${t('year')}"><label class="sr-only" for="catalog-sort">${t('filter_sort')}</label><select class="field" id="catalog-sort" name="sort">${sortOptions}</select><button class="btn" type="submit">${t('apply')}</button><a class="filter-reset" href="#/catalog">${t('reset')}</a></form>${resultContent}${pagination}</section>`;
  document.querySelector('#filters').addEventListener('submit', event => {
    event.preventDefault();
    const nextParams = new URLSearchParams(new FormData(event.currentTarget));
    [...nextParams.entries()].forEach(([key, value]) => { if (!String(value).trim()) nextParams.delete(key); });
    if (nextParams.get('sort') === 'newest') nextParams.delete('sort');
    const nextHash = `#/catalog${nextParams.size ? `?${nextParams}` : ''}`;
    if (location.hash === nextHash) catalog(nextParams);
    else location.hash = nextHash;
  });
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function playerMarkup(movie) {
  const {mode, url} = movie.player;
  if (mode === 'html5') {
    const posterUrl = movie.banner || movie.poster;
    return `<div class="video-player" id="video-player" tabindex="0" aria-label="${t('video_player')}: ${esc(movie.title)}">
      <video id="movie-video" src="${esc(url)}"${posterUrl ? ` poster="${esc(posterUrl)}"` : ''} controls preload="metadata" playsinline></video>
      <button class="video-center-play" id="video-center-play" type="button" aria-label="${t('play')}"><span aria-hidden="true">▶</span></button>
      <div class="video-loading" aria-hidden="true"><span></span></div>
      <div class="video-error" id="video-error" role="alert" hidden><strong>${t('video_error')}</strong><span>${t('video_error_hint')}</span><button class="btn secondary" id="video-retry" type="button">${t('retry')}</button></div>
      <div class="video-controls" id="video-controls">
        <button class="control-button" id="video-toggle" type="button" aria-label="${t('play')}" title="${t('play')}"><span aria-hidden="true">▶</span></button>
        <button class="control-button skip-control" id="video-back" type="button" aria-label="${t('back_10')}" title="${t('back_10')}">−10</button>
        <button class="control-button skip-control" id="video-forward" type="button" aria-label="${t('forward_10')}" title="${t('forward_10')}">+10</button>
        <div class="video-timeline"><input id="video-seek" type="range" min="0" max="1000" value="0" aria-label="${t('playback_position')}"><span id="video-time">0:00 / 0:00</span></div>
        <button class="control-button" id="video-mute" type="button" aria-label="${t('mute')}" title="${t('mute')}"><span aria-hidden="true">🔊</span></button>
        <input class="volume-control" id="video-volume" type="range" min="0" max="1" step="0.05" value="1" aria-label="${t('volume')}">
        <label class="speed-control">${t('speed')}<select id="video-speed" aria-label="${t('speed')}"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
        <button class="control-button" id="video-fullscreen" type="button" aria-label="${t('fullscreen')}" title="${t('fullscreen')}"><span aria-hidden="true">⛶</span></button>
      </div>
    </div>`;
  }
  if (mode === 'embed') return `<div class="player embed-player"><iframe src="${esc(url)}" title="${t('video_player')}: ${esc(movie.title)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe><p class="player-note">${t('embed_hint')}</p></div>`;
  if (mode === 'external') return `<div class="player player-state"><div><div class="player-state-icon" aria-hidden="true">↗</div><strong>${t('external_movie')}</strong><p>${t('external_hint')}</p><a class="btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${t('open_legal_source')}</a></div></div>`;
  return `<div class="player player-state"><div><div class="player-state-icon" aria-hidden="true">!</div><strong>${t('video_unavailable')}</strong><p>${t('video_unavailable_hint')}</p></div></div>`;
}

function videoKind(movie) {
  return /video\.kinoafisha\.info\/video-/i.test(movie.player?.url || '') ? t('trailer') : t('watch');
}

function saveWatchProgress(slug, video, keepalive = false) {
  if (!token() || !Number.isFinite(video.currentTime) || !Number.isFinite(video.duration) || video.currentTime < 1) return Promise.resolve();
  return fetch(`${API}/movies/${encodeURIComponent(slug)}/progress/`, {
    method:'PUT',
    headers:{'Content-Type':'application/json', 'Accept-Language':language(), Authorization:`Token ${token()}`},
    body:JSON.stringify({position_seconds:Math.floor(video.currentTime), duration_seconds:Math.floor(video.duration)}),
    keepalive,
  }).catch(() => {});
}

function initVideoPlayer(movie) {
  const shell = document.querySelector('#video-player');
  if (!shell) return;
  window.playerController?.abort();
  window.playerController = new AbortController();
  const playerSignal = window.playerController.signal;
  const video = shell.querySelector('#movie-video');
  const playButtons = [shell.querySelector('#video-toggle'), shell.querySelector('#video-center-play')];
  const toggleButton = playButtons[0];
  const centerButton = playButtons[1];
  const controls = shell.querySelector('#video-controls');
  const seek = shell.querySelector('#video-seek');
  const time = shell.querySelector('#video-time');
  const mute = shell.querySelector('#video-mute');
  const volume = shell.querySelector('#video-volume');
  const speed = shell.querySelector('#video-speed');
  const fullscreen = shell.querySelector('#video-fullscreen');
  const errorState = shell.querySelector('#video-error');
  let lastSavedPosition = Number(movie.watch_progress?.position_seconds) || 0;
  let restored = false;
  video.controls = false;

  const updatePlayState = () => {
    const playing = !video.paused && !video.ended;
    toggleButton.innerHTML = `<span aria-hidden="true">${playing ? '❚❚' : '▶'}</span>`;
    toggleButton.setAttribute('aria-label', t(playing ? 'pause' : 'play'));
    toggleButton.title = t(playing ? 'pause' : 'play');
    centerButton.classList.toggle('is-hidden', playing);
    shell.classList.toggle('is-playing', playing);
  };
  const updateTime = () => {
    const progress = video.duration ? video.currentTime / video.duration : 0;
    seek.value = String(Math.round(progress * 1000));
    seek.style.setProperty('--progress', `${progress * 100}%`);
    time.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
  };
  const saveProgress = (force = false) => {
    if (!force && Math.abs(video.currentTime - lastSavedPosition) < 10) return;
    lastSavedPosition = Math.floor(video.currentTime);
    saveWatchProgress(movie.slug, video, force);
  };
  const restoreProgress = () => {
    if (restored || !Number.isFinite(video.duration)) return;
    restored = true;
    const saved = Number(movie.watch_progress?.position_seconds) || 0;
    if (saved > 0 && saved < video.duration - 5) video.currentTime = saved;
    updateTime();
  };
  const togglePlay = async () => {
    if (video.paused || video.ended) {
      try { await video.play(); } catch (_) { toast(t('playback_blocked')); }
    } else video.pause();
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (shell.requestFullscreen) await shell.requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      else toast(t('fullscreen_unsupported'));
    } catch (_) { toast(t('fullscreen_unavailable')); }
  };
  const setMutedIcon = () => {
    const muted = video.muted || video.volume === 0;
    mute.innerHTML = `<span aria-hidden="true">${muted ? '🔇' : '🔊'}</span>`;
    mute.setAttribute('aria-label', t(muted ? 'unmute' : 'mute'));
  };

  playButtons.forEach(button => button.addEventListener('click', togglePlay));
  video.addEventListener('click', togglePlay);
  video.addEventListener('dblclick', toggleFullscreen);
  video.addEventListener('play', updatePlayState);
  video.addEventListener('pause', () => { updatePlayState(); saveProgress(true); });
  video.addEventListener('ended', () => { updatePlayState(); saveProgress(true); });
  video.addEventListener('timeupdate', () => { updateTime(); saveProgress(); });
  video.addEventListener('loadedmetadata', restoreProgress);
  video.addEventListener('durationchange', updateTime);
  video.addEventListener('waiting', () => shell.classList.add('is-buffering'));
  video.addEventListener('playing', () => shell.classList.remove('is-buffering'));
  video.addEventListener('canplay', () => shell.classList.remove('is-buffering'));
  video.addEventListener('error', () => { errorState.hidden = false; controls.hidden = true; centerButton.hidden = true; });
  seek.addEventListener('input', () => { if (video.duration) video.currentTime = (Number(seek.value) / 1000) * video.duration; });
  shell.querySelector('#video-back').addEventListener('click', () => { video.currentTime = Math.max(0, video.currentTime - 10); });
  shell.querySelector('#video-forward').addEventListener('click', () => { video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10); });
  mute.addEventListener('click', () => { video.muted = !video.muted; setMutedIcon(); });
  volume.addEventListener('input', () => { video.volume = Number(volume.value); video.muted = video.volume === 0; volume.style.setProperty('--progress', `${video.volume * 100}%`); setMutedIcon(); });
  speed.addEventListener('change', () => { video.playbackRate = Number(speed.value); toast(`${t('speed')}: ${speed.options[speed.selectedIndex].text}`); });
  fullscreen.addEventListener('click', toggleFullscreen);
  shell.querySelector('#video-retry').addEventListener('click', () => { errorState.hidden = true; controls.hidden = false; centerButton.hidden = false; video.load(); });
  document.addEventListener('fullscreenchange', () => { const active = Boolean(document.fullscreenElement); fullscreen.setAttribute('aria-label', t(active ? 'exit_fullscreen' : 'fullscreen')); fullscreen.title = t(active ? 'exit_fullscreen' : 'fullscreen'); }, {signal: playerSignal});
  shell.addEventListener('keydown', event => {
    if (event.target.matches('select, input')) return;
    if ([' ', 'k', 'K'].includes(event.key)) { event.preventDefault(); togglePlay(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 10); }
    if (event.key === 'ArrowRight') { event.preventDefault(); video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10); }
    if (event.key.toLowerCase() === 'm') { video.muted = !video.muted; setMutedIcon(); }
    if (event.key.toLowerCase() === 'f') toggleFullscreen();
  });
  playerSignal.addEventListener('abort', () => saveProgress(true), {once:true});
  window.addEventListener('pagehide', () => saveProgress(true), {signal:playerSignal});
  updatePlayState();
  updateTime();
}

function commentMarkup(comment) {
  const date = new Intl.DateTimeFormat(language() === 'ky' ? 'ky-KG' : 'ru-RU', {day:'numeric', month:'short', year:'numeric'}).format(new Date(comment.created_at));
  return `<div class="comment" data-comment-id="${Number(comment.id)}"><div><strong>${esc(comment.username)}</strong><small>${esc(date)}</small></div><p>${esc(comment.text)}</p></div>`;
}

function legalMarkup(legal = {}) {
  const source = safeExternalUrl(legal.content_source_url);
  const posterSource = safeExternalUrl(legal.poster_source_url);
  const videoSource = safeExternalUrl(legal.video_source_url);
  const sourceLink = (url, label) => url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>` : `<span>${t('not_listed')}</span>`;
  return `<section class="legal-card" aria-labelledby="legal-title">
    <div><div class="eyebrow">${t('rights_sources')}</div><h2 id="legal-title">${t('content_info')}</h2></div>
    <dl class="legal-meta">
      <div><dt>${t('material')}</dt><dd>${esc(legal.video_content_label || t('not_listed'))}</dd></div>
      <div><dt>${t('rights_holder')}</dt><dd>${esc(legal.rights_holder || t('being_clarified'))}</dd></div>
      <div><dt>${t('license')}</dt><dd>${esc(legal.license_label || t('not_listed'))}</dd></div>
      <div><dt>${t('verification')}</dt><dd><span class="rights-status rights-status-${esc(legal.rights_status || 'pending')}">${esc(legal.rights_status_label || t('pending_review'))}</span></dd></div>
      <div><dt>${t('rights_details')}</dt><dd>${sourceLink(source, t('open_source'))}</dd></div>
    </dl>
    ${legal.video_attribution ? `<p class="attribution"><strong>Видео:</strong> ${esc(legal.video_attribution)} · ${sourceLink(videoSource, t('source'))}</p>` : ''}
    ${legal.poster_attribution ? `<p class="attribution"><strong>${t('poster')}:</strong> ${esc(legal.poster_attribution)} · ${sourceLink(posterSource, t('source'))}</p>` : ''}
  </section>`;
}

async function movie(slug) {
  const m = await api(`/movies/${encodeURIComponent(slug)}/`);
  updateSeo({
    title:`${m.title} (${m.year}) — КиноОрдо`,
    description:`${m.title} (${m.year}). ${m.description}`,
    canonical:`/films/${encodeURIComponent(m.slug)}/`,
    image:m.poster || '/social-card.svg',
    type:'video.movie',
  });
  const comments = m.comments.length ? m.comments.map(commentMarkup).join('') : `<div class="comments-empty">${t('comments_empty')}</div>`;
  const guestNote = token() ? '' : `<div class="social-auth-note"><a href="#/login">${t('login_to_discuss')}</a></div>`;
  app.innerHTML = `<article class="detail">
    <aside class="detail-poster">${poster(m)}</aside>
    <div class="detail-content">
      <div class="eyebrow">${esc(m.genres.map(g=>g.name).join(' · '))}</div>
      <h1>${esc(m.title)}</h1>
      <div class="meta">${esc(m.original_title)}</div>
      <div class="facts"><span>${m.year}</span><span>${esc(m.country)}</span><span>${m.duration} ${t('minutes')}</span><span id="movie-rating-summary">★ ${m.rating_avg ? Number(m.rating_avg).toFixed(1) : '—'} (${m.ratings_count})</span></div>
      <p class="movie-description">${esc(m.description)}</p>
      <p><strong>${t('director')}:</strong> ${esc(m.director || t('not_listed'))}<br><strong>${t('cast')}:</strong> ${esc(m.actors || t('not_listed_plural'))}</p>
      <section class="watch-section"><div class="watch-head"><div><div class="eyebrow">${videoKind(m)}</div><h2>${esc(m.title)}</h2></div><span>${t('player_shortcuts')}</span></div>${playerMarkup(m)}</section>
      ${legalMarkup(m.legal)}
      <section class="social-panel" aria-label="${t('movie_actions')}">
        <div><div><div class="social-label">${t('nav_favorites')}</div><h2>${t('save_movie')}</h2></div><button class="btn ${m.is_favorite ? 'is-selected' : ''}" id="favorite" type="button" aria-pressed="${m.is_favorite}">${t(m.is_favorite ? 'favorite_added' : 'favorite_add')}</button></div>
        <div><div><div class="social-label">${t('personal_rating')}</div><h2>${m.user_rating ? t('rating_of',{value:m.user_rating}) : t('not_rated')}</h2></div><div class="stars" id="rating-stars">${[1,2,3,4,5].map(n=>`<button type="button" data-rating="${n}" class="${n <= (m.user_rating || 0) ? 'active':''}" aria-label="${t('rating_of',{value:n})}" aria-pressed="${n === m.user_rating}">★</button>`).join('')}</div></div>
        ${guestNote}
      </section>
      <section class="comments"><div class="comments-heading"><div><div class="eyebrow">${t('discussion')}</div><h2>${t('comments')}</h2></div><span id="comments-count" aria-label="${t('comments')}">${m.comments.length}</span></div>${token()?`<form id="comment-form" novalidate><label for="comment-text">${t('your_comment')}</label><textarea class="field" id="comment-text" name="text" maxlength="1000" required aria-describedby="comment-counter comment-error" placeholder="${t('comment_placeholder')}"></textarea><div class="comment-form-footer"><span id="comment-counter">0 / 1000</span><button class="btn" type="submit">${t('send')}</button></div><div id="comment-error" role="alert" aria-live="polite"></div></form>`:`<div class="comment-login-note"><a href="#/login">${t('login_to_discuss')}</a></div>`}<div id="comment-list">${comments}</div></section>
    </div>
  </article>`;
  initVideoPlayer(m);
  document.querySelector('#favorite').onclick = async () => {
    if (!token()) return location.hash='#/login';
    const button = document.querySelector('#favorite');
    button.disabled = true;
    try {
      const result = await api(`/movies/${encodeURIComponent(slug)}/favorite/`, {method:'POST'});
      button.textContent = t(result.is_favorite ? 'favorite_added' : 'favorite_add');
      button.classList.toggle('is-selected', result.is_favorite);
      button.setAttribute('aria-pressed', String(result.is_favorite));
      toast(t(result.is_favorite ? 'favorite_toast' : 'favorite_removed'));
    } catch (error) { notifyError(error); }
    finally { button.disabled = false; }
  };
  document.querySelectorAll('[data-rating]').forEach(button => button.onclick = async () => {
    if (!token()) return location.hash='#/login';
    const value = Number(button.dataset.rating);
    const buttons = [...document.querySelectorAll('[data-rating]')];
    buttons.forEach(item => item.disabled = true);
    try {
      const result = await api(`/movies/${encodeURIComponent(slug)}/rating/`, {method:'PUT', body:JSON.stringify({value})});
      buttons.forEach(item => { item.classList.toggle('active', Number(item.dataset.rating) <= value); item.setAttribute('aria-pressed', String(Number(item.dataset.rating) === value)); });
      document.querySelector('#rating-stars').previousElementSibling.querySelector('h2').textContent = t('rating_of',{value});
      document.querySelector('#movie-rating-summary').textContent = `★ ${Number(result.rating_avg).toFixed(1)} (${result.ratings_count})`;
      toast(t('your_rating',{value}));
    } catch (error) { notifyError(error); }
    finally { buttons.forEach(item => item.disabled = false); }
  });
  const form = document.querySelector('#comment-form');
  if (form) {
    const textarea = form.elements.text;
    const counter = document.querySelector('#comment-counter');
    const errorNode = document.querySelector('#comment-error');
    textarea.addEventListener('input', () => { counter.textContent = `${textarea.value.length} / 1000`; errorNode.innerHTML = ''; });
    form.onsubmit = async event => {
      event.preventDefault();
      const text = textarea.value.trim();
      if (!text) { errorNode.innerHTML = `<div class="error">${t('comment_empty')}</div>`; textarea.focus(); return; }
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        const result = await api(`/movies/${encodeURIComponent(slug)}/comments/`, {method:'POST', body:JSON.stringify({text})});
        document.querySelector('.comments-empty')?.remove();
        document.querySelector('#comment-list').insertAdjacentHTML('afterbegin', commentMarkup(result));
        const count = document.querySelectorAll('[data-comment-id]').length;
        document.querySelector('#comments-count').textContent = String(count);
        form.reset(); counter.textContent = '0 / 1000'; errorNode.innerHTML = '';
        toast(t('comment_published'));
      } catch (error) {
        errorNode.innerHTML = `<div class="error">${esc((error.messages || [error.message])[0])}</div>`;
      } finally { submit.disabled = false; }
    };
  }
}

function legalPage(kind) {
  const reportUrl = 'https://github.com/AzamBazartbaev/KinoMir/issues/new';
  const isTakedown = kind === 'takedown-policy';
  app.innerHTML = `<article class="legal-page">
    <div class="eyebrow">Правовая информация</div>
    <h1>${isTakedown ? 'Политика удаления контента' : 'Правообладателям'}</h1>
    ${isTakedown ? `
      <p class="legal-intro">Мы рассматриваем обращения о нарушении прав и при необходимости временно скрываем спорный материал на время проверки.</p>
      <h2>Что указать в обращении</h2>
      <ol><li>Ваше имя и способ связи.</li><li>Ссылку на страницу фильма или конкретный материал.</li><li>Описание произведения и подтверждение ваших прав или полномочий.</li><li>Какое действие требуется: исправление атрибуции, ограничение доступа или удаление.</li></ol>
      <h2>Как проходит проверка</h2>
      <p>Обращение фиксируется, материал и источники проверяются администратором. При обоснованном запросе публикация снимается или исправляется. Если данных недостаточно, мы запросим уточнение в созданном обращении.</p>` : `
      <p class="legal-intro">КиноОрдо — учебный каталог кыргызского кино. Права на фильмы, трейлеры, изображения и названия принадлежат соответствующим правообладателям.</p>
      <h2>Источники и атрибуция</h2>
      <p>На странице каждого фильма указаны тип материала, лицензия, статус проверки и ссылки на источники. Полный фильм публикуется только после подтверждения прав.</p>
      <h2>Сообщить об ошибке или нарушении</h2>
      <p>Если вы правообладатель или его представитель, отправьте ссылку на материал, описание требования и подтверждение полномочий. Мы проверим обращение по процедуре удаления контента.</p>`}
    <div class="legal-actions"><a class="btn" href="${reportUrl}" target="_blank" rel="noopener noreferrer">Создать обращение</a><a class="text-link" href="#/${isTakedown ? 'rights-holders' : 'takedown-policy'}">${isTakedown ? 'Для правообладателей' : 'Политика удаления'}</a></div>
  </article>`;
}

function authPage(mode) {
  const register = mode === 'register';
  if (token()) { location.hash = '#/profile'; return; }
  app.innerHTML = `<section class="auth-card"><div class="eyebrow">${t('account')}</div><h1>${t(register?'register':'login')}</h1><form id="auth-form" novalidate><label for="auth-username">${t('username')}</label><input class="field" id="auth-username" name="username" minlength="3" maxlength="150" autocomplete="username" required aria-describedby="auth-error" placeholder="${t('username_example')}">${register?'<label for="auth-email">Email</label><input class="field" id="auth-email" name="email" type="email" autocomplete="email" required aria-describedby="auth-error" placeholder="name@example.com">':''}<label for="auth-password">${t('password')}</label><input class="field" id="auth-password" name="password" type="password" minlength="8" autocomplete="${register?'new-password':'current-password'}" required aria-describedby="auth-error" placeholder="${t('password_min')}">${register?`<label for="auth-password-confirm">${t('repeat_password')}</label><input class="field" id="auth-password-confirm" name="password_confirm" type="password" minlength="8" autocomplete="new-password" required aria-describedby="auth-error" placeholder="${t('repeat_password_hint')}">`:''}<div id="auth-error" role="alert" aria-live="polite"></div><button class="btn" type="submit">${t(register?'create_account':'nav_login')}</button></form><p>${register?`${t('already_registered')} <a href="#/login">${t('nav_login')}</a>`:`${t('no_account')} <a href="#/register">${t('register')}</a><br><a href="#/password-reset">${t('forgot_password')}</a>`}</p></section>`;
  document.querySelector('#auth-form').onsubmit = async e => {
    e.preventDefault();
    const form = e.target;
    const errorNode = document.querySelector('#auth-error');
    form.querySelectorAll('input').forEach(input => input.removeAttribute('aria-invalid'));
    if (!form.reportValidity()) return;
    const body = Object.fromEntries(new FormData(form));
    if (register && body.password !== body.password_confirm) {
      errorNode.innerHTML = `<div class="error">${t('passwords_mismatch')}</div>`;
      form.elements.password_confirm.setAttribute('aria-invalid', 'true');
      form.elements.password_confirm.focus();
      return;
    }
    delete body.password_confirm;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    errorNode.innerHTML = '';
    try {
      const result = await api(`/auth/${mode}/`, {method:'POST', body:JSON.stringify(body)});
      localStorage.setItem('kinomir_token', result.token);
      setAuthControls();
      location.hash = '#/profile';
      toast(t(register ? 'account_created' : 'logged_in'));
    } catch (error) {
      const messages = error.messages || [error.message];
      form.querySelectorAll('input').forEach(input => input.setAttribute('aria-invalid', 'true'));
      errorNode.innerHTML = `<div class="error"><strong>${t('check_data')}</strong><ul>${messages.map(message => `<li>${esc(translateServerMessage(message))}</li>`).join('')}</ul></div>`;
    } finally {
      button.disabled = false;
    }
  };
}

function formError(node, error) {
  const messages = error.messages || [error.message || t('request_failed')];
  node.innerHTML = `<div class="error"><ul>${messages.map(message => `<li>${esc(message)}</li>`).join('')}</ul></div>`;
}

function passwordResetRequestPage() {
  app.innerHTML = `<section class="auth-card"><div class="eyebrow">${t('account_security')}</div><h1>${t('reset_password')}</h1><p>${t('reset_intro')}</p><form id="password-reset-request-form" novalidate><label for="reset-email">Email</label><input class="field" id="reset-email" name="email" type="email" autocomplete="email" required aria-describedby="account-form-message" placeholder="name@example.com"><div id="account-form-message" role="status" aria-live="polite"></div><button class="btn" type="submit">${t('send_instruction')}</button></form><p><a href="#/login">${t('return_login')}</a></p></section>`;
  const form = document.querySelector('#password-reset-request-form');
  form.onsubmit = async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('button');
    const message = document.querySelector('#account-form-message');
    button.disabled = true; message.innerHTML = '';
    try {
      const result = await api('/auth/password-reset/request/', {method:'POST', body:JSON.stringify(Object.fromEntries(new FormData(form)))});
      message.innerHTML = `<div class="success">${esc(translateServerMessage(result.detail))}</div>`;
      form.reset();
    } catch (error) { formError(message, error); }
    finally { button.disabled = false; }
  };
}

function passwordResetConfirmPage(params) {
  const resetToken = params.get('token') || '';
  app.innerHTML = `<section class="auth-card"><div class="eyebrow">${t('account_security')}</div><h1>${t('new_password')}</h1>${resetToken ? `<form id="password-reset-confirm-form" novalidate><label for="new-password">${t('new_password')}</label><input class="field" id="new-password" name="password" type="password" minlength="8" autocomplete="new-password" required aria-describedby="account-form-message"><label for="new-password-confirm">${t('repeat_password')}</label><input class="field" id="new-password-confirm" name="password_confirm" type="password" minlength="8" autocomplete="new-password" required aria-describedby="account-form-message"><div id="account-form-message" role="alert" aria-live="polite"></div><button class="btn" type="submit">${t('change_password')}</button></form>` : `<div class="error">${t('missing_reset_token')}</div>`}<p><a href="#/login">${t('return_login')}</a></p></section>`;
  const form = document.querySelector('#password-reset-confirm-form');
  if (!form) return;
  form.onsubmit = async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const body = Object.fromEntries(new FormData(form));
    const message = document.querySelector('#account-form-message');
    if (body.password !== body.password_confirm) { message.innerHTML = `<div class="error">${t('passwords_mismatch')}</div>`; form.elements.password_confirm.setAttribute('aria-invalid', 'true'); form.elements.password_confirm.focus(); return; }
    const button = form.querySelector('button'); button.disabled = true; message.innerHTML = '';
    try {
      const result = await api('/auth/password-reset/confirm/', {method:'POST', body:JSON.stringify({...body, token:resetToken})});
      app.innerHTML = `<section class="auth-card"><div class="eyebrow">${t('done')}</div><h1>${t('password_changed')}</h1><p>${esc(translateServerMessage(result.detail))}</p><a class="btn" href="#/login">${t('nav_login')}</a></section>`;
    } catch (error) { formError(message, error); button.disabled = false; }
  };
}

function emailConfirmPage(params) {
  const confirmationToken = params.get('token') || '';
  app.innerHTML = `<section class="auth-card"><div class="eyebrow">Email</div><h1>${t('email_confirmation')}</h1>${confirmationToken ? `<p>${t('email_confirm_intro')}</p><form id="email-confirm-form"><div id="account-form-message" role="alert" aria-live="polite"></div><button class="btn" type="submit">${t('confirm_email')}</button></form>` : `<div class="error">${t('missing_email_token')}</div>`}<p><a href="#/profile">${t('return_profile')}</a></p></section>`;
  const form = document.querySelector('#email-confirm-form');
  if (!form) return;
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('button'); const message = document.querySelector('#account-form-message');
    button.disabled = true;
    try {
      const result = await api('/auth/email-change/confirm/', {method:'POST', body:JSON.stringify({token:confirmationToken})});
      message.innerHTML = `<div class="success">${esc(translateServerMessage(result.detail))}</div>`;
      button.remove();
    } catch (error) { formError(message, error); button.disabled = false; }
  };
}

async function favorites() {
  if (!token()) return location.hash='#/login';
  const movies=await api('/favorites/'); app.innerHTML=`<section class="section"><div class="section-head"><h1>${t('nav_favorites')}</h1></div><div class="grid">${movies.length?movies.map(movieCard).join(''):`<div class="empty">${t('favorites_empty')}</div>`}</div></section>`;
}

async function profile() {
  if (!token()) return location.hash = '#/login';
  try {
    const user = await api('/auth/me/');
    const joined = new Intl.DateTimeFormat(language() === 'ky' ? 'ky-KG' : 'ru-RU', {day:'numeric', month:'long', year:'numeric'}).format(new Date(user.date_joined));
    app.innerHTML = `<section class="profile-card"><div class="profile-avatar" aria-hidden="true">${esc(user.username.slice(0, 1).toUpperCase())}</div><div class="eyebrow">${t('personal_profile')}</div><h1>${esc(user.username)}</h1><p class="profile-intro">${t('profile_intro')}</p><dl class="profile-data"><div><dt>${t('username')}</dt><dd>${esc(user.username)}</dd></div><div><dt>Email</dt><dd>${esc(user.email || t('not_specified'))}</dd></div><div><dt>${t('registration_date')}</dt><dd>${esc(joined)}</dd></div></dl><section class="profile-email" aria-labelledby="email-change-title"><h2 id="email-change-title">${t('change_email')}</h2><p>${t('email_change_intro')}</p><form id="email-change-form" novalidate><label for="profile-email">${t('new_email')}</label><input class="field" id="profile-email" name="email" type="email" autocomplete="email" required aria-describedby="email-change-message" placeholder="new@example.com"><div id="email-change-message" role="status" aria-live="polite"></div><button class="btn secondary" type="submit">${t('send_confirmation')}</button></form></section><div class="profile-actions"><a class="btn" href="#/favorites">${t('open_favorites')}</a><a class="btn secondary" href="#/catalog">${t('go_catalog')}</a></div></section>`;
    const emailForm = document.querySelector('#email-change-form');
    emailForm.onsubmit = async event => {
      event.preventDefault();
      if (!emailForm.reportValidity()) return;
      const button = emailForm.querySelector('button'); const message = document.querySelector('#email-change-message');
      button.disabled = true; message.innerHTML = '';
      try {
        const result = await api('/auth/email-change/request/', {method:'POST', body:JSON.stringify(Object.fromEntries(new FormData(emailForm)))});
        message.innerHTML = `<div class="success">${esc(translateServerMessage(result.detail))}</div>`;
        emailForm.reset();
      } catch (error) { formError(message, error); }
      finally { button.disabled = false; }
    };
  } catch (error) {
    if (error.status === 401) { location.hash = '#/login'; return; }
    throw error;
  }
}

async function router() {
  const isSpaNavigation = Boolean(window.routeReady);
  window.playerController?.abort();
  window.pageController?.abort();
  window.pageController = new AbortController();
  window.pageSignal = window.pageController.signal;
  app.setAttribute('aria-busy', 'true');
  app.innerHTML=`<div class="loader" role="status"><span>${t('loading')}</span></div>`; const [path, queryString = ''] = location.hash.replace(/^#\/?/,'').split('?'); const parts=path.split('/'); const routeParams = new URLSearchParams(queryString);
  applyRouteSeo(parts[0], routeParams);
  const route = parts[0] === 'movie' ? 'catalog' : (parts[0] || 'home');
  document.querySelectorAll('[data-route]').forEach(link => {
    const active = link.dataset.route === route;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  try {
    if(parts[0]==='catalog') await catalog(routeParams); else if(parts[0]==='movie') await movie(decodeURIComponent(parts[1])); else if(parts[0]==='login'||parts[0]==='register') authPage(parts[0]); else if(parts[0]==='password-reset') passwordResetRequestPage(); else if(parts[0]==='password-reset-confirm') passwordResetConfirmPage(routeParams); else if(parts[0]==='email-confirm') emailConfirmPage(routeParams); else if(parts[0]==='favorites') await favorites(); else if(parts[0]==='profile') await profile(); else if(parts[0]==='rights-holders'||parts[0]==='takedown-policy') legalPage(parts[0]); else await home();
    app.removeAttribute('aria-busy');
    window.scrollTo(0, 0);
    if (isSpaNavigation) app.focus({preventScroll:true});
    window.routeReady = true;
    const pageHeading = app.querySelector('h1, h2');
    const announcer = document.querySelector('#route-announcer');
    if (announcer) announcer.textContent = pageHeading?.textContent?.trim() || document.title;
  } catch(error) {
    if (error.name === 'AbortError') return;
    renderPageError(error);
    app.focus({preventScroll:true});
  }
}

function applyStaticTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  document.querySelector('#main-nav')?.setAttribute('aria-label', t('main_navigation'));
  document.querySelector('#legal-nav')?.setAttribute('aria-label', t('legal_navigation'));
  const switcher = document.querySelector('#language-switcher');
  switcher?.setAttribute('aria-label', t('language_switcher'));
  switcher?.querySelectorAll('[data-language]').forEach(button => { const active = button.dataset.language === language(); button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
}

document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => setLanguage(button.dataset.language)));
document.querySelector('#skip-link')?.addEventListener('click', event => { event.preventDefault(); app.focus(); });
window.addEventListener('kinoordo:languagechange', () => { applyStaticTranslations(); setAuthControls(); router(); });
applyStaticTranslations();
setAuthControls();
window.addEventListener('hashchange', router);
window.addEventListener('offline', () => toast(t('offline')));
window.addEventListener('online', () => toast(t('online')));
app.addEventListener('error', event => replaceBrokenPoster(event.target), true);
window.addEventListener('unhandledrejection', event => {
  event.preventDefault();
  if (event.reason?.name !== 'AbortError') notifyError(event.reason);
});
router();
