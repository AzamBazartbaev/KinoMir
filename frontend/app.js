const configuredApi = window.KINOMIR_API_URL || '/api';
const API = (configuredApi.includes('__') ? 'http://localhost:8000/api' : configuredApi).replace(/\/$/, '');
const API_TIMEOUT_MS = 10000;
const app = document.querySelector('#app');
const token = () => localStorage.getItem('kinomir_token');
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const safeExternalUrl = value => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? esc(url.href) : ''; }
  catch { return ''; }
};
const FIELD_LABELS = {username:'Имя пользователя', email:'Email', password:'Пароль', non_field_errors:'Ошибка'};
const HTTP_ERRORS = {
  0: {title: 'Нет соединения с сервером', message: 'Проверьте интернет и убедитесь, что КиноОрдо запущен.'},
  401: {title: 'Нужно войти в аккаунт', message: 'Сессия завершилась или для этого действия требуется авторизация.'},
  403: {title: 'Доступ запрещён', message: 'У вашего аккаунта нет прав для выполнения этого действия.'},
  404: {title: 'Страница не найдена', message: 'Возможно, фильм удалён или адрес указан неправильно.'},
  429: {title: 'Слишком много запросов', message: 'Защита от спама временно ограничила запросы. Подождите немного и попробуйте снова.'},
  500: {title: 'Ошибка на сервере', message: 'Мы не смогли обработать запрос. Попробуйте ещё раз немного позже.'},
};

class ApiError extends Error {
  constructor(messages, status, code = '', retryAfter = 0) {
    super(messages[0] || 'Ошибка запроса');
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
    return {status, title: 'Сервер отвечает слишком долго', message: error.message};
  }
  if (status === 429) {
    const wait = Number(error?.retryAfter) || 0;
    return {
      status,
      title: HTTP_ERRORS[429].title,
      message: wait ? `Лимит запросов исчерпан. Повторите попытку примерно через ${wait} сек.` : HTTP_ERRORS[429].message,
    };
  }
  const preset = status >= 500 ? HTTP_ERRORS[500] : HTTP_ERRORS[status];
  return {
    status,
    title: preset?.title || 'Не удалось выполнить запрос',
    message: preset?.message || error?.message || 'Попробуйте ещё раз.',
  };
}

function apiMessages(data) {
  if (!data || typeof data !== 'object') return ['Ошибка запроса. Попробуйте ещё раз.'];
  const messages = [];
  Object.entries(data).forEach(([field, value]) => {
    const values = Array.isArray(value) ? value : [value];
    values.forEach(message => messages.push(field === 'detail' || field === 'non_field_errors' ? String(message) : `${FIELD_LABELS[field] || field}: ${message}`));
  });
  return messages.length ? messages : ['Ошибка запроса. Попробуйте ещё раз.'];
}

async function api(path, options = {}) {
  const headers = {'Content-Type':'application/json', ...(options.headers || {})};
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
    if (timedOut) throw new ApiError(['Сервер не ответил за 10 секунд. Проверьте соединение и повторите загрузку.'], 0, 'timeout');
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
      ? [`Лимит запросов исчерпан. Повторите попытку примерно через ${retryAfter} сек.`]
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
  const statusLabel = details.status ? `Ошибка ${details.status}` : 'Сетевая ошибка';
  const loginAction = details.status === 401 ? '<a class="btn" href="#/login">Войти</a>' : '';
  app.removeAttribute('aria-busy');
  app.innerHTML = `<section class="page-error" role="alert" aria-live="assertive">
    <div class="page-error-code">${statusLabel}</div>
    <h1>${esc(details.title)}</h1>
    <p>${esc(details.message)}</p>
    <div class="page-error-actions">${loginAction}<button class="btn${loginAction ? ' secondary' : ''}" id="page-retry" type="button">Повторить загрузку</button><a class="text-link" href="#/catalog">Перейти в каталог</a></div>
  </section>`;
  document.querySelector('#page-retry')?.addEventListener('click', router);
}

function poster(movie) {
  return `<div class="poster">${movie.poster ? `<img src="${esc(movie.poster)}" alt="Постер: ${esc(movie.title)}" loading="lazy" decoding="async">` : `<span class="placeholder">${esc(movie.title.slice(0,1))}</span>`}<span class="badge">${esc(movie.age_rating || '0+')}</span></div>`;
}

