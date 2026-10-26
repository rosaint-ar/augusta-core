// Augusta Core — armazón común: sesión, menú lateral, barra superior, formatos y carga de datos.
// Cada página: <body data-page="id" data-title="…" data-subtitle="…"> y un <main id="contenido">.
(function () {
  const raiz = document.querySelector('meta[name="app-root"]')?.content || './';
  const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('datos') === 'local';

  const MENU = [
    { grupo: 'Análisis' },
    { id: 'metricas', label: 'Métricas', href: 'metricas/', icono: 'M4 19V9m5 10V5m5 14v-7m5 7V8' },
    { id: 'productos', label: 'Productos', icono: 'M6 4h12l2 5-8 11L4 9z', pronto: true },
    { id: 'stock', label: 'Stock y compras', icono: 'M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7', pronto: true },
    { id: 'clientas', label: 'Clientas', icono: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0', pronto: true },
    { grupo: 'Negocio' },
    { id: 'local', label: 'Horarios del local', icono: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z', pronto: true },
    { id: 'finanzas', label: 'Finanzas', icono: 'M4 7h16v12H4zM4 11h16M8 15h3', pronto: true },
    { grupo: 'Sistema' },
    { id: 'fuentes', label: 'Fuentes de datos', icono: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3', pronto: true },
  ];

  const CORE = window.CORE = { raiz, local: LOCAL, usuario: null };

  // ---------- formatos (es-AR) ----------
  const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  CORE.n = x => nf0.format(Math.round(x || 0));
  CORE.plata = x => '$' + nf0.format(Math.round(x || 0));
  CORE.compacto = x => { const a = Math.abs(x || 0), s = x < 0 ? '−' : '';
    if (a >= 1e9) return s + '$' + nf1.format(a / 1e9) + ' mil M';
    if (a >= 1e6) return s + '$' + nf1.format(a / 1e6) + ' M';
    if (a >= 1e4) return s + '$' + nf0.format(a / 1e3) + ' mil';
    return s + '$' + nf0.format(a); };
  CORE.pct = (x, dec = 0) => (x == null || !isFinite(x)) ? '—' : new Intl.NumberFormat('es-AR', { maximumFractionDigits: dec, minimumFractionDigits: dec }).format(x * 100) + '%';
  CORE.variacion = (a, b) => (b == null || b === 0 || a == null) ? null : a / b - 1;
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  CORE.MESES = MESES;
  CORE.mesCorto = m => MESES[+m.slice(5, 7) - 1] + ' ' + m.slice(2, 4);
  CORE.fecha = f => f ? `${+f.slice(8, 10)} ${MESES[+f.slice(5, 7) - 1]} ${f.slice(0, 4)}` : '—';
  CORE.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- datos: un solo paquete con todo lo necesario para las métricas ----------
  let paquete = null;
  CORE.datos = async function () {
    if (paquete) return paquete;
    if (LOCAL) { const r = await fetch(raiz + '_local/dataset.json', { cache: 'no-store' }); if (!r.ok) throw new Error('No encuentro _local/dataset.json'); return (paquete = await r.json()); }
    const { data, error } = await sb.rpc('core_dataset');
    if (error) throw new Error(error.message);
    return (paquete = data);
  };

  // ---------- sesión ----------
  async function sesion() {
    if (LOCAL) { CORE.usuario = { email: 'vista local (datos de prueba desde CSV)' }; return true; }
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { location.replace(raiz + 'login.html?volver=' + encodeURIComponent(location.pathname + location.search)); return false; }
    CORE.usuario = session.user;
    return true;
  }

  // ---------- armazón ----------
  function svg(d) { return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`; }
  function pintar() {
    const b = document.body, actual = b.dataset.page;
    const contenido = document.getElementById('contenido');
    const app = document.createElement('div'); app.className = 'app';
    const items = MENU.map(m => m.grupo ? `<div class="grupo">${m.grupo}</div>`
      : `<a href="${m.pronto ? '#' : raiz + m.href}" class="${m.id === actual ? 'activo' : ''} ${m.pronto ? 'pronto' : ''}" ${m.pronto ? 'aria-disabled="true" title="Próximamente"' : ''}>${svg(m.icono)}<span>${m.label}</span></a>`).join('');
    app.innerHTML = `
      <aside class="lateral">
        <a class="marca" href="${raiz}metricas/"><img src="${raiz}shell/logo-augusta.svg" alt="Augusta Intimates"><small>Core</small></a>
        <nav class="menu">${items}</nav>
        <div class="pie"><div>${CORE.esc(CORE.usuario?.email || '')}</div>${LOCAL ? '' : '<button id="salir">Cerrar sesión</button>'}</div>
      </aside>
      <div class="principal">
        <header class="barra">
          <button class="abrir-menu" aria-label="Abrir menú">${svg('M4 7h16M4 12h16M4 17h16')}</button>
          <div><h1>${CORE.esc(b.dataset.title || '')}</h1><div class="sub">${CORE.esc(b.dataset.subtitle || '')}</div></div>
          <div class="der" id="barra-der"></div>
        </header>
      </div>`;
    b.prepend(app);
    app.querySelector('.principal').appendChild(contenido);
    contenido.classList.add('contenido');
    const sello = document.createElement('img'); sello.src = raiz + 'shell/simbolo-augusta.svg'; sello.className = 'sello-fondo'; sello.alt = ''; b.appendChild(sello);
    app.querySelector('.abrir-menu').onclick = () => b.classList.toggle('menu-abierto');
    app.querySelector('.menu').addEventListener('click', e => { const a = e.target.closest('a'); if (a?.classList.contains('pronto')) e.preventDefault(); });
    const salir = app.querySelector('#salir');
    if (salir) salir.onclick = async () => { await sb.auth.signOut(); location.replace(raiz + 'login.html'); };
  }

  CORE.listo = (async () => { if (!(await sesion())) return false; pintar(); return true; })();
})();
