/* Etiquetas de Augusta para www (armado 2026-11-17): motor común + colocación. Fuente: augusta-core/etiquetas/motor.js y web-colocar.js */
/* Motor de etiquetas de Augusta — el MISMO archivo lo usan el Core (vista previa) y la web (etiquetas.js lo incluye).
 * - qué productos entran en un conjunto (a mano + reglas − excluidos), con los datos del catálogo público de la web;
 * - cómo se dibuja una etiqueta (HTML con variables CSS; los estilos están en etiquetas.css).
 * No toca el DOM de la página: solo devuelve datos y HTML. */
(function (root) {
  'use strict';
  const sinAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const nombreDe = p => (p && (p.name && (p.name.es || p.name))) || '';
  const disponible = v => v && v.visible !== false && (v.stock_management === false || v.stock == null || Number(v.stock) > 0);
  const precioDe = p => { const ps = (p.variants || []).map(v => Number(v.promotional_price) > 0 ? Number(v.promotional_price) : Number(v.price)).filter(n => n > 0); return ps.length ? Math.min(...ps) : 0; };
  const lista = x => (Array.isArray(x) ? x : String(x || '').split(',')).map(s => String(s).trim()).filter(Boolean);

  // ¿El conjunto tiene reglas? (las palabras a excluir solas no arman un grupo)
  function tieneReglas(r) {
    r = r || {};
    return lista(r.categorias).length > 0 || lista(r.palabras).length > 0 || r.stock === 'con' || r.stock === 'sin' || Number(r.precio_min) > 0 || Number(r.precio_max) > 0;
  }
  // ¿El producto cumple TODAS las reglas? Dentro de cada regla alcanza con una opción (alguna categoría, alguna palabra).
  function cumple(p, r) {
    r = r || {};
    if (!p || !tieneReglas(r)) return false;
    const cats = lista(r.categorias).map(Number);
    if (cats.length && !(p.categories || []).some(c => cats.includes(Number(c.id != null ? c.id : c)))) return false;
    const nom = sinAcento(nombreDe(p));
    const pal = lista(r.palabras).map(sinAcento);
    if (pal.length && !pal.some(w => nom.includes(w))) return false;
    if (lista(r.sin_palabras).map(sinAcento).some(w => nom.includes(w))) return false;
    const hay = (p.variants || []).some(disponible);
    if (r.stock === 'con' && !hay) return false;
    if (r.stock === 'sin' && hay) return false;
    const pr = precioDe(p);
    if (Number(r.precio_min) > 0 && pr < Number(r.precio_min)) return false;
    if (Number(r.precio_max) > 0 && pr > Number(r.precio_max)) return false;
    return true;
  }
  function enConjunto(p, c) {
    if (!p || !c) return false;
    const id = Number(p.id);
    if ((c.excluidos || []).map(Number).includes(id)) return false;
    return (c.productos || []).map(Number).includes(id) || cumple(p, c.reglas);
  }
  // ids del catálogo que entran en un conjunto (para el Core)
  const productosDe = (c, catalogo) => (catalogo || []).filter(p => enConjunto(p, c)).map(p => Number(p.id));

  // ¿La etiqueta está en la web ahora? (activa y dentro de las fechas)
  function vigente(e, ahora) {
    ahora = ahora || Date.now();
    if (!e || !e.activa) return false;
    if (e.desde && ahora < Date.parse(e.desde)) return false;
    if (e.hasta && ahora >= Date.parse(e.hasta)) return false;
    return true;
  }
  function estado(e, ahora) {
    ahora = ahora || Date.now();
    if (!e.activa) return 'pausada';
    if (e.hasta && ahora >= Date.parse(e.hasta)) return 'vencida';
    if (e.desde && ahora < Date.parse(e.desde)) return 'programada';
    return 'en la web';
  }
  // etiquetas que le tocan a un producto, de mayor a menor prioridad
  const paraProducto = (p, etiquetas, donde) => (etiquetas || [])
    .filter(e => (donde === 'ficha' ? e.en_ficha : e.en_tarjeta) && (e.conjuntos || []).some(c => enConjunto(p, c)))
    .sort((a, b) => (b.prioridad || 0) - (a.prioridad || 0));

  // ---------- dibujo ----------
  const ICONOS = {
    rayo: '<path d="M13.5 2 4 13.6h6.6L9.4 22 20 9.9h-6.8z"/>',
    reloj: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v5.2l3.6 2.2-.9 1.5L11 13V7z"/>',
    estrella: '<path d="m12 2 3 6.6 7.2.7-5.4 4.8 1.6 7.1L12 17.5 5.6 21.2l1.6-7.1L1.8 9.3 9 8.6z"/>',
    corazon: '<path d="M12 21s-7.5-4.6-9.6-9.2C.8 8.2 3 4 6.9 4c2.1 0 3.6 1.1 5.1 3 1.5-1.9 3-3 5.1-3C21 4 23.2 8.2 21.6 11.8 19.5 16.4 12 21 12 21z"/>',
    fuego: '<path d="M12 2s5 4.6 5 9.6c0 1.2-.3 2.2-.8 3 .9-.4 1.6-1.3 1.9-2.4 1.2 1.6 1.9 3.4 1.9 5.2C20 21 16.4 23 12 23s-8-2-8-5.6c0-3.6 2.6-5.6 3.8-8.3.6 1.4.5 2.8.2 3.9C9.6 11.6 12 8.3 12 2z"/>',
    brillo: '<path d="M12 1.5 14 10l8.5 2-8.5 2-2 8.5-2-8.5-8.5-2 8.5-2z"/>',
    regalo: '<path d="M20 7h-2.2A3 3 0 0 0 12 4.4 3 3 0 0 0 6.2 7H4a1 1 0 0 0-1 1v3h18V8a1 1 0 0 0-1-1zM9 7a1 1 0 1 1 1-1v1zm5 0V6a1 1 0 1 1 1 1zM4 13h7v8H5a1 1 0 0 1-1-1zm9 0h7v7a1 1 0 0 1-1 1h-6z"/>',
    camion: '<path d="M2 5h12v10H2zm13 3h4l3 3.5V15h-7zM6 19.5a2 2 0 1 0 0-.1zm11 0a2 2 0 1 0 0-.1z"/>',
    check: '<path d="M9.5 16.2 4.8 11.5l-1.6 1.6 6.3 6.3L21 7.9l-1.6-1.6z"/>',
    porcentaje: '<path d="M6.5 3a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zm11 11a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM19 3.6l1.4 1.4L5 20.4 3.6 19z"/>'
  };
  const FUENTES = {
    dm: "DM, 'DM Sans', system-ui, sans-serif",
    fraunces: "Fraunces, Georgia, serif",
    'fraunces-italica': "Fraunces, Georgia, serif",
    source: "Source, 'Source Sans 3', system-ui, sans-serif"
  };
  const POSICIONES = ['arriba-izq', 'arriba-der', 'abajo-izq', 'abajo-der', 'centro', 'franja-arriba', 'franja-abajo', 'cinta'];
  // Estilos de partida: los tres primeros copian marcas que ya existen en la web.
  const ESTILOS = {
    'web-ciruela': { titulo: 'Como la web · insignia ciruela', forma: 'rect', fondo: '#604668', color: '#ffffff', fuente: 'dm', tam: 10, mayus: true, esp: 0.5, px: 9, py: 5, sombra: true },
    'web-lila': { titulo: 'Como la web · cartel lila', forma: 'rect', fondo: '#E6DEF0', color: '#604668', fuente: 'dm', tam: 10, mayus: true, esp: 0.6, px: 8, py: 3 },
    'web-blanca': { titulo: 'Como la web · etiqueta blanca', forma: 'rect', fondo: 'rgba(255,255,255,.94)', color: '#465362', fuente: 'source', tam: 11, mayus: false, esp: 0, px: 8, py: 3 },
    'degrade': { titulo: 'Degradé de eventos', forma: 'rect', fondo: 'linear-gradient(135deg,#3f2f47 0%,#604668 55%,#7a5d86 100%)', color: '#ffffff', fuente: 'dm', tam: 10, mayus: true, esp: 0.6, px: 10, py: 6, sombra: true, anim: 'brillo' },
    'violeta': { titulo: 'Violeta Augusta', forma: 'pildora', fondo: '#70547B', color: '#ffffff', fuente: 'dm', tam: 10, mayus: true, esp: 0.8, px: 11, py: 5 },
    'agua': { titulo: 'Agua', forma: 'pildora', fondo: '#94D8CB', color: '#3f2f47', fuente: 'dm', tam: 10, mayus: true, esp: 0.6, px: 11, py: 5 },
    'firma': { titulo: 'Firma en itálica', forma: 'rect', fondo: '#ffffff', color: '#604668', borde: '#604668', borde_ancho: 1, fuente: 'fraunces-italica', tam: 13, mayus: false, esp: 0, px: 10, py: 4 },
    'sello': { titulo: 'Sello redondo', forma: 'circulo', fondo: '#604668', color: '#ffffff', fuente: 'fraunces', tam: 13, mayus: false, esp: 0, px: 8, py: 8, sombra: true },
    'negro': { titulo: 'Negro elegante', forma: 'rect', fondo: '#2b2530', color: '#ffffff', fuente: 'dm', tam: 10, mayus: true, esp: 1.2, px: 10, py: 5 }
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // solo valores de color/degradé simples (lo escribe el Core, pero igual no se deja inyectar CSS)
  const color = (v, def) => /^[#a-z0-9(),.%\s-]+$/i.test(String(v || '')) && !/[;{}<>]/.test(String(v)) ? String(v) : def;
  const num = (v, def, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };

  function estiloCompleto(e) { const base = ESTILOS[(e.estilo && e.estilo.base) || 'web-ciruela'] || ESTILOS['web-ciruela']; return Object.assign({}, base, e.estilo || {}); }
  // HTML de una etiqueta (sin posición: la posición la da el contenedor de su esquina)
  function html(e) {
    const s = estiloCompleto(e), forma = ['rect', 'redondeada', 'pildora', 'circulo'].includes(s.forma) ? s.forma : 'rect';
    const vars = [
      `--aet-fondo:${color(s.fondo, '#604668')}`, `--aet-color:${color(s.color, '#fff')}`,
      `--aet-borde:${color(s.borde, 'transparent')}`, `--aet-borde-ancho:${num(s.borde_ancho, 0, 0, 4)}px`,
      `--aet-fuente:${FUENTES[s.fuente] || FUENTES.dm}`, `--aet-estilo:${s.fuente === 'fraunces-italica' ? 'italic' : 'normal'}`,
      `--aet-peso:${s.fuente === 'source' ? 400 : s.fuente && s.fuente.startsWith('fraunces') ? 500 : 600}`,
      `--aet-tam:${num(s.tam, 10, 8, 28)}px`, `--aet-esp:${num(s.esp, 0.5, 0, 4)}px`,
      `--aet-px:${num(s.px, 9, 0, 30)}px`, `--aet-py:${num(s.py, 5, 0, 20)}px`
    ].join(';');
    const ic = ICONOS[s.icono] ? `<svg class="aet-ic" viewBox="0 0 24 24" aria-hidden="true">${ICONOS[s.icono]}</svg>` : '';
    const anim = ['brillo', 'pulso', 'latido', 'balanceo'].includes(s.anim) ? ' aet-anim-' + s.anim : '';
    const cls = `aet aet-forma-${forma}${s.mayus ? ' aet-mayus' : ''}${s.sombra ? ' aet-sombra' : ''}${anim}`;
    const t2 = e.texto_2 ? `<small class="aet-t2">${esc(e.texto_2)}</small>` : '';
    return `<span class="${cls}" style="${vars}" data-aet="${esc(e.id || '')}">${ic}<span class="aet-txt"><b class="aet-t">${esc(e.texto)}</b>${t2}</span></span>`;
  }
  // Agrupa por posición: un contenedor por esquina (si caen varias en la misma esquina, se apilan; máximo 3).
  function capa(etiquetas) {
    const por = {};
    for (const e of etiquetas) { const pos = POSICIONES.includes(e.posicion) ? e.posicion : 'arriba-izq'; (por[pos] = por[pos] || []).push(e); }
    return Object.entries(por).map(([pos, l]) => `<span class="aet-pila aet-pos-${pos}">${l.slice(0, pos === 'cinta' ? 1 : 3).map(html).join('')}</span>`).join('');
  }
  function textoFicha(e) {
    const s = estiloCompleto(e);
    return `<div class="aet-ficha" style="--aet-fondo:${color(s.fondo, '#604668')};--aet-color:${color(s.color, '#fff')}"><span class="aet-ficha-marca">${ICONOS[s.icono] ? `<svg class="aet-ic" viewBox="0 0 24 24" aria-hidden="true">${ICONOS[s.icono]}</svg>` : ''}${esc(e.texto)}</span><span class="aet-ficha-txt">${esc(e.texto_ficha)}</span></div>`;
  }

  root.AugustaEtiquetasMotor = { cumple, enConjunto, productosDe, tieneReglas, vigente, estado, paraProducto, html, capa, textoFicha, disponible, precioDe, nombreDe, sinAcento,
    ICONOS, FUENTES, POSICIONES, ESTILOS, estiloCompleto };
})(typeof globalThis !== 'undefined' ? globalThis : window);

/* Etiquetas en la web de Augusta (www): coloca las etiquetas que se administran en Augusta Core.
 * Lee la vista pública v_web_etiquetas (base de Augusta) y, con el motor común, decide qué etiqueta le toca a cada producto.
 * Dónde: sobre la foto de cada tarjeta (.product-card a.card-image / a.product-image), sobre la foto principal de la ficha
 * (#expand-image), un recuadro arriba del precio (#detail-price) y, si la etiqueta lo pide, el texto del botón (#add-product).
 * La web vuelve a dibujar las páginas seguido: un observador repone las etiquetas.
 * Prueba sin publicar: www.augustaintimates.com/?etiquetas=prueba muestra también las pausadas y programadas.
 * Si la base no responde, la tienda sigue igual (sin etiquetas). */
(function (root) {
  'use strict';
  const M = root.AugustaEtiquetasMotor; if (!M) return;
  const SB = 'https://ooqcdpxehcehuofolefq.supabase.co', KEY = 'sb_publishable_Wv5XwgzasCMlEB4lb82erw_oYgLYoo4';
  const PRUEBA = /[?&]etiquetas=prueba\b/.test(location.search);
  const CACHE = 'augusta:etiquetas:v1', TTL = 5 * 60 * 1000;
  let todas = [];
  const vigentes = () => todas.filter(e => PRUEBA || M.vigente(e));
  const prod = id => { try { if (typeof product === 'function') { const p = product(id); if (p) return p; } } catch (e) { /* sigue */ }
    const c = root.AUGUSTA_CATALOG; return c && c.products ? c.products.find(x => Number(x.id) === Number(id)) : null; };
  const idDe = a => Number(((a && a.getAttribute('href')) || '').replace(/^#producto\//, '').split(/[/?]/)[0]) || 0;

  function cargar() {
    let guardado = null; try { guardado = JSON.parse(sessionStorage.getItem(CACHE) || 'null'); } catch (e) { /* sin caché */ }
    if (guardado && !PRUEBA && Date.now() - guardado.at < TTL) { todas = guardado.l || []; return Promise.resolve(todas); }
    return fetch(`${SB}/rest/v1/v_web_etiquetas?select=*&order=prioridad.desc`, { headers: { apikey: KEY }, cache: 'no-store' })
      .then(r => r.ok ? r.json() : []).then(l => { todas = Array.isArray(l) ? l : []; try { sessionStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), l: todas })); } catch (e) { /* lleno */ } return todas; })
      .catch(() => (todas = []));
  }

  function poner(anfitrion, etiquetas) {
    const firma = etiquetas.map(e => e.id + e.modificado).join('|');
    if (anfitrion.dataset.aet === firma) return;
    anfitrion.querySelectorAll(':scope > .aet-pila').forEach(x => x.remove());
    anfitrion.dataset.aet = firma;
    if (!etiquetas.length) { anfitrion.classList.remove('aet-anfitrion'); return; }
    anfitrion.classList.add('aet-anfitrion');
    anfitrion.insertAdjacentHTML('beforeend', M.capa(etiquetas));
  }

  function marcar() {
    const vs = vigentes();
    // tarjetas
    document.querySelectorAll('.product-card a.card-image, .product-card a.product-image').forEach(a => {
      const p = prod(idDe(a)); poner(a, p && vs.length ? M.paraProducto(p, vs, 'tarjeta') : []);
    });
    // ficha
    const m = location.hash.match(/^#producto\/(\d+)/), p = m && prod(m[1]);
    const foto = document.getElementById('expand-image');
    const enFicha = p && vs.length ? M.paraProducto(p, vs, 'ficha') : [];
    if (foto) poner(foto, enFicha);
    const precio = document.getElementById('detail-price'), conTexto = enFicha.find(e => e.texto_ficha);
    const caja = document.querySelector('.aet-ficha');
    const clave = conTexto ? conTexto.id + conTexto.modificado + m[1] : '';
    if (caja && caja.dataset.clave !== clave) caja.remove();
    if (precio && conTexto && !document.querySelector('.aet-ficha')) { precio.insertAdjacentHTML('beforebegin', M.textoFicha(conTexto)); document.querySelector('.aet-ficha').dataset.clave = clave; }
    // botón: solo si dice «Agregar…» (otras partes de la web lo cambian por «Avisame cuando vuelva», etc.)
    const btn = document.getElementById('add-product'), conBoton = enFicha.find(e => e.texto_boton);
    const nodo = btn && [...btn.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (nodo) {
      const actual = nodo.textContent.trim();
      if (conBoton && /^agregar/i.test(actual)) { btn.dataset.aetOriginal = nodo.textContent; nodo.textContent = conBoton.texto_boton + ' '; btn.dataset.aetPuesto = conBoton.texto_boton; }
      else if (!conBoton && btn.dataset.aetPuesto && actual === btn.dataset.aetPuesto) { nodo.textContent = btn.dataset.aetOriginal || 'Agregar a mi bolsa '; delete btn.dataset.aetPuesto; }
    }
  }

  const arrancar = () => cargar().then(() => {
    marcar();
    let pend = false;
    new MutationObserver(ms => {
      if (pend || ms.every(x => x.target.closest && x.target.closest('.aet-pila,.aet-ficha'))) return;
      pend = true; setTimeout(() => { pend = false; marcar(); }, 60);   // setTimeout y no rAF: rAF no corre con la pestaña oculta
    }).observe(document.body, { childList: true, subtree: true });
    addEventListener('hashchange', () => setTimeout(marcar, 0));
    // cada 5 minutos se vuelven a leer (por si se activó o venció alguna)
    setInterval(() => { try { sessionStorage.removeItem(CACHE); } catch (e) { /* nada */ } cargar().then(marcar); }, TTL);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar, { once: true }); else arrancar();
  root.AugustaEtiquetas = { estado: () => ({ cargadas: todas.length, vigentes: vigentes().length, prueba: PRUEBA }), marcar };
})(globalThis);
