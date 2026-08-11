const API = window.KINOMIR_API_URL.includes('__') ? 'http://localhost:8000/api' : window.KINOMIR_API_URL;
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
  return `<div class="poster">${movie.poster ? `<img src="${esc(movie.poster)}" alt="Постер: ${esc(movie.title)}">` : `<span class="placeholder">${esc(movie.title.slice(0,1))}</span>`}<span class="badge">${movie.age_rating || '0+'}</span></div>`;
}

function movieCard(movie) {
  const rating = movie.rating_avg ? `★ ${Number(movie.rating_avg).toFixed(1)}` : 'Без оценки';
  return `<article class="card" data-slug="${esc(movie.slug)}" tabindex="0">${poster(movie)}<h3>${esc(movie.title)}</h3><div class="card-meta"><div class="meta">${movie.year} · ${esc(movie.country)}</div><div class="rating">${rating}</div></div></article>`;
}

function bindCards() {
  document.querySelectorAll('[data-slug]').forEach(card => {
    const open = () => location.hash = `#/movie/${encodeURIComponent(card.dataset.slug)}`;
    card.onclick = open; card.onkeydown = e => { if (e.key === 'Enter') open(); };
  });
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
  const data = await api('/movies/?sort=popular');
  const movies = data.results; const hero = movies.find(x => x.is_featured) || movies[0];
  const heroImage = hero?.poster ? `style="--hero-image:url('${esc(hero.poster)}')"` : '';
  app.innerHTML = hero ? `<section class="hero" ${heroImage}><div class="hero-content"><div class="eyebrow">Выбор редакции</div><h1>${esc(hero.title)}</h1><div class="hero-meta"><span>${hero.year}</span><span>${esc(hero.country)}</span><span>${hero.age_rating || '0+'}</span>${hero.rating_avg ? `<span>★ ${Number(hero.rating_avg).toFixed(1)}</span>` : ''}</div><p>${esc(hero.description)}</p><button class="btn" data-slug="${esc(hero.slug)}">Смотреть подробнее</button></div></section><section class="section"><div class="section-head"><h2>Популярные фильмы</h2><a href="#/catalog">Весь каталог →</a></div><div class="grid">${movies.slice(0,6).map(movieCard).join('')}</div></section>` : '<div class="empty">Каталог пока пуст</div>';
  bindCards();
}

async function catalog() {
  const [genres, data] = await Promise.all([api('/genres/'), api('/movies/')]);
  app.innerHTML = `<section class="section"><div class="section-head"><div><div class="eyebrow">Коллекция</div><h2>Каталог фильмов</h2></div></div><form class="filters" id="filters"><input class="field" name="q" placeholder="Название, актёр или режиссёр"><select class="field" name="genre"><option value="">Все жанры</option>${genres.map(g=>`<option value="${esc(g.slug)}">${esc(g.name)}</option>`).join('')}</select><select class="field" name="sort"><option value="newest">Сначала новые</option><option value="rating">По рейтингу</option><option value="popular">По популярности</option><option value="year_desc">По году</option></select><button class="btn">Найти</button></form><div id="catalog-grid" class="grid">${data.results.map(movieCard).join('')}</div></section>`;
  bindCards();
  document.querySelector('#filters').onsubmit = async e => {
    e.preventDefault(); const qs = new URLSearchParams(new FormData(e.target));
    const result = await api(`/movies/?${qs}`); document.querySelector('#catalog-grid').innerHTML = result.results.length ? result.results.map(movieCard).join('') : '<div class="empty">Ничего не найдено</div>'; bindCards();
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
  const movies=await api('/favorites/'); app.innerHTML=`<section class="section"><div class="section-head"><h2>Избранное</h2></div><div class="grid">${movies.length?movies.map(movieCard).join(''):'<div class="empty">Здесь пока нет фильмов</div>'}</div></section>`;bindCards();
}

async function router() {
  app.innerHTML='<div class="loader">Загружаем кино…</div>'; const parts=location.hash.replace(/^#\/?/,'').split('/');
  const route = parts[0] || 'home';
  document.querySelectorAll('[data-route]').forEach(link => link.classList.toggle('active', link.dataset.route === route));
  try { if(parts[0]==='catalog') await catalog(); else if(parts[0]==='movie') await movie(decodeURIComponent(parts[1])); else if(parts[0]==='login'||parts[0]==='register') authPage(parts[0]); else if(parts[0]==='favorites') await favorites(); else await home(); app.focus(); } catch(error) { app.innerHTML=`<div class="empty"><h2>Не удалось загрузить страницу</h2><p>${esc(error.message)}</p></div>`; }
}

setAuthControls(); window.addEventListener('hashchange',router); router();