function replaceBrokenPoster(image) {
  if (!(image instanceof HTMLImageElement) || !image.matches('.poster img')) return;
  const wrapper = image.closest('.poster');
  const title = image.alt.replace(/^Постер:\s*/, '');
  image.remove();
  wrapper.insertAdjacentHTML('afterbegin', `<span class="placeholder" role="img" aria-label="Постер недоступен: ${esc(title)}">${esc(title.slice(0, 1) || 'К')}</span>`);
}

function movieCard(movie) {
  const rating = movie.rating_avg ? `★ ${Number(movie.rating_avg).toFixed(1)}` : 'Без оценки';
  return `<a class="card" href="#/movie/${encodeURIComponent(movie.slug)}">${poster(movie)}<h3>${esc(movie.title)}</h3><div class="card-meta"><div class="meta">${movie.year} · ${esc(movie.country)}</div><div class="rating">${rating}</div></div></a>`;
}

const HOME_COLLECTIONS = [
  {id: 'popular', title: 'Популярное', eyebrow: 'Кыргыз киносу', sort: 'popular'},
  {id: 'newest', title: 'Новинки', eyebrow: 'Жаңы тасмалар', sort: 'newest'},
  {id: 'rating', title: 'Высокий рейтинг', eyebrow: 'Көрүүчүлөрдүн тандоосу', sort: 'rating'},
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
    <section class="hero hero-skeleton" id="home-hero" aria-busy="true" aria-label="Загружается рекомендуемый фильм">
      <div class="hero-content">
        <div class="skeleton skeleton-kicker"></div>
        <div class="skeleton skeleton-heading"></div>
        <div class="skeleton skeleton-copy"></div>
        <div class="skeleton skeleton-button"></div>
      </div>
    </section>
    <div class="home-collections">
      ${HOME_COLLECTIONS.map(collection => `
        <section class="section collection" aria-labelledby="${collection.id}-title">
          <div class="section-head">
            <div><div class="eyebrow">${collection.eyebrow}</div><h2 id="${collection.id}-title">${collection.title}</h2></div>
            <a href="#/catalog">Весь каталог →</a>
          </div>
          <div class="grid" id="${collection.id}-grid" aria-live="polite" aria-busy="true">${skeletonCards()}</div>
        </section>`).join('')}
    </div>`;
}

function renderHero(movie) {
  const target = document.querySelector('#home-hero');
  if (!movie) {
    target.className = 'hero hero-empty';
    target.removeAttribute('aria-busy');
    target.setAttribute('aria-label', 'Рекомендуемый фильм пока не выбран');
    target.innerHTML = '<div class="hero-content"><div class="eyebrow">Кыргыз киносу</div><h1>Скоро здесь будет премьера</h1><p>Добавьте опубликованный фильм, чтобы он появился на главной странице.</p><a class="btn secondary" href="#/catalog">Открыть каталог</a></div>';
    return;
  }

  const heroImage = movie.banner || movie.poster;
  target.className = 'hero';
  target.removeAttribute('aria-busy');
  target.removeAttribute('aria-label');
  if (heroImage) target.style.setProperty('--hero-image', `url("${heroImage.replace(/["\\]/g, '\\$&')}")`);
  target.innerHTML = `<div class="hero-content"><div class="eyebrow">КиноОрдо сунуштайт</div><h1>${esc(movie.title)}</h1><div class="hero-meta"><span>${movie.year}</span><span>${esc(movie.country)}</span><span>${esc(movie.age_rating || '0+')}</span>${movie.rating_avg ? `<span>★ ${Number(movie.rating_avg).toFixed(1)}</span>` : ''}</div><p>${esc(movie.description)}</p><a class="btn" href="#/movie/${encodeURIComponent(movie.slug)}">Смотреть подробнее</a></div>`;
}

