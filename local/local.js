// Augusta Core · Horarios del local
// Base: cada ticket de la caja del local con su hora real (core_horario). Online no entra: su hora es la de carga.
// Promedios SIEMPRE sobre los días abiertos (no solo los días con venta en ese turno: eso infla el promedio).
(async function () {
  if (!(await CORE.listo)) return;
  const C = CORE, $ = s => document.querySelector(s), raiz = $('#contenido');
  let H;
  try { H = await C.horario(); } catch (e) { raiz.innerHTML = `<div class="aviso">No pude traer los datos: ${C.esc(e.message)}</div>`; return; }

  const HASTA = H.hasta, mesesIpc = Object.keys(H.ipc).sort(), mesBase = mesesIpc[mesesIpc.length - 1], ipcBase = H.ipc[mesBase];
  const def = m => ipcBase / (H.ipc[m] || ipcBase);
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const dow = f => new Date(f + 'T12:00:00').getDay();
  const dmas = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const anioMenos = f => `${+f.slice(0, 4) - 1}${f.slice(4) === '-02-29' ? '-02-28' : f.slice(4)}`;
  const anios = [...new Set(H.tickets.map(t => t[0].slice(0, 4)))].filter(y => y > '2022').sort();
  const PRESETS = [
    { id: '12m', label: 'Últimos 12 meses', d1: dmas(anioMenos(HASTA), 1), d2: HASTA },
    { id: '6m', label: 'Últimos 6 meses', d1: dmas(HASTA, -182), d2: HASTA },
    ...anios.slice().reverse().map(y => ({ id: y, label: y === HASTA.slice(0, 4) ? `${y} hasta hoy` : y, d1: `${y}-01-01`, d2: y === HASTA.slice(0, 4) ? HASTA : `${y}-12-31` })),
    { id: 'todo', label: 'Todo', d1: '2022-12-01', d2: HASTA }];
  // lo que cuesta abrir cada turno (atención); valores de Diego al 20/10/2026, editables
  const COSTOS0 = { 'LV-m': 18000, 'LV-t': 18000, 'SAB-m': 18000, 'SAB-t': 27000 };
  const guardado = (() => { try { return JSON.parse(localStorage.getItem('core_local') || '{}'); } catch { return {}; } })();
  const S = Object.assign({ preset: '12m', calor: 'venta' }, guardado);
  S.costos = Object.assign({}, COSTOS0, guardado.costos || {});
  const guardar = () => { try { localStorage.setItem('core_local', JSON.stringify({ preset: S.preset, calor: S.calor, costos: S.costos })); } catch {} };

  const TURNOS = [
    { id: 'LV-m', nombre: 'Lunes a viernes · mañana', hor: '10 a 13 h', sab: false, tarde: false },
    { id: 'LV-t', nombre: 'Lunes a viernes · tarde', hor: '17:30 a 20:30 h', sab: false, tarde: true },
    { id: 'SAB-m', nombre: 'Sábado · mañana', hor: '10 a 13 h', sab: true, tarde: false },
    { id: 'SAB-t', nombre: 'Sábado · tarde', hor: '17:30 a 20:30 h', sab: true, tarde: true }];
  const esTarde = h => h >= '15:00';

  // fechas especiales: un sábado "es previo" si la fecha cae en los 7 días siguientes (incluido el mismo sábado)
  function domingoN(y, mes, n) { const d = new Date(y, mes - 1, 1); const primero = (7 - d.getDay()) % 7 + 1; return new Date(y, mes - 1, primero + (n - 1) * 7); }
  function especial(f) {
    const y = +f.slice(0, 4), d = new Date(f + 'T12:00:00');
    const fechas = [['San Valentín', new Date(y, 1, 14)], ['Día de la Mujer', new Date(y, 2, 8)], ['Día del Padre', domingoN(y, 6, 3)], ['Día del Amigo', new Date(y, 6, 20)],
      ['Día de la Niñez', domingoN(y, 8, 3)], ['Día de la Madre', domingoN(y, 10, 3)], ['Navidad', new Date(y, 11, 24)]];
    for (const [n, x] of fechas) { const dias = (x - d) / 864e5; if (dias >= -0.6 && dias < 7) return n; }
    if (f.slice(5, 7) === '12' && +f.slice(8) >= 6 && +f.slice(8) <= 24) return 'Navidad';
    return null;
  }

  function calcular() {
    const p = PRESETS.find(x => x.id === S.preset) || PRESETS[0];
    const T = H.tickets.filter(t => t[0] >= p.d1 && t[0] <= p.d2 && dow(t[0]) !== 0);
    // días abiertos = días con al menos un ticket. Un turno se da por CERRADO en un mes si no tuvo ni un ticket
    // en todo ese mes para ese tipo de día (así se ven los meses de sábado a la tarde cerrado).
    const dia = {};
    for (const [f, h, v, c, vc, u] of T) {
      const k = f; const x = dia[k] ||= { f, sab: dow(f) === 6, m: { n: 0, v: 0, g: 0, u: 0 }, t: { n: 0, v: 0, g: 0, u: 0 }, slots: {} };
      const fx = def(f.slice(0, 7)), g = vc > 0 ? (v - (c / vc) * v) * fx : v * fx * 0.6;   // sin costo cargado: se estima con 60% de margen
      const tt = esTarde(h) ? x.t : x.m; tt.n++; tt.v += v * fx; tt.g += g; tt.u += u;
      const s = slot(h); const sl = x.slots[s] ||= { n: 0, v: 0 }; sl.n++; sl.v += v * fx;
    }
    const dias = Object.values(dia);
    const turnoMes = {}; for (const d of dias) for (const tu of ['m', 't']) { const k = `${d.f.slice(0, 7)}|${d.sab ? 'SAB' : 'LV'}-${tu}`; turnoMes[k] = (turnoMes[k] || 0) + d[tu].n; }
    const abierto = (d, tu) => (turnoMes[`${d.f.slice(0, 7)}|${d.sab ? 'SAB' : 'LV'}-${tu}`] || 0) > 0;
    const res = {};
    for (const T0 of TURNOS) {
      const tu = T0.tarde ? 't' : 'm', ds = dias.filter(d => d.sab === T0.sab), abiertos = ds.filter(d => abierto(d, tu));
      const r = { dias: abiertos.length, cerrados: ds.length - abiertos.length, n: 0, v: 0, g: 0, u: 0, conVenta: 0 };
      for (const d of abiertos) { const x = d[tu]; r.n += x.n; r.v += x.v; r.g += x.g; r.u += x.u; if (x.n) r.conVenta++; }
      res[T0.id] = r;
    }
    return { p, dias, res, abierto };
  }
  const slot = h => { const [hh, mm] = h.split(':').map(Number); return `${String(hh).padStart(2, '0')}:${mm >= 30 ? '30' : '00'}`; };

  raiz.innerHTML = `<div class="filtros" id="filtros"></div>
    <div class="grilla g-4" id="turnos"></div>
    <div class="grilla"><section class="tarjeta"><div class="cab"><div><h2>Lo que cuesta abrir cada turno</h2><p class="ayuda">Atención del local por turno (sueldo de quien atiende). Cambialo y todo se recalcula; queda guardado en este navegador.</p></div></div><div class="costos" id="costos"></div></section></div>
    <div class="grilla"><section class="tarjeta" id="claves"></section></div>
    <div class="grilla"><section class="tarjeta" id="calor"></section></div>
    <div class="grilla"><section class="tarjeta" id="meses"></section></div>
    <div class="grilla"><section class="tarjeta" id="sabados"></section></div>`;

  function pintar() {
    const { p, dias, res, abierto } = calcular();
    $('#filtros').innerHTML = `<div class="grupo"><span>Período</span>${PRESETS.map(x => `<button class="chip ${S.preset === x.id ? 'activo' : ''}" data-preset="${x.id}">${x.label}</button>`).join('')}</div>
      <span style="font-size:12.5px;color:var(--tinta-2)">Pesos de ${C.MESES[+mesBase.slice(5, 7) - 1]} ${mesBase.slice(0, 4)} (IPC). Ganancia bruta = venta − costo de las prendas.</span>`;
    $('#turnos').innerHTML = TURNOS.map(T0 => {
      const r = res[T0.id], costo = +S.costos[T0.id] || 0, gd = r.dias ? r.g / r.dias : 0, vd = r.dias ? r.v / r.dias : 0, resultado = gd - costo;
      let soloFechas = false;
      if (T0.id === 'SAB-t') { const sab = dias.filter(d => d.sab && abierto(d, 't')), com = sab.filter(d => !especial(d.f)), esp = sab.filter(d => especial(d.f));
        const pr = l => l.length ? l.reduce((s, d) => s + d.t.g, 0) / l.length : 0; soloFechas = com.length > 0 && esp.length > 0 && pr(com) < costo && pr(esp) >= costo; }
      const ver = !r.dias ? '' : soloFechas ? '<span class="veredicto v-justo">Solo antes de fechas</span>' : resultado >= costo * 0.2 ? '<span class="veredicto v-si">Conviene</span>' : resultado >= -costo * 0.1 ? '<span class="veredicto v-justo">Justo</span>' : '<span class="veredicto v-no">No cubre</span>';
      return `<div class="tarjeta turno"><div class="et"><span>${T0.nombre}</span>${ver}</div><div class="hor">${T0.hor} · ${C.n(r.dias)} días abiertos${r.cerrados ? ` (${C.n(r.cerrados)} cerrado)` : ''}</div>
        <div class="valor num">${C.plata(gd)}</div><div style="font-size:12.5px;color:var(--tinta-3);margin-bottom:6px">ganancia bruta promedio por día</div>
        <div class="lin"><span>Venta por día</span><b>${C.plata(vd)}</b></div>
        <div class="lin"><span>Tickets por día</span><b>${r.dias ? new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(r.n / r.dias) : '—'}</b></div>
        <div class="lin"><span>Días con alguna venta</span><b>${r.dias ? C.pct(r.conVenta / r.dias) : '—'}</b></div>
        <div class="lin"><span>Costo del turno</span><b>${C.plata(costo)}</b></div>
        <div class="lin res"><span>Queda por día</span><b style="color:${resultado >= 0 ? 'var(--bien)' : 'var(--mal)'}">${resultado >= 0 ? '' : '−'}${C.plata(Math.abs(resultado))}</b></div></div>`;
    }).join('');
    if (!$('#costos').children.length) {
      $('#costos').innerHTML = TURNOS.map(T0 => `<label>${T0.nombre}<input type="text" inputmode="numeric" data-costo="${T0.id}" value="${C.n(S.costos[T0.id])}"></label>`).join('') + `<button class="chip" id="reponer">Volver a los valores originales</button>`;
    }
    pintarClaves(dias, res, abierto); pintarCalor(dias); pintarMeses(dias, abierto); pintarSabados(dias, abierto);
  }

  // ---------- conclusiones automáticas ----------
  function pintarClaves(dias, res, abierto) {
    const lv = dias.filter(d => !d.sab), tot = {}; for (const d of lv) for (const [s, x] of Object.entries(d.slots)) { const k = tot[s] ||= { v: 0 }; k.v += x.v; }
    const top = Object.entries(tot).sort((a, b) => b[1].v - a[1].v).slice(0, 3).map(([s]) => s);
    const m = res['LV-m'], t = res['LV-t'], sm = res['SAB-m'], st = res['SAB-t'];
    const gpd = r => r.dias ? r.g / r.dias : 0;
    const despues = dias.reduce((s, d) => s + Object.entries(d.slots).filter(([k]) => k === '13:00' || k === '13:30' || k === '20:30' || k === '21:00').reduce((a, [, x]) => a + x.n, 0), 0);
    const items = [
      m.dias && t.dias ? `De lunes a viernes, <b>${gpd(t) >= gpd(m) ? 'la tarde' : 'la mañana'}</b> deja más: ${C.plata(Math.max(gpd(m), gpd(t)))} de ganancia por día contra ${C.plata(Math.min(gpd(m), gpd(t)))}.` : '',
      top.length ? `Las medias horas que más venden (lunes a viernes): <b>${top.map(s => s + ' h').join(', ')}</b>.` : '',
      sm.dias ? `El sábado a la mañana deja ${C.plata(gpd(sm))} por día${st.dias ? ` y la tarde ${C.plata(gpd(st))} (con ${C.pct(st.conVenta / st.dias)} de los sábados con alguna venta a la tarde)` : ''}.` : '',
      (() => { const ct = +S.costos['SAB-t'] || 0, sab = dias.filter(d => d.sab && abierto(d, 't')), esp = sab.filter(d => especial(d.f)), com = sab.filter(d => !especial(d.f));
        const pr = l => l.length ? l.reduce((s, d) => s + d.t.g, 0) / l.length : 0; if (!com.length) return '';
        return `Sábado a la tarde: un sábado <b>común</b> deja en promedio ${C.plata(pr(com))} (contando los que no venden nada), contra ${C.plata(ct)} que cuesta el turno; los <b>previos a fechas especiales</b> dejan ${C.plata(pr(esp))}. ${pr(com) < ct ? 'Conviene abrir la tarde solo antes de fechas.' : ''}`; })(),
      despues ? `Hubo <b>${C.n(despues)} tickets</b> cobrados en la media hora de después del cierre (13:00 a 13:30 o desde las 20:30): hay clientas que llegan sobre la hora.` : '',
    ].filter(Boolean);
    $('#claves').innerHTML = `<h2 style="margin:0 0 10px;font:500 19px var(--f-titulo);color:var(--violeta)">Lo que dicen los números</h2><ul class="claves">${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
  }

  // ---------- mapa de calor: día × media hora ----------
  function pintarCalor(dias) {
    const porDow = {}; for (const d of dias) (porDow[dow(d.f)] ||= []).push(d);
    const conteo = {}; for (const d of dias) for (const [s, x] of Object.entries(d.slots)) conteo[s] = (conteo[s] || 0) + x.n;
    const slots = Object.keys(conteo).filter(s => conteo[s] >= 3).sort();
    if (!slots.length) { $('#calor').innerHTML = '<p class="ayuda">Sin tickets en el período.</p>'; return; }
    // solo las medias horas con movimiento (el mediodía cerrado no ocupa lugar); donde se saltean horas va una línea de corte
    const todos = slots, aMin = s => +s.slice(0, 2) * 60 + +s.slice(3), corte = i => i > 0 && aMin(todos[i]) - aMin(todos[i - 1]) > 30;
    const venta = S.calor === 'venta', val = {};
    let max = 0;
    for (const w of [1, 2, 3, 4, 5, 6]) { const ds = porDow[w] || []; for (const s of todos) { const tot = ds.reduce((a, d) => a + (d.slots[s]?.[venta ? 'v' : 'n'] || 0), 0); const x = ds.length ? tot / ds.length : 0; val[w + '|' + s] = x; if (x > max) max = x; } }
    const color = x => { if (!x) return null; const t = Math.min(1, x / max); const A = [241, 236, 246], B = [180, 155, 200], Cc = [91, 58, 120];
      const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k)); const c = t < .5 ? mix(A, B, t * 2) : mix(B, Cc, (t - .5) * 2); return `rgb(${c.join(',')})`; };
    $('#calor').innerHTML = `<div class="cab"><div><h2>Día por día, media hora por media hora</h2><p class="ayuda">${venta ? 'Venta promedio por día abierto' : 'Tickets promedio por día abierto'} en cada media hora. Más oscuro = vende más.</p></div>
      <div class="ops"><button class="chip ${venta ? 'activo' : ''}" data-calor="venta">Venta</button><button class="chip ${venta ? '' : 'activo'}" data-calor="tickets">Tickets</button></div></div>
      <div class="tabla-scroll"><table class="calor"><thead><tr><th></th>${todos.map((s, i) => `<th class="${corte(i) ? 'corte' : ''}">${s.endsWith(':00') || corte(i) || i === 0 ? s.replace(':00', ' h') : ''}</th>`).join('')}</tr></thead><tbody>
      ${[1, 2, 3, 4, 5, 6].map(w => `<tr><th class="d">${DIAS[w]}</th>${todos.map((s, i) => { const x = val[w + '|' + s], c = color(x), osc = x / max > .55;
        return `<td class="${c ? '' : 'cero'} ${corte(i) ? 'corte' : ''}" style="${c ? `background:${c};color:${osc ? '#fff' : 'var(--tinta)'}` : ''}" data-w="${w}" data-s="${s}">${x && x / max > .35 ? (venta ? (x >= 1000 ? Math.round(x / 1000) + 'k' : Math.round(x)) : x.toFixed(1).replace('.', ',')) : ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="escala-calor"><span>menos</span><i></i><span>más</span><span style="margin-left:12px">${venta ? `máximo ${C.plata(max)} por día` : ''}</span></div>`;
    const tb = $('#calor table');
    tb.addEventListener('mousemove', e => { const td = e.target.closest('td[data-w]'); if (!td) return C.tipFuera(); const w = td.dataset.w, s = td.dataset.s, ds = porDow[w] || [];
      const n = ds.reduce((a, d) => a + (d.slots[s]?.n || 0), 0), v = ds.reduce((a, d) => a + (d.slots[s]?.v || 0), 0);
      C.tip(`<b>${DIAS[w]} ${s} a ${s.endsWith('00') ? s.slice(0, 3) + '30' : String(+s.slice(0, 2) + 1).padStart(2, '0') + ':00'}</b><div class="f"><span>Venta por día</span><span>${C.plata(ds.length ? v / ds.length : 0)}</span></div><div class="f"><span>Tickets en el período</span><span>${C.n(n)}</span></div><div class="f"><span>Días abiertos</span><span>${C.n(ds.length)}</span></div>`, e); });
    tb.addEventListener('mouseleave', C.tipFuera);
  }

  // ---------- mañana contra tarde, mes a mes ----------
  function pintarMeses(dias, abierto) {
    const el = $('#meses'), M = {};
    for (const d of dias) { if (d.sab) continue; const m = d.f.slice(0, 7); const x = M[m] ||= { dm: 0, dt: 0, gm: 0, gt: 0 }; if (abierto(d, 'm')) { x.dm++; x.gm += d.m.g; } if (abierto(d, 't')) { x.dt++; x.gt += d.t.g; } }
    const ms = Object.keys(M).sort(); if (ms.length < 2) { el.innerHTML = '<h2>Mañana contra tarde</h2><p class="ayuda">Elegí un período más largo para ver la evolución.</p>'; return; }
    const S2 = [{ id: 'Mañana', color: 'var(--a-2)', g: m => M[m].dm ? M[m].gm / M[m].dm : null }, { id: 'Tarde', color: 'var(--violeta)', g: m => M[m].dt ? M[m].gt / M[m].dt : null }];
    const { tope, paso } = C.escala(Math.max(...ms.flatMap(m => S2.map(s => s.g(m) || 0)), 1));
    el.innerHTML = `<div class="cab"><div><h2>Mañana contra tarde, mes a mes</h2><p class="ayuda">Ganancia bruta promedio por día abierto, de lunes a viernes.</p></div></div>
      <div class="leyenda">${S2.map(s => `<span><i style="background:${s.color}"></i>${s.id}</span>`).join('')}</div><div id="g-mt"></div>`;
    const g = $('#g-mt'), W = Math.max(300, g.clientWidth), Hh = 230, izq = 58, der = 16, abajo = 24, arriba = 10;
    const x = i => izq + (W - izq - der) * (ms.length === 1 ? .5 : i / (ms.length - 1)), y = v => arriba + (Hh - arriba - abajo) * (1 - v / tope);
    let s = `<svg class="graf" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Mañana contra tarde">`;
    for (let v = 0; v <= tope + 1e-9; v += paso) s += `<line class="${v ? 'eje' : 'base'}" x1="${izq}" x2="${W - der}" y1="${y(v)}" y2="${y(v)}"/><text x="${izq - 8}" y="${y(v) + 4}" text-anchor="end">${C.compacto(v).replace(' mil', 'k')}</text>`;
    const cada = Math.ceil(ms.length / Math.max(1, Math.floor((W - izq) / 52)));
    ms.forEach((m, i) => { if (i % cada === 0) s += `<text x="${x(i)}" y="${Hh - 6}" text-anchor="middle">${C.mesCorto(m)}</text>`; });
    for (const se of S2) { const pts = ms.map((m, i) => se.g(m) == null ? null : [x(i), y(se.g(m))]); let d = '', pen = false; for (const p of pts) { if (!p) { pen = false; continue; } d += (pen ? ' L' : ' M') + p.join(','); pen = true; }
      s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`; const u = [...pts].reverse().find(Boolean); if (u) s += `<circle cx="${u[0]}" cy="${u[1]}" r="4.5" fill="${se.color}" stroke="#fff" stroke-width="2"/>`; }
    s += `<line id="cz" class="eje" y1="${arriba}" y2="${Hh - abajo}" style="display:none;stroke:#C9BFD3"/><rect x="${izq}" y="${arriba}" width="${W - izq - der}" height="${Hh - arriba - abajo}" fill="transparent"/>`;
    g.innerHTML = s + '</svg>';
    const svg = g.querySelector('svg'), cz = svg.querySelector('#cz');
    svg.addEventListener('mousemove', e => { const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * (W / r.width); const i = Math.max(0, Math.min(ms.length - 1, Math.round((px - izq) / ((W - izq - der) / Math.max(1, ms.length - 1))))); const m = ms[i];
      cz.setAttribute('x1', x(i)); cz.setAttribute('x2', x(i)); cz.style.display = '';
      C.tip(`<b>${C.mesCorto(m)}</b>${S2.map(se => `<div class="f"><span><i style="background:${se.color}"></i>${se.id}</span><span>${se.g(m) == null ? 'cerrado' : C.plata(se.g(m))}</span></div>`).join('')}<div class="f tot"><span>Días abiertos</span><span>${M[m].dm} / ${M[m].dt}</span></div>`, e); });
    svg.addEventListener('mouseleave', () => { cz.style.display = 'none'; C.tipFuera(); });
  }

  // ---------- sábados ----------
  function pintarSabados(dias, abierto) {
    const sab = dias.filter(d => d.sab).sort((a, b) => b.f.localeCompare(a.f));
    const cm = +S.costos['SAB-m'] || 0, ct = +S.costos['SAB-t'] || 0;
    const fila = d => { const et = especial(d.f), tAb = abierto(d, 't');
      return `<tr><td>${C.fecha(d.f)}${et ? `<span class="especial">${et}</span>` : ''}</td><td class="n">${C.plata(d.m.v)}</td><td class="n">${C.plata(d.m.g)}</td>
        <td class="n">${tAb ? C.plata(d.t.v) : '<span class="sub">cerrado</span>'}</td><td class="n">${tAb ? C.plata(d.t.g) : '—'}</td>
        <td class="n" style="color:${!tAb ? 'inherit' : d.t.g - ct >= 0 ? 'var(--bien)' : 'var(--mal)'}">${tAb ? (d.t.g - ct >= 0 ? '+' : '−') + C.plata(Math.abs(d.t.g - ct)) : '—'}</td></tr>`; };
    const mejores = sab.filter(d => abierto(d, 't')).sort((a, b) => b.t.g - a.t.g).slice(0, 8);
    const esp = sab.filter(d => abierto(d, 't') && especial(d.f)), comunes = sab.filter(d => abierto(d, 't') && !especial(d.f));
    const prom = l => l.length ? l.reduce((s, d) => s + d.t.g, 0) / l.length : 0;
    $('#sabados').innerHTML = `<div class="cab"><div><h2>Sábados</h2><p class="ayuda">Sábado a la tarde: los previos a fechas especiales dejan en promedio <b>${C.plata(prom(esp))}</b> de ganancia (${esp.length} sábados); un sábado común, <b>${C.plata(prom(comunes))}</b> (${comunes.length}). El turno cuesta ${C.plata(ct)}.</p></div></div>
      <div class="tabla-scroll"><table class="t"><thead><tr><th>Los que más dejaron a la tarde</th><th class="n">Venta mañana</th><th class="n">Ganancia mañana</th><th class="n">Venta tarde</th><th class="n">Ganancia tarde</th><th class="n">Tarde − costo</th></tr></thead><tbody>${mejores.map(fila).join('')}</tbody></table></div>
      <div class="tabla-scroll" style="margin-top:16px"><table class="t"><thead><tr><th>Últimos sábados</th><th class="n">Venta mañana</th><th class="n">Ganancia mañana</th><th class="n">Venta tarde</th><th class="n">Ganancia tarde</th><th class="n">Tarde − costo</th></tr></thead><tbody>${sab.slice(0, 12).map(fila).join('')}</tbody></table></div>
      <p class="pie-nota">"Cerrado" = ese mes no hubo ni una venta un sábado a la tarde: se toma como que no abrió. Ganancia bruta en pesos de hoy; si una prenda no tenía costo cargado se estima con 60% de margen.</p>`;
  }

  // ---------- eventos ----------
  raiz.addEventListener('click', e => {
    const b = e.target.closest('[data-preset]'); if (b) { S.preset = b.dataset.preset; guardar(); return pintar(); }
    const c = e.target.closest('[data-calor]'); if (c) { S.calor = c.dataset.calor; guardar(); return pintar(); }
    if (e.target.id === 'reponer') { S.costos = { ...COSTOS0 }; guardar(); $('#costos').innerHTML = ''; return pintar(); }
  });
  raiz.addEventListener('change', e => { const k = e.target.dataset?.costo; if (!k) return; S.costos[k] = +String(e.target.value).replace(/\D/g, '') || 0; e.target.value = C.n(S.costos[k]); guardar(); pintar(); });
  pintar();
  let espera; addEventListener('resize', () => { clearTimeout(espera); espera = setTimeout(pintar, 150); });
})();
