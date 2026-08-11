const configuredApi = window.KINOMIR_API_URL || '/api';
const API = (configuredApi.includes('__') ? 'http://localhost:8000/api' : configuredApi).replace(/\/$/, '');
const app = document.querySelector('#app');
const token = () => localStorage.getItem('kinomir_token');
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

async function api(path, options = {}) {
  const headers = {'Content-Type':'application/json', ...(options.headers || {})};
  if (token()) headers.Authorization = `Token ${token()}`;
  const response = await fetch(`${API}${path}`, {...options, headers});
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.non_field_errors?.[0] || Object.values(data).flat()[0] || 'Ошибка запроса');
  return data;
}

function toast(message) {
  const node = document.querySelector('#toast'); node.textContent = message; node.classList.add('show');
  setTimeout(() => node.classList.remove('show'), 2500);
}

function poster(movie) {
  return `<div class="poster">${movie.poster ? `<img src="${esc(movie.poster)}" alt="Постер: ${esc(movie.title)}">` : `<span class="placeholder">${esc(movie.title.slice(0,1))}</span>`}<span class="badge">${esc(movie.age_rating || '0+')}</span></div>`;
}

function movieCard(movie) {
  const rating = movie.rating_avg ? `★ ${Number(movie.rating_avg).toFixed(1)}` : 'Без оценки';
  return `<a class="card" href="#/movie/${encodeURIComponent(movie.slug)}">${poster(movie)}<h3>${esc(movie.title)}</h3><div class="card-meta"><div class="meta">${movie.year} · ${esc(movie.country)}</div><div class="rating">${rating}</div></div></a>`;
}

const HOME_COLLECTIONS = [
  {id: 'popular', title: 'Популярное', eyebrow: 'Смотрят сейчас', sort: 'popular'},
  {id: 'newest', title: 'Новинки', eyebrow: 'Свежие поступления', sort: 'newest'},
  {id: 'rating', title: 'Высокий рейтинг', eyebrow: 'Выбор зрителей', sort: 'rating'},
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
    target.innerHTML = '<div class="hero-content"><div class="eyebrow">Выбор редакции</div><h1>Скоро здесь будет премьера</h1><p>Добавьте опубликованный фильм, чтобы он появился на главной странице.</p><a class="btn secondary" href="#/catalog">Открыть каталог</a></div>';
    return;
  }

  const heroImage = movie.banner || movie.poster;
  target.className = 'hero';
  target.removeAttribute('aria-busy');
  target.removeAttribute('aria-label');
  if (heroImage) target.style.setProperty('--hero-image', `url("${heroImage.replace(/["\\]/g, '\\$&')}")`);
  target.innerHTML = `<div class="hero-content"><div class="eyebrow">Выбор редакции</div><h1>${esc(movie.title)}</h1><div class="hero-meta"><span>${movie.year}</span><span>${esc(movie.country)}</span><span>${esc(movie.age_rating || '0+')}</span>${movie.rating_avg ? `<span>★ ${Number(movie.rating_avg).toFixed(1)}</span>` : ''}</div><p>${esc(movie.description)}</p><a class="btn" href="#/movie/${encodeURIComponent(movie.slug)}">Смотреть подробнее</a></div>`;
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
  const result = await Promise.allSettled([api(`/movies/?sort=${collection.sort}`)]);
  renderCollection(collection, result[0]);
}

function setAuthControls() {
  document.querySelector('#auth-controls').innerHTML = token()
    ? `<button class="btn secondary" id="logout">Выйти</button>`
    : `<a class="btn secondary" href="#/login">Войти</a>`;
  document.querySelector('#logout')?.addEventListener('click', async () => {
    try { await api('/auth/logout/', {method:'POST'}); } catch (_) {}
    localStorage.removeItem('kinomir_token'); setAuthControls(); location.hash = '#/'; toast('Вы вышли');
  });
}

async function home() {
  app.innerHTML = homeShell();
  const results = await Promise.allSettled(HOME_COLLECTIONS.map(collection => api(`/movies/?sort=${collection.sort}`)));
  const popularMovies = results[0].status === 'fulfilled' ? results[0].value.results : [];
  renderHero(popularMovies.find(movie => movie.is_featured) || popularMovies[0]);
  HOME_COLLECTIONS.forEach((collection, index) => renderCollection(collection, results[index]));
}

async function catalog() {
  const [genres, data] = await Promise.all([api('/genres/'), api('/movies/')]);
  app.innerHTML = `<section class="section"><div class="section-head"><div><div class="eyebrow">Коллекция</div><h2>Каталог фильмов</h2></div></div><form class="filters" id="filters"><input class="field" name="q" placeholder="Название, актёр или режиссёр"><select class="field" name="genre"><option value="">Все жанры</option>${genres.map(g=>`<option value="${esc(g.slug)}">${esc(g.name)}</option>`).join('')}</select><select class="field" name="sort"><option value="newest">Сначала новые</option><option value="rating">По рейтингу</option><option value="popular">По популярности</option><option value="year_desc">По году</option></select><button class="btn">Найти</button></form><div id="catalog-grid" class="grid">${data.results.map(movieCard).join('')}</div></section>`;
  document.querySelector('#filters').onsubmit = async e => {
    e.preventDefault(); const qs = new URLSearchParams(new FormData(e.target));
    const result = await api(`/movies/?${qs}`); document.querySelector('#catalog-grid').innerHTML = result.results.length ? result.results.map(movieCard).join('') : '<div class="empty">Ничего не найдено</div>';
  };
}