function renderCollection(collection, result) {
  const target = document.querySelector(`#${collection.id}-grid`);
  if (!target) return;
  target.removeAttribute('aria-busy');

  if (result.status === 'rejected') {
    target.innerHTML = `<div class="collection-state"><strong>Не удалось загрузить подборку</strong><span>${esc(result.reason.message)}</span><button class="btn secondary" data-retry="${collection.id}">Повторить</button></div>`;
    target.querySelector('[data-retry]')?.addEventListener('click', () => loadCollection(collection));
    return;
  }

  const movies = result.value.results.slice(0, 6);
  target.innerHTML = movies.length
    ? movies.map(movieCard).join('')
    : '<div class="collection-state"><strong>Здесь пока нет фильмов</strong><span>Подборка появится после добавления фильмов в каталог.</span></div>';
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
    ? `<a class="profile-link" href="#/profile">Профиль</a><button class="btn secondary" id="logout">Выйти</button>`
    : `<a class="btn secondary" href="#/login">Войти</a>`;
  document.querySelector('#logout')?.addEventListener('click', async () => {
    try { await api('/auth/logout/', {method:'POST'}); } catch (_) {}
    localStorage.removeItem('kinomir_token'); setAuthControls(); location.hash = '#/'; toast('Вы вышли');
  });
}

async function home() {
  app.innerHTML = homeShell();
  const results = await Promise.allSettled(HOME_COLLECTIONS.map(collection => api(`/movies/?sort=${collection.sort}&page_size=6`)));
  const popularMovies = results[0].status === 'fulfilled' ? results[0].value.results : [];
  renderHero(popularMovies.find(movie => movie.is_featured) || popularMovies[0]);
  HOME_COLLECTIONS.forEach((collection, index) => renderCollection(collection, results[index]));
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
    ['newest', 'По дате добавления'],
    ['title', 'По названию'],
    ['rating', 'По рейтингу'],
  ].map(([value, label]) => `<option value="${value}"${value === sort ? ' selected' : ''}>${label}</option>`).join('');
  const resultContent = data.results.length
    ? `<div id="catalog-grid" class="grid">${data.results.map(movieCard).join('')}</div>`
    : '<div id="catalog-grid" class="collection-state"><strong>Ничего не найдено</strong><span>Попробуйте изменить запрос или сбросить фильтры.</span></div>';
  const pagination = data.previous || data.next ? `<nav class="pagination" aria-label="Страницы каталога">${catalogLink(data.previous, '← Назад')}<span>Страница ${page} из ${totalPages}</span>${catalogLink(data.next, 'Дальше →')}</nav>` : '';

  app.innerHTML = `<section class="section catalog-section"><div class="section-head"><div><div class="eyebrow">Коллекция</div><h2>Каталог фильмов</h2></div><span class="catalog-summary">Найдено: ${data.count}</span></div><form class="filters" id="filters"><input class="field" name="q" value="${esc(query)}" placeholder="Название или описание"><select class="field" name="genre"><option value="">Все жанры</option>${genreOptions}</select><input class="field" name="year" type="number" min="1888" max="2100" value="${esc(year)}" placeholder="Год"><select class="field" name="sort">${sortOptions}</select><button class="btn">Применить</button><a class="filter-reset" href="#/catalog">Сбросить</a></form>${resultContent}${pagination}</section>`;
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
    return `<div class="video-player" id="video-player" tabindex="0" aria-label="Видеоплеер: ${esc(movie.title)}">
      <video id="movie-video" src="${esc(url)}"${posterUrl ? ` poster="${esc(posterUrl)}"` : ''} controls preload="metadata" playsinline></video>
      <button class="video-center-play" id="video-center-play" type="button" aria-label="Воспроизвести"><span aria-hidden="true">▶</span></button>
      <div class="video-loading" aria-hidden="true"><span></span></div>
      <div class="video-error" id="video-error" role="alert" hidden><strong>Видео не удалось загрузить</strong><span>Проверьте подключение и повторите попытку.</span><button class="btn secondary" id="video-retry" type="button">Повторить</button></div>
      <div class="video-controls" id="video-controls">
        <button class="control-button" id="video-toggle" type="button" aria-label="Воспроизвести" title="Воспроизвести (Пробел)"><span aria-hidden="true">▶</span></button>
        <button class="control-button skip-control" id="video-back" type="button" aria-label="Назад на 10 секунд" title="Назад на 10 секунд">−10</button>
        <button class="control-button skip-control" id="video-forward" type="button" aria-label="Вперёд на 10 секунд" title="Вперёд на 10 секунд">+10</button>
        <div class="video-timeline"><input id="video-seek" type="range" min="0" max="1000" value="0" aria-label="Позиция воспроизведения"><span id="video-time">0:00 / 0:00</span></div>
        <button class="control-button" id="video-mute" type="button" aria-label="Выключить звук" title="Звук (M)"><span aria-hidden="true">🔊</span></button>
        <input class="volume-control" id="video-volume" type="range" min="0" max="1" step="0.05" value="1" aria-label="Громкость">
        <label class="speed-control">Скорость<select id="video-speed" aria-label="Скорость воспроизведения"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
        <button class="control-button" id="video-fullscreen" type="button" aria-label="Полноэкранный режим" title="Полноэкранный режим (F)"><span aria-hidden="true">⛶</span></button>
      </div>
    </div>`;
  }
  if (mode === 'embed') return `<div class="player embed-player"><iframe src="${esc(url)}" title="Проигрыватель: ${esc(movie.title)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe><p class="player-note">Скорость и полный экран доступны в панели встроенного плеера.</p></div>`;
  if (mode === 'external') return `<div class="player player-state"><div><div class="player-state-icon" aria-hidden="true">↗</div><strong>Фильм доступен на внешней площадке</strong><p>Просмотр откроется в новой безопасной вкладке.</p><a class="btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Открыть легальный источник</a></div></div>`;
  return '<div class="player player-state"><div><div class="player-state-icon" aria-hidden="true">!</div><strong>Видео временно недоступно</strong><p>Мы сохранили информацию о фильме. Источник просмотра появится позже.</p></div></div>';
}

