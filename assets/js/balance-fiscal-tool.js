/*
 * "Radiografía fiscal de tu municipio" — herramienta interactiva de
 * alsina-balance-fiscal-1s2026.html
 *
 * Fuente de datos: /assets/data/transferencias-135-municipios-2026.json
 * (generado por scripts/build-transferencias-135-dataset.py a partir de
 * Base_transferencias_135_municipios_PBA_completa.xlsx, Ministerio de
 * Economía PBA). Cobertura: 135 de 135 municipios. Ningún valor es inventado
 * ni estimado: la única capa de cálculo es la deflactación documentada en
 * la sección de Metodología de la nota.
 */
(function(){
  let DATA = null;         // { meta, municipios: [...] }
  let byId = new Map();
  let current = null;      // municipio seleccionado (record)
  let period = '1s';       // '1s' | 'jun'

  const els = {};
  document.addEventListener('DOMContentLoaded', () => {
    cacheEls();
    wireSearch();
    wirePeriodToggle();
    wireAlphaToggle();
    wireTableSort();
    fetch('/assets/data/transferencias-135-municipios-2026.json')
      .then(r => r.json())
      .then(json => {
        DATA = json;
        DATA.municipios.forEach(m => byId.set(m.id, m));
        renderDotplot();
        showToolShell();
        renderRankings();
        renderFullTable(DATA.municipios.slice().sort((a,b)=>a.municipio_norm.localeCompare(b.municipio_norm)));
      })
      .catch(err => {
        console.error('No se pudo cargar la base de municipios', err);
        const el = document.getElementById('tool');
        if (el) el.insertAdjacentHTML('beforeend', '<p class="chart-note" style="color:#f0653e">No se pudo cargar la base de datos de municipios en este momento.</p>');
      });
  });

  function cacheEls(){
    ['muniSearch','muniSearchResults','periodToggle','toolResult','toolSentence','indicatorGrid',
     'dotplotSvg','dotplotTooltip','chainCard','chainMuniName','chainMuniVal','gapCard',
     'gap2025','gapNecesario','gapRecibido','gapBrecha','gapSentence','rankTop','rankBottom',
     'fullTableBody','alphaListToggle'].forEach(id => els[id] = document.getElementById(id));
  }

  // ── formatters ──────────────────────────────────────────────
  const fmtM = v => '$' + Math.round(v/1e6).toLocaleString('es-AR') + ' M';
  function pct(v, d){ d = d===undefined?2:d; const n = v*100; const s = Math.abs(n).toFixed(d).replace('.', ','); return (n>=0?'+':'−') + s + '%'; }
  function pp(v, d){ d = d===undefined?2:d; const n = v*100; const s = Math.abs(n).toFixed(d).replace('.', ','); return (n>=0?'+':'−') + s + ' pp'; }
  function num2(v){ return v.toFixed(2).replace('.', ','); }
  function absPct(v, d){ d = d===undefined?2:d; return Math.abs(v*100).toFixed(d).replace('.', ','); }
  function norm(s){ return s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }

  function periodLabel(p, lower){
    const s = p === 'jun' ? 'junio de 2026' : 'el primer semestre de 2026';
    return lower ? s : (p === 'jun' ? 'Junio de 2026' : 'El primer semestre de 2026');
  }
  function periodLabelPrev(p){ return p === 'jun' ? 'junio de 2025' : 'el primer semestre de 2025'; }
  function fields(p){
    return p === 'jun'
      ? { n25:'n2025_jun', n26:'n2026_jun', vnom:'var_nom_jun', vreal:'var_real_jun', rank:'rank_jun', diff:'diff_vs_avg_jun', necesario:'monto_necesario_jun', brecha:'brecha_jun', per100:'per100_jun', avgKey:'promedio_provincial_var_real_jun' }
      : { n25:'n2025_1s', n26:'n2026_1s', vnom:'var_nom_1s', vreal:'var_real_1s', rank:'rank_1s', diff:'diff_vs_avg_1s', necesario:'monto_necesario_1s', brecha:'brecha_1s', per100:'per100_1s', avgKey:'promedio_provincial_var_real_1s' };
  }

  // ── búsqueda / autocompletado ───────────────────────────────
  function wireSearch(){
    const input = els.muniSearch, box = els.muniSearchResults;
    if (!input) return;
    let activeIdx = -1;

    input.addEventListener('input', () => {
      if (!DATA) return;
      const q = norm(input.value.trim());
      if (!q){ closeResults(); return; }
      const matches = DATA.municipios.filter(m => m.municipio_norm.includes(q)).slice(0, 8);
      renderResults(matches);
    });
    input.addEventListener('keydown', e => {
      const items = box.querySelectorAll('.search-item');
      if (e.key === 'ArrowDown'){ e.preventDefault(); activeIdx = Math.min(activeIdx+1, items.length-1); highlight(items); }
      else if (e.key === 'ArrowUp'){ e.preventDefault(); activeIdx = Math.max(activeIdx-1, 0); highlight(items); }
      else if (e.key === 'Enter'){ if (items[activeIdx]) items[activeIdx].click(); }
      else if (e.key === 'Escape'){ closeResults(); }
    });
    document.addEventListener('click', e => {
      if (!box.contains(e.target) && e.target !== input) closeResults();
    });

    function highlight(items){
      items.forEach((it,i) => it.classList.toggle('focus', i===activeIdx));
      if (items[activeIdx]) items[activeIdx].scrollIntoView({block:'nearest'});
    }
    function renderResults(matches){
      activeIdx = -1;
      if (!matches.length){ box.innerHTML = '<div class="search-item" style="cursor:default;color:#64748b">Sin resultados</div>'; box.classList.add('open'); input.setAttribute('aria-expanded','true'); return; }
      box.innerHTML = matches.map(m => `<button type="button" class="search-item" data-id="${m.id}" role="option">${m.municipio}</button>`).join('');
      box.classList.add('open'); input.setAttribute('aria-expanded','true');
      box.querySelectorAll('.search-item[data-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const m = byId.get(Number(btn.dataset.id));
          input.value = m.municipio;
          closeResults();
          selectMunicipio(m);
        });
      });
    }
    function closeResults(){ box.classList.remove('open'); box.innerHTML=''; input.setAttribute('aria-expanded','false'); }
    els._closeResults = closeResults;
  }

  function wireAlphaToggle(){
    els.alphaListToggle?.addEventListener('click', () => {
      if (!DATA) return;
      const box = els.muniSearchResults;
      const open = box.classList.contains('open') && box.dataset.mode === 'alpha';
      if (open){ box.classList.remove('open'); box.innerHTML=''; return; }
      box.dataset.mode = 'alpha';
      box.innerHTML = DATA.municipios.map(m => `<button type="button" class="search-item" data-id="${m.id}" role="option">${m.municipio}</button>`).join('');
      box.classList.add('open');
      box.querySelectorAll('.search-item[data-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const m = byId.get(Number(btn.dataset.id));
          els.muniSearch.value = m.municipio;
          box.classList.remove('open'); box.innerHTML = '';
          selectMunicipio(m);
        });
      });
    });
  }

  function wirePeriodToggle(){
    els.periodToggle?.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        els.periodToggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        period = btn.dataset.period;
        renderDotplot();
        if (current) renderSelection();
      });
    });
  }

  function showToolShell(){
    els.toolResult?.classList.add('open');
    els.toolSentence.className = 'tool-sentence';
    els.toolSentence.textContent = 'Elegí un municipio en el buscador de arriba (o un punto en el gráfico) para ver su radiografía fiscal completa.';
    els.indicatorGrid.innerHTML = '';
    els.chainCard.style.display = 'none';
    els.gapCard.style.display = 'none';
  }

  // ── selección de municipio ──────────────────────────────────
  function selectMunicipio(m){
    current = m;
    renderSelection();
  }

  function renderSelection(){
    const f = fields(period);
    const m = current;
    const vreal = m[f.vreal];
    const cls = vreal >= 0 ? 'pos' : 'neg';
    const dir = vreal >= 0 ? 'más' : 'menos';

    els.toolSentence.className = 'tool-sentence ' + cls;
    els.toolSentence.innerHTML = `<strong>${m.municipio}</strong> recibió un ${absPct(vreal)}% ${dir} en términos reales durante ${periodLabel(period, true)}. Por cada $100 de poder de compra transferidos durante ${periodLabelPrev(period)}, en ${period==='jun'?'junio de 2026':'2026'} recibió el equivalente a $${num2(m[f.per100])}.`;

    els.indicatorGrid.style.display = 'grid';
    els.indicatorGrid.innerHTML = [
      { lbl: `Transferido en ${period==='jun'?'junio 2026':'1S 2026'}`, val: fmtM(m[f.n26]) },
      { lbl: `Transferido en ${period==='jun'?'junio 2025':'1S 2025'}`, val: fmtM(m[f.n25]) },
      { lbl:'Variación nominal', val: pct(m[f.vnom],1), cls:'' },
      { lbl:'Variación real', val: pct(m[f.vreal],2), cls: vreal>=0?'pos':'neg' },
      { lbl:'Posición entre los 135 municipios', val: '#'+m[f.rank] },
      { lbl:'Diferencia vs. promedio provincial', val: pp(m[f.diff],2), cls: m[f.diff]>=0?'pos':'neg' },
      { lbl:'Por cada $100 de poder de compra de 2025', val: '$'+num2(m[f.per100]) },
    ].map(it => `<div class="indicator-cell"><div class="ic-val ${it.cls||''}">${it.val}</div><div class="ic-lbl">${it.lbl}</div></div>`).join('');

    // cadena personalizada
    els.chainCard.style.display = 'block';
    els.chainMuniName.textContent = m.municipio;
    els.chainMuniVal.textContent = pct(m[f.vreal],2);
    els.chainMuniVal.style.color = vreal>=0 ? '#00D5D8' : '#f0653e';

    // brecha
    els.gapCard.style.display = 'block';
    els.gap2025.textContent = fmtM(m[f.n25]);
    els.gapNecesario.textContent = fmtM(m[f.necesario]);
    els.gapRecibido.textContent = fmtM(m[f.n26]);
    const brecha = m[f.brecha];
    els.gapBrecha.textContent = (brecha>0?'−':'+') + fmtM(Math.abs(brecha)).replace('$','$');
    els.gapBrecha.style.color = brecha>0 ? '#f0653e' : '#00D5D8';
    if (brecha > 0){
      els.gapSentence.textContent = `Para conservar el poder de compra de ${periodLabelPrev(period)}, ${m.municipio} debería haber recibido ${fmtM(brecha)} adicionales.`;
    } else {
      els.gapSentence.textContent = `${m.municipio} recibió ${fmtM(Math.abs(brecha))} por encima de lo necesario para mantener el poder de compra de ${periodLabelPrev(period)}.`;
    }

    renderDotplot();
  }

  // ── dot plot (SVG a mano, accesible) ────────────────────────
  function renderDotplot(){
    const svg = els.dotplotSvg;
    if (!svg || !DATA) return;
    const f = fields(period);
    const W = 1000, H = 170, PAD = 46;
    const vals = DATA.municipios.map(m => m[f.vreal]*100);
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = Math.max(Math.abs(min), Math.abs(max)) * 1.12;
    const x0 = -span, x1 = span;
    const xPix = v => PAD + (v - x0) / (x1 - x0) * (W - PAD*2);
    const avg = DATA.meta[f.avgKey] * 100;
    const curId = current ? current.id : null;

    let svgHtml = '';
    // eje / líneas de referencia
    svgHtml += `<line x1="${PAD}" y1="${H-30}" x2="${W-PAD}" y2="${H-30}" stroke="rgba(255,255,255,.12)" stroke-width="1"/>`;
    const zx = xPix(0);
    svgHtml += `<line x1="${zx}" y1="18" x2="${zx}" y2="${H-30}" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/>`;
    svgHtml += `<text x="${zx}" y="14" text-anchor="middle" font-size="10" fill="#94a3b8">0%</text>`;
    const ax = xPix(avg);
    svgHtml += `<line x1="${ax}" y1="18" x2="${ax}" y2="${H-30}" stroke="#f0653e" stroke-width="1.5" stroke-dasharray="4,3"/>`;
    svgHtml += `<text x="${ax}" y="${H-14}" text-anchor="middle" font-size="9" fill="#f0653e">prom. PBA ${avg>=0?'+':'−'}${Math.abs(avg).toFixed(2).replace('.',',')}%</text>`;
    svgHtml += `<text x="${PAD}" y="${H-14}" text-anchor="start" font-size="9" fill="#64748b">${min.toFixed(1).replace('.',',')}%</text>`;
    svgHtml += `<text x="${W-PAD}" y="${H-14}" text-anchor="end" font-size="9" fill="#64748b">+${max.toFixed(1).replace('.',',')}%</text>`;

    // puntos (jitter determinístico por id para reducir superposición)
    const rows = DATA.municipios.map(m => {
      const v = m[f.vreal]*100;
      const jitter = ((m.id * 41) % 70) - 35; // -35..+35
      const y = (H-30)/2 + jitter*0.55 + 6;
      const sel = m.id === curId;
      const r = sel ? 7 : 3.4;
      const fill = sel ? '#f0653e' : 'rgba(148,163,184,.55)';
      const stroke = sel ? '#fff' : 'none';
      return `<circle class="dot" data-id="${m.id}" cx="${xPix(v).toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${fill}" ${stroke!=='none'?`stroke="${stroke}" stroke-width="1.5"`:''} tabindex="0" role="button" aria-label="${m.municipio}: ${pct(m[f.vreal],2)}"></circle>`;
    }).join('');

    svg.innerHTML = svgHtml + rows;

    const tip = els.dotplotTooltip;
    svg.querySelectorAll('.dot').forEach(dot => {
      const m = byId.get(Number(dot.dataset.id));
      const show = evt => {
        const clientX = evt.clientX !== undefined ? evt.clientX : (evt.target.getBoundingClientRect().left);
        const clientY = evt.clientY !== undefined ? evt.clientY : (evt.target.getBoundingClientRect().top);
        tip.innerHTML = `<div class="dp-tt-name">${m.municipio}</div><div class="dp-tt-row">${fmtM(m[f.n26])} · var. real ${pct(m[f.vreal],2)}</div><div class="dp-tt-row">Posición #${m[f.rank]} de 135</div>`;
        tip.classList.add('show');
        let x = clientX + 14, y = clientY + 14;
        const tw = 220, th = 70;
        if (x + tw > window.innerWidth - 8) x = clientX - tw - 14;
        if (y + th > window.innerHeight - 8) y = clientY - th - 14;
        tip.style.left = x+'px'; tip.style.top = y+'px';
      };
      const hide = () => tip.classList.remove('show');
      dot.addEventListener('mouseenter', show);
      dot.addEventListener('mousemove', show);
      dot.addEventListener('mouseleave', hide);
      dot.addEventListener('focus', show);
      dot.addEventListener('blur', hide);
      dot.addEventListener('click', () => { els.muniSearch.value = m.municipio; selectMunicipio(m); });
    });
  }

  // ── rankings (capítulo 7, fijos al semestre) ─────────────────
  function renderRankings(){
    const sorted = DATA.municipios.slice().sort((a,b) => b.var_real_1s - a.var_real_1s);
    const top = sorted.slice(0,12);
    const bottom = sorted.slice(-12).reverse();
    const maxAbs = Math.max(...sorted.map(m => Math.abs(m.var_real_1s))) * 100;

    els.rankTop.innerHTML = top.map(m => rankRow(m, maxAbs, true)).join('');
    els.rankBottom.innerHTML = bottom.map(m => rankRow(m, maxAbs, false)).join('');

    function rankRow(m, maxAbs, positive){
      const v = m.var_real_1s*100;
      const w = Math.min(100, Math.abs(v)/maxAbs*100);
      const color = positive ? '#00D5D8' : '#f0653e';
      return `<div class="rank-row"><div class="rank-row-label">${m.municipio}</div><div class="rank-track"><div class="rank-fill" style="width:${w}%;background:${color};left:0"></div></div><div class="rank-val" style="color:${color}">${pct(m.var_real_1s,1)}</div></div>`;
    }
  }

  // ── tabla completa (capítulo 7) ──────────────────────────────
  let tableSort = { key:'municipio', dir:1 };
  function renderFullTable(list){
    els.fullTableBody.innerHTML = list.map(m => `
      <tr>
        <td>${m.municipio}</td>
        <td>${fmtM(m.n2026_1s)}</td>
        <td>${pct(m.var_nom_1s,1)}</td>
        <td style="color:${m.var_real_1s>=0?'#52C78C':'#f0653e'}">${pct(m.var_real_1s,2)}</td>
        <td>#${m.rank_1s}</td>
      </tr>`).join('');
  }
  function wireTableSort(){
    const ths = document.querySelectorAll('#fullTable th[data-sort]');
    function applySort(th){
      const key = th.dataset.sort;
      tableSort.dir = (tableSort.key === key) ? -tableSort.dir : 1;
      tableSort.key = key;
      ths.forEach(t => t.setAttribute('aria-sort', t === th ? (tableSort.dir === 1 ? 'ascending' : 'descending') : 'none'));
      if (!DATA) return;
      const list = DATA.municipios.slice().sort((a,b) => {
        const av = a[key], bv = b[key];
        if (typeof av === 'string') return av.localeCompare(bv) * tableSort.dir;
        return (av - bv) * tableSort.dir;
      });
      renderFullTable(list);
    }
    ths.forEach(th => {
      th.addEventListener('click', () => applySort(th));
      th.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); applySort(th); }
      });
    });
  }
})();
