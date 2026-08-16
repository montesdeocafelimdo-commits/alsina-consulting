/* ALSINA — carrusel de informes (vitrina de la home).
   Vainilla JS: scroll nativo + scroll-snap, sin librerías.
   Editar este array para agregar/quitar informes de la vitrina. */
const INFORMES = [
  { id: 'fin-de-una-era', cat: ['destacados', 'institucional'],
    titulo: 'El fin de una era',
    subtitulo: '80 de 135 intendentes no podrán competir en 2027. Mapa interactivo de reelección y signo político.',
    img: '/assets/img/informes/fin-de-una-era.jpg',
    href: '/nota-fin-de-una-era.html' },
  { id: 'balance-fiscal-1s2026', cat: ['destacados', 'economico'],
    titulo: 'Más de 4 de cada 5 municipios recibieron menos recursos en términos reales',
    subtitulo: '112 de los 135 municipios bonaerenses perdieron poder de compra durante el primer semestre de 2026.',
    img: '/assets/img/informes/balance-fiscal-1s2026.jpg',
    href: '/alsina-balance-fiscal-1s2026.html' },
  { id: 'recaudacion', cat: ['destacados', 'economico'],
    titulo: 'Recaudación tributaria PBA',
    subtitulo: 'Evolución y composición de los tributos provinciales.',
    img: '/assets/img/informes/recaudacion.jpg',
    href: '/alsina-recaudacion-tributaria-pba.html' },
  { id: 'transferencias', cat: ['destacados', 'economico'],
    titulo: 'Transferencias a municipios',
    subtitulo: 'Los recursos que Nación y Provincia giran a los 135 partidos.',
    img: '/assets/img/informes/transferencias.jpg',
    href: '/alsina-informe-transferencias.html' },
  { id: 'radiografia-estado', cat: ['institucional'],
    titulo: 'Radiografía del Estado PBA',
    subtitulo: 'La arquitectura institucional completa de la Provincia.',
    img: '/assets/img/informes/radiografia-estado.jpg',
    href: '/alsina-radiografia-pba.html' },
  { id: 'presupuesto', cat: ['destacados', 'economico'],
    titulo: 'Presupuesto e Impositiva 2026',
    subtitulo: 'Estructura del gasto y cambios tributarios del año.',
    img: '/assets/img/informes/presupuesto.jpg',
    href: '/alsina-presupuesto-impositiva-2026.html' },
  { id: 'finanzas', cat: ['economico'],
    titulo: 'Finanzas de la PBA',
    subtitulo: 'Recursos, deuda y transferencias en perspectiva.',
    img: '/assets/img/informes/finanzas.jpg',
    href: '/alsina-nota-finanzas-pba.html' },
  { id: 'radiografia-fiscal', cat: ['economico'],
    titulo: 'Radiografía Fiscal 1999–2026',
    subtitulo: 'Veintisiete años de historia tributaria bonaerense.',
    img: '/assets/img/informes/radiografia-fiscal.jpg',
    href: '/alsina-recaudacion-tributaria-pba.html' },
  { id: 'pbg', cat: ['territorio'],
    titulo: 'PBG Municipal',
    subtitulo: 'El producto bruto de cada municipio de la Provincia.',
    img: '/assets/img/informes/pbg.jpg',
    href: '/alsina-pbg-pba.html' },
  { id: 'mapa-politico', cat: ['territorio', 'institucional'],
    titulo: 'Mapa Político PBA',
    subtitulo: 'La composición política de los 135 municipios.',
    img: '/assets/img/informes/mapa-politico.jpg',
    href: '/alsina-mapa-politico.html' },
  { id: 'electoral-2027', cat: ['destacados', 'territorio'],
    titulo: '2027 empieza ahora',
    subtitulo: 'El mapa de poder que define la próxima elección.',
    img: '/assets/img/informes/electoral-2027.jpg',
    href: '/nota-electoral-2027.html' },
  { id: 'super-rigi', cat: ['institucional'],
    titulo: 'Súper RIGI',
    subtitulo: 'El régimen de inversiones y su impacto municipal.',
    img: '/assets/img/informes/super-rigi.jpg',
    href: '/alsina-informe-super-rigi.html' },
  { id: 'informes-territoriales', cat: ['demanda'],
    titulo: 'Informes territoriales',
    subtitulo: 'Análisis integral de un municipio o sección, a pedido.',
    img: '/assets/img/informes/informes-territoriales.jpg',
    href: 'mailto:newsletter@alsinaar.com?subject=Consulta%20informe%20territorial' },
];