async function movie(slug) {
  const m = await api(`/movies/${encodeURIComponent(slug)}/`);
  let player = '<div class="player">Источник видео недоступен</div>';
  if (m.player.mode === 'embed') player = `<div class="player"><iframe src="${esc(m.player.url)}" title="Проигрыватель: ${esc(m.title)}" allowfullscreen></iframe></div>`;
  if (m.player.mode === 'html5') player = `<div class="player"><video src="${esc(m.player.url)}" controls></video></div>`;
  if (m.player.mode === 'external') player = `<div class="player"><a class="btn" href="${esc(m.player.url)}" target="_blank" rel="noopener noreferrer">Открыть легальный источник ↗</a></div>`;
  app.innerHTML = `<article class="detail"><div>${poster(m)}</div><div><div class="eyebrow">${esc(m.genres.map(g=>g.name).join(' · '))}</div><h1>${esc(m.title)}</h1><div class="meta">${esc(m.original_title)}</div><div class="facts"><span>${m.year}</span><span>${esc(m.country)}</span><span>${m.duration} мин</span><span>★ ${m.rating_avg ? Number(m.rating_avg).toFixed(1) : '—'} (${m.ratings_count})</span></div><p>${esc(m.description)}</p><p><strong>Режиссёр:</strong> ${esc(m.director || 'не указан')}<br><strong>В ролях:</strong> ${esc(m.actors || 'не указаны')}</p><div class="actions"><button class="btn" id="favorite">${m.is_favorite ? 'Убрать из избранного' : 'В избранное'}</button></div><section><h2>Ваша оценка</h2><div class="stars">${[1,2,3,4,5].map(n=>`<button data-rating="${n}" class="${n <= (m.user_rating || 0) ? 'active':''}" aria-label="${n} из 5">★</button>`).join('')}</div></section>${player}<section class="comments"><h2>Комментарии</h2>${token()?'<form id="comment-form"><textarea class="field" name="text" maxlength="1000" required placeholder="Ваш комментарий"></textarea><button class="btn">Отправить</button></form>':'<p><a href="#/login">Войдите</a>, чтобы оставить комментарий.</p>'}<div id="comment-list">${m.comments.map(c=>`<div class="comment"><strong>${esc(c.username)}</strong><small>${new Date(c.created_at).toLocaleDateString('ru')}</small><p>${esc(c.text)}</p></div>`).join('')}</div></section></div></article>`;
  document.querySelector('#favorite').onclick = async () => {
    if (!token()) return location.hash='#/login';
    const result = await api(`/movies/${encodeURIComponent(slug)}/favorite/`, {method:'POST'}); document.querySelector('#favorite').textContent = result.is_favorite ? 'Убрать из избранного':'В избранное'; toast(result.is_favorite?'Добавлено в избранное':'Удалено из избранного');
  };
  document.querySelectorAll('[data-rating]').forEach(button => button.onclick = async () => {
    if (!token()) return location.hash='#/login';
    await api(`/movies/${encodeURIComponent(slug)}/rating/`, {method:'PUT', body:JSON.stringify({value:Number(button.dataset.rating)})}); document.querySelectorAll('[data-rating]').forEach(x=>x.classList.toggle('active', Number(x.dataset.rating)<=Number(button.dataset.rating))); toast('Оценка сохранена');
  });
  const form = document.querySelector('#comment-form'); if (form) form.onsubmit = async e => {e.preventDefault(); const text=e.target.text.value; await api(`/movies/${encodeURIComponent(slug)}/comments/`,{method:'POST',body:JSON.stringify({text})}); toast('Комментарий отправлен'); movie(slug);};
}

function authPage(mode) {
  const register = mode === 'register';
  app.innerHTML = `<section class="auth-card"><h1>${register?'Регистрация':'Вход'}</h1><form id="auth-form"><input class="field" name="username" required placeholder="Имя пользователя">${register?'<input class="field" name="email" type="email" required placeholder="Email">':''}<input class="field" name="password" type="password" required placeholder="Пароль"><div id="auth-error"></div><button class="btn">${register?'Создать аккаунт':'Войти'}</button></form><p>${register?'Уже зарегистрированы? <a href="#/login">Войти</a>':'Нет аккаунта? <a href="#/register">Регистрация</a>'}</p></section>`;
  document.querySelector('#auth-form').onsubmit = async e => { e.preventDefault(); const body=Object.fromEntries(new FormData(e.target)); try{const result=await api(`/auth/${mode}/`,{method:'POST',body:JSON.stringify(body)});localStorage.setItem('kinomir_token',result.token);setAuthControls();location.hash='#/';toast(register?'Аккаунт создан':'Вы вошли');}catch(error){document.querySelector('#auth-error').innerHTML=`<div class="error">${esc(error.message)}</div>`;}};
}

async function favorites() {
  if (!token()) return location.hash='#/login';
  const movies=await api('/favorites/'); app.innerHTML=`<section class="section"><div class="section-head"><h2>Избранное</h2></div><div class="grid">${movies.length?movies.map(movieCard).join(''):'<div class="empty">Здесь пока нет фильмов</div>'}</div></section>`;
}

async function router() {
  app.innerHTML='<div class="loader">Загружаем кино…</div>'; const parts=location.hash.replace(/^#\/?/,'').split('/');
  const route = parts[0] === 'movie' ? 'catalog' : (parts[0] || 'home');
  document.querySelectorAll('[data-route]').forEach(link => link.classList.toggle('active', link.dataset.route === route));
  try { if(parts[0]==='catalog') await catalog(); else if(parts[0]==='movie') await movie(decodeURIComponent(parts[1])); else if(parts[0]==='login'||parts[0]==='register') authPage(parts[0]); else if(parts[0]==='favorites') await favorites(); else await home(); app.focus(); } catch(error) { app.innerHTML=`<div class="empty"><h2>Не удалось загрузить страницу</h2><p>${esc(error.message)}</p></div>`; }
}

setAuthControls(); window.addEventListener('hashchange',router); router();
