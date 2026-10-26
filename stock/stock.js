// Augusta Core · Stock y compras
// core_compras(): compras (FactuSOL + Percha), stock de hoy por variante (Percha) y ventas de 90 días por talle·color.
// core_dataset(): ventas por mes y producto (para rotación y para cuánto se vendió de lo comprado).
(async function () {
  if (!(await CORE.listo)) return;
  const C = CORE, $ = s => document.querySelector(s), raiz = $('#contenido');
  let K, D;
  try { [K, D] = await Promise.all([C.compras(), C.datos()]); } catch (e) { raiz.innerHTML = `<div class="aviso">No pude traer los datos: ${C.esc(e.message)}</div>`; return; }

  const HASTA = K.hasta, MH = HASTA.slice(0, 7), alias = D.alias || {}, actual = c => alias[c] || c;
  const mesesIpc = Object.keys(K.ipc).sort(), mesBase = mesesIpc[mesesIpc.length - 1], ipcBase = K.ipc[mesBase];
  const def = m => ipcBase / (K.ipc[m] || ipcBase);
  const famNombre = c => { const n = D.familias?.[c]; return n ? n.charAt(0) + n.slice(1).toLowerCase() : (c ? 'Familia ' + c : 'Sin familia'); };
  const nombre = c => D.articulos?.[c] || c;
  const mesMenos = (m, n) => { let y = +m.slice(0, 4), mm = +m.slice(5, 7) - n; while (mm < 1) { mm += 12; y--; } while (mm > 12) { mm -= 12; y++; } return `${y}-${String(mm).padStart(2, '0')}`; };
  const sinAcento = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const nt = t => { const s = sinAcento(t).replace(/\s*\(.*\)\s*/, '').trim().toUpperCase(); return /^(U|UNICO|UNICA|TALLE UNICO)$/.test(s) ? '' : s; };
  const nc = c => { const s = sinAcento(c).trim().toLowerCase(); return s === 'sin color' ? '' : s; };
  const ordenTalle = t => { const s = nt(t), L = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL']; if (L.includes(s)) return 100 + L.indexOf(s); const n = parseFloat(s); if (!isNaN(n)) return 200 + n; return s ? 900 : 1000; };
  const guardado = (() => { try { return JSON.parse(localStorage.getItem('core_stock') || '{}'); } catch { return {}; } })();
  const S = Object.assign({ cobertura: 45, fam: '', ventana: '12m', buscarProv: '' }, guardado, { buscarProv: '' });
  const guardar = () => { try { localStorage.setItem('core_stock', JSON.stringify({ cobertura: S.cobertura, fam: S.fam, ventana: S.ventana })); } catch {} };

  // ---------- bases ----------
  const genericos = new Set(K.stock.filter(s => s[6]).map(s => s[0]));
  const esGenerico = c => genericos.has(c) || /VARIAS|VARIOS/i.test(nombre(c));
  const stockProd = {}, stockVar = {};
  for (const [cod, fam, t, c, st, costo] of K.stock) {
    const p = stockProd[cod] ||= { cod, fam, u: 0, costo: 0 }; if (st > 0) { p.u += st; p.costo += st * costo; }
    const k = `${cod}|${nt(t)}|${nc(c)}`; const v = stockVar[k] ||= { cod, fam, t, c, st: 0, costo }; v.st += st; if (t) v.t = t; if (c) v.c = c;
  }
  // última compra de cada producto: proveedor y costo
  const ultCompra = {}, provPrincipal = {};
  { const porProv = {};
    for (const [f, prov, cod0, , , , u, costo] of K.compras) { const cod = actual(cod0); if (!ultCompra[cod] || f >= ultCompra[cod].f) ultCompra[cod] = { f, prov, costo };
      const k = cod + '|' + prov; porProv[k] = (porProv[k] || 0) + u; }
    for (const [k, u] of Object.entries(porProv)) { const [cod, prov] = k.split('|'); if (!provPrincipal[cod] || u > provPrincipal[cod].u) provPrincipal[cod] = { prov, u }; } }
  const ultima = {}; for (const [c, f] of Object.entries(D.ultima_venta || {})) { const k = actual(c); if (!ultima[k] || f > ultima[k]) ultima[k] = f; }
  // costo de lo vendido por mes (pesos de hoy) y por familia, desde el paquete de Métricas
  const vendidoMes = {}, vendidoFam12 = {}, m12 = mesMenos(MH, 11);
  for (const [f, , fam, u, v, c, vc] of D.dias) { const m = f.slice(0, 7), k = def(m), costoEst = vc > 0 ? c / vc * v : v * 0.4;   // sin costo cargado: 40% de la venta
    vendidoMes[m] = (vendidoMes[m] || 0) + costoEst * k; if (m >= m12) vendidoFam12[fam] = (vendidoFam12[fam] || 0) + costoEst * k; }

  raiz.innerHTML = `<div class="grilla g-4" id="kpis"></div>
    <div class="grilla"><section class="tarjeta" id="repo"></section></div>
    <div class="grilla g-2"><section class="tarjeta" id="familias"></section><section class="tarjeta" id="edad"></section></div>
    <div class="grilla"><section class="tarjeta" id="compras"></section></div>
    <div class="grilla"><section class="tarjeta" id="provs"></section></div>`;

  // ---------- 1 · cifras ----------
  function pintarKpis() {
    const stockCosto = Object.values(stockProd).reduce((s, p) => s + p.costo, 0), stockU = Object.values(stockProd).reduce((s, p) => s + p.u, 0);
    const vend12 = Object.entries(vendidoMes).filter(([m]) => m >= m12).reduce((s, [, v]) => s + v, 0);
    const comp12 = K.compras.filter(c => c[0].slice(0, 7) >= m12).reduce((s, c) => s + c[6] * c[7] * def(c[0].slice(0, 7)), 0);
    const rota = stockCosto ? vend12 / stockCosto : null, corte = (() => { const d = new Date(HASTA + 'T12:00:00'); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10); })();
    const parado = Object.values(stockProd).filter(p => !ultima[p.cod] || ultima[p.cod] < corte).reduce((s, p) => s + p.costo, 0);
    const dif = vend12 ? comp12 / vend12 - 1 : null;
    $('#kpis').innerHTML = `
      <div class="tarjeta kpi destacado"><div class="et">Plata en mercadería hoy</div><div class="valor num">${C.compacto(stockCosto)}</div><div class="det">${C.n(stockU)} prendas a costo · stock de Percha</div></div>
      <div class="tarjeta kpi"><div class="et">Rotación</div><div class="valor num">${rota == null ? '—' : new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(rota) + ' veces'}</div><div class="det">por año · el stock de hoy alcanza para ${rota ? C.n(365 / rota) : '—'} días al ritmo de los últimos 12 meses</div></div>
      <div class="tarjeta kpi"><div class="et">Compras de los últimos 12 meses</div><div class="valor num">${C.compacto(comp12)}</div><div class="det">${dif == null ? '' : `${dif >= 0 ? C.pct(dif) + ' más' : C.pct(-dif) + ' menos'} que el costo de lo vendido (${C.compacto(vend12)})`}</div></div>
      <div class="tarjeta kpi"><div class="et">Parada hace más de 3 meses</div><div class="valor num">${C.compacto(parado)}</div><div class="det">${C.pct(parado / (stockCosto || 1))} del stock a costo, sin ventas en 90 días</div></div>`;
  }

  // ---------- 2 · reposición sugerida ----------
  let sugeridas = [];
  function pintarRepo() {
    const vend = {}; for (const [cod0, t, c, u] of K.ventas90) { const cod = actual(cod0); if (esGenerico(cod)) continue; const k = `${cod}|${nt(t)}|${nc(c)}`; const x = vend[k] ||= { cod, t, c, u: 0 }; x.u += u; }
    const filas = [];
    for (const [k, x] of Object.entries(vend)) {
      if (x.u < 2) continue;                                    // una sola venta en 90 días no alcanza para reponer
      const sv = stockVar[k], st = Math.max(0, sv?.st || 0), fam = sv?.fam || stockProd[x.cod]?.fam || provFam(x.cod);
      if (S.fam && fam !== S.fam) continue;
      const necesita = Math.ceil(x.u / 90 * S.cobertura - st);
      if (necesita <= 0) continue;
      const uc = ultCompra[x.cod], costo = uc?.costo || sv?.costo || 0;
      filas.push({ cod: x.cod, fam, t: sv?.t || x.t || '', c: sv?.c || x.c || '', v90: x.u, st, sug: necesita, costo, prov: provPrincipal[x.cod]?.prov || uc?.prov || 'Sin compras registradas', ult: uc?.f });
    }
    sugeridas = filas;
    const porProv = {}; for (const f of filas) (porProv[f.prov] ||= []).push(f);
    const provs = Object.entries(porProv).map(([p, l]) => ({ p, l: l.sort((a, b) => nombre(a.cod).localeCompare(nombre(b.cod)) || ordenTalle(a.t) - ordenTalle(b.t)), u: l.reduce((s, f) => s + f.sug, 0), $: l.reduce((s, f) => s + f.sug * f.costo, 0) }))
      .sort((a, b) => (a.p.startsWith('Sin ') - b.p.startsWith('Sin ')) || b.$ - a.$);
    const totU = filas.reduce((s, f) => s + f.sug, 0), tot$ = filas.reduce((s, f) => s + f.sug * f.costo, 0);
    const fams = [...new Set(K.stock.map(s => s[1]).concat(Object.values(stockProd).map(p => p.fam)))].filter(f => f && f !== '99').sort((a, b) => famNombre(a).localeCompare(famNombre(b)));
    $('#repo').innerHTML = `<div class="cab"><div><h2>Qué reponer</h2><p class="ayuda">Talle por talle y color por color: lo que se vendió en los últimos 90 días, cuánto queda y cuánto pedir para tener stock para <b>${S.cobertura} días</b>. Sugerido: <b>${C.n(totU)} prendas</b> por unos <b>${C.compacto(tot$)}</b> a último costo.</p></div>
      <div class="ops"><span>Cubrir</span>${[30, 45, 60, 90].map(d => `<button class="chip ${S.cobertura === d ? 'activo' : ''}" data-cob="${d}">${d} días</button>`).join('')}
        <select id="sel-fam"><option value="">Todas las familias</option>${fams.map(f => `<option value="${f}" ${f === S.fam ? 'selected' : ''}>${C.esc(famNombre(f))}</option>`).join('')}</select>
        <button class="chip" id="csv" ${filas.length ? '' : 'disabled'}>Bajar para el pedido (CSV)</button></div></div>
      ${filas.length ? `<div class="tabla-scroll"><table class="t"><thead><tr><th>Producto</th><th>Talle</th><th>Color</th><th class="n">Vendidas 90 días</th><th class="n">Stock hoy</th><th class="n">Pedir</th><th class="n">Costo est.</th></tr></thead><tbody>
      ${provs.map(g => `<tr class="prov-fila"><td colspan="5">${C.esc(g.p)} <span class="sub">· ${g.l.length} talle·color</span></td><td class="n">${C.n(g.u)}</td><td class="n">${g.$ ? C.plata(g.$) : '—'}</td></tr>
        ${g.l.map(f => `<tr><td><div class="nombre">${C.esc(nombre(f.cod))}</div><div class="sub">${C.esc(f.cod)} · ${C.esc(famNombre(f.fam))}</div></td><td>${C.esc(f.t || 'Único')}</td><td>${C.esc(f.c || '—')}</td>
          <td class="n">${C.n(f.v90)}</td><td class="n">${C.n(f.st)}</td><td class="n"><span class="sug">${C.n(f.sug)}</span></td><td class="n">${f.costo ? C.plata(f.sug * f.costo) : '—'}</td></tr>`).join('')}`).join('')}</tbody></table></div>`
      : '<div class="vacio">Con esta cobertura no hace falta reponer nada.</div>'}
      <p class="pie-nota">Se agrupa por el proveedor al que más se le compró ese producto. No entran las bolsas genéricas (BOMBIS VARIAS, MEDIAS VARIAS) ni lo que se vendió una sola vez en 90 días. Es una sugerencia: si una prenda es de temporada que termina, conviene pedir menos.</p>`;
  }
  const provFam = cod => { for (const [, , c0, fam] of K.compras) if (actual(c0) === cod) return fam; return ''; };

  // ---------- 3 · stock por familia ----------
  function pintarFamilias() {
    const g = {}; for (const p of Object.values(stockProd)) { const x = g[p.fam] ||= { u: 0, costo: 0 }; x.u += p.u; x.costo += p.costo; }
    const tot = Object.values(g).reduce((s, x) => s + x.costo, 0);
    const filas = Object.entries(g).filter(([, x]) => x.costo > 0).sort((a, b) => b[1].costo - a[1].costo), max = filas[0]?.[1].costo || 1;
    $('#familias').innerHTML = `<h2 style="margin:0 0 4px;font:500 19px var(--f-titulo);color:var(--violeta)">Stock por familia</h2><p class="ayuda">Plata en mercadería y cuántas veces por año rota cada familia (costo de lo vendido en 12 meses ÷ stock a costo).</p>
      <div class="tabla-scroll"><table class="t"><thead><tr><th>Familia</th><th></th><th class="n">A costo</th><th class="n">Prendas</th><th class="n">Rota</th><th class="n">Alcanza</th></tr></thead><tbody>
      ${filas.map(([f, x]) => { const r = x.costo ? (vendidoFam12[f] || 0) / x.costo : 0; return `<tr><td class="nombre">${C.esc(famNombre(f))}</td><td style="width:20%"><div class="barrita"><i style="width:${x.costo / max * 100}%"></i></div></td>
        <td class="n">${C.plata(x.costo)} <span class="sub">${C.pct(x.costo / tot)}</span></td><td class="n">${C.n(x.u)}</td><td class="n">${r ? new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(r) + '×' : '—'}</td><td class="n">${r ? (365 / r > 730 ? '+2 años' : C.n(365 / r) + ' días') : 'sin ventas'}</td></tr>`; }).join('')}</tbody></table></div>`;
  }

  // ---------- 4 · antigüedad ----------
  function pintarEdad() {
    const tramos = [['Vendió en los últimos 30 días', 0, 30], ['31 a 90 días', 31, 90], ['3 a 6 meses', 91, 182], ['6 meses a 1 año', 183, 365], ['Más de un año', 366, 1e9], ['Nunca se vendió', null, null]];
    const hoy = new Date(HASTA + 'T12:00:00'), b = tramos.map(t => ({ t: t[0], u: 0, costo: 0, n: 0 }));
    for (const p of Object.values(stockProd)) { if (p.costo <= 0 && p.u <= 0) continue; const f = ultima[p.cod]; let i;
      if (!f) i = 5; else { const d = (hoy - new Date(f + 'T12:00:00')) / 864e5; i = tramos.findIndex(t => t[1] != null && d >= t[1] && d <= t[2]); if (i < 0) i = 0; }
      b[i].u += p.u; b[i].costo += p.costo; b[i].n++; }
    const tot = b.reduce((s, x) => s + x.costo, 0), max = Math.max(...b.map(x => x.costo), 1);
    const tonos = ['var(--a-1)', 'var(--a-2)', 'var(--a-2)', 'var(--a-3)', 'var(--a-4)', 'var(--a-4)'];
    $('#edad').innerHTML = `<h2 style="margin:0 0 4px;font:500 19px var(--f-titulo);color:var(--violeta)">¿Hace cuánto que no se vende?</h2><p class="ayuda">Stock de hoy a costo, según la última venta del producto. Más oscuro = más tiempo quieto.</p>
      <div class="barras-h">${b.map((x, i) => `<div class="fila"><div class="lbl">${x.t}</div><div class="pista"><i style="width:${x.costo / max * 100}%;background:${tonos[i]}"></i></div><div class="val"><b>${C.compacto(x.costo)}</b><span class="sub">${C.pct(x.costo / (tot || 1))} · ${C.n(x.n)} productos</span></div></div>`).join('')}</div>
      <p class="pie-nota">"Nunca se vendió": productos con stock que no tienen ninguna venta registrada desde dic-2022 (muchos son de Tienda Nube con código nuevo).</p>`;
  }

  // ---------- 5 · compras contra vendido, mes a mes ----------
  function pintarCompras() {
    const desde = S.ventana === 'todo' ? '2022-12' : mesMenos(MH, { '3m': 2, '24m': 23 }[S.ventana] ?? 11), ms = [];
    for (let m = desde; m <= MH; m = mesMenos(m, -1)) ms.push(m);
    const comp = {}; for (const [f, , , , , , u, costo] of K.compras) { const m = f.slice(0, 7); comp[m] = (comp[m] || 0) + u * costo * def(m); }
    const max = Math.max(...ms.map(m => Math.max(comp[m] || 0, vendidoMes[m] || 0)), 1), { tope, paso } = C.escala(max);
    const el = $('#compras');
    el.innerHTML = `<div class="cab"><div><h2>Compras contra lo que se vendió</h2><p class="ayuda">Mes a mes, en pesos de hoy: lo que se le compró a proveedores (columnas) y el costo de las prendas que se vendieron (línea). Si las columnas pasan la línea mucho tiempo, se acumula stock.</p></div>
      <div class="ops">${[['3m', '3 meses'], ['12m', '12 meses'], ['24m', '24 meses'], ['todo', 'Todo']].map(([k, t]) => `<button class="chip ${S.ventana === k ? 'activo' : ''}" data-ventana="${k}">${t}</button>`).join('')}</div></div>
      <div class="leyenda"><span><i style="background:var(--a-2)"></i>Compras</span><span><i style="background:var(--violeta);height:3px;width:16px;vertical-align:3px"></i>Costo de lo vendido</span></div><div id="g-comp"></div>`;
    const g = $('#g-comp'), W = Math.max(300, g.clientWidth), H = 240, izq = 58, abajo = 24, arriba = 10, ancho = (W - izq) / ms.length, barra = Math.min(24, ancho * .6);
    const y = v => arriba + (H - arriba - abajo) * (1 - v / tope), cx = i => izq + i * ancho + ancho / 2;
    let s = `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="Compras y costo de lo vendido por mes">`;
    for (let v = 0; v <= tope + 1e-9; v += paso) s += `<line class="${v ? 'eje' : 'base'}" x1="${izq}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${izq - 8}" y="${y(v) + 4}" text-anchor="end">${C.compacto(v).replace(' mil', 'k')}</text>`;
    const cada = Math.ceil(ms.length / Math.max(1, Math.floor((W - izq) / 52)));
    ms.forEach((m, i) => { const v = comp[m] || 0; if (v > 0) { const x = cx(i) - barra / 2, y1 = y(v), y0 = y(0), r = Math.min(4, (y0 - y1) / 2, barra / 2);
      s += `<path d="M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + barra - r} Q${x + barra},${y1} ${x + barra},${y1 + r} V${y0} Z" fill="var(--a-2)"/>`; }
      if (i % cada === 0) s += `<text x="${cx(i)}" y="${H - 6}" text-anchor="middle">${C.mesCorto(m)}</text>`; });
    s += `<path d="M${ms.map((m, i) => `${cx(i)},${y(vendidoMes[m] || 0)}`).join(' L')}" fill="none" stroke="var(--violeta)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    ms.forEach((m, i) => s += `<rect x="${izq + i * ancho}" y="${arriba}" width="${ancho}" height="${H - arriba - abajo}" fill="transparent" data-mes="${m}"/>`);
    g.innerHTML = s + '</svg>';
    const svg = g.querySelector('svg');
    svg.addEventListener('mousemove', e => { const m = e.target.dataset?.mes; if (!m) return C.tipFuera();
      const provs = {}; for (const [f, p, , , , , u, costo] of K.compras) if (f.slice(0, 7) === m) provs[p] = (provs[p] || 0) + u * costo * def(m);
      const top = Object.entries(provs).sort((a, b) => b[1] - a[1]).slice(0, 4);
      C.tip(`<b>${C.mesCorto(m)}</b><div class="f"><span><i style="background:var(--a-2)"></i>Compras</span><span>${C.plata(comp[m] || 0)}</span></div><div class="f"><span><i style="background:var(--violeta)"></i>Costo de lo vendido</span><span>${C.plata(vendidoMes[m] || 0)}</span></div>${top.length ? `<div class="tot">${top.map(([p, v]) => `<div class="f"><span>${C.esc(p)}</span><span>${C.compacto(v)}</span></div>`).join('')}</div>` : ''}`, e); });
    svg.addEventListener('mouseleave', C.tipFuera);
  }

  // ---------- 6 · proveedores ----------
  function pintarProvs() {
    const desde = S.ventana === 'todo' ? '0000' : mesMenos(MH, { '3m': 2, '24m': 23 }[S.ventana] ?? 11);
    const P = {};
    for (const [f, prov, cod0, , , , u, costo] of K.compras) { if (f.slice(0, 7) < desde) continue; const cod = actual(cod0);
      const x = P[prov] ||= { prov, u: 0, $: 0, fechas: new Set(), prods: {}, ult: '' }; x.u += u; x.$ += u * costo * def(f.slice(0, 7)); x.fechas.add(f); if (f > x.ult) x.ult = f;
      const pr = x.prods[cod] ||= { u: 0, desde: f.slice(0, 7) }; pr.u += u; if (f.slice(0, 7) < pr.desde) pr.desde = f.slice(0, 7); }
    // vendidas de lo comprado: ventas de cada producto desde su primera compra a ese proveedor (en el período), y margen de esas ventas
    const ventasProd = {}; for (const [m, , cod0, , u, v, c, vc] of D.productos) { const cod = actual(cod0); (ventasProd[cod] ||= []).push([m, u, v, c, vc]); }
    const filas = Object.values(P).map(x => { let vu = 0, v = 0, c = 0, vc = 0;
      for (const [cod, pr] of Object.entries(x.prods)) { if (provPrincipal[cod]?.prov !== x.prov) continue; for (const [m, u, vv, cc, vvc] of ventasProd[cod] || []) if (m >= pr.desde) { vu += u; v += vv; c += cc; vc += vvc; } }
      const compPrincipal = Object.entries(x.prods).filter(([cod]) => provPrincipal[cod]?.prov === x.prov).reduce((s, [, pr]) => s + pr.u, 0);
      return Object.assign(x, { vu, st: compPrincipal ? vu / compPrincipal : null, mg: vc ? 1 - c / vc : null, nprods: Object.keys(x.prods).length }); });
    const q = S.buscarProv.trim().toLowerCase();
    const vis = filas.filter(x => !q || x.prov.toLowerCase().includes(q)).sort((a, b) => b.$ - a.$);
    const max = vis[0]?.$ || 1;
    $('#provs').innerHTML = `<div class="cab"><div><h2>Proveedores</h2><p class="ayuda">${S.ventana === 'todo' ? 'Desde dic-2022' : `Últimos ${{ '3m': 3, '24m': 24 }[S.ventana] ?? 12} meses`}, en pesos de hoy. "Se vendió" = prendas vendidas de sus productos desde que se las compramos, sobre lo comprado.</p></div>
      <div class="ops"><input class="buscar" id="buscar-prov" placeholder="Buscar proveedor" value="${C.esc(S.buscarProv)}"></div></div>
      <div class="tabla-scroll"><table class="t"><thead><tr><th>Proveedor</th><th></th><th class="n">Comprado</th><th class="n">Prendas</th><th class="n">Compras</th><th class="n">Productos</th><th class="n">Se vendió</th><th class="n">Margen</th><th class="n">Última compra</th></tr></thead><tbody>
      ${vis.map(x => `<tr><td class="nombre">${C.esc(x.prov)}</td><td style="width:14%"><div class="barrita"><i style="width:${x.$ / max * 100}%"></i></div></td><td class="n">${C.plata(x.$)}</td><td class="n">${C.n(x.u)}</td><td class="n">${x.fechas.size}</td><td class="n">${x.nprods}</td>
        <td class="n">${x.st == null ? '—' : C.pct(x.st)}</td><td class="n">${x.mg == null ? '—' : C.pct(x.mg)}</td><td class="n">${C.fecha(x.ult)}</td></tr>`).join('') || '<tr><td colspan="9" class="vacio">Sin compras en el período.</td></tr>'}</tbody></table></div>
      <p class="pie-nota">FactuSOL no tiene todas las compras (hay mercadería que entró sin cargarse), así que "Se vendió" puede pasar del 100%. Un producto comprado a varios proveedores se le asigna al que más unidades le vendió.</p>`;
  }

  // ---------- eventos ----------
  raiz.addEventListener('click', e => {
    const b = e.target.closest('[data-cob]'); if (b) { S.cobertura = +b.dataset.cob; guardar(); return pintarRepo(); }
    const v = e.target.closest('[data-ventana]'); if (v) { S.ventana = v.dataset.ventana; guardar(); pintarCompras(); return pintarProvs(); }
    if (e.target.id === 'csv') bajarCsv();
  });
  raiz.addEventListener('change', e => { if (e.target.id === 'sel-fam') { S.fam = e.target.value; guardar(); pintarRepo(); } });
  raiz.addEventListener('input', e => { if (e.target.id !== 'buscar-prov') return; S.buscarProv = e.target.value; const pos = e.target.selectionStart; pintarProvs(); const n = $('#buscar-prov'); n.focus(); n.setSelectionRange(pos, pos); });
  function bajarCsv() {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const filas = [['Proveedor', 'Código', 'Producto', 'Familia', 'Talle', 'Color', 'Vendidas 90 días', 'Stock hoy', 'Pedir', 'Último costo', 'Costo estimado'].map(q).join(';')]
      .concat(sugeridas.slice().sort((a, b) => a.prov.localeCompare(b.prov) || nombre(a.cod).localeCompare(nombre(b.cod)) || ordenTalle(a.t) - ordenTalle(b.t))
        .map(f => [f.prov, f.cod, nombre(f.cod), famNombre(f.fam), f.t || 'Único', f.c || '', f.v90, f.st, f.sug, Math.round(f.costo), Math.round(f.sug * f.costo)].map(q).join(';')));
    const blob = new Blob(['﻿' + filas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `reposicion-augusta-${HASTA}-${S.cobertura}dias.csv` });
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function todo() { pintarKpis(); pintarRepo(); pintarFamilias(); pintarEdad(); pintarCompras(); pintarProvs(); }
  todo();
  let espera; addEventListener('resize', () => { clearTimeout(espera); espera = setTimeout(pintarCompras, 150); });
})();
