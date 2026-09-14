/* ALSINA — botones de compartir (X, WhatsApp, copiar enlace).
   Reusa el patrón ya establecido en alsina-balance-fiscal-1s2026.html
   (.share-row / .share-btn / #shareX,#shareWA,#shareCopy) pero como script
   compartido: la página sólo pone el markup (con data-share en vez de id,
   para poder repetir el bloque más de una vez en la misma página) y este
   script hace el wiring. Mismo criterio que assets/js/gate.js.

   Markup esperado, uno o más por página:
     <div class="share-row" data-share-text="Texto del tweet/mensaje — Alsina" role="group" aria-label="Compartir esta nota">
       <a class="share-btn" data-share="x" href="#" target="_blank" rel="noopener" aria-label="Compartir en X">...</a>
       <a class="share-btn" data-share="wa" href="#" target="_blank" rel="noopener" aria-label="Compartir en WhatsApp">...</a>
       <button class="share-btn" data-share="copy" aria-label="Copiar enlace">...</button>
     </div>

   data-share-text es opcional: si falta, usa document.title. La URL usa
   <link rel="canonical"> si existe (evita compartir con querystrings de
   tracking); si no, location.href. */
(function () {
  function pageUrl() {
    const canon = document.querySelector('link[rel="canonical"]');
    return (canon && canon.href) || location.href;
  }

  function wireRow(row) {
    if (row.dataset.shareWired) return;
    row.dataset.shareWired = '1';

    const text = row.dataset.shareText || document.title;
    const url = pageUrl();
    const encText = encodeURIComponent(text);
    const encUrl = encodeURIComponent(url);

    const x = row.querySelector('[data-share="x"]');
    if (x) x.href = `https://twitter.com/intent/tweet?text=${encText}&url=${encUrl}`;

    const wa = row.querySelector('[data-share="wa"]');
    if (wa) wa.href = `https://wa.me/?text=${encText}%20${encUrl}`;

    const copyBtn = row.querySelector('[data-share="copy"]');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const done = () => {
          const prevLabel = copyBtn.getAttribute('aria-label');
          const prevHTML = copyBtn.innerHTML;
          copyBtn.setAttribute('aria-label', 'Enlace copiado');
          copyBtn.innerHTML = '✓';
          setTimeout(() => {
            copyBtn.innerHTML = prevHTML;
            copyBtn.setAttribute('aria-label', prevLabel || 'Copiar enlace');
          }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done).catch(() => {});
        } else {
          // Fallback sin Clipboard API (http no seguro / navegador viejo)
          const tmp = document.createElement('textarea');
          tmp.value = url;
          tmp.style.position = 'fixed';
          tmp.style.opacity = '0';
          document.body.appendChild(tmp);
          tmp.select();
          try { document.execCommand('copy'); done(); } catch (e) {}
          document.body.removeChild(tmp);
        }
      });
    }
  }

  function init(root) {
    (root || document).querySelectorAll('.share-row').forEach(wireRow);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }

  window.AlsinaShare = { init };
})();
