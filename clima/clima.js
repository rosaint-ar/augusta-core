// Augusta Core · Clima y temporadas
// core_clima_paquete(): zonas (temperatura de la semana, pronóstico de 16 días, normales por mes, clientas y pedidos),
// ventas de cada producto por franja de temperatura (aprendido de ventas con lugar) y ventas web por zona y mes.
// core_dataset(): stock de hoy, nombres, ventas por mes (para "lo que se viene" y el ritmo de venta).
(async function () {
  if (!(await CORE.listo)) return;
  const C = CORE, $ = s => document.querySelector(s), raiz = $('#contenido');
  let P, D;
  try { [P, D] = await Promise.all([C.clima(), C.datos()]); } catch (e) { raiz.innerHTML = `<div class="aviso">No pude traer los datos: ${C.esc(e.message)}</div>`; return; }

  const HOY = P.hoy, MES = +HOY.slice(5, 7), alias = D.alias || {}, actual = c => alias[c] || c;
  const famNombre = c => { const n = D.familias?.[c]; return n ? n.charAt(0) + n.slice(1).toLowerCase() : (c ? 'Familia ' + c : 'Sin familia'); };
  const nombre = c => D.articulos?.[c] || c;
  const MESES = C.MESES, MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const mesMas = n => ((MES - 1 + n) % 12) + 1;
  const Z = Object.fromEntries(P.zonas.map(z => [z.id, z]));
  const normal = (z, m) => (z.normal || []).find(x => x[0] === m)?.[1] ?? null;
  // franjas: <12 frío · 12-17 fresco · 17-22 templado · 22+ calor
  const banda = t => t == null ? null : t < 12 ? 'frio' : t < 17 ? 'fresco' : t < 22 ? 'templado' : 'calor';
  const NOMBRE_BANDA = { frio: 'Frío', fresco: 'Fresco', templado: 'Templado', calor: 'Calor' };
  const chipT = b => b ? `<span class="temporada t-${b}">${NOMBRE_BANDA[b]}</span>` : '';
  const fmtT = t => t == null ? '—' : new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(t) + ' °C';
  // color de temperatura: azul (frío) · gris (17 °C) · rojo (calor)
  const colorT = t => { if (t == null) return '#f6f4f8'; const k = Math.max(-1, Math.min(1, (t - 17) / 13)), N = [240, 239, 236], F = [42, 120, 214], H = [227, 73, 72];
    const c = k < 0 ? N.map((v, i) => Math.round(v + (F[i] - v) * -k)) : N.map((v, i) => Math.round(v + (H[i] - v) * k)); return `rgb(${c.join(',')})`; };
  const tintaT = t => t != null && Math.abs(t - 17) > 8 ? '#fff' : 'var(--tinta)';
  // temperatura "de las próximas semanas" de una zona: pronóstico de 16 días, si no, la normal del mes
  const tAhora = z => z.t_pronostico ?? z.t_semana ?? normal(z, MES);

  // ---------- clima de cada producto ----------
  const [bF, bFr, bTe, bCa, bMed] = P.base, bTot = bF + bFr + bTe + bCa, bFrio = (bF + bFr) / bTot, bCalor = (bTe + bCa) / bTot;
  const PALABRAS_FRIO = /POLAR|PLUSH|CORDERITO|ALASKA|PANTUF|T[ÉE]RMIC|MANGA LARGA|MAXIBUZO|BATA|BUZO|PANTAL[ÓO]N|LANA|INVIERNO|WINTER|POLERA|SWEATER|CAMPERA|MEDIAS? T[ÉE]RMIC/i;
  const PALABRAS_CALOR = /BIKINI|MALLA|ENTERIZA|TRAJE DE BA[ÑN]O|KENDALL|PAREO|LONA|SHORT|MANGA CORTA|S\/ ?MANGAS|SIN MANGA|TIRITAS|MUSCULOSA|CHUNAS|CHANCLA|OJOTA|SANDALIA|VERANO|SUMMER|SAT[ÉE]N|CAMIS[ÓO]N/i;
  const FAM_CALOR = new Set(['60', '93', '94']);
  const climaProd = {};
  // FactuSOL reusó códigos para prendas distintas: se descartan los años en que el código tenía otro nombre (mismas reglas que la ficha de producto)
  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ«»"]/g, '').replace(/s+/g, ' ').trim().toUpperCase();
  const TIPO = new Set('PIJAMA CONJUNTO BOMBACHA BOMBIS LESS COLALESS CULOTTELESS VEDETINA BODY CAMISON BATA BIKINI CORPINO TOP MEDIAS PANTUFLAS PANTUFLON LIGUERO ARNES ENTERIZA REMERA PANTALON MAXIBUZO SHORT PACK MODAL MORLEY SATEN ALGODON POLAR SOFT PLUSH MANGA CORTA LARGA CLASSIC'.split(' '));
  const palabras = s => new Set(norm(s).replace(/[^A-Z0-9 ]/g, ' ').split(' ').filter(w => w.length > 2 && !TIPO.has(w)));
  const otraPrenda = (actualNom, viejo) => { if (!viejo) return false; const a = palabras(actualNom), b = palabras(viejo); return a.size > 0 && b.size > 0 && ![...b].some(w => a.has(w)); };
  for (const [cod0, fam, u, f, fr, te, ca, med, anio, meses, nomAnio] of P.productos) {
    const cod = actual(cod0); if (otraPrenda(nombre(cod), nomAnio)) continue;
    const x = climaProd[cod] ||= { cod, fam, u: 0, f: 0, fr: 0, te: 0, ca: 0, meds: [], anios: 0, meses: 0 };
    x.u += u; x.f += f || 0; x.fr += fr || 0; x.te += te || 0; x.ca += ca || 0; x.meds.push([med, u]); if (!x.fam) x.fam = fam;
    x.anios++; x.meses += meses || 0;
  }
  function climaDe(cod) {
    const x = climaProd[cod], nom = nombre(cod), fam = x?.fam || D.stock?.find(s => actual(s[0]) === cod)?.[1] || '';
    // se aprende de las ventas solo si se vio el producto en distintas épocas (2 años o 6 meses distintos):
    // un producto nuevo que se vendió en una sola estación no dice nada del clima
    const visto = x && (x.anios >= 2 || x.meses >= 6);
    if (x && x.u >= 8 && visto) {
      const med = x.meds.reduce((s, [m, u]) => s + m * u, 0) / x.meds.reduce((s, [, u]) => s + u, 0);
      const lf = ((x.f + x.fr) / x.u) / bFrio, lc = ((x.te + x.ca) / x.u) / bCalor;
      const conf = x.u >= 30 ? 'alta' : 'media';
      if (lf >= 1.25 && med <= bMed - 2) return { tipo: 'frio', med, u: x.u, conf, por: `${C.pct((x.f + x.fr) / x.u)} de sus ventas fueron con menos de 17 °C (en todo Augusta es ${C.pct(bFrio)})` };
      if (lc >= 1.25 && med >= bMed + 2) return { tipo: 'calor', med, u: x.u, conf, por: `${C.pct((x.te + x.ca) / x.u)} de sus ventas fueron con más de 17 °C (en todo Augusta es ${C.pct(bCalor)})` };
      return { tipo: 'todo', med, u: x.u, conf, por: 'se vende parejo con cualquier temperatura' };
    }
    if (PALABRAS_FRIO.test(nom)) return { tipo: 'frio', med: null, u: x?.u || 0, conf: 'por el nombre', por: 'por el nombre (pocas ventas con ubicación para aprenderlo)' };
    if (PALABRAS_CALOR.test(nom) || FAM_CALOR.has(fam)) return { tipo: 'calor', med: null, u: x?.u || 0, conf: 'por el nombre', por: 'por el nombre o la familia (pocas ventas con ubicación para aprenderlo)' };
    return { tipo: 'todo', med: null, u: x?.u || 0, conf: 'sin datos', por: 'sin ventas suficientes para saberlo' };
  }
  const CHIP_CLIMA = { frio: '<span class="clima-p c-frio">De frío</span>', calor: '<span class="clima-p c-calor">De calor</span>', todo: '<span class="clima-p c-todo">Todo el año</span>' };
  // ¿la zona está en la temporada del producto? frío: pronóstico ≤ 15 °C · calor: ≥ 20 °C
  const enTemporada = (tipo, t) => t != null && (tipo === 'frio' ? t <= 15 : tipo === 'calor' ? t >= 20 : false);
  // cuántos de los próximos 3 meses siguen en temporada (por la normal)
  const mesesQueQuedan = (tipo, z) => [1, 2, 3].filter(n => enTemporada(tipo, normal(z, mesMas(n)))).length;

  // ---------- stock y ritmo ----------
  const stock = {}; for (const [c, fam, u, costo] of D.stock || []) { const k = actual(c); const x = stock[k] ||= { u: 0, costo: 0, fam }; x.u += u; x.costo += costo; }
  const ultima = {}; for (const [c, f] of Object.entries(D.ultima_venta || {})) { const k = actual(c); if (!ultima[k] || f > ultima[k]) ultima[k] = f; }
  const ventasMes = {}; for (const [m, , c0, , u] of D.productos) { const k = actual(c0) + '|' + m; ventasMes[k] = (ventasMes[k] || 0) + u; }
  const mesStr = (y, m) => `${y}-${String(m).padStart(2, '0')}`;

  const RC = Z.riocuarto, tRC = tAhora(RC), bRC = banda(tRC);
  const zonasFuera = P.zonas.filter(z => z.id !== 'riocuarto');
  const totalClientas = P.zonas.reduce((s, z) => s + (z.clientas_2a || 0), 0);

  // ---------- oportunidades: stock fuera de temporada en Río Cuarto → zonas donde sí es temporada ----------
  function oportunidades() {
    const out = [];
    for (const [cod, st] of Object.entries(stock)) {
      if (st.u <= 0) continue;
      const cl = climaDe(cod); if (cl.tipo === 'todo') continue;
      const enRC = enTemporada(cl.tipo, tRC), quedaRC = mesesQueQuedan(cl.tipo, RC);
      if (enRC && quedaRC >= 2) continue;                          // en Río Cuarto todavía es su temporada: se vende acá
      if (!enRC && enTemporada(cl.tipo, normal(RC, mesMas(1)))) continue;   // su temporada llega acá el mes que viene: va en "lo que se viene"
      const zonas = zonasFuera.map(z => ({ z, t: tAhora(z), quedan: mesesQueQuedan(cl.tipo, z), afin: (z.familias?.[st.fam] || 0) }))
        .filter(x => enTemporada(cl.tipo, x.t) && x.quedan >= 1 && (x.z.clientas_2a || x.z.pedidos))
        .sort((a, b) => (b.z.clientas_2a * (1 + b.quedan) + b.afin * 2) - (a.z.clientas_2a * (1 + a.quedan) + a.afin * 2)).slice(0, 4);
      if (!zonas.length) continue;
      out.push({ cod, st, cl, enRC, quedaRC, zonas, ult: ultima[cod] });
    }
    return out.sort((a, b) => b.st.costo - a.st.costo);
  }
  // ---------- lo que se viene en Río Cuarto ----------
  function seViene() {
    const out = [], y = +HOY.slice(0, 4) - 1;
    for (const cod of new Set([...Object.keys(stock), ...Object.keys(climaProd)])) {
      const cl = climaDe(cod); if (cl.tipo === 'todo') continue;
      const ahora = enTemporada(cl.tipo, tRC), en1 = enTemporada(cl.tipo, normal(RC, mesMas(1))), en2 = enTemporada(cl.tipo, normal(RC, mesMas(2)));
      if (ahora || !(en1 || en2)) continue;                        // solo lo que todavía no es temporada acá pero arranca en 1-2 meses
      const antes = [0, 1, 2].reduce((s, n) => { const m = mesMas(n); const yy = m < MES ? y + 1 : y; return s + (ventasMes[cod + '|' + mesStr(yy, m)] || 0); }, 0);
      if (antes < 2 && !(stock[cod]?.u > 0)) continue;
      out.push({ cod, cl, antes, st: stock[cod]?.u || 0, costo: stock[cod]?.costo || 0, fam: stock[cod]?.fam || climaProd[cod]?.fam });
    }
    return out.sort((a, b) => (b.antes - b.st) - (a.antes - a.st));
  }

  // ---------- pintar ----------
  const S = { filtroClima: '', buscar: '' };
  raiz.innerHTML = `<div class="grilla g-3" id="arriba"></div>
    <div class="grilla"><section class="tarjeta" id="opor"></section></div>
    <div class="grilla"><section class="tarjeta" id="viene"></section></div>
    <div class="grilla"><section class="tarjeta" id="zonas"></section></div>
    <div class="grilla"><section class="tarjeta" id="calendario"></section></div>
    <div class="grilla"><section class="tarjeta" id="prods"></section></div>`;

  function pintarArriba(op) {
    const parado = op.reduce((s, o) => s + o.st.costo, 0), frias = zonasFuera.filter(z => enTemporada('frio', tAhora(z)) && z.clientas_2a).sort((a, b) => b.clientas_2a - a.clientas_2a);
    $('#arriba').innerHTML = `
      <div class="tarjeta hero"><div class="et">Río Cuarto · próximos 16 días</div><div class="valor num">${fmtT(tRC)}</div>
        <div class="det">${chipT(bRC)} Esta semana ${fmtT(RC.t_semana)}. Normal de ${MESES_L[mesMas(1) - 1]}: ${fmtT(normal(RC, mesMas(1)))}.</div></div>
      <div class="tarjeta kpi"><div class="et">Stock para mover a otras zonas</div><div class="valor num">${C.compacto(parado)}</div><div class="det">${C.n(op.length)} productos fuera de temporada acá que en otras zonas sí la tienen</div></div>
      <div class="tarjeta kpi"><div class="et">Zonas con frío y clientas</div><div class="valor num">${C.n(frias.length)}</div><div class="det">${frias.slice(0, 4).map(z => C.esc(z.nombre.replace(/ y .*/, ''))).join(', ') || '—'}${frias.length > 4 ? '…' : ''}</div></div>`;
  }
  function pintarOpor(op) {
    $('#opor').innerHTML = `<div class="cab"><div><h2>Stock para anunciar en otras zonas</h2><p class="ayuda">Productos con stock que en Río Cuarto ya no están en temporada (o les queda poco), con las zonas donde ahora sí lo están y donde ya hay clientas. Las ordeno por clientas, por cuánto le queda de temporada y por cuánto compra esa zona de esa familia. <b>No es para comprar más</b>: es para mover lo que ya hay.</p></div>
      <div class="ops"><button class="chip" id="csv-opor" ${op.length ? '' : 'disabled'}>Bajar para los anuncios (CSV)</button></div></div>
      <div class="opor">${op.slice(0, 25).map(o => `<div class="item">
        <div><h3>${C.esc(nombre(o.cod))}</h3><div class="sub">${C.esc(famNombre(o.st.fam))} · ${CHIP_CLIMA[o.cl.tipo]} ${o.cl.med != null ? `· se vende con ~${fmtT(o.cl.med)}` : ''} · última venta ${C.fecha(o.ult)}</div></div>
        <div class="val">${C.n(o.st.u)} u.<small>${C.plata(o.st.costo)} a costo</small></div>
        <div class="por">${o.enRC ? `En Río Cuarto le queda poco: ${o.quedaRC ? `${o.quedaRC} mes` : 'se termina'}.` : `En Río Cuarto no es temporada (${fmtT(tRC)}).`} Donde sí:</div>
        <div class="zonas">${o.zonas.map(x => `<span class="zona-chip"><b>${C.esc(x.z.nombre)}</b> · ${fmtT(x.t)} · ${C.n(x.z.clientas_2a)} clientas · ${x.quedan >= 3 ? '3+ meses' : x.quedan + (x.quedan === 1 ? ' mes' : ' meses')} más</span>`).join('')}</div></div>`).join('') || '<div class="vacio">Hoy no hay stock fuera de temporada que tenga dónde moverse.</div>'}</div>
      ${op.length > 25 ? `<p class="pie-nota">Se muestran 25 de ${op.length}; el CSV trae todos.</p>` : ''}
      <p class="pie-nota">Temporada de frío = menos de 15 °C promedio; de calor = más de 20 °C (pronóstico de 16 días y normales de los próximos meses). Las clientas son de Tienda Nube, últimos 2 años.</p>`;
  }
  function pintarViene(lv) {
    $('#viene').innerHTML = `<div class="cab"><div><h2>Lo que se viene en Río Cuarto</h2><p class="ayuda">Productos cuya temporada arranca acá en los próximos dos meses (${MESES_L[mesMas(1) - 1]} y ${MESES_L[mesMas(2) - 1]}: normal ${fmtT(normal(RC, mesMas(1)))} y ${fmtT(normal(RC, mesMas(2)))}). "El año pasado" = lo que vendió entre ${MESES_L[MES - 1]} y ${MESES_L[mesMas(2) - 1]} del año anterior, en todos los canales.</p></div></div>
      ${lv.length ? `<div class="tabla-scroll"><table class="t"><thead><tr><th>Producto</th><th>Clima</th><th class="n">El año pasado</th><th class="n">Stock hoy</th><th class="n">Diferencia</th></tr></thead><tbody>
      ${lv.slice(0, 30).map(x => `<tr><td><div class="nombre">${C.esc(nombre(x.cod))}</div><div class="sub">${C.esc(x.cod)} · ${C.esc(famNombre(x.fam))}</div></td><td>${CHIP_CLIMA[x.cl.tipo]}</td>
        <td class="n">${C.n(x.antes)} u.</td><td class="n">${C.n(x.st)} u.</td><td class="n" style="color:${x.st >= x.antes ? 'var(--bien)' : 'var(--mal)'}">${x.st >= x.antes ? 'alcanza' : 'faltan ' + C.n(x.antes - x.st)}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="vacio">No hay productos con una temporada que arranque pronto en Río Cuarto.</div>'}
      <p class="pie-nota">Es una referencia: si el año pasado no hubo stock, lo vendido fue menos de lo que se podía vender. Para cuánto pedir, mirá "Qué reponer" en Stock y compras.</p>`;
  }
  function spark(dias) {
    const pts = (dias || []).filter(d => d[0] > HOY); if (pts.length < 2) return '';
    const vals = pts.map(d => d[1]), mn = Math.min(...vals), mx = Math.max(...vals), W = 120, H = 26;
    const x = i => i * (W - 4) / (pts.length - 1) + 2, y = v => H - 3 - (mx === mn ? .5 : (v - mn) / (mx - mn)) * (H - 6);
    return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-label="Pronóstico 16 días"><path d="M${vals.map((v, i) => `${x(i)},${y(v)}`).join(' L')}" fill="none" stroke="var(--violeta)" stroke-width="1.6" stroke-linejoin="round"/><circle cx="${x(vals.length - 1)}" cy="${y(vals[vals.length - 1])}" r="2.5" fill="var(--violeta)"/></svg>`;
  }
  function pintarZonas() {
    const zs = P.zonas.slice().sort((a, b) => a.orden - b.orden);
    $('#zonas').innerHTML = `<div class="cab"><div><h2>Cómo está cada zona</h2><p class="ayuda">De norte a sur. Temperatura media de esta semana, de los próximos 16 días y la normal del mes que viene; clientas de Tienda Nube de los últimos 2 años.</p></div></div>
      <div class="tabla-scroll"><table class="t"><thead><tr><th>Zona</th><th class="n">Esta semana</th><th class="n">Próx. 16 días</th><th>Tendencia</th><th>Temporada</th><th class="n">Normal ${MESES[mesMas(1) - 1]}</th><th class="n">Clientas</th><th class="n">Pedidos</th></tr></thead><tbody>
      ${zs.map(z => { const t = tAhora(z); return `<tr><td><div class="nombre">${C.esc(z.nombre)}</div><div class="sub">${C.esc(z.provincia)}</div></td>
        <td class="n"><span class="temp" style="background:${colorT(z.t_semana)};color:${tintaT(z.t_semana)}">${fmtT(z.t_semana)}</span></td>
        <td class="n"><span class="temp" style="background:${colorT(t)};color:${tintaT(t)}">${fmtT(z.t_pronostico)}</span></td><td>${spark(z.dias)}</td><td>${chipT(banda(t))}</td>
        <td class="n">${fmtT(normal(z, mesMas(1)))}</td><td class="n">${C.n(z.clientas_2a)}</td><td class="n">${C.n(z.pedidos)}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  function pintarCalendario() {
    const zs = P.zonas.slice().sort((a, b) => a.orden - b.orden);
    $('#calendario').innerHTML = `<div class="cab"><div><h2>Calendario de temporadas</h2><p class="ayuda">Temperatura media normal de cada mes (2015 a 2025). Azul = frío, rojo = calor. Sirve para ver, por ejemplo, que en la Patagonia el frío empieza antes y termina mucho después que en Río Cuarto. El mes actual está marcado.</p></div></div>
      <div class="tabla-scroll"><table class="cal"><thead><tr><th></th>${MESES.map((m, i) => `<th>${m}</th>`).join('')}</tr></thead><tbody>
      ${zs.map(z => `<tr><th class="z">${C.esc(z.nombre)}</th>${MESES.map((m, i) => { const t = normal(z, i + 1); return `<td class="${i + 1 === MES ? 'hoy' : ''}" style="background:${colorT(t)};color:${tintaT(t)}" title="${C.esc(z.nombre)}, ${MESES_L[i]}: ${fmtT(t)} de media">${t == null ? '' : Math.round(t)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function pintarProds() {
    const cods = [...new Set([...Object.keys(climaProd), ...Object.keys(stock)])];
    let filas = cods.map(c => ({ c, cl: climaDe(c), st: stock[c]?.u || 0 })).filter(x => x.cl.u >= 3 || x.st > 0);
    if (S.filtroClima) filas = filas.filter(x => x.cl.tipo === S.filtroClima);
    const q = S.buscar.trim().toLowerCase(); if (q) filas = filas.filter(x => (nombre(x.c) + ' ' + x.c).toLowerCase().includes(q));
    filas.sort((a, b) => b.cl.u - a.cl.u);
    const cuenta = t => cods.map(c => climaDe(c)).filter(x => x.tipo === t).length;
    $('#prods').innerHTML = `<div class="cab"><div><h2>El clima de cada producto</h2><p class="ayuda">Aprendido de ${C.n(bTot)} prendas vendidas con lugar conocido (local y Tienda Nube), cruzando cada venta con la temperatura de esa semana en esa zona. En todo Augusta, la mitad de las ventas fue con menos de ${fmtT(bMed)}.</p></div>
      <div class="ops"><button class="chip ${!S.filtroClima ? 'activo' : ''}" data-fc="">Todos</button><button class="chip ${S.filtroClima === 'frio' ? 'activo' : ''}" data-fc="frio">De frío (${cuenta('frio')})</button><button class="chip ${S.filtroClima === 'calor' ? 'activo' : ''}" data-fc="calor">De calor (${cuenta('calor')})</button><button class="chip ${S.filtroClima === 'todo' ? 'activo' : ''}" data-fc="todo">Todo el año</button>
        <input class="buscar" id="buscar-cl" placeholder="Buscar producto" value="${C.esc(S.buscar)}"></div></div>
      <div class="tabla-scroll"><table class="t"><thead><tr><th>Producto</th><th>Clima</th><th class="n">Temp. típica</th><th class="n">Ventas con lugar</th><th>Por qué</th><th class="n">Stock hoy</th></tr></thead><tbody>
      ${filas.slice(0, 60).map(x => `<tr><td><div class="nombre">${C.esc(nombre(x.c))}</div><div class="sub">${C.esc(x.c)}</div></td><td>${CHIP_CLIMA[x.cl.tipo]}<div class="sub">${C.esc(x.cl.conf)}</div></td>
        <td class="n">${x.cl.med == null ? '—' : fmtT(x.cl.med)}</td><td class="n">${C.n(x.cl.u)}</td><td style="font-size:13px;color:var(--tinta-2);max-width:340px">${C.esc(x.cl.por)}</td><td class="n">${C.n(x.st)}</td></tr>`).join('') || '<tr><td colspan="6" class="vacio">Sin resultados.</td></tr>'}</tbody></table></div>
      ${filas.length > 60 ? `<p class="pie-nota">Se muestran 60 de ${filas.length}. Buscá un producto para verlo.</p>` : ''}`;
  }
  function bajarCsv(op) {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const filas = [['Código', 'Producto', 'Familia', 'Clima', 'Stock', 'A costo', 'Zonas para anunciar', 'Provincias', 'Temperaturas', 'Clientas en esas zonas'].map(q).join(';')]
      .concat(op.map(o => [o.cod, nombre(o.cod), famNombre(o.st.fam), o.cl.tipo === 'frio' ? 'De frío' : 'De calor', o.st.u, Math.round(o.st.costo),
        o.zonas.map(x => x.z.nombre).join(' | '), [...new Set(o.zonas.map(x => x.z.provincia))].join(' | '), o.zonas.map(x => fmtT(x.t)).join(' | '), o.zonas.reduce((s, x) => s + x.z.clientas_2a, 0)].map(q).join(';')));
    const blob = new Blob(['﻿' + filas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `anuncios-por-clima-${HOY}.csv` });
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  const op = oportunidades();
  pintarArriba(op); pintarOpor(op); pintarViene(seViene()); pintarZonas(); pintarCalendario(); pintarProds();
  raiz.addEventListener('click', e => {
    if (e.target.id === 'csv-opor') return bajarCsv(op);
    const f = e.target.closest('[data-fc]'); if (f) { S.filtroClima = f.dataset.fc; pintarProds(); }
  });
  raiz.addEventListener('input', e => { if (e.target.id !== 'buscar-cl') return; S.buscar = e.target.value; const pos = e.target.selectionStart; pintarProds(); const n = $('#buscar-cl'); n.focus(); n.setSelectionRange(pos, pos); });
})();