function videoKind(movie) {
  return /video\.kinoafisha\.info\/video-/i.test(movie.player?.url || '') ? 'Трейлер' : 'Смотреть';
}

function initVideoPlayer() {
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
  video.controls = false;

  const updatePlayState = () => {
    const playing = !video.paused && !video.ended;
    toggleButton.innerHTML = `<span aria-hidden="true">${playing ? '❚❚' : '▶'}</span>`;
    toggleButton.setAttribute('aria-label', playing ? 'Пауза' : 'Воспроизвести');
    toggleButton.title = playing ? 'Пауза (Пробел)' : 'Воспроизвести (Пробел)';
    centerButton.classList.toggle('is-hidden', playing);
    shell.classList.toggle('is-playing', playing);
  };
  const updateTime = () => {
    const progress = video.duration ? video.currentTime / video.duration : 0;
    seek.value = String(Math.round(progress * 1000));
    seek.style.setProperty('--progress', `${progress * 100}%`);
    time.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
  };
  const togglePlay = async () => {
    if (video.paused || video.ended) {
      try { await video.play(); } catch (_) { toast('Браузер не разрешил воспроизведение'); }
    } else video.pause();
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (shell.requestFullscreen) await shell.requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      else toast('Полноэкранный режим не поддерживается');
    } catch (_) { toast('Полноэкранный режим недоступен'); }
  };
  const setMutedIcon = () => {
    const muted = video.muted || video.volume === 0;
    mute.innerHTML = `<span aria-hidden="true">${muted ? '🔇' : '🔊'}</span>`;
    mute.setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');
  };

  playButtons.forEach(button => button.addEventListener('click', togglePlay));
  video.addEventListener('click', togglePlay);
  video.addEventListener('dblclick', toggleFullscreen);
  video.addEventListener('play', updatePlayState);
  video.addEventListener('pause', updatePlayState);
  video.addEventListener('ended', updatePlayState);
  video.addEventListener('timeupdate', updateTime);
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
  speed.addEventListener('change', () => { video.playbackRate = Number(speed.value); toast(`Скорость: ${speed.options[speed.selectedIndex].text}`); });
  fullscreen.addEventListener('click', toggleFullscreen);
  shell.querySelector('#video-retry').addEventListener('click', () => { errorState.hidden = true; controls.hidden = false; centerButton.hidden = false; video.load(); });
  document.addEventListener('fullscreenchange', () => { const active = Boolean(document.fullscreenElement); fullscreen.setAttribute('aria-label', active ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'); fullscreen.title = active ? 'Выйти из полноэкранного режима (F)' : 'Полноэкранный режим (F)'; }, {signal: playerSignal});
  shell.addEventListener('keydown', event => {
    if (event.target.matches('select, input')) return;
    if ([' ', 'k', 'K'].includes(event.key)) { event.preventDefault(); togglePlay(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 10); }
    if (event.key === 'ArrowRight') { event.preventDefault(); video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10); }
    if (event.key.toLowerCase() === 'm') { video.muted = !video.muted; setMutedIcon(); }
    if (event.key.toLowerCase() === 'f') toggleFullscreen();
  });
  updatePlayState();
  updateTime();
}

function commentMarkup(comment) {
  const date = new Intl.DateTimeFormat('ru-RU', {day:'numeric', month:'short', year:'numeric'}).format(new Date(comment.created_at));
  return `<div class="comment" data-comment-id="${Number(comment.id)}"><div><strong>${esc(comment.username)}</strong><small>${esc(date)}</small></div><p>${esc(comment.text)}</p></div>`;
}

function legalMarkup(legal = {}) {
  const source = safeExternalUrl(legal.content_source_url);
  const posterSource = safeExternalUrl(legal.poster_source_url);
  const videoSource = safeExternalUrl(legal.video_source_url);
  const sourceLink = (url, label) => url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>` : '<span>не указан</span>';
  return `<section class="legal-card" aria-labelledby="legal-title">
    <div><div class="eyebrow">Права и источники</div><h2 id="legal-title">Информация о контенте</h2></div>
    <dl class="legal-meta">
      <div><dt>Материал</dt><dd>${esc(legal.video_content_label || 'не указан')}</dd></div>
      <div><dt>Правообладатель</dt><dd>${esc(legal.rights_holder || 'уточняется')}</dd></div>
      <div><dt>Лицензия</dt><dd>${esc(legal.license_label || 'не указана')}</dd></div>
      <div><dt>Проверка</dt><dd><span class="rights-status rights-status-${esc(legal.rights_status || 'pending')}">${esc(legal.rights_status_label || 'ожидает проверки')}</span></dd></div>
      <div><dt>Сведения о правах</dt><dd>${sourceLink(source, 'Открыть источник')}</dd></div>
    </dl>
    ${legal.video_attribution ? `<p class="attribution"><strong>Видео:</strong> ${esc(legal.video_attribution)} · ${sourceLink(videoSource, 'источник')}</p>` : ''}
    ${legal.poster_attribution ? `<p class="attribution"><strong>Постер:</strong> ${esc(legal.poster_attribution)} · ${sourceLink(posterSource, 'источник')}</p>` : ''}
  </section>`;
}

async function movie(slug) {
  const m = await api(`/movies/${encodeURIComponent(slug)}/`);
  const comments = m.comments.length ? m.comments.map(commentMarkup).join('') : '<div class="comments-empty">Комментариев пока нет. Начните обсуждение первым.</div>';
  const guestNote = token() ? '' : '<div class="social-auth-note">Чтобы добавлять фильмы, ставить оценки и писать комментарии, <a href="#/login">войдите в аккаунт</a>.</div>';
  app.innerHTML = `<article class="detail">
    <aside class="detail-poster">${poster(m)}</aside>
    <div class="detail-content">
      <div class="eyebrow">${esc(m.genres.map(g=>g.name).join(' · '))}</div>
      <h1>${esc(m.title)}</h1>
      <div class="meta">${esc(m.original_title)}</div>
      <div class="facts"><span>${m.year}</span><span>${esc(m.country)}</span><span>${m.duration} мин</span><span id="movie-rating-summary">★ ${m.rating_avg ? Number(m.rating_avg).toFixed(1) : '—'} (${m.ratings_count})</span></div>
      <p class="movie-description">${esc(m.description)}</p>
      <p><strong>Режиссёр:</strong> ${esc(m.director || 'не указан')}<br><strong>В ролях:</strong> ${esc(m.actors || 'не указаны')}</p>
      <section class="watch-section"><div class="watch-head"><div><div class="eyebrow">${videoKind(m)}</div><h2>${esc(m.title)}</h2></div><span>Пробел — пауза · ← → — 10 сек · F — полный экран</span></div>${playerMarkup(m)}</section>
      ${legalMarkup(m.legal)}
      <section class="social-panel" aria-label="Действия с фильмом">
        <div><div><div class="social-label">Избранное</div><h2>Сохранить фильм</h2></div><button class="btn ${m.is_favorite ? 'is-selected' : ''}" id="favorite" type="button" aria-pressed="${m.is_favorite}">${m.is_favorite ? '✓ В избранном' : 'В избранное'}</button></div>
        <div><div><div class="social-label">Личная оценка</div><h2>${m.user_rating ? `${m.user_rating} из 5` : 'Пока не оценён'}</h2></div><div class="stars" id="rating-stars">${[1,2,3,4,5].map(n=>`<button type="button" data-rating="${n}" class="${n <= (m.user_rating || 0) ? 'active':''}" aria-label="${n} из 5" aria-pressed="${n === m.user_rating}">★</button>`).join('')}</div></div>
        ${guestNote}
      </section>
      <section class="comments"><div class="comments-heading"><div><div class="eyebrow">Обсуждение</div><h2>Комментарии</h2></div><span id="comments-count">${m.comments.length}</span></div>${token()?'<form id="comment-form" novalidate><label for="comment-text">Ваш комментарий</label><textarea class="field" id="comment-text" name="text" maxlength="1000" required placeholder="Поделитесь впечатлением о фильме"></textarea><div class="comment-form-footer"><span id="comment-counter">0 / 1000</span><button class="btn" type="submit">Отправить</button></div><div id="comment-error" role="alert" aria-live="polite"></div></form>':'<div class="comment-login-note"><a href="#/login">Войдите в аккаунт</a>, чтобы присоединиться к обсуждению.</div>'}<div id="comment-list">${comments}</div></section>
    </div>
  </article>`;
  initVideoPlayer();
  document.querySelector('#favorite').onclick = async () => {
    if (!token()) return location.hash='#/login';
    const button = document.querySelector('#favorite');
    button.disabled = true;
    try {
      const result = await api(`/movies/${encodeURIComponent(slug)}/favorite/`, {method:'POST'});
      button.textContent = result.is_favorite ? '✓ В избранном' : 'В избранное';
      button.classList.toggle('is-selected', result.is_favorite);
      button.setAttribute('aria-pressed', String(result.is_favorite));
      toast(result.is_favorite ? 'Добавлено в избранное' : 'Удалено из избранного');
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
      document.querySelector('#rating-stars').previousElementSibling.querySelector('h2').textContent = `${value} из 5`;
      document.querySelector('#movie-rating-summary').textContent = `★ ${Number(result.rating_avg).toFixed(1)} (${result.ratings_count})`;
      toast(`Ваша оценка: ${value} из 5`);
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
      if (!text) { errorNode.innerHTML = '<div class="error">Напишите комментарий перед отправкой.</div>'; textarea.focus(); return; }
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        const result = await api(`/movies/${encodeURIComponent(slug)}/comments/`, {method:'POST', body:JSON.stringify({text})});
        document.querySelector('.comments-empty')?.remove();
        document.querySelector('#comment-list').insertAdjacentHTML('afterbegin', commentMarkup(result));
        const count = document.querySelectorAll('[data-comment-id]').length;
        document.querySelector('#comments-count').textContent = String(count);
        form.reset(); counter.textContent = '0 / 1000'; errorNode.innerHTML = '';
        toast('Комментарий опубликован');
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
  app.innerHTML = `<section class="auth-card"><div class="eyebrow">Аккаунт</div><h1>${register?'Регистрация':'Вход'}</h1><form id="auth-form" novalidate><label>Имя пользователя<input class="field" name="username" minlength="3" maxlength="150" autocomplete="username" required placeholder="Например, azam"></label>${register?'<label>Email<input class="field" name="email" type="email" autocomplete="email" required placeholder="name@example.com"></label>':''}<label>Пароль<input class="field" name="password" type="password" minlength="8" autocomplete="${register?'new-password':'current-password'}" required placeholder="Минимум 8 символов"></label>${register?'<label>Повторите пароль<input class="field" name="password_confirm" type="password" minlength="8" autocomplete="new-password" required placeholder="Введите пароль ещё раз"></label>':''}<div id="auth-error" role="alert" aria-live="polite"></div><button class="btn" type="submit">${register?'Создать аккаунт':'Войти'}</button></form><p>${register?'Уже зарегистрированы? <a href="#/login">Войти</a>':'Нет аккаунта? <a href="#/register">Регистрация</a><br><a href="#/password-reset">Забыли пароль?</a>'}</p></section>`;
  document.querySelector('#auth-form').onsubmit = async e => {
    e.preventDefault();
    const form = e.target;
    const errorNode = document.querySelector('#auth-error');
    if (!form.reportValidity()) return;
    const body = Object.fromEntries(new FormData(form));
    if (register && body.password !== body.password_confirm) {
      errorNode.innerHTML = '<div class="error">Пароли не совпадают.</div>';
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
      toast(register ? 'Аккаунт создан' : 'Вы вошли');
    } catch (error) {
      const messages = error.messages || [error.message];
      errorNode.innerHTML = `<div class="error"><strong>Проверьте данные:</strong><ul>${messages.map(message => `<li>${esc(message)}</li>`).join('')}</ul></div>`;
    } finally {
      button.disabled = false;
    }
  };
}

function formError(node, error) {
  const messages = error.messages || [error.message || 'Не удалось выполнить запрос.'];
  node.innerHTML = `<div class="error"><ul>${messages.map(message => `<li>${esc(message)}</li>`).join('')}</ul></div>`;
}

function passwordResetRequestPage() {
  app.innerHTML = `<section class="auth-card"><div class="eyebrow">Безопасность аккаунта</div><h1>Восстановление пароля</h1><p>Укажите email аккаунта. Ответ будет одинаковым независимо от того, зарегистрирован адрес или нет.</p><form id="password-reset-request-form" novalidate><label>Email<input class="field" name="email" type="email" autocomplete="email" required placeholder="name@example.com"></label><div id="account-form-message" role="status" aria-live="polite"></div><button class="btn" type="submit">Отправить инструкцию</button></form><p><a href="#/login">Вернуться ко входу</a></p></section>`;
  const form = document.querySelector('#password-reset-request-form');
  form.onsubmit = async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('button');
    const message = document.querySelector('#account-form-message');
    button.disabled = true; message.innerHTML = '';
    try {
      const result = await api('/auth/password-reset/request/', {method:'POST', body:JSON.stringify(Object.fromEntries(new FormData(form)))});
      message.innerHTML = `<div class="success">${esc(result.detail)}</div>`;
      form.reset();
    } catch (error) { formError(message, error); }
    finally { button.disabled = false; }
  };
}

function passwordResetConfirmPage(params) {
  const resetToken = params.get('token') || '';
  app.innerHTML = `<section class="auth-card"><div class="eyebrow">Безопасность аккаунта</div><h1>Новый пароль</h1>${resetToken ? `<form id="password-reset-confirm-form" novalidate><label>Новый пароль<input class="field" name="password" type="password" minlength="8" autocomplete="new-password" required></label><label>Повторите пароль<input class="field" name="password_confirm" type="password" minlength="8" autocomplete="new-password" required></label><div id="account-form-message" role="alert" aria-live="polite"></div><button class="btn" type="submit">Изменить пароль</button></form>` : '<div class="error">В ссылке отсутствует токен восстановления.</div>'}<p><a href="#/login">Вернуться ко входу</a></p></section>`;
  const form = document.querySelector('#password-reset-confirm-form');
  if (!form) return;
  form.onsubmit = async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const body = Object.fromEntries(new FormData(form));
    const message = document.querySelector('#account-form-message');
    if (body.password !== body.password_confirm) { message.innerHTML = '<div class="error">Пароли не совпадают.</div>'; return; }
    const button = form.querySelector('button'); button.disabled = true; message.innerHTML = '';
    try {
      const result = await api('/auth/password-reset/confirm/', {method:'POST', body:JSON.stringify({...body, token:resetToken})});
      app.innerHTML = `<section class="auth-card"><div class="eyebrow">Готово</div><h1>Пароль изменён</h1><p>${esc(result.detail)}</p><a class="btn" href="#/login">Войти</a></section>`;
    } catch (error) { formError(message, error); button.disabled = false; }
  };
}

function emailConfirmPage(params) {
  const confirmationToken = params.get('token') || '';
  app.innerHTML = `<section class="auth-card"><div class="eyebrow">Email</div><h1>Подтверждение адреса</h1>${confirmationToken ? '<p>Нажмите кнопку, чтобы подтвердить новый email. Ссылка сработает только один раз.</p><form id="email-confirm-form"><div id="account-form-message" role="alert" aria-live="polite"></div><button class="btn" type="submit">Подтвердить email</button></form>' : '<div class="error">В ссылке отсутствует токен подтверждения.</div>'}<p><a href="#/profile">Вернуться в профиль</a></p></section>`;
  const form = document.querySelector('#email-confirm-form');
  if (!form) return;
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('button'); const message = document.querySelector('#account-form-message');
    button.disabled = true;
    try {
      const result = await api('/auth/email-change/confirm/', {method:'POST', body:JSON.stringify({token:confirmationToken})});
      message.innerHTML = `<div class="success">${esc(result.detail)}</div>`;
      button.remove();
    } catch (error) { formError(message, error); button.disabled = false; }
  };
}

async function favorites() {
  if (!token()) return location.hash='#/login';
  const movies=await api('/favorites/'); app.innerHTML=`<section class="section"><div class="section-head"><h2>Избранное</h2></div><div class="grid">${movies.length?movies.map(movieCard).join(''):'<div class="empty">Здесь пока нет фильмов</div>'}</div></section>`;
}

async function profile() {
  if (!token()) return location.hash = '#/login';
  try {
    const user = await api('/auth/me/');
    const joined = new Intl.DateTimeFormat('ru-RU', {day:'numeric', month:'long', year:'numeric'}).format(new Date(user.date_joined));
    app.innerHTML = `<section class="profile-card"><div class="profile-avatar" aria-hidden="true">${esc(user.username.slice(0, 1).toUpperCase())}</div><div class="eyebrow">Личный профиль</div><h1>${esc(user.username)}</h1><p class="profile-intro">Здесь хранятся данные вашего аккаунта КиноОрдо.</p><dl class="profile-data"><div><dt>Имя пользователя</dt><dd>${esc(user.username)}</dd></div><div><dt>Email</dt><dd>${esc(user.email || 'Не указан')}</dd></div><div><dt>Дата регистрации</dt><dd>${esc(joined)}</dd></div></dl><section class="profile-email" aria-labelledby="email-change-title"><h2 id="email-change-title">Изменить email</h2><p>Новый адрес будет сохранён только после перехода по ссылке из письма.</p><form id="email-change-form" novalidate><label>Новый email<input class="field" name="email" type="email" autocomplete="email" required placeholder="new@example.com"></label><div id="email-change-message" role="status" aria-live="polite"></div><button class="btn secondary" type="submit">Отправить подтверждение</button></form></section><div class="profile-actions"><a class="btn" href="#/favorites">Открыть избранное</a><a class="btn secondary" href="#/catalog">Перейти в каталог</a></div></section>`;
    const emailForm = document.querySelector('#email-change-form');
    emailForm.onsubmit = async event => {
      event.preventDefault();
      if (!emailForm.reportValidity()) return;
      const button = emailForm.querySelector('button'); const message = document.querySelector('#email-change-message');
      button.disabled = true; message.innerHTML = '';
      try {
        const result = await api('/auth/email-change/request/', {method:'POST', body:JSON.stringify(Object.fromEntries(new FormData(emailForm)))});
        message.innerHTML = `<div class="success">${esc(result.detail)}</div>`;
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
  window.playerController?.abort();
  window.pageController?.abort();
  window.pageController = new AbortController();
  window.pageSignal = window.pageController.signal;
  app.setAttribute('aria-busy', 'true');
  app.innerHTML='<div class="loader" role="status"><span>Загружаем кино…</span></div>'; const [path, queryString = ''] = location.hash.replace(/^#\/?/,'').split('?'); const parts=path.split('/'); const routeParams = new URLSearchParams(queryString);
  const route = parts[0] === 'movie' ? 'catalog' : (parts[0] || 'home');
  document.querySelectorAll('[data-route]').forEach(link => link.classList.toggle('active', link.dataset.route === route));
  try {
    if(parts[0]==='catalog') await catalog(routeParams); else if(parts[0]==='movie') await movie(decodeURIComponent(parts[1])); else if(parts[0]==='login'||parts[0]==='register') authPage(parts[0]); else if(parts[0]==='password-reset') passwordResetRequestPage(); else if(parts[0]==='password-reset-confirm') passwordResetConfirmPage(routeParams); else if(parts[0]==='email-confirm') emailConfirmPage(routeParams); else if(parts[0]==='favorites') await favorites(); else if(parts[0]==='profile') await profile(); else if(parts[0]==='rights-holders'||parts[0]==='takedown-policy') legalPage(parts[0]); else await home();
    app.removeAttribute('aria-busy');
    app.focus();
  } catch(error) {
    if (error.name === 'AbortError') return;
    renderPageError(error);
  }
}

setAuthControls();
window.addEventListener('hashchange', router);
window.addEventListener('offline', () => toast('Соединение с интернетом потеряно'));
window.addEventListener('online', () => toast('Соединение восстановлено'));
app.addEventListener('error', event => replaceBrokenPoster(event.target), true);
window.addEventListener('unhandledrejection', event => {
  event.preventDefault();
  if (event.reason?.name !== 'AbortError') notifyError(event.reason);
});
router();
