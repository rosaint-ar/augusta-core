// Augusta Core · Productos
// Lista: sale del mismo paquete que Métricas (productos por mes·canal + stock vivo de Percha + última venta).
// Ficha: core_producto(código) trae la historia completa (ventas por talle·color, compras, stock por variante).
(async function () {
  if (!(await CORE.listo)) return;
  const C = CORE, $ = s => document.querySelector(s), raiz = $('#contenido');
  let D;
  try { D = await C.datos(); } catch (e) { raiz.innerHTML = `<div class="aviso">No pude traer los datos: ${C.esc(e.message)}</div>`; return; }

  const HASTA = D.hasta, alias = D.alias || {};
  const actual = c => alias[c] || c;
  const famNombre = c => { const n = D.familias?.[c]; return n ? n.charAt(0) + n.slice(1).toLowerCase() : (c ? 'Familia ' + c : 'Sin familia'); };
  const nombre = c => D.articulos?.[c] || D.articulos?.[Object.keys(alias).find(k => alias[k] === c)] || c;
  const mesesIpc = Object.keys(D.ipc).sort(), mesBase = mesesIpc[mesesIpc.length - 1], ipcBase = D.ipc[mesBase];
  const def = m => ipcBase / (D.ipc[m] || ipcBase);
  const mesMenos = (m, n) => { let y = +m.slice(0, 4), mm = +m.slice(5, 7) - n; while (mm < 1) { mm += 12; y--; } return `${y}-${String(mm).padStart(2, '0')}`; };
  const MH = HASTA.slice(0, 7);
  const anios = [...new Set(D.productos.map(p => p[0].slice(0, 4)))].sort().filter(y => y > '2022');
  const PRESETS = [
    { id: '3m', label: 'Últimos 3 meses', m1: mesMenos(MH, 2), m2: MH },
    { id: '12m', label: 'Últimos 12 meses', m1: mesMenos(MH, 11), m2: MH },
    ...anios.slice().reverse().map(y => ({ id: y, label: y === MH.slice(0, 4) ? `${y} hasta hoy` : y, m1: `${y}-01`, m2: `${y}-12` })),
    { id: 'todo', label: 'Todo', m1: '2022-12', m2: MH }];
  const guardado = (() => { try { return JSON.parse(localStorage.getItem('core_productos') || '{}'); } catch { return {}; } })();
  const S = Object.assign({ preset: '12m', fam: '', estado: '', orden: 'v', buscar: '', cuantos: 50 }, guardado, { buscar: '', cuantos: 50 });
  const guardar = () => { try { localStorage.setItem('core_productos', JSON.stringify({ preset: S.preset, fam: S.fam, estado: S.estado, orden: S.orden })); } catch {} };

  // ---------- armar la tabla de productos ----------
  const stock = {}; for (const [c, fam, u, costo] of D.stock || []) { const k = actual(c); const x = stock[k] ||= { u: 0, costo: 0, fam }; x.u += u; x.costo += costo; }
  const ultima = {}; for (const [c, f] of Object.entries(D.ultima_venta || {})) { const k = actual(c); if (!ultima[k] || f > ultima[k]) ultima[k] = f; }
  const m90 = mesMenos(MH, 2);   // "últimos 90 días" ≈ los últimos 3 meses (el actual va parcial)
  const diasVentana = (() => { const d1 = new Date(m90 + '-01T12:00:00'), d2 = new Date(HASTA + 'T12:00:00'); return Math.round((d2 - d1) / 864e5) + 1; })();

  function calcular() {
    const p = PRESETS.find(x => x.id === S.preset) || PRESETS[1];
    const filas = {};
    const fila = (c, fam) => filas[c] ||= { cod: c, fam: fam || stock[c]?.fam || '', u: 0, v: 0, c: 0, vc: 0, u90: 0 };
    for (const [m, , cod, fam, u, v, c, vc] of D.productos) {
      const k = actual(cod);
      if (m >= m90) fila(k, fam).u90 += u;
      if (m < p.m1 || m > p.m2) continue;
      const x = fila(k, fam), f = def(m); x.u += u; x.v += v * f; x.c += c * f; x.vc += vc * f;
    }
    for (const k of Object.keys(stock)) fila(k);
    const lista = Object.values(filas).map(x => {
      const st = stock[x.cod]?.u || 0, ritmo = x.u90 / diasVentana;
      const cob = st > 0 && ritmo > 0 ? st / ritmo : null;
      const ult = ultima[x.cod] || null, vendio90 = x.u90 > 0;
      let estado = 'ok';
      if (st <= 0 && vendio90) estado = 'quiebre';
      else if (st > 0 && !vendio90) estado = 'parado';
      else if (cob != null && cob < 30) estado = 'poco';
      else if (st <= 0) estado = 'sin';
      return Object.assign(x, { stock: st, stockCosto: stock[x.cod]?.costo || 0, cob, ult, estado });
    });
    // estrellas: las 15 que más vendieron en el período (si no están en quiebre)
    lista.slice().sort((a, b) => b.v - a.v).slice(0, 15).forEach(x => { if (x.v > 0 && x.estado === 'ok') x.estado = 'estrella'; });
    return { p, lista };
  }
  const ESTADOS = { quiebre: ['e-quiebre', 'Se vende y no hay'], poco: ['e-parado', 'Queda poco'], parado: ['e-parado', 'Parado'], estrella: ['e-estrella', 'Estrella'], ok: ['e-ok', 'Bien'], sin: ['e-sin', 'Sin stock'] };
  const chip = e => `<span class="estado ${ESTADOS[e][0]}">${ESTADOS[e][1]}</span>`;

  raiz.innerHTML = `<div class="filtros" id="filtros"></div><div class="resumen" id="resumen"></div><section class="tarjeta" id="tabla"></section>`;

  function pintar() {
    const { p, lista } = calcular();
    const fams = [...new Set(lista.map(x => x.fam))].filter(Boolean).sort((a, b) => famNombre(a).localeCompare(famNombre(b)));
    $('#filtros').innerHTML = `
      <div class="grupo"><span>Período</span>${PRESETS.map(x => `<button class="chip ${S.preset === x.id ? 'activo' : ''}" data-preset="${x.id}">${x.label}</button>`).join('')}</div>
      <div class="grupo"><span>Familia</span><select id="sel-fam"><option value="">Todas</option>${fams.map(f => `<option value="${f}" ${f === S.fam ? 'selected' : ''}>${C.esc(famNombre(f))}</option>`).join('')}</select></div>
      <div class="grupo" style="flex:1;justify-content:flex-end"><input class="buscar" id="buscar" placeholder="Buscar por nombre o código" value="${C.esc(S.buscar)}"></div>`;
    const base = lista.filter(x => !S.fam || x.fam === S.fam);
    const cuenta = e => base.filter(x => x.estado === e);
    const q = cuenta('quiebre'), po = cuenta('poco'), pa = cuenta('parado');
    const conStock = base.filter(x => x.stock > 0), valor = conStock.reduce((s, x) => s + x.stockCosto, 0);
    $('#resumen').innerHTML = [
      ['quiebre', 'Se vende y no hay', q.length, `vendieron en los últimos 3 meses y hoy no tienen stock`],
      ['poco', 'Queda poco', po.length, 'stock para menos de 30 días al ritmo actual'],
      ['parado', 'Parados', pa.length, `${C.compacto(pa.reduce((s, x) => s + x.stockCosto, 0))} a costo, sin ventas en 3 meses`],
      ['', 'Con stock', conStock.length, `${C.compacto(valor)} a costo · ${C.n(conStock.reduce((s, x) => s + x.stock, 0))} u.`],
    ].map(([e, t, n, d]) => `<div class="tarjeta ${S.estado === e && e ? 'activo' : ''}" data-estado="${e}" role="button" tabindex="0">
        <div class="et">${e ? chip(e).replace(ESTADOS[e][1], '') : ''}${t}</div><div class="valor num">${C.n(n)}</div><div class="det">${d}</div></div>`).join('');

    let filas = base.filter(x => (!S.estado || x.estado === S.estado) && (x.u || x.stock > 0 || S.buscar));
    const qq = S.buscar.trim().toLowerCase();
    if (qq) filas = filas.filter(x => qq.split(/\s+/).every(w => (nombre(x.cod) + ' ' + x.cod).toLowerCase().includes(w)));
    const ord = { v: (a, b) => b.v - a.v, u: (a, b) => b.u - a.u, stock: (a, b) => b.stock - a.stock, cob: (a, b) => (a.cob ?? 1e9) - (b.cob ?? 1e9), ult: (a, b) => (b.ult || '').localeCompare(a.ult || ''), mg: (a, b) => mg(b) - mg(a), nombre: (a, b) => nombre(a.cod).localeCompare(nombre(b.cod)) };
    filas.sort(ord[S.orden] || ord.v);
    const vistos = filas.slice(0, S.cuantos);
    const th = (k, t, n) => `<th class="${n ? 'n' : ''} ${S.orden === k ? 'orden' : ''}" data-orden="${k}">${t}</th>`;
    $('#tabla').innerHTML = `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <h2 style="margin:0;font:500 19px var(--f-titulo);color:var(--violeta)">${S.estado ? ESTADOS[S.estado][1] : 'Todos los productos'}</h2>
        <span style="color:var(--tinta-2);font-size:13.5px">${C.n(filas.length)} productos · ventas de ${p.label.toLowerCase()} en pesos de hoy · tocá uno para ver su historia${S.estado ? ' · <a href="#" id="quitar">ver todos</a>' : ''}</span></div>
      <div class="tabla-scroll"><table class="t"><thead><tr>${th('nombre', 'Producto')}<th>Familia</th><th>Estado</th>${th('u', 'Vendidas', 1)}${th('v', 'Venta', 1)}${th('mg', 'Margen', 1)}${th('stock', 'Stock hoy', 1)}${th('cob', 'Alcanza para', 1)}${th('ult', 'Última venta', 1)}</tr></thead><tbody>
      ${vistos.map(x => `<tr data-cod="${C.esc(x.cod)}"><td><div class="nombre">${C.esc(nombre(x.cod))}</div><div class="sub">${C.esc(x.cod)}</div></td><td>${C.esc(famNombre(x.fam))}</td><td>${chip(x.estado)}</td>
        <td class="n">${x.u ? C.n(x.u) : '—'}</td><td class="n">${x.v ? C.plata(x.v) : '—'}</td><td class="n">${x.vc ? C.pct(mg(x)) : '—'}</td><td class="n">${C.n(x.stock)}</td>
        <td class="n">${x.cob == null ? (x.stock > 0 ? 'sin ventas' : '—') : x.cob > 365 ? 'más de un año' : C.n(x.cob) + ' días'}</td><td class="n">${C.fecha(x.ult)}</td></tr>`).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--tinta-3);padding:24px">Nada para mostrar con estos filtros.</td></tr>'}</tbody></table></div>
      ${filas.length > S.cuantos ? `<button class="chip mas" id="mas">Ver ${Math.min(50, filas.length - S.cuantos)} más (quedan ${filas.length - S.cuantos})</button>` : ''}
      <p class="pie-nota">"Alcanza para" = stock de hoy dividido el ritmo de venta de los últimos 3 meses. Stock de Percha al ${C.fecha(D.stock_fecha || HASTA)}${D.stock_fuente === 'percha' ? '' : ' (foto de FactuSOL)'}.</p>`;
  }
  const mg = x => x.vc ? 1 - x.c / x.vc : -1;

  // ---------- eventos de la lista ----------
  raiz.addEventListener('click', e => {
    const b = e.target.closest('[data-preset]'); if (b) { S.preset = b.dataset.preset; guardar(); return pintar(); }
    const t = e.target.closest('[data-estado]'); if (t) { S.estado = S.estado === t.dataset.estado ? '' : t.dataset.estado; S.cuantos = 50; guardar(); return pintar(); }
    const h = e.target.closest('th[data-orden]'); if (h) { S.orden = h.dataset.orden; guardar(); return pintar(); }
    if (e.target.id === 'mas') { S.cuantos += 50; return pintar(); }
    if (e.target.id === 'quitar') { e.preventDefault(); S.estado = ''; guardar(); return pintar(); }
    const tr = e.target.closest('tr[data-cod]'); if (tr) abrirFicha(tr.dataset.cod);
  });
  raiz.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-estado]')) e.target.click(); });
  raiz.addEventListener('change', e => { if (e.target.id === 'sel-fam') { S.fam = e.target.value; guardar(); pintar(); } });
  raiz.addEventListener('input', e => { if (e.target.id !== 'buscar') return; S.buscar = e.target.value; S.cuantos = 50; const pos = e.target.selectionStart; pintar(); const n = $('#buscar'); n.focus(); n.setSelectionRange(pos, pos); });

  // ---------- ficha ----------
  const ficha = $('#ficha'), velo = $('#velo');
  function cerrarFicha() { ficha.classList.remove('abierta'); velo.classList.remove('abierto'); ficha.setAttribute('aria-hidden', 'true'); C.tipFuera(); if (location.hash) history.replaceState(null, '', location.pathname + location.search); }
  velo.onclick = cerrarFicha;
  addEventListener('keydown', e => { if (e.key === 'Escape') cerrarFicha(); });
  const normTalle = t => (t || '').replace(/\s*\(.*\)\s*/, '').trim().toUpperCase();
  const normColor = c => (c || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const ordenTalle = t => { const s = normTalle(t), L = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'];
    if (L.includes(s)) return 100 + L.indexOf(s); if (s === 'DOBLE XL') return 106; if (s === 'TRIPLE XL') return 107; const n = parseFloat(s); if (!isNaN(n)) return 200 + n; if (/^(U|ÚNICO|UNICO)/.test(s) || !s) return 1000; return 900; };

  async function abrirFicha(cod) {
    ficha.innerHTML = `<div class="cargando">Buscando la historia de ${C.esc(nombre(cod))}…</div>`;
    ficha.classList.add('abierta'); velo.classList.add('abierto'); ficha.setAttribute('aria-hidden', 'false');
    history.replaceState(null, '', '#' + encodeURIComponent(cod));
    let P; try { P = await C.producto(cod); } catch (e) { ficha.innerHTML = `<div class="cab-f"><h2>${C.esc(nombre(cod))}</h2><button class="cerrar" aria-label="Cerrar">×</button></div><div class="aviso-f">${C.esc(e.message)}</div>`; ficha.querySelector('.cerrar').onclick = cerrarFicha; return; }
    const pr = P.producto || {}, nom = pr.nombre || P.nombre_fs || nombre(cod), fam = pr.familia || P.familia_fs;
    const aviso = avisoNombres(P, nom), fuera = r => aviso.ajenos.has(String(r[0]).slice(0, 4));
    const V = (P.ventas || []).filter(r => !fuera(r)), m12 = mesMenos(MH, 11);
    const primera = V.find(r => r[4] > 0)?.[0];
    const tot = { u: 0, v: 0 }, ult12 = { u: 0, v: 0, c: 0, vc: 0 }, porMes = {}, porAnio = {};
    for (const [m, canal, , , u, v, c, vc] of V) {
      const f = def(m); tot.u += u; tot.v += v * f;
      if (m >= m12) { ult12.u += u; ult12.v += v * f; ult12.c += c * f; ult12.vc += vc * f; }
      (porMes[m] ||= {})[canal] = ((porMes[m] || {})[canal] || 0) + u;
      const a = porAnio[m.slice(0, 4)] ||= { u: 0, v: 0, c: 0, vc: 0 }; a.u += u; a.v += v * f; a.c += c * f; a.vc += vc * f;
    }
    const st = (P.stock || []).reduce((s, x) => s + (+x[2] || 0), 0);
    const u90 = V.filter(x => x[0] >= m90).reduce((s, x) => s + x[4], 0), ritmo = u90 / diasVentana, cob = st > 0 && ritmo > 0 ? st / ritmo : null;
    const margenU = pr.precio && pr.costo ? pr.precio - pr.costo : null;
    const compras = (P.compras || []).filter(r => !fuera(r)), comprado = compras.reduce((s, x) => s + (+x[4] || 0), 0);

    ficha.innerHTML = `
      <div class="cab-f">${pr.foto ? `<img src="${C.esc(pr.foto)}" alt="">` : ''}
        <div><h2>${C.esc(nom)}</h2><div class="sub">${C.esc(famNombre(fam))} · código ${C.esc(P.codigo)}${P.codigos?.length > 1 ? ` (antes ${C.esc(P.codigos.filter(x => x !== P.codigo).join(', '))})` : ''}${pr.activo === false ? ' · <b>inactivo</b>' : ''}</div>
          <div class="sub">${pr.precio ? `Precio de lista ${C.plata(pr.precio)}` : ''}${pr.costo ? ` · costo ${C.plata(pr.costo)}` : ''}${margenU != null ? ` · ganás ${C.plata(margenU)} por prenda a precio de lista` : ''}</div></div>
        <button class="cerrar" aria-label="Cerrar">×</button></div>
      <div class="cuerpo">${aviso.html}
        <div class="tiles">
          <div class="tarjeta"><div class="et">Últimos 12 meses</div><div class="valor num">${C.n(ult12.u)} u.</div><div class="det">${C.compacto(ult12.v)}${ult12.vc ? ` · margen ${C.pct(1 - ult12.c / ult12.vc)}` : ''}</div></div>
          <div class="tarjeta"><div class="et">Desde siempre</div><div class="valor num">${C.n(tot.u)} u.</div><div class="det">${C.compacto(tot.v)} · desde ${aviso.ajenos.size ? C.mesCorto(primera || MH) : C.fecha(P.primera_venta)}</div></div>
          <div class="tarjeta"><div class="et">Stock hoy</div><div class="valor num">${C.n(st)} u.</div><div class="det">${P.stock?.length ? `en ${P.stock.filter(x => x[2] > 0).length} talle·color` : 'sin variantes en Percha'}</div></div>
          <div class="tarjeta"><div class="et">Alcanza para</div><div class="valor num">${cob == null ? (st > 0 ? '—' : u90 ? 'agotado' : '—') : cob > 365 ? '+1 año' : C.n(cob) + ' días'}</div><div class="det">${u90 ? `vende ${C.n(u90)} u. cada 3 meses` : 'sin ventas en 3 meses'}</div></div>
        </div>
        <section class="tarjeta"><h2>Unidades por mes</h2><p class="ayuda">Toda la historia, por canal. Última venta: ${C.fecha(P.ultima_venta)}.</p><div class="leyenda">${C.CANALES.map(c => `<span><i style="background:${c.color}"></i>${c.id}</span>`).join('')}</div><div id="g-meses"></div></section>
        <section class="tarjeta"><h2>Talles y colores</h2><p class="ayuda">Número grande = vendidas en los últimos 12 meses · abajo, el stock de hoy. Con borde rojo: se vendió y hoy no hay.</p><div class="tabla-scroll" id="matriz"></div></section>
        <section class="tarjeta"><h2>Año por año</h2><p class="ayuda">En pesos de hoy. El precio promedio es lo que efectivamente se cobró (con descuentos y promos).</p><div class="tabla-scroll"><table class="t"><thead><tr><th>Año</th><th class="n">Unidades</th><th class="n">Venta</th><th class="n">Precio promedio</th><th class="n">Margen</th></tr></thead><tbody>
          ${Object.keys(porAnio).sort().reverse().map(y => { const a = porAnio[y]; return `<tr><td>${y}${y === MH.slice(0, 4) ? ` (al ${+HASTA.slice(8)}/${+HASTA.slice(5, 7)})` : ''}</td><td class="n">${C.n(a.u)}</td><td class="n">${C.plata(a.v)}</td><td class="n">${a.u ? C.plata(a.v / a.u) : '—'}</td><td class="n">${a.vc ? C.pct(1 - a.c / a.vc) : '—'}</td></tr>`; }).join('') || '<tr><td colspan="5" style="color:var(--tinta-3)">Sin ventas registradas.</td></tr>'}</tbody></table></div></section>
        <section class="tarjeta"><h2>Compras</h2><p class="ayuda">${compras.length ? `Entraron ${C.n(comprado)} u. en ${new Set(compras.map(x => x[0])).size} compras; desde la primera se vendieron ${C.n(V.filter(x => x[0] >= compras[0][0].slice(0, 7)).reduce((s, x) => s + x[4], 0))}.` : 'No hay compras registradas de este producto (puede haber entrado sin cargarse como compra).'}</p>
          ${compras.length ? `<div class="tabla-scroll"><table class="t"><thead><tr><th>Fecha</th><th>Proveedor</th><th class="n">Unidades</th><th class="n">Costo unitario</th></tr></thead><tbody>${agruparCompras(compras).slice(0, 15).map(c => `<tr><td>${C.fecha(c.f)}</td><td>${C.esc(c.prov || '—')}</td><td class="n">${C.n(c.u)}</td><td class="n">${c.u ? C.plata(c.costo / c.u) : '—'}</td></tr>`).join('')}</tbody></table></div>` : ''}</section>
      </div>`;
    ficha.querySelector('.cerrar').onclick = cerrarFicha;
    ficha.scrollTop = 0;
    graficoMeses(porMes, aviso.ajenos.size ? (primera ? primera + '-01' : null) : P.primera_venta);
    matriz(V, P.stock || [], m12);
  }
  // FactuSOL reusó códigos para prendas distintas: si este código tuvo otro nombre en años anteriores, se avisa
  function avisoNombres(P, nom) {
    const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ«»"]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    // palabras que identifican al modelo (sin el tipo de prenda ni la tela): si no comparten ninguna, es otra prenda
    const TIPO = new Set('PIJAMA CONJUNTO BOMBACHA BOMBIS LESS COLALESS CULOTTELESS VEDETINA BODY CAMISON BATA BIKINI CORPINO TOP MEDIAS PANTUFLAS PANTUFLON LIGUERO ARNES ENTERIZA REMERA PANTALON MAXIBUZO SHORT PACK MODAL MORLEY SATEN ALGODON POLAR SOFT PLUSH MANGA CORTA LARGA CLASSIC'.split(' '));
    const palabras = s => new Set(norm(s).replace(/[^A-Z0-9 ]/g, ' ').split(' ').filter(w => w.length > 2 && !TIPO.has(w)));
    const propias = palabras(nom), distinta = d => { const p = palabras(d); return p.size > 0 && propias.size > 0 && ![...p].some(w => propias.has(w)); };
    const otros = {}, porAnio = {};
    for (const [y, , d] of P.nombres || []) { if (!d) continue; const o = distinta(d); (porAnio[y] ||= []).push(o); if (o) (otros[d] ||= []).push(y); }
    // años en los que el código era SOLO de otra prenda: sus ventas y compras no son de esta
    const ajenos = new Set(Object.entries(porAnio).filter(([, l]) => l.every(Boolean)).map(([y]) => y));
    const l = Object.entries(otros);
    return { ajenos, html: l.length ? `<div class="aviso">FactuSOL usó este mismo código para ${l.map(([d, ys]) => `<b>${C.esc(d)}</b> (${[...new Set(ys)].join(', ')})`).join(' y ')}.${ajenos.size ? ` Las ventas y compras de ${[...ajenos].join(', ')} son de esa prenda y no se cuentan acá.` : ' Revisá las ventas de esos años.'}</div>` : '' };
  }
  function agruparCompras(compras) {
    const g = {}; for (const [f, prov, , , u, costo] of compras) { const k = f + '|' + prov; const x = g[k] ||= { f, prov, u: 0, costo: 0 }; x.u += +u || 0; x.costo += (+u || 0) * (+costo || 0); }
    return Object.values(g).sort((a, b) => b.f.localeCompare(a.f));
  }
  function graficoMeses(porMes, primera) {
    const el = $('#g-meses'); if (!primera) { el.innerHTML = '<p class="ayuda">Sin ventas.</p>'; return; }
    const ms = []; let m = primera.slice(0, 7); while (m <= MH) { ms.push(m); const y = +m.slice(0, 4), mm = +m.slice(5, 7); m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`; }
    const tot = mm => Object.values(porMes[mm] || {}).reduce((a, b) => a + Math.max(0, b), 0);
    const { tope, paso } = C.escala(Math.max(...ms.map(tot), 1));
    const W = Math.max(300, el.clientWidth), H = 200, izq = 40, abajo = 24, arriba = 8, ancho = (W - izq) / ms.length, barra = Math.min(22, ancho * .65);
    const y = v => arriba + (H - arriba - abajo) * (1 - v / tope);
    let s = `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="Unidades por mes">`;
    for (let v = 0; v <= tope + 1e-9; v += paso) s += `<line class="${v ? 'eje' : 'base'}" x1="${izq}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${izq - 6}" y="${y(v) + 4}" text-anchor="end">${C.n(v)}</text>`;
    const cada = Math.ceil(ms.length / Math.max(1, Math.floor((W - izq) / 50)));
    ms.forEach((mm, i) => {
      const x = izq + i * ancho + (ancho - barra) / 2; let acum = 0;
      const segs = C.CANALES.map(c => ({ c, v: Math.max(0, porMes[mm]?.[c.id] || 0) })).filter(z => z.v > 0);
      segs.forEach((z, j) => { const y1 = y(acum + z.v), y0 = y(acum); acum += z.v; const h = Math.max(0, y0 - y1 - (j < segs.length - 1 ? 2 : 0)), ult = j === segs.length - 1, r = ult ? Math.min(4, h, barra / 2) : 0;
        s += ult ? `<path d="M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + barra - r} Q${x + barra},${y1} ${x + barra},${y1 + r} V${y0} Z" fill="${z.c.color}"/>` : `<rect x="${x}" y="${y0 - h}" width="${barra}" height="${h}" fill="${z.c.color}"/>`; });
      s += `<rect x="${izq + i * ancho}" y="${arriba}" width="${ancho}" height="${H - arriba - abajo}" fill="transparent" data-mes="${mm}"/>`;
      if (i % cada === 0) s += `<text x="${izq + i * ancho + ancho / 2}" y="${H - 6}" text-anchor="middle">${C.mesCorto(mm)}</text>`;
    });
    el.innerHTML = s + '</svg>';
    const svg = el.querySelector('svg');
    svg.addEventListener('mousemove', e => { const mm = e.target.dataset?.mes; if (!mm) return C.tipFuera();
      const filas = C.CANALES.map(c => ({ c, v: porMes[mm]?.[c.id] || 0 })).filter(z => z.v);
      C.tip(`<b>${C.mesCorto(mm)}</b>${filas.map(z => `<div class="f"><span><i style="background:${z.c.color}"></i>${z.c.id}</span><span class="tab">${C.n(z.v)} u.</span></div>`).join('') || '<div class="f"><span>Sin ventas</span></div>'}${filas.length > 1 ? `<div class="f tot"><span>Total</span><span>${C.n(tot(mm))} u.</span></div>` : ''}`, e); });
    svg.addEventListener('mouseleave', C.tipFuera);
  }
  function matriz(V, stockV, m12) {
    const celdas = {}, talles = {}, colores = {};
    const cel = (t, c) => { const kt = normTalle(t), kc = normColor(c); talles[kt] ||= t ? normTalle(t) : 'Único'; colores[kc] ||= c || 'Sin color'; return celdas[kt + '|' + kc] ||= { v: 0, s: 0, v90: 0 }; };
    for (const [m, , t, c, u] of V) { if (m < m12) continue; const x = cel(t, c); x.v += u; if (m >= m90) x.v90 += u; }
    for (const [t, c, s] of stockV) { const x = cel(t, c); x.s += +s || 0; if (c) colores[normColor(c)] = c; }   // Percha manda en cómo se escribe el color
    const vivo = (t, c) => { const x = celdas[t + '|' + c]; return x && (x.v || x.s); };   // sin ventas en 12 meses ni stock: no se muestra
    const ts = Object.keys(talles).filter(t => Object.keys(colores).some(c => vivo(t, c))).sort((a, b) => ordenTalle(a) - ordenTalle(b) || a.localeCompare(b));
    const cs = Object.keys(colores).filter(c => ts.some(t => vivo(t, c))).sort((a, b) => ts.reduce((s, t) => s + (celdas[t + '|' + b]?.v || 0), 0) - ts.reduce((s, t) => s + (celdas[t + '|' + a]?.v || 0), 0));
    if (!ts.length) { $('#matriz').innerHTML = '<p class="ayuda">Sin ventas ni stock por talle o color.</p>'; return; }
    $('#matriz').innerHTML = `<table class="matriz"><thead><tr><th></th>${ts.map(t => `<th>${C.esc(talles[t])}</th>`).join('')}<th>Total</th></tr></thead><tbody>
      ${cs.map(c => { let tv = 0, tsk = 0; const tds = ts.map(t => { const x = celdas[t + '|' + c]; if (!x) return '<td class="vacia">·</td>'; tv += x.v; tsk += x.s;
        return `<td class="${x.s <= 0 && x.v > 0 ? 'quiebre' : ''}" title="${C.esc(colores[c])} ${C.esc(talles[t])}: ${C.n(x.v)} vendidas en 12 meses, ${C.n(x.s)} en stock"><b>${x.v ? C.n(x.v) : '–'}</b><small>stock ${C.n(x.s)}</small></td>`; }).join('');
        return `<tr><th class="c">${C.esc(colores[c])}</th>${tds}<td><b>${C.n(tv)}</b><small>stock ${C.n(tsk)}</small></td></tr>`; }).join('')}</tbody></table>`;
  }

  pintar();
  if (location.hash.length > 1) abrirFicha(decodeURIComponent(location.hash.slice(1)));
})();
