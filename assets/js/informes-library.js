/* ALSINA — biblioteca de Informes.
   Lee window.ALSINA_PUBLICATIONS (assets/data/publications.js) y arma:
   destacado, grilla filtrable (formato × tema) y estado vacío.
   Vainilla JS, sin dependencias — coherente con el resto del sitio. */
(function () {
  const PUBS = (window.ALSINA_PUBLICATIONS || []).filter((p) => p.status === 'published');

  const FORMAT_LABELS = { report: 'Informe', note: 'Nota', 'tracking-series': 'Serie de seguimiento' };
  const TOPIC_LABELS = {
    'public-finance': 'Finanzas públicas',
    'politics-elections': 'Política y elecciones',
    'municipalities-territory': 'Municipios y territorio',
    'state-public-management': 'Estado y gestión pública',
  };
  const PLAN_LABELS = { intendente: 'Nivel Intendente', ministro: 'Nivel Ministro', gobernador: 'Nivel Gobernador' };
  const ALT_OVERRIDES = {
    'fin-de-una-era': 'Portada: una ley de hace 10 años puede provocar el mayor recambio simultáneo de intendentes',
    'presupuesto-impositiva-2026': 'Portada: ¿Quién paga la cuenta en 2026? Presupuesto e Impositiva PBA',
    '2027-empieza-ahora': 'Portada: 2027 empieza ahora',
    'pbg-municipal': 'Portada: no todos los municipios crecen igual',
  };

  const featuredPub = PUBS.find((p) => p.featured);
  const arrowIcon = '<svg class="ic-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  function formatDate(iso) {
    if (!iso) return null;
    return new Date(iso + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function accessBadge(pub) {
    if (pub.accessType === 'free') return { text: 'Lectura gratuita', cls: 'access-free' };
    const plan = PLAN_LABELS[pub.requiredPlan] || 'Suscripción';
    return { text: `Incluido en ${plan}`, cls: 'access-sub' };
  }

  function ctaLabel(pub) {
    if (pub.format === 'tracking-series') return 'Explorar serie';
    if (pub.accessType === 'free') return 'Leer gratis';
    return 'Ver informe';
  }

  function metaLine(pub) {
    const parts = [FORMAT_LABELS[pub.format], TOPIC_LABELS[pub.primaryTopic]];
    if (pub.frequency) parts.push(pub.frequency);
    return parts.join(' · ');
  }

  function dateOrPeriod(pub) {
    return formatDate(pub.publishedAt) || pub.period || null;
  }

  function cardHTML(pub, featured) {
    const badge = accessBadge(pub);
    const dateText = dateOrPeriod(pub);
    const authorText = pub.author && pub.author.length ? pub.author.join(' y ') : null;
    const alt = ALT_OVERRIDES[pub.id] || `Portada del informe: ${pub.title}`;
    const cover = pub.coverImage
      ? `<div class="nota-card-cover"><img src="${pub.coverImage}" alt="${alt}" loading="${featured ? 'eager' : 'lazy'}" width="${featured ? 1200 : 1050}" height="${featured ? 630 : 787}"></div>`
      : '';
    const metaBits = [];
    if (authorText || dateText) {
      metaBits.push(`<div class="nota-card-meta2">${[authorText, dateText].filter(Boolean).join(' · ')}</div>`);
    }
    const kicker = featured ? '<span class="featured-kicker">Publicación destacada</span>' : '';
    return `${cover}<div class="nota-card-body${featured ? ' featured-body' : ''}">
      ${kicker}
      <span class="tag-mini">${metaLine(pub)}</span>
      <h3>${pub.title}</h3>
      <p>${pub.summary}</p>
      ${metaBits.join('')}
      <div class="nota-card-foot">
        <span class="access-badge ${badge.cls}">${badge.text}</span>
        <span class="card-cta">${ctaLabel(pub)} ${arrowIcon}</span>
      </div>
    </div>`;
  }

  function renderFeatured() {
    const wrap = document.getElementById('featuredPub');
    if (!wrap || !featuredPub) { if (wrap) wrap.remove(); return; }
    const a = document.createElement('a');
    a.className = 'nota-card has-cover featured-pub';
    a.href = featuredPub.url;
    a.innerHTML = cardHTML(featuredPub, true);
    wrap.innerHTML = '';
    wrap.appendChild(a);
  }

  const DEFAULT_FORMAT = 'note';

  function matchesFilters(pub, state) {
    if (pub.format !== state.format) return false;
    if (state.topic !== 'all' && pub.primaryTopic !== state.topic) return false;
    return true;
  }

  function readStateFromURL() {
    const params = new URLSearchParams(location.search);
    const format = params.get('formato');
    const topic = params.get('tema');
    const validFormats = ['report', 'note', 'tracking-series'];
    const validTopics = ['all', ...Object.keys(TOPIC_LABELS)];
    return {
      format: validFormats.includes(format) ? format : DEFAULT_FORMAT,
      topic: validTopics.includes(topic) ? topic : 'all',
    };
  }

  function writeStateToURL(state) {
    const params = new URLSearchParams();
    if (state.format !== DEFAULT_FORMAT) params.set('formato', state.format);
    if (state.topic !== 'all') params.set('tema', state.topic);
    const qs = params.toString();
    const url = location.pathname + (qs ? `?${qs}` : '');
    history.replaceState(null, '', url);
  }

  function initTopicToggle() {
    const toggle = document.getElementById('topicToggle');
    const panel = document.getElementById('topicChipsPanel');
    if (!toggle || !panel) return;
    toggle.addEventListener('click', () => {
      const open = panel.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  function init() {
    renderFeatured();
    initTopicToggle();

    const grid = document.getElementById('pubGrid');
    const empty = document.getElementById('pubEmpty');
    const countEl = document.getElementById('pubResultsCount');
    const resetInline = document.getElementById('resetFiltersInline');
    const resetEmpty = document.getElementById('resetFiltersEmpty');
    const formatBtns = Array.from(document.querySelectorAll('.format-tab'));
    const topicBtns = Array.from(document.querySelectorAll('.topic-chip'));
    if (!grid) return;

    let state = readStateFromURL();

    function syncControls() {
      formatBtns.forEach((b) => {
        const active = b.dataset.format === state.format;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      topicBtns.forEach((b) => {
        const active = b.dataset.topic === state.topic;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      const isDefault = state.format === DEFAULT_FORMAT && state.topic === 'all';
      if (resetInline) resetInline.hidden = isDefault;
    }

    function render() {
      const list = PUBS.filter((p) => matchesFilters(p, state));

      grid.innerHTML = '';
      list.forEach((pub) => {
        const a = document.createElement('a');
        a.className = 'nota-card' + (pub.coverImage ? ' has-cover' : '');
        a.href = pub.url;
        a.innerHTML = cardHTML(pub, false);
        grid.appendChild(a);
      });

      const n = list.length;
      if (countEl) countEl.textContent = n === 0 ? '' : `Mostrando ${n} publicaci${n === 1 ? 'ón' : 'ones'}.`;
      if (empty) empty.hidden = n !== 0;
      grid.hidden = n === 0;

      syncControls();
      writeStateToURL(state);
    }

    formatBtns.forEach((b) => b.addEventListener('click', () => { state = { ...state, format: b.dataset.format }; render(); }));
    topicBtns.forEach((b) => b.addEventListener('click', () => { state = { ...state, topic: b.dataset.topic }; render(); }));
    [resetInline, resetEmpty].forEach((b) => {
      if (!b) return;
      b.addEventListener('click', () => { state = { format: DEFAULT_FORMAT, topic: 'all' }; render(); });
    });

    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
