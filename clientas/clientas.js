// Augusta Core · Clientas
// core_clientas(): pedidos pagados y no cancelados de Tienda Nube con su clienta y zona. El local y WhatsApp no guardan quién compra.
(async function () {
  if (!(await CORE.listo)) return;
  const C = CORE, $ = s => document.querySelector(s), raiz = $('#contenido');
  let K;
  try { K = await C.clientas(); } catch (e) { raiz.innerHTML = `<div class="aviso">No pude traer los datos: ${C.esc(e.message)}</div>`; return; }

  const HASTA = K.hasta, mesesIpc = Object.keys(K.ipc).sort(), mesBase = mesesIpc[mesesIpc.length - 1], ipcBase = K.ipc[mesBase];
  const def = m => ipcBase / (K.ipc[m] || ipcBase);
  const dmas = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const dias = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
  const anioMenos = f => `${+f.slice(0, 4) - 1}${f.slice(4)}`;
  const anios = [...new Set(K.pedidos.map(p => p[0].slice(0, 4)))].sort();
  const PRESETS = [
    { id: '3m', label: 'Últimos 3 meses', d1: dmas(HASTA, -91), d2: HASTA },
    { id: '12m', label: 'Últimos 12 meses', d1: dmas(anioMenos(HASTA), 1), d2: HASTA },
    ...anios.slice().reverse().filter(y => y >= '2021').map(y => ({ id: y, label: y === HASTA.slice(0, 4) ? `${y} hasta hoy` : y, d1: `${y}-01-01`, d2: y === HASTA.slice(0, 4) ? HASTA : `${y}-12-31` })),
    { id: 'todo', label: 'Todo', d1: '2020-01-01', d2: HASTA }];
  const guardado = (() => { try { return JSON.parse(localStorage.getItem('core_clientas') || '{}'); } catch { return {}; } })();
  const S = Object.assign({ preset: '12m', buscar: '' }, guardado, { buscar: '' });
  const guardar = () => { try { localStorage.setItem('core_clientas', JSON.stringify({ preset: S.preset })); } catch {} };

  // historia completa de cada clienta (para saber si es nueva o vuelve, y su segmento)
  const H = {};
  for (const [f, cid, zona, total, u, cupon] of K.pedidos) { const x = H[cid] ||= { cid, peds: [], zona }; x.peds.push({ f, v: total * def(f.slice(0, 7)), vn: total, u, cupon }); if (zona) x.zona = zona; }
  for (const x of Object.values(H)) { x.peds.sort((a, b) => a.f.localeCompare(b.f)); x.primera = x.peds[0].f; x.ultima = x.peds[x.peds.length - 1].f; x.n = x.peds.length; x.total = x.peds.reduce((s, p) => s + p.v, 0); }
  const nombre = cid => (K.clientas?.[cid]?.[0] || 'Sin nombre').replace(/\s+/g, ' ').trim();
  const zonaNom = z => K.zonas?.[z] || 'Sin zona';

  const SEG = [
    { id: 'activa', nombre: 'Activas', desc: 'compraron en los últimos 3 meses', color: 'var(--bien)', d: [0, 90] },
    { id: 'riesgo', nombre: 'Por enfriarse', desc: 'última compra hace 3 a 6 meses', color: '#C99A2E', d: [91, 182] },
    { id: 'dormida', nombre: 'Dormidas', desc: 'hace 6 meses a 1 año', color: '#D45487', d: [183, 365] },
    { id: 'perdida', nombre: 'Perdidas', desc: 'hace más de un año', color: 'var(--tinta-3)', d: [366, 1e6] }];
  const segDe = x => SEG.find(s => { const d = dias(x.ultima, HASTA); return d >= s.d[0] && d <= s.d[1]; });

  raiz.innerHTML = `<div class="filtros" id="filtros"></div><p class="nota">Solo la tienda web (Tienda Nube): es lo único que guarda quién compra. Montos en pesos de ${C.MESES[+mesBase.slice(5, 7) - 1]} ${mesBase.slice(0, 4)} (IPC).</p>
    <div class="grilla g-4" id="kpis"></div>
    <div class="grilla"><section class="tarjeta" id="meses"></section></div>
    <div class="grilla"><section class="tarjeta" id="segmentos"></section></div>
    <div class="grilla g-2"><section class="tarjeta" id="zonas"></section><section class="tarjeta" id="vuelta"></section></div>
    <div class="grilla"><section class="tarjeta" id="top"></section></div>`;

  function pintar() {
    const p = PRESETS.find(x => x.id === S.preset) || PRESETS[1], { d1, d2 } = p;
    $('#filtros').innerHTML = `<div class="grupo"><span>Período</span>${PRESETS.map(x => `<button class="chip ${S.preset === x.id ? 'activo' : ''}" data-preset="${x.id}">${x.label}</button>`).join('')}</div>`;
    const enP = Object.values(H).map(x => ({ x, peds: x.peds.filter(q => q.f >= d1 && q.f <= d2) })).filter(y => y.peds.length);
    const nuevas = enP.filter(y => y.x.primera >= d1), vuelven = enP.filter(y => y.x.primera < d1);
    const nPed = enP.reduce((s, y) => s + y.peds.length, 0), venta = enP.reduce((s, y) => s + y.peds.reduce((a, q) => a + q.v, 0), 0);
    const repiten = enP.filter(y => y.peds.length > 1).length;
    // comparación: mismo período del año anterior
    const d1b = anioMenos(d1), d2b = anioMenos(d2), antes = Object.values(H).filter(x => x.peds.some(q => q.f >= d1b && q.f <= d2b)).length;
    const dl = (a, b) => { const v = C.variacion(a, b); if (v == null || !isFinite(v)) return ''; return `<span class="delta ${Math.abs(v) < .005 ? 'igual' : v > 0 ? 'sube' : 'baja'}">${v > 0 ? '▲' : '▼'} ${C.pct(Math.abs(v))}</span>`; };
    $('#kpis').innerHTML = `
      <div class="tarjeta kpi destacado"><div class="et">Clientas que compraron</div><div class="valor num">${C.n(enP.length)}</div><div class="det">${dl(enP.length, antes)} ${antes ? `contra ${C.n(antes)} el año anterior` : ''}</div></div>
      <div class="tarjeta kpi"><div class="et">Nuevas</div><div class="valor num">${C.n(nuevas.length)}</div><div class="det">primera compra en el período · ${C.pct(nuevas.length / (enP.length || 1))}</div></div>
      <div class="tarjeta kpi"><div class="et">Volvieron</div><div class="valor num">${C.n(vuelven.length)}</div><div class="det">ya habían comprado antes · ${C.pct(vuelven.length / (enP.length || 1))}${repiten ? ` · ${C.n(repiten)} compraron 2+ veces en el período` : ''}</div></div>
      <div class="tarjeta kpi"><div class="et">Pedido promedio</div><div class="valor num">${nPed ? C.plata(venta / nPed) : '—'}</div><div class="det">${C.n(nPed)} pedidos · ${C.compacto(venta)}</div></div>`;
    pintarMeses(d1, d2); pintarSegmentos(); pintarZonas(enP); pintarVuelta(); pintarTop(enP);
  }

  function pintarMeses(d1, d2) {
    const el = $('#meses'), m1 = d1.slice(0, 7), m2 = d2.slice(0, 7), ms = [];
    let mm = m1 < '2020-04' ? '2020-04' : m1; while (mm <= m2) { ms.push(mm); const y = +mm.slice(0, 4), n = +mm.slice(5, 7); mm = n === 12 ? `${y + 1}-01` : `${y}-${String(n + 1).padStart(2, '0')}`; }
    const M = {}; for (const x of Object.values(H)) { const vistos = new Set(); for (const q of x.peds) { const m = q.f.slice(0, 7); if (vistos.has(m)) continue; vistos.add(m); const r = M[m] ||= { n: 0, v: 0 }; if (x.primera.slice(0, 7) === m) r.n++; else r.v++; } }
    const S2 = [{ id: 'Nuevas', k: 'n', color: 'var(--a-2)' }, { id: 'Volvieron', k: 'v', color: 'var(--violeta)' }];
    const { tope, paso } = C.escala(Math.max(...ms.map(m => (M[m]?.n || 0) + (M[m]?.v || 0)), 1));
    el.innerHTML = `<div class="cab"><div><h2>Mes a mes</h2><p class="ayuda">Clientas distintas que compraron cada mes: las que compraban por primera vez y las que volvían.</p></div></div>
      <div class="leyenda">${S2.map(s => `<span><i style="background:${s.color}"></i>${s.id}</span>`).join('')}</div><div id="g-m"></div>`;
    const g = $('#g-m'), W = Math.max(300, g.clientWidth), Hh = 220, izq = 40, abajo = 24, arriba = 8, ancho = (W - izq) / Math.max(ms.length, 1), barra = Math.min(24, ancho * .62);
    const y = v => arriba + (Hh - arriba - abajo) * (1 - v / tope);
    let s = `<svg class="graf" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Clientas por mes">`;
    for (let v = 0; v <= tope + 1e-9; v += paso) s += `<line class="${v ? 'eje' : 'base'}" x1="${izq}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${izq - 6}" y="${y(v) + 4}" text-anchor="end">${C.n(v)}</text>`;
    const cada = Math.ceil(ms.length / Math.max(1, Math.floor((W - izq) / 52)));
    ms.forEach((m, i) => { const x = izq + i * ancho + (ancho - barra) / 2; let acum = 0; const segs = S2.map(z => ({ z, v: M[m]?.[z.k] || 0 })).filter(z => z.v);
      segs.forEach((z, j) => { const y1 = y(acum + z.v), y0 = y(acum); acum += z.v; const h = Math.max(0, y0 - y1 - (j < segs.length - 1 ? 2 : 0)), ult = j === segs.length - 1, r = ult ? Math.min(4, h, barra / 2) : 0;
        s += ult ? `<path d="M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + barra - r} Q${x + barra},${y1} ${x + barra},${y1 + r} V${y0} Z" fill="${z.z.color}"/>` : `<rect x="${x}" y="${y0 - h}" width="${barra}" height="${h}" fill="${z.z.color}"/>`; });
      s += `<rect x="${izq + i * ancho}" y="${arriba}" width="${ancho}" height="${Hh - arriba - abajo}" fill="transparent" data-mes="${m}"/>`;
      if (i % cada === 0) s += `<text x="${izq + i * ancho + ancho / 2}" y="${Hh - 6}" text-anchor="middle">${C.mesCorto(m)}</text>`; });
    g.innerHTML = s + '</svg>';
    const svg = g.querySelector('svg');
    svg.addEventListener('mousemove', e => { const m = e.target.dataset?.mes; if (!m) return C.tipFuera(); const r = M[m] || { n: 0, v: 0 };
      C.tip(`<b>${C.mesCorto(m)}</b>${S2.map(z => `<div class="f"><span><i style="background:${z.color}"></i>${z.id}</span><span>${C.n(r[z.k])}</span></div>`).join('')}<div class="f tot"><span>Total</span><span>${C.n(r.n + r.v)}</span></div>`, e); });
    svg.addEventListener('mouseleave', C.tipFuera);
  }

  function pintarSegmentos() {
    const todas = Object.values(H), g = {}; for (const x of todas) { const s = segDe(x); const r = g[s.id] ||= { n: 0, rec: 0, v: 0 }; r.n++; if (x.n > 1) r.rec++; r.v += x.total; }
    $('#segmentos').innerHTML = `<div class="cab"><div><h2>Cómo están hoy las clientas</h2><p class="ayuda">Todas las clientas de la web según su última compra. Las "por enfriarse" y "dormidas" son las más fáciles de recuperar con un mensaje o una promo.</p></div></div>
      <div class="seg">${SEG.map(s => { const r = g[s.id] || { n: 0, rec: 0, v: 0 }; return `<div class="s"><div class="t"><i style="background:${s.color}"></i>${s.nombre}</div><b class="num">${C.n(r.n)}</b><small>${s.desc}<br>${C.n(r.rec)} compraron más de una vez · ${C.compacto(r.v)} en total</small></div>`; }).join('')}</div>`;
  }

  function pintarZonas(enP) {
    const z = {}; for (const y of enP) { const r = z[y.x.zona || ''] ||= { n: 0, ped: 0, v: 0 }; r.n++; r.ped += y.peds.length; r.v += y.peds.reduce((a, q) => a + q.v, 0); }
    const filas = Object.entries(z).sort((a, b) => b[1].n - a[1].n).slice(0, 14), max = filas[0]?.[1].n || 1;
    $('#zonas').innerHTML = `<h2 style="margin:0 0 4px;font:500 19px var(--f-titulo);color:var(--violeta)">Dónde están</h2><p class="ayuda">Clientas que compraron en el período, por zona.</p>
      <div class="barras-h">${filas.map(([k, r]) => `<div class="fila"><div class="lbl">${C.esc(zonaNom(k))}</div><div class="pista"><i style="width:${r.n / max * 100}%"></i></div><div class="val"><b>${C.n(r.n)}</b><span class="sub">${C.n(r.ped)} pedidos · ${C.plata(r.v / (r.ped || 1))} promedio</span></div></div>`).join('')}</div>`;
  }

  function pintarVuelta() {
    const segunda = Object.values(H).filter(x => x.n > 1).map(x => dias(x.peds[0].f, x.peds[1].f));
    const tramos = [['En el mismo mes', 0, 30], ['1 a 3 meses', 31, 90], ['3 a 6 meses', 91, 182], ['6 meses a 1 año', 183, 365], ['Más de un año', 366, 1e6]];
    const c = tramos.map(([t, a, b]) => [t, segunda.filter(d => d >= a && d <= b).length]), max = Math.max(...c.map(x => x[1]), 1);
    const viejas = Object.values(H).filter(x => dias(x.primera, HASTA) >= 365), volvieron = viejas.filter(x => x.n > 1).length;
    $('#vuelta').innerHTML = `<h2 style="margin:0 0 4px;font:500 19px var(--f-titulo);color:var(--violeta)">¿Vuelven?</h2><p class="ayuda">De las clientas que compraron por primera vez hace más de un año, <b>${C.pct(volvieron / (viejas.length || 1))}</b> volvió a comprar. Cuánto tardaron en volver:</p>
      <div class="barras-h">${c.map(([t, n]) => `<div class="fila"><div class="lbl">${t}</div><div class="pista"><i style="width:${n / max * 100}%;background:var(--violeta)"></i></div><div class="val"><b>${C.n(n)}</b><span class="sub">${C.pct(n / (segunda.length || 1))}</span></div></div>`).join('')}</div>`;
  }

  function pintarTop(enP) {
    const q = S.buscar.trim().toLowerCase();
    let filas = enP.map(y => ({ x: y.x, ped: y.peds.length, v: y.peds.reduce((a, b) => a + b.v, 0) }));
    if (q) filas = filas.filter(f => (nombre(f.x.cid) + ' ' + zonaNom(f.x.zona)).toLowerCase().includes(q));
    filas.sort((a, b) => b.v - a.v);
    $('#top').innerHTML = `<div class="cab"><div><h2>Las que más compraron</h2><p class="ayuda">En el período elegido. "Historia" = todas sus compras desde que es clienta.</p></div><input class="buscar" id="buscar-cl" placeholder="Buscar clienta o zona" value="${C.esc(S.buscar)}"></div>
      <div class="tabla-scroll"><table class="t"><thead><tr><th>Clienta</th><th>Zona</th><th class="n">Pedidos</th><th class="n">Compró</th><th class="n">Historia</th><th class="n">Clienta desde</th><th class="n">Última compra</th><th>Estado</th></tr></thead><tbody>
      ${filas.slice(0, 40).map(f => { const s = segDe(f.x); return `<tr><td class="nombre">${C.esc(nombre(f.x.cid))}</td><td>${C.esc(zonaNom(f.x.zona))}</td><td class="n">${C.n(f.ped)}</td><td class="n">${C.plata(f.v)}</td>
        <td class="n">${C.n(f.x.n)} · ${C.compacto(f.x.total)}</td><td class="n">${C.fecha(f.x.primera)}</td><td class="n">${C.fecha(f.x.ultima)}</td><td><span style="display:inline-flex;align-items:center;gap:6px;font:600 12.5px var(--f-ui)"><i style="width:8px;height:8px;border-radius:50%;background:${s.color}"></i>${s.nombre.replace(/s$/, '')}</span></td></tr>`; }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--tinta-3);padding:20px">Sin resultados.</td></tr>'}</tbody></table></div>
      <p class="pie-nota">Una clienta = una cuenta de Tienda Nube (o un email). Si compró como invitada con otro email, cuenta como otra clienta.</p>`;
  }

  raiz.addEventListener('click', e => { const b = e.target.closest('[data-preset]'); if (b) { S.preset = b.dataset.preset; guardar(); pintar(); } });
  raiz.addEventListener('input', e => { if (e.target.id !== 'buscar-cl') return; S.buscar = e.target.value; const pos = e.target.selectionStart; const p = PRESETS.find(x => x.id === S.preset) || PRESETS[1];
    pintarTop(Object.values(H).map(x => ({ x, peds: x.peds.filter(q => q.f >= p.d1 && q.f <= p.d2) })).filter(y => y.peds.length)); const n = $('#buscar-cl'); n.focus(); n.setSelectionRange(pos, pos); });
  pintar();
  let espera; addEventListener('resize', () => { clearTimeout(espera); espera = setTimeout(pintar, 150); });
})();