(function () {
  const track = document.getElementById('repTrack');
  const dotsWrap = document.getElementById('repDots');
  const prevBtn = document.getElementById('repPrev');
  const nextBtn = document.getElementById('repNext');
  const filters = document.querySelectorAll('.rep-filter');
  if (!track) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollBehavior = reduceMotion ? 'auto' : 'smooth';
  let io = null;

  const arrowIcon = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  function render(list) {
    track.innerHTML = '';
    list.forEach((it, idx) => {
      const a = document.createElement('a');
      a.className = 'gallery4-card';
      a.href = it.href;

      const cover = document.createElement('div');
      cover.className = 'gallery4-cover';

      const img = document.createElement('img');
      img.className = 'gallery4-img';
      img.src = it.img;
      img.width = 480;
      img.height = 360;
      img.alt = `Portada del informe: ${it.titulo}`;
      img.loading = idx < 2 ? 'eager' : 'lazy';
      cover.appendChild(img);

      const body = document.createElement('div');
      body.className = 'gallery4-body';
      body.innerHTML = `<h3>${it.titulo}</h3><p>${it.subtitulo}</p><span class="gallery4-cta">Ver informe ${arrowIcon}</span>`;

      a.append(cover, body);
      track.appendChild(a);
    });

    buildDots(list.length);
    track.scrollTo({ left: 0, behavior: 'auto' });
    observeCards();
    updateArrows();
  }

  function buildDots(n) {
    dotsWrap.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gallery4-dot' + (i === 0 ? ' active' : '');
      b.setAttribute('aria-label', `Ir al informe ${i + 1}`);
      b.addEventListener('click', () => scrollToCard(i));
      dotsWrap.appendChild(b);
    }
  }

  function cardStep() {
    const card = track.querySelector('.gallery4-card');
    if (!card) return 0;
    const style = getComputedStyle(track);
    const gap = parseFloat(style.columnGap || style.gap || '0');
    return card.getBoundingClientRect().width + gap;
  }

  function scrollToCard(i) {
    track.scrollTo({ left: i * cardStep(), behavior: scrollBehavior });
  }

  function updateArrows() {
    if (!prevBtn || !nextBtn) return;
    const atStart = track.scrollLeft <= 4;
    const atEnd = track.scrollLeft >= track.scrollWidth - track.clientWidth - 4;
    prevBtn.disabled = atStart;
    nextBtn.disabled = atEnd;
  }

  function observeCards() {
    if (io) io.disconnect();
    const cards = Array.from(track.querySelectorAll('.gallery4-card'));
    const dots = Array.from(dotsWrap.querySelectorAll('.gallery4-dot'));
    io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const idx = cards.indexOf(entry.target);
        dots.forEach((d, n) => d.classList.toggle('active', n === idx));
      });
    }, { root: track, threshold: 0.6 });
    cards.forEach((c) => io.observe(c));
  }

  if (prevBtn) prevBtn.addEventListener('click', () => {
    track.scrollBy({ left: -cardStep(), behavior: scrollBehavior });
  });
  if (nextBtn) nextBtn.addEventListener('click', () => {
    track.scrollBy({ left: cardStep(), behavior: scrollBehavior });
  });

  track.addEventListener('scroll', updateArrows, { passive: true });
  window.addEventListener('resize', updateArrows);

  filters.forEach((btn) => {
    btn.addEventListener('click', () => {
      filters.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const f = btn.dataset.filter;
      render(INFORMES.filter((it) => it.cat.includes(f)));
    });
  });

  render(INFORMES.filter((it) => it.cat.includes('destacados')));
})();
