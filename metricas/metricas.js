// Augusta Core · Métricas
// Todo se calcula en el navegador sobre el paquete de core_dataset(): ventas por día·canal·familia, tickets por día·canal,
// productos y talles por mes·canal, compras por mes·familia, formas de pago por mes, stock de la última copia e IPC.
(async function () {
  if (!(await CORE.listo)) return;
  const C = CORE, $ = s => document.querySelector(s), raiz = $('#contenido');
  let D;
  try { D = await C.datos(); } catch (e) { raiz.innerHTML = `<div class="aviso">No pude traer los datos: ${C.esc(e.message)}</div>`; return; }

  // ---------- constantes ----------
  const CANALES = [
    { id: 'Local', color: 'var(--c-local)' }, { id: 'Tienda Nube', color: 'var(--c-tn)' }, { id: 'Mercado Libre', color: 'var(--c-ml)' },
    { id: 'WhatsApp y redes', color: 'var(--c-wsp)' }, { id: 'Clientas con ficha', color: 'var(--c-cli)' }];
  const colorCanal = Object.fromEntries(CANALES.map(c => [c.id, c.color]));
  const famNombre = c => { const n = D.familias?.[c]; return n ? n.charAt(0) + n.slice(1).toLowerCase() : (c ? 'Familia ' + c : 'Sin familia'); };
  const artNombre = c => D.articulos?.[c] || c;
  const HASTA = D.hasta, DESDE0 = D.dias[0][0];
  const mesesIpc = Object.keys(D.ipc).sort(), mesBase = mesesIpc[mesesIpc.length - 1], ipcBase = D.ipc[mesBase];
  const def = m => ipcBase / (D.ipc[m] || ipcBase);   // a pesos del último IPC publicado

  // ---------- estado ----------
  const guardado = (() => { try { return JSON.parse(localStorage.getItem('core_metricas') || '{}'); } catch { return {}; } })();
  const S = Object.assign({ preset: 'anio', desde: null, hasta: null, apagados: [], real: true, mesMetrica: 'venta', prodOrden: 'venta', prodTodos: false, prodBuscar: '', famTalle: null, famCompra: '' }, guardado, { prodTodos: false, prodBuscar: '' });
  const guardar = () => { try { localStorage.setItem('core_metricas', JSON.stringify({ preset: S.preset, desde: S.desde, hasta: S.hasta, apagados: S.apagados, real: S.real, mesMetrica: S.mesMetrica, prodOrden: S.prodOrden, famTalle: S.famTalle, famCompra: S.famCompra })); } catch {} };

  // ---------- fechas ----------
  const dmas = (f, dias) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); };
  const anioMenos = f => { const y = +f.slice(0, 4) - 1, md = f.slice(5); return md === '02-29' ? `${y}-02-28` : `${y}-${md}`; };
  const finMes = m => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7), 0); return `${m}-${String(d.getDate()).padStart(2, '0')}`; };
  const meses = (d1, d2) => { const out = []; let m = d1.slice(0, 7); while (m <= d2.slice(0, 7)) { out.push(m); const y = +m.slice(0, 4), mm = +m.slice(5, 7); m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`; } return out; };
  const anios = [...new Set(D.dias.map(d => d[0].slice(0, 4)))].sort();
  const PRESETS = [
    { id: 'anio', label: `${HASTA.slice(0, 4)} hasta hoy`, d1: `${HASTA.slice(0, 4)}-01-01`, d2: HASTA },
    { id: '12m', label: 'Últimos 12 meses', d1: dmas(anioMenos(HASTA), 1), d2: HASTA },
    ...anios.filter(y => y < HASTA.slice(0, 4) && y > '2022').reverse().map(y => ({ id: y, label: y, d1: `${y}-01-01`, d2: `${y}-12-31` })),
    { id: 'todo', label: 'Todo', d1: DESDE0, d2: HASTA }];
  function periodo() {
    const p = PRESETS.find(p => p.id === S.preset);
    let d1 = p ? p.d1 : (S.desde || PRESETS[0].d1), d2 = p ? p.d2 : (S.hasta || HASTA);
    if (d1 < DESDE0) d1 = DESDE0; if (d2 > HASTA) d2 = HASTA;
    return { d1, d2, p1: anioMenos(d1), p2: anioMenos(d2) };
  }
  const textoPeriodo = (d1, d2) => `${C.fecha(d1)} al ${C.fecha(d2)}`;

  // ---------- agregados ----------
  const activo = canal => !S.apagados.includes(canal);
  const val = (v, m) => S.real ? v * def(m) : v;
  function sumar(d1, d2) {
    const t = { u: 0, v: 0, c: 0, vc: 0, n: 0, vt: 0, porCanal: {}, porFam: {}, porMes: {}, filas: 0 };
    for (const [f, canal, fam, u, v, c, vc] of D.dias) {
      if (f < d1 || f > d2 || !activo(canal)) continue;
      const m = f.slice(0, 7), k = S.real ? def(m) : 1;
      t.u += u; t.v += v * k; t.c += c * k; t.vc += vc * k; t.filas++;
      const pc = t.porCanal[canal] ||= { u: 0, v: 0 }; pc.u += u; pc.v += v * k;
      const pf = t.porFam[fam] ||= { u: 0, v: 0, c: 0, vc: 0 }; pf.u += u; pf.v += v * k; pf.c += c * k; pf.vc += vc * k;
      const pm = (t.porMes[m] ||= {}); const pmc = pm[canal] ||= { u: 0, v: 0 }; pmc.u += u; pmc.v += v * k;
    }
    for (const [f, canal, n, v] of D.tickets) { if (f < d1 || f > d2 || !activo(canal)) continue; t.n += n; t.vt += val(v, f.slice(0, 7)); }
    return t;
  }

  // ---------- piezas visuales ----------
  const tip = $('#tip');
  function mostrarTip(html, e) {
    tip.innerHTML = html; tip.style.display = 'block';
    const r = tip.getBoundingClientRect(); let x = e.clientX + 16, y = e.clientY + 14;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 16; if (y + r.height > innerHeight - 8) y = innerHeight - r.height - 8;
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
  }
  const ocultarTip = () => { tip.style.display = 'none'; };
  function delta(a, b, { puntos = false, invertir = false } = {}) {
    if (puntos) { if (a == null || b == null || !isFinite(a) || !isFinite(b)) return '<span class="delta igual">sin comparación</span>';
      const d = (a - b) * 100; const cls = Math.abs(d) < 0.5 ? 'igual' : (d > 0) !== invertir ? 'sube' : 'baja';
      return `<span class="delta ${cls}">${d > 0 ? '▲' : d < 0 ? '▼' : ''} ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(Math.abs(d))} pts</span>`; }
    const x = C.variacion(a, b); if (x == null) return '<span class="delta igual">sin comparación</span>';
    const cls = Math.abs(x) < 0.005 ? 'igual' : (x > 0) !== invertir ? 'sube' : 'baja';
    return `<span class="delta ${cls}">${x > 0 ? '▲' : x < 0 ? '▼' : ''} ${C.pct(Math.abs(x))}</span>`;
  }
  function escalaLinda(max) {
    if (max <= 0) return { tope: 1, paso: 1 };
    const crudo = max / 4, pot = Math.pow(10, Math.floor(Math.log10(crudo))), n = crudo / pot;
    const paso = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pot;
    return { tope: Math.ceil(max / paso) * paso, paso };
  }
  const etiquetaEje = (x, plata) => plata ? C.compacto(x).replace(' mil', 'k') : C.n(x);

  // ---------- estructura de la página ----------
  raiz.innerHTML = `
    <div class="filtros" id="filtros"></div>
    <div class="nota-datos" id="nota"></div>
    <div class="grilla g-kpi" id="kpis"></div>
    <div class="grilla" style="margin-top:18px"><section class="tarjeta" id="mesames"></section></div>
    <div class="grilla" style="margin-top:18px"><section class="tarjeta" id="estacional"></section></div>
    <div class="grilla g-2" style="margin-top:18px"><section class="tarjeta" id="canales"></section><section class="tarjeta" id="pagos"></section></div>
    <div class="grilla" style="margin-top:18px"><section class="tarjeta" id="familias"></section></div>
    <div class="grilla" style="margin-top:18px"><section class="tarjeta" id="productos"></section></div>
    <div class="grilla g-2" style="margin-top:18px"><section class="tarjeta" id="talles"></section><section class="tarjeta" id="stock"></section></div>
    <div class="grilla" style="margin-top:18px"><section class="tarjeta" id="compras"></section></div>`;

  function pintarFiltros() {
    const { d1, d2 } = periodo();
    const ms = meses(DESDE0, HASTA);
    $('#filtros').innerHTML = `
      <div class="grupo"><span>Período</span>${PRESETS.map(p => `<button class="chip ${S.preset === p.id ? 'activo' : ''}" data-preset="${p.id}">${p.label}</button>`).join('')}
        <select id="sel-desde" aria-label="Desde">${ms.map(m => `<option value="${m}" ${m === d1.slice(0, 7) ? 'selected' : ''}>${C.mesCorto(m)}</option>`).join('')}</select>
        <span style="margin:0">a</span>
        <select id="sel-hasta" aria-label="Hasta">${ms.map(m => `<option value="${m}" ${m === d2.slice(0, 7) ? 'selected' : ''}>${C.mesCorto(m)}</option>`).join('')}</select></div>
      <div class="grupo"><span>Canales</span>${CANALES.map(c => `<button class="chip ${activo(c.id) ? '' : 'apagado'}" data-canal="${c.id}" aria-pressed="${activo(c.id)}"><i class="pt" style="background:${c.color}"></i>${c.id}</button>`).join('')}</div>
      <div class="grupo"><span>Pesos</span><button class="chip ${S.real ? 'activo' : ''}" data-real="1">De hoy</button><button class="chip ${S.real ? '' : 'activo'}" data-real="0">De cada momento</button></div>`;
  }
  $('#filtros').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.preset) { S.preset = b.dataset.preset; }
    if (b.dataset.canal) { const c = b.dataset.canal; S.apagados = activo(c) ? [...S.apagados, c] : S.apagados.filter(x => x !== c); if (S.apagados.length === CANALES.length) S.apagados = []; }
    if (b.dataset.real) S.real = b.dataset.real === '1';
    guardar(); todo();
  });
  $('#filtros').addEventListener('change', e => {
    if (e.target.id !== 'sel-desde' && e.target.id !== 'sel-hasta') return;
    let a = $('#sel-desde').value, b = $('#sel-hasta').value; if (a > b) [a, b] = [b, a];
    S.preset = 'propio'; S.desde = a + '-01'; S.hasta = finMes(b); guardar(); todo();
  });

  // ---------- 1 · cifras principales ----------
  function pintarKpis(A, B, d1, d2) {
    const tp = A.n ? A.vt / A.n : null, tpB = B.n ? B.vt / B.n : null;
    const pp = A.u ? A.v / A.u : null, ppB = B.u ? B.v / B.u : null;
    const mg = A.vc ? 1 - A.c / A.vc : null, mgB = B.vc ? 1 - B.c / B.vc : null;
    const cobertura = A.v ? A.vc / A.v : 0;
    const comp = B.filas ? `contra ${textoPeriodo(anioMenos(d1), anioMenos(d2))}` : 'sin datos del año anterior para comparar';
    $('#kpis').innerHTML = `
      <div class="tarjeta hero" style="grid-row: span 2">
        <div class="et">Venta de prendas · ${textoPeriodo(d1, d2)}</div>
        <div class="valor num">${C.compacto(A.v)}</div>
        <div>${delta(A.v, B.filas ? B.v : null)} <span class="det" style="margin-left:6px">${comp}</span></div>
        <div class="det" style="margin-top:18px">${S.real ? `En pesos de ${C.MESES[+mesBase.slice(5, 7) - 1]} ${mesBase.slice(0, 4)} (IPC del INDEC): así se puede comparar con años de mucha inflación.` : 'En pesos de cada momento, sin ajustar por inflación.'}
          No incluye envíos, señas ni gift cards.</div>
      </div>
      ${kpi('Prendas vendidas', C.n(A.u) + ' u.', delta(A.u, B.filas ? B.u : null), B.filas ? `antes ${C.n(B.u)} u.` : '')}
      ${kpi('Tickets', C.n(A.n), delta(A.n, B.filas ? B.n : null), 'ventas con al menos una prenda')}
      ${kpi('Ticket promedio', tp == null ? '—' : C.plata(tp), delta(tp, tpB), tpB ? `antes ${C.plata(tpB)}` : '')}
      ${kpi('Precio promedio por prenda', pp == null ? '—' : C.plata(pp), delta(pp, ppB), ppB ? `antes ${C.plata(ppB)}` : '')}
      ${kpi('Ganancia bruta', C.compacto(A.vc - A.c), delta(A.vc - A.c, B.filas ? B.vc - B.c : null), 'venta − costo de la prenda')}
      ${kpi('Margen bruto', C.pct(mg, 1), delta(mg, mgB, { puntos: true }), `sobre el ${C.pct(cobertura)} de la venta que tiene costo cargado`)}`;
  }
  const kpi = (et, v, d, det) => `<div class="tarjeta kpi"><div class="et">${et}</div><div class="valor num">${v}</div><div>${d}</div><div class="det" style="margin-top:6px">${det}</div></div>`;

  // ---------- 2 · mes a mes (columnas apiladas por canal) ----------
  function pintarMesAMes(A, d1, d2) {
    const el = $('#mesames'), ms = meses(d1, d2), plata = S.mesMetrica === 'venta';
    const canales = CANALES.filter(c => activo(c.id));
    const totalMes = m => canales.reduce((s, c) => s + (A.porMes[m]?.[c.id]?.[plata ? 'v' : 'u'] || 0), 0);
    const max = Math.max(...ms.map(totalMes), 0), { tope, paso } = escalaLinda(max);
    el.innerHTML = `<div class="cab"><div><h2>Mes a mes</h2><p class="ayuda">${plata ? 'Venta de prendas' : 'Prendas vendidas'} por canal. ${ms.length && HASTA.slice(0, 7) === ms[ms.length - 1] ? `El último mes va hasta el ${+HASTA.slice(8)}.` : ''}</p></div>
      <div class="ops"><button class="chip ${plata ? 'activo' : ''}" data-m="venta">Venta</button><button class="chip ${plata ? '' : 'activo'}" data-m="unidades">Unidades</button><button class="chip" data-tabla>Ver tabla</button></div></div>
      <div class="leyenda">${canales.map(c => `<span><i style="background:${c.color}"></i>${c.id}</span>`).join('')}</div>
      <div class="cont-graf"></div><div class="cont-tabla" hidden></div>`;
    const W = Math.max(320, el.querySelector('.cont-graf').clientWidth), H = 280, izq = 58, abajo = 26, arriba = 10;
    const ancho = (W - izq) / Math.max(ms.length, 1), barra = Math.min(24, ancho * 0.62), y = v => arriba + (H - arriba - abajo) * (1 - v / tope);
    let s = `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="Columnas por mes">`;
    for (let v = 0; v <= tope + 1e-9; v += paso) s += `<line class="${v === 0 ? 'base' : 'eje'}" x1="${izq}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${izq - 8}" y="${y(v) + 4}" text-anchor="end">${etiquetaEje(v, plata)}</text>`;
    const cadaTanto = Math.ceil(ms.length / Math.max(1, Math.floor((W - izq) / 52)));
    ms.forEach((m, i) => {
      const x = izq + i * ancho + (ancho - barra) / 2; let acum = 0;
      const segs = canales.map(c => ({ c, v: A.porMes[m]?.[c.id]?.[plata ? 'v' : 'u'] || 0 })).filter(z => z.v > 0);
      segs.forEach((z, j) => {
        const y1 = y(acum + z.v), y0 = y(acum); acum += z.v;
        const h = Math.max(0, y0 - y1 - (j < segs.length - 1 ? 2 : 0));   // 2px de aire entre segmentos
        const ultimo = j === segs.length - 1, r = ultimo ? Math.min(4, h, barra / 2) : 0;
        s += ultimo ? `<path d="M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + barra - r} Q${x + barra},${y1} ${x + barra},${y1 + r} V${y0} Z" fill="${z.c.color}"/>`
                    : `<rect x="${x}" y="${y0 - h}" width="${barra}" height="${h}" fill="${z.c.color}"/>`;
      });
      s += `<rect x="${izq + i * ancho}" y="${arriba}" width="${ancho}" height="${H - arriba - abajo}" fill="transparent" data-mes="${m}"/>`;
      if (i % cadaTanto === 0) s += `<text x="${izq + i * ancho + ancho / 2}" y="${H - 6}" text-anchor="middle">${C.mesCorto(m)}</text>`;
    });
    el.querySelector('.cont-graf').innerHTML = s + '</svg>';
    el.querySelector('svg').addEventListener('mousemove', e => {
      const m = e.target.dataset?.mes; if (!m) return ocultarTip();
      const filas = canales.map(c => ({ c, v: A.porMes[m]?.[c.id]?.[plata ? 'v' : 'u'] || 0 })).filter(z => z.v);
      const tot = filas.reduce((a, z) => a + z.v, 0);
      mostrarTip(`<b>${C.mesCorto(m)}</b>${filas.map(z => `<div class="f"><span><i style="background:${z.c.color}"></i>${z.c.id}</span><span class="tab">${plata ? C.plata(z.v) : C.n(z.v) + ' u.'} · ${C.pct(z.v / tot)}</span></div>`).join('')}<div class="f tot"><span>Total</span><span class="tab">${plata ? C.plata(tot) : C.n(tot) + ' u.'}</span></div>`, e);
    });
    el.querySelector('svg').addEventListener('mouseleave', ocultarTip);
    el.querySelector('.cont-tabla').innerHTML = `<div class="tabla-scroll"><table class="t"><thead><tr><th>Mes</th>${canales.map(c => `<th class="n">${c.id}</th>`).join('')}<th class="n">Total</th></tr></thead><tbody>${ms.map(m => `<tr><td>${C.mesCorto(m)}</td>${canales.map(c => `<td class="n">${fmtM(A.porMes[m]?.[c.id]?.[plata ? 'v' : 'u'] || 0, plata)}</td>`).join('')}<td class="n"><b>${fmtM(totalMes(m), plata)}</b></td></tr>`).join('')}</tbody></table></div>`;
    el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { S.mesMetrica = b.dataset.m; guardar(); pintarMesAMes(A, d1, d2); });
    el.querySelector('[data-tabla]').onclick = ev => { const t = el.querySelector('.cont-tabla'); t.hidden = !t.hidden; ev.target.textContent = t.hidden ? 'Ver tabla' : 'Ocultar tabla'; };
  }
  const fmtM = (v, plata) => plata ? C.plata(v) : C.n(v);

  // ---------- 3 · cada año, mes por mes (estacionalidad) ----------
  function pintarEstacional() {
    const el = $('#estacional'), ys = anios.filter(y => y > '2022');
    const serie = {}; for (const y of ys) serie[y] = Array(12).fill(null);
    for (const [f, canal, , , v] of D.dias) { const y = f.slice(0, 4); if (!serie[y] || !activo(canal)) continue; const i = +f.slice(5, 7) - 1; serie[y][i] = (serie[y][i] || 0) + val(v, f.slice(0, 7)); }
    const ultimoMes = +HASTA.slice(5, 7) - 1, yAct = HASTA.slice(0, 4);
    const tonos = ['var(--a-1)', 'var(--a-2)', 'var(--a-3)', 'var(--a-4)'], color = y => tonos[Math.max(0, tonos.length - (ys.length - ys.indexOf(y)))];
    const max = Math.max(...ys.flatMap(y => serie[y].filter(v => v != null)), 0), { tope, paso } = escalaLinda(max);
    el.innerHTML = `<div class="cab"><div><h2>Cada año, mes por mes</h2><p class="ayuda">La forma del año: qué meses venden y cómo viene ${yAct} contra los anteriores (${S.real ? 'pesos de hoy' : 'pesos de cada momento'}).</p></div><div class="ops"><button class="chip" data-tabla>Ver tabla</button></div></div>
      <div class="leyenda">${ys.map(y => `<span><i class="linea" style="background:${color(y)}"></i>${y}${y === yAct ? ` (al ${+HASTA.slice(8)}/${+HASTA.slice(5, 7)})` : ''}</span>`).join('')}</div><div class="cont-graf"></div><div class="cont-tabla" hidden></div>`;
    const W = Math.max(320, el.querySelector('.cont-graf').clientWidth), H = 280, izq = 58, der = 54, abajo = 26, arriba = 12;
    const x = i => izq + (W - izq - der) * i / 11, y = v => arriba + (H - arriba - abajo) * (1 - v / tope);
    let s = `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="Líneas por año">`;
    for (let v = 0; v <= tope + 1e-9; v += paso) s += `<line class="${v === 0 ? 'base' : 'eje'}" x1="${izq}" x2="${W - der}" y1="${y(v)}" y2="${y(v)}"/><text x="${izq - 8}" y="${y(v) + 4}" text-anchor="end">${etiquetaEje(v, true)}</text>`;
    C.MESES.forEach((m, i) => s += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${m}</text>`);
    s += `<line id="cruz" class="eje" x1="0" x2="0" y1="${arriba}" y2="${H - abajo}" style="display:none;stroke:#C9BFD3"/>`;
    const etiquetas = [];
    for (const y0 of ys) {
      const pts = serie[y0].map((v, i) => v == null || (y0 === yAct && i > ultimoMes) ? null : [x(i), y(v)]).filter(Boolean);
      if (!pts.length) continue;
      const act = y0 === yAct;
      s += `<path d="M${pts.map(p => p.join(',')).join(' L')}" fill="none" stroke="${color(y0)}" stroke-width="${act ? 2.5 : 2}" stroke-linejoin="round" stroke-linecap="round"/>`;
      const [lx, ly] = pts[pts.length - 1];
      s += `<circle cx="${lx}" cy="${ly}" r="4.5" fill="${color(y0)}" stroke="#fff" stroke-width="2"/>`;
      etiquetas.push({ y0, lx, ly, act });
    }
    // el año en curso siempre lleva etiqueta; los demás solo si no chocan con otra (si no, leyenda + tooltip)
    const puestas = [];
    for (const e of etiquetas.sort((a, b) => b.act - a.act)) {
      if (!e.act && puestas.some(p => Math.abs(p.lx - e.lx) < 40 && Math.abs(p.ly - e.ly) < 14)) continue;
      puestas.push(e); s += `<text x="${e.lx + 9}" y="${e.ly + 4}" style="font-weight:700;fill:var(--tinta)">${e.y0}</text>`;
    }
    s += `<rect x="${izq - 10}" y="${arriba}" width="${W - izq - der + 20}" height="${H - arriba - abajo}" fill="transparent" id="zona"/>`;
    el.querySelector('.cont-graf').innerHTML = s + '</svg>';
    const svg = el.querySelector('svg'), cruz = svg.querySelector('#cruz');
    svg.addEventListener('mousemove', e => {
      const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * (W / r.width);
      const i = Math.max(0, Math.min(11, Math.round((px - izq) / ((W - izq - der) / 11))));
      cruz.setAttribute('x1', x(i)); cruz.setAttribute('x2', x(i)); cruz.style.display = '';
      mostrarTip(`<b>${C.MESES[i]}</b>${ys.slice().reverse().map(y0 => { const v = serie[y0][i]; const ok = v != null && !(y0 === yAct && i > ultimoMes);
        return `<div class="f"><span><i style="background:${color(y0)}"></i>${y0}${y0 === yAct && i === ultimoMes ? ' (parcial)' : ''}</span><span class="tab">${ok ? C.plata(v) : '—'}</span></div>`; }).join('')}`, e);
    });
    svg.addEventListener('mouseleave', () => { cruz.style.display = 'none'; ocultarTip(); });
    el.querySelector('.cont-tabla').innerHTML = `<div class="tabla-scroll"><table class="t"><thead><tr><th>Mes</th>${ys.map(y0 => `<th class="n">${y0}</th>`).join('')}</tr></thead><tbody>${C.MESES.map((m, i) => `<tr><td>${m}</td>${ys.map(y0 => `<td class="n">${serie[y0][i] == null || (y0 === yAct && i > ultimoMes) ? '—' : C.plata(serie[y0][i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    el.querySelector('[data-tabla]').onclick = ev => { const t = el.querySelector('.cont-tabla'); t.hidden = !t.hidden; ev.target.textContent = t.hidden ? 'Ver tabla' : 'Ocultar tabla'; };
  }

  // ---------- 4 · canales y formas de pago ----------
  function pintarCanales(A, B) {
    const tot = Object.values(A.porCanal).reduce((s, x) => s + x.v, 0), max = Math.max(...Object.values(A.porCanal).map(x => x.v), 1);
    const filas = CANALES.filter(c => activo(c.id) && (A.porCanal[c.id] || B.porCanal[c.id]));
    $('#canales').innerHTML = `<h2>Por canal</h2><p class="ayuda">Cuánto vendió cada canal en el período y cómo cambió contra el año anterior.</p>
      <div class="barras-h">${filas.map(c => { const a = A.porCanal[c.id] || { v: 0, u: 0 }, b = B.porCanal[c.id];
        return `<div class="fila"><div class="lbl"><i style="background:${c.color}"></i>${c.id}</div><div class="pista"><i style="width:${a.v / max * 100}%;background:${c.color}"></i></div>
        <div class="val tab"><b>${C.compacto(a.v)}</b><span class="sub">${C.pct(a.v / (tot || 1))} · ${C.n(a.u)} u.</span> ${B.filas ? delta(a.v, b ? b.v : 0) : ''}</div></div>`; }).join('') || '<div class="vacio">Sin ventas en el período.</div>'}</div>
      <p class="pie-nota">Tienda Nube = pedidos web; WhatsApp y redes = ventas online cobradas por transferencia o efectivo; Mercado Libre se reconoce por la forma de pago.</p>`;
  }
  function grupoPago(n) {
    const s = (n || '').toLowerCase();
    if (s.includes('mercado libre')) return 'Mercado Libre';
    if (s.includes('pago nube') || s.includes('tienda nube')) return 'Pago Nube';
    if (s.includes('transferencia')) return 'Transferencia';
    if (s.includes('efectivo')) return 'Efectivo';
    if (s.includes('débito') || s.includes('debito') || s.includes('1 cuota')) return 'Débito o 1 pago';
    if (/cuota|naranja|go cuotas|plan z|nave|posnet/.test(s)) return 'Tarjeta en cuotas';
    if (s.includes('sin cargo')) return 'Sin cargo';
    return 'Otras';
  }
  function pintarPagos(d1, d2) {
    const m1 = d1.slice(0, 7), m2 = d2.slice(0, 7), g = {};
    for (const [m, n, v] of D.pagos) { if (m < m1 || m > m2) continue; const k = grupoPago(n); g[k] = (g[k] || 0) + val(v, m); }
    const filas = Object.entries(g).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]), tot = filas.reduce((s, [, v]) => s + v, 0), max = filas[0]?.[1] || 1;
    $('#pagos').innerHTML = `<h2>Cómo pagan</h2><p class="ayuda">Total cobrado por forma de pago (todas las ventas, incluye envíos), meses de ${C.mesCorto(m1)} a ${C.mesCorto(m2)}.</p>
      <div class="barras-h">${filas.map(([k, v]) => `<div class="fila"><div class="lbl">${k}</div><div class="pista"><i style="width:${v / max * 100}%;background:var(--lavanda)"></i></div><div class="val tab"><b>${C.pct(v / tot)}</b><span class="sub">${C.compacto(v)}</span></div></div>`).join('') || '<div class="vacio">Sin datos.</div>'}</div>`;
  }

  // ---------- 5 · familias ----------
  function pintarFamilias(A, B) {
    const tot = Object.values(A.porFam).reduce((s, x) => s + x.v, 0);
    const filas = Object.entries(A.porFam).filter(([, x]) => x.v > 0 || x.u > 0).sort((a, b) => b[1].v - a[1].v);
    const max = filas[0]?.[1].v || 1;
    $('#familias').innerHTML = `<div class="cab"><div><h2>Por familia</h2><p class="ayuda">Qué tipo de prenda sostiene la venta y con qué margen.</p></div></div>
      <div class="tabla-scroll"><table class="t"><thead><tr><th>Familia</th><th></th><th class="n">Venta</th><th class="n">Del total</th><th class="n">Unidades</th><th class="n">Precio prom.</th><th class="n">Margen</th><th class="n">Contra año ant.</th></tr></thead><tbody>
      ${filas.map(([f, x]) => { const b = B.porFam[f]; return `<tr><td class="nombre">${C.esc(famNombre(f))}</td><td style="width:18%"><div class="barrita"><i style="width:${x.v / max * 100}%"></i></div></td>
        <td class="n">${C.plata(x.v)}</td><td class="n">${C.pct(x.v / (tot || 1))}</td><td class="n">${C.n(x.u)}</td><td class="n">${x.u ? C.plata(x.v / x.u) : '—'}</td>
        <td class="n">${x.vc ? C.pct(1 - x.c / x.vc) : '—'}</td><td class="n">${B.filas ? delta(x.v, b ? b.v : 0) : '—'}</td></tr>`; }).join('')}</tbody></table></div>`;
  }

  // ---------- 6 · productos ----------
  function pintarProductos(d1, d2) {
    const m1 = d1.slice(0, 7), m2 = d2.slice(0, 7), p = {};
    for (const [m, canal, cod, fam, u, v, c, vc] of D.productos) {
      if (m < m1 || m > m2 || !activo(canal)) continue; const k = S.real ? def(m) : 1;
      const x = p[cod] ||= { cod, fam, u: 0, v: 0, c: 0, vc: 0 }; x.u += u; x.v += v * k; x.c += c * k; x.vc += vc * k;
    }
    let filas = Object.values(p).filter(x => x.u > 0 || x.v > 0);
    const q = S.prodBuscar.trim().toLowerCase();
    if (q) filas = filas.filter(x => q.split(/\s+/).every(w => (artNombre(x.cod) + ' ' + x.cod + ' ' + famNombre(x.fam)).toLowerCase().includes(w)));
    filas.sort((a, b) => S.prodOrden === 'unidades' ? b.u - a.u || b.v - a.v : b.v - a.v);
    const tot = Object.values(p).reduce((s, x) => s + x.v, 0), vistos = S.prodTodos ? filas : filas.slice(0, 20);
    const el = $('#productos');
    el.innerHTML = `<div class="cab"><div><h2>Productos</h2><p class="ayuda">Ranking del período (meses de ${C.mesCorto(m1)} a ${C.mesCorto(m2)}). ${filas.length} productos con venta.</p></div>
      <div class="ops"><input class="buscar" id="buscar-prod" placeholder="Buscar producto o código" value="${C.esc(S.prodBuscar)}"><button class="chip ${S.prodOrden === 'venta' ? 'activo' : ''}" data-o="venta">Por venta</button><button class="chip ${S.prodOrden === 'unidades' ? 'activo' : ''}" data-o="unidades">Por unidades</button></div></div>
      <div class="tabla-scroll"><table class="t"><thead><tr><th>#</th><th>Producto</th><th>Familia</th><th class="n">Unidades</th><th class="n">Venta</th><th class="n">Del total</th><th class="n">Margen</th><th class="n">Última venta</th></tr></thead><tbody>
      ${vistos.map((x, i) => `<tr><td class="sub">${i + 1}</td><td><div class="nombre">${C.esc(artNombre(x.cod))}</div><div class="sub">${C.esc(x.cod)}</div></td><td>${C.esc(famNombre(x.fam))}</td>
        <td class="n">${C.n(x.u)}</td><td class="n">${C.plata(x.v)}</td><td class="n">${C.pct(x.v / (tot || 1), 1)}</td><td class="n">${x.vc ? C.pct(1 - x.c / x.vc) : '—'}</td><td class="n">${C.fecha(D.ultima_venta?.[x.cod])}</td></tr>`).join('') || `<tr><td colspan="8" class="vacio">Sin resultados.</td></tr>`}</tbody></table></div>
      ${filas.length > 20 ? `<button class="chip ver-mas" id="ver-todos">${S.prodTodos ? 'Ver solo los 20 primeros' : `Ver los ${filas.length}`}</button>` : ''}
      <p class="pie-nota">FactuSOL reusó algunos códigos para productos distintos con los años: el nombre que se muestra es el último que tuvo ese código.</p>`;
    el.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { S.prodOrden = b.dataset.o; guardar(); pintarProductos(d1, d2); });
    const vt = el.querySelector('#ver-todos'); if (vt) vt.onclick = () => { S.prodTodos = !S.prodTodos; pintarProductos(d1, d2); };
    const bus = el.querySelector('#buscar-prod');
    bus.oninput = () => { S.prodBuscar = bus.value; const pos = bus.selectionStart; pintarProductos(d1, d2); const nb = $('#buscar-prod'); nb.focus(); nb.setSelectionRange(pos, pos); };
  }

  // ---------- 7 · talles ----------
  const ordenTalle = t => { const s = t.toUpperCase().replace(/\s*\(.*\)/, '').trim(); const L = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'];
    if (L.includes(s)) return 100 + L.indexOf(s); const n = parseFloat(s); if (!isNaN(n)) return 200 + n; if (/^(U|ÚNICO|UNICO)/.test(s)) return 1000; return 900; };
  function pintarTalles(d1, d2) {
    const m1 = d1.slice(0, 7), m2 = d2.slice(0, 7), porFam = {};
    for (const [m, canal, fam, talle, u] of D.talles) { if (m < m1 || m > m2 || !activo(canal)) continue; const f = porFam[fam] ||= {}; f[talle] = (f[talle] || 0) + u; }
    const fams = Object.entries(porFam).map(([f, t]) => [f, Object.values(t).reduce((a, b) => a + b, 0)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    if (!fams.find(([f]) => f === S.famTalle)) S.famTalle = fams[0]?.[0] || null;
    const t = porFam[S.famTalle] || {}, filas = Object.entries(t).filter(([, u]) => u > 0).sort((a, b) => ordenTalle(a[0]) - ordenTalle(b[0]) || a[0].localeCompare(b[0]));
    const tot = filas.reduce((s, [, u]) => s + u, 0), max = Math.max(...filas.map(([, u]) => u), 1);
    const el = $('#talles');
    el.innerHTML = `<div class="cab"><div><h2>Talles</h2><p class="ayuda">Qué talles se venden en cada familia: sirve para armar la curva de compra.</p></div>
      <select id="sel-fam" class="chip" aria-label="Familia">${fams.map(([f, n]) => `<option value="${f}" ${f === S.famTalle ? 'selected' : ''}>${C.esc(famNombre(f))} (${C.n(n)} u.)</option>`).join('')}</select></div>
      <div class="barras-h">${filas.map(([k, u]) => `<div class="fila"><div class="lbl">${C.esc(k)}</div><div class="pista"><i style="width:${u / max * 100}%;background:var(--violeta)"></i></div><div class="val tab"><b>${C.pct(u / tot)}</b><span class="sub">${C.n(u)} u.</span></div></div>`).join('') || '<div class="vacio">Esta familia no tiene talles cargados en el período.</div>'}</div>`;
    el.querySelector('#sel-fam')?.addEventListener('change', e => { S.famTalle = e.target.value; guardar(); pintarTalles(d1, d2); });
  }

  // ---------- 8 · stock (foto de FactuSOL) ----------
  function pintarStock() {
    const vivo = D.stock_fuente === 'percha', corte = dmas(D.stock_fecha || HASTA, -90);
    const filas = D.stock.map(([cod, fam, u, costo]) => ({ cod, fam, u, costo, ult: D.ultima_venta?.[cod] || null }));
    const totU = filas.reduce((s, x) => s + x.u, 0), totV = filas.reduce((s, x) => s + x.costo, 0);
    const parado = filas.filter(x => !x.ult || x.ult < corte).sort((a, b) => b.costo - a.costo);
    const pU = parado.reduce((s, x) => s + x.u, 0), pV = parado.reduce((s, x) => s + x.costo, 0);
    $('#stock').innerHTML = `<h2>Stock parado</h2><p class="ayuda">${vivo ? `Stock de hoy en Percha (${C.fecha(D.stock_fecha)})` : `Foto del stock de FactuSOL al ${C.fecha(D.stock_fecha || HASTA)}`}, a costo. "Parado" = sin ventas en los últimos 90 días.</p>
      <div class="kpis-chicos" style="margin-bottom:14px">
        <div><div class="et" style="font:600 12.5px var(--f-ui);color:var(--tinta-2)">Stock total</div><div class="num" style="font-size:24px;margin-top:6px">${C.compacto(totV)}</div><div class="sub" style="font-size:12.5px;color:var(--tinta-3)">${C.n(totU)} u.</div></div>
        <div><div class="et" style="font:600 12.5px var(--f-ui);color:var(--tinta-2)">Parado</div><div class="num" style="font-size:24px;margin-top:6px">${C.compacto(pV)}</div><div class="sub" style="font-size:12.5px;color:var(--tinta-3)">${C.n(pU)} u. · ${C.pct(pV / (totV || 1))} del valor</div></div>
        <div><div class="et" style="font:600 12.5px var(--f-ui);color:var(--tinta-2)">Productos parados</div><div class="num" style="font-size:24px;margin-top:6px">${C.n(parado.length)}</div><div class="sub" style="font-size:12.5px;color:var(--tinta-3)">de ${C.n(filas.length)} con stock</div></div></div>
      <div class="tabla-scroll"><table class="t"><thead><tr><th>Lo que más plata tiene parada</th><th class="n">Unid.</th><th class="n">A costo</th><th class="n">Última venta</th></tr></thead><tbody>
      ${parado.slice(0, 8).map(x => `<tr><td><div class="nombre">${C.esc(artNombre(x.cod))}</div><div class="sub">${C.esc(famNombre(x.fam))}</div></td><td class="n">${C.n(x.u)}</td><td class="n">${C.plata(x.costo)}</td><td class="n">${x.ult ? C.fecha(x.ult) : 'nunca'}</td></tr>`).join('')}</tbody></table></div>
      <p class="pie-nota">${vivo ? 'Sin kits (su stock es el de sus componentes); las bolsas genéricas como BOMBIS VARIAS sí cuentan.' : 'El stock vivo se lleva en Percha desde el 23/10/2026; esta foto sirve para ver lo que venía acumulado.'}</p>`;
  }

  // ---------- 9 · compras contra ventas ----------
  function pintarCompras() {
    const el = $('#compras'), ys = anios.filter(y => y > '2022');
    const fams = [...new Set(D.compras.map(c => c[1]))].sort();
    const comp = {}, vend = {};
    for (const [m, fam, u, costo] of D.compras) { if (S.famCompra && fam !== S.famCompra) continue; const y = m.slice(0, 4); const x = comp[y] ||= { u: 0, c: 0 }; x.u += u; x.c += val(costo, m); }
    for (const [f, , fam, u, , c] of D.dias) { if (S.famCompra && fam !== S.famCompra) continue; const y = f.slice(0, 4); const x = vend[y] ||= { u: 0, c: 0 }; x.u += u; x.c += val(c, f.slice(0, 7)); }
    const series = [{ id: 'Compradas', color: 'var(--a-2)', g: y => comp[y]?.u || 0 }, { id: 'Vendidas', color: 'var(--violeta)', g: y => vend[y]?.u || 0 }];
    const max = Math.max(...ys.flatMap(y => series.map(s => s.g(y))), 0), { tope, paso } = escalaLinda(max);
    el.innerHTML = `<div class="cab"><div><h2>Compras contra ventas</h2><p class="ayuda">Prendas que entraron de proveedores y prendas que se vendieron, por año (todos los canales). Si se compra mucho más de lo que se vende, se acumula stock.</p></div>
      <select id="sel-fam-c" class="chip" aria-label="Familia"><option value="">Todas las familias</option>${fams.map(f => `<option value="${f}" ${f === S.famCompra ? 'selected' : ''}>${C.esc(famNombre(f))}</option>`).join('')}</select></div>
      <div class="leyenda">${series.map(s => `<span><i style="background:${s.color}"></i>${s.id}</span>`).join('')}</div><div class="cont-graf"></div>
      <div class="tabla-scroll" style="margin-top:10px"><table class="t"><thead><tr><th>Año</th><th class="n">Compradas</th><th class="n">Vendidas</th><th class="n">Vendidas / compradas</th><th class="n">Costo de lo comprado</th><th class="n">Costo de lo vendido</th></tr></thead><tbody>
      ${ys.map(y => `<tr><td>${y}${y === HASTA.slice(0, 4) ? ` (al ${+HASTA.slice(8)}/${+HASTA.slice(5, 7)})` : ''}</td><td class="n">${C.n(comp[y]?.u)}</td><td class="n">${C.n(vend[y]?.u)}</td><td class="n">${comp[y]?.u ? C.pct((vend[y]?.u || 0) / comp[y].u) : '—'}</td><td class="n">${C.plata(comp[y]?.c)}</td><td class="n">${C.plata(vend[y]?.c)}</td></tr>`).join('')}</tbody></table></div>
      <p class="pie-nota">Hay compras que FactuSOL no tiene (mercadería que entró sin cargarse como compra), por eso algunos años venden más de lo que figura comprado.</p>`;
    const W = Math.max(320, el.querySelector('.cont-graf').clientWidth), H = 220, izq = 58, abajo = 26, arriba = 10;
    const grupo = (W - izq) / ys.length, barra = Math.min(24, grupo / 4), y = v => arriba + (H - arriba - abajo) * (1 - v / tope);
    let s = `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="Compradas y vendidas por año">`;
    for (let v = 0; v <= tope + 1e-9; v += paso) s += `<line class="${v === 0 ? 'base' : 'eje'}" x1="${izq}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${izq - 8}" y="${y(v) + 4}" text-anchor="end">${C.n(v)}</text>`;
    ys.forEach((y0, i) => {
      const cx = izq + i * grupo + grupo / 2;
      series.forEach((se, j) => { const v = se.g(y0); if (!v) return; const x0 = cx - barra - 1 + j * (barra + 2), y1 = y(v), y00 = y(0), r = Math.min(4, (y00 - y1) / 2, barra / 2);
        s += `<path d="M${x0},${y00} V${y1 + r} Q${x0},${y1} ${x0 + r},${y1} H${x0 + barra - r} Q${x0 + barra},${y1} ${x0 + barra},${y1 + r} V${y00} Z" fill="${se.color}"><title>${se.id} ${y0}: ${C.n(v)} u.</title></path>`;
      });
      s += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${y0}</text>`;
    });
    el.querySelector('.cont-graf').innerHTML = s + '</svg>';
    el.querySelector('#sel-fam-c').onchange = e => { S.famCompra = e.target.value; guardar(); pintarCompras(); };
  }

  // ---------- todo junto ----------
  function todo() {
    const { d1, d2, p1, p2 } = periodo();
    pintarFiltros();
    $('#nota').textContent = `Ventas del ${C.fecha(DESDE0)} al ${C.fecha(HASTA)}: FactuSOL hasta el 22 oct 2026 y Percha desde el 23${D.fuente === 'csv' ? ' · vista local armada desde los CSV' : ''} · ${S.real ? `pesos de ${C.MESES[+mesBase.slice(5, 7) - 1]} ${mesBase.slice(0, 4)} según IPC del INDEC` : 'pesos de cada momento'}.`;
    const A = sumar(d1, d2), B = sumar(p1, p2);
    pintarKpis(A, B, d1, d2); pintarMesAMes(A, d1, d2); pintarEstacional(); pintarCanales(A, B); pintarPagos(d1, d2);
    pintarFamilias(A, B); pintarProductos(d1, d2); pintarTalles(d1, d2); pintarStock(); pintarCompras();
  }
  todo();
  let espera; addEventListener('resize', () => { clearTimeout(espera); espera = setTimeout(todo, 150); });
})();
