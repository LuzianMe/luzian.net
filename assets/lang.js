// Language switch helpers (English / Spanish)
(function () {
  'use strict';

  const KEY = 'luzian-lang';
  // Storage can be blocked (private windows, strict settings), so never let it throw
  const read = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const write = (value) => { try { localStorage.setItem(KEY, value); } catch (e) { /* ignore */ } };

  // Remember an explicit choice made with the EN / ES switch
  document.querySelectorAll('.lang-switch a[data-lang]').forEach((link) => {
    link.addEventListener('click', () => write(link.dataset.lang));
  });

  // On English pages, offer Spanish once to visitors whose browser prefers it.
  // It never redirects on its own, and it stays quiet after any choice or dismissal.
  if (document.documentElement.lang !== 'en') return;
  if (read()) return;
  const preferred = (navigator.languages && navigator.languages[0]) || navigator.language || '';
  if (!/^es/i.test(preferred)) return;
  const alt = document.querySelector('link[rel="alternate"][hreflang="es"]');
  if (!alt) return;

  const banner = document.createElement('div');
  banner.className = 'lang-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Idioma');
  banner.lang = 'es';

  const text = document.createElement('span');
  text.textContent = '¿Prefieres leer esto en español?';

  const go = document.createElement('a');
  go.className = 'lang-banner-go';
  go.href = new URL(alt.href).pathname; // same site, whatever domain it is served from
  go.hreflang = 'es';
  go.textContent = 'Ver en español';
  go.addEventListener('click', () => write('es'));

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lang-banner-close';
  close.textContent = 'Cerrar';
  close.addEventListener('click', () => {
    write('en');
    banner.remove();
  });

  banner.append(text, go, close);
  document.body.appendChild(banner);
})();
