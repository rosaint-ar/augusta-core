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
