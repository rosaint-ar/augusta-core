// Augusta Core · Maestro de productos (sql/016)
// Todo lo que hay en la web, EXACTO (nombres y valores tal cual, sin recortar espacios), agrupado por código, al lado de lo
// que tiene Percha. Lo que se edita acá queda en el maestro (columna m): NO cambia la web ni Percha (eso será la fase 3).
// Datos: maestro_datos() · leer la web: maestro_traer() + maestro_paso() · editar: maestro_editar().
// Vista local sin login (?datos=local): lee ../_local/maestro.json y las ediciones quedan solo en esta pestaña.
(async function () {
  if (!(await CORE.listo)) return;
  const C = CORE, $ = s => document.querySelector(s), raiz = $('#contenido'), esc = C.esc;
  const FAMILIAS = { '10': 'Bombachas', '20': 'Conjuntos', '30': 'Bodies', '40': 'Ligueros', '50': 'Pijamas', '60': 'Trajes de baño', '70': 'Deportiva', '80': 'Ropa', '90': 'Accesorios', '91': 'Calzado', '92': 'Sexitive', '93': 'Lonas', '94': 'Pareos', '99': 'Varios' };
  const CAMPOS_OP = { sku: 'string', talle: 'string', color: 'string', precio: 'number', oferta: 'number', stock: 'number', visible: 'boolean' };
  const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
  const plata = x => x == null ? '' : '$' + nf.format(+x);
  const hora = f => f ? new Date(f).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  // un texto EXACTO: los espacios de más (al principio, al final o dobles) se marcan para que se vean
  const exacto = s => {
    if (s == null) return '<span class="vacio-v">vacío</span>';
    const t = String(s); if (t === '') return '<span class="vacio-v">(texto vacío)</span>';
    return esc(t).replace(/^ +| +$|  +/g, m => `<span class="esp" title="${m.length} espacio${m.length > 1 ? 's' : ''} de más">${'␣'.repeat(m.length)}</span>`);
  };

  let D;
  const cargar = async () => {
    if (C.local) { const r = await fetch('../_local/maestro.json', { cache: 'no-store' }); if (!r.ok) throw new Error('falta _local/maestro.json'); return r.json(); }
    const { data, error } = await sb.rpc('maestro_datos'); if (error) throw error; return data;
  };
  try { D = await cargar(); } catch (e) { raiz.innerHTML = `<div class="aviso">No pude traer el maestro: ${esc(e.message)}</div>`; return; }

  // ---------- armar: opciones con su publicación, y lo de Percha ----------
  let PUBS, OPS, porCodigo, codigos;
  const armar = () => {
    PUBS = new Map(D.pubs.map(p => [p[0], { ext: p[0], nombre: p[1], handle: p[2], url: p[3], visible: p[4], atributos: p[5] || [], categorias: p[6] || [], fotos: p[7], foto: p[8], enWeb: p[9], m: p[10] || {}, nota: p[11], modificada: p[12], ops: [] }]));
    OPS = D.ops.map(o => ({ ext: o[0], pub: o[1], pos: o[2], valores: o[3] || [], talle: o[4], color: o[5], otros: o[6], sku: o[7], precio: o[8], oferta: o[9], stock: o[10], sinLimite: o[11], visible: o[12], foto: o[13], enWeb: o[14], m: o[15] || {}, nota: o[16], vid: o[17], mpn: o[18], barcode: o[19], comparar: o[20] }));
    for (const o of OPS) { o.P = PUBS.get(o.pub); if (o.P) o.P.ops.push(o); o.pe = o.vid ? D.percha[o.vid] || null : null; }
    porCodigo = new Map();
    for (const p of PUBS.values()) {
      p.ops.sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
      const cods = [...new Set(p.ops.map(o => valor(o, 'sku') || '').filter(Boolean))];
      const cod = cods[0] || (p.ops.find(o => o.pe)?.pe[0]) || 'sin código';
      p.codigo = cod; p.codigosVarios = cods.length > 1;
      if (!porCodigo.has(cod)) porCodigo.set(cod, { codigo: cod, pubs: [] }); porCodigo.get(cod).pubs.push(p);
    }
    const solo = new Map();
    for (const s of D.solo_percha || []) { const k = s[1]; if (!solo.has(k)) solo.set(k, []); solo.get(k).push(s); }
    for (const [cod, filas] of solo) { if (!porCodigo.has(cod)) porCodigo.set(cod, { codigo: cod, pubs: [] }); porCodigo.get(cod).solo = filas; }
    for (const g of porCodigo.values()) analizar(g);
    codigos = [...porCodigo.values()].sort((a, b) => (a.codigo === 'sin código') - (b.codigo === 'sin código') || String(a.codigo).localeCompare(String(b.codigo), 'es', { numeric: true }));
  };
  // el valor que vale en el maestro: lo editado o, si no se editó, lo de la web
  function valor(x, campo) { return Object.prototype.hasOwnProperty.call(x.m || {}, campo) ? x.m[campo] : x[campo]; }
  const editado = (x, campo) => Object.prototype.hasOwnProperty.call(x.m || {}, campo);
  // diferencias de una opción contra Percha (con los valores del maestro)
  function difs(o) {
    const d = { num: [], nom: [] }, p = o.pe; if (!p) return d;
    const [cod, , talle, color, stock, fallas, precio, oferta, activa, prodActivo, , tipo] = p;
    if (String(valor(o, 'sku') ?? '') !== String(cod ?? '')) d.num.push('código');
    if (+valor(o, 'precio') !== +precio) d.num.push('precio');
    if ((valor(o, 'oferta') == null ? null : +valor(o, 'oferta')) !== (oferta == null ? null : +oferta)) d.num.push('oferta');
    // un pack/kit: su stock en la web sale de sus prendas (tn-push), no de su variante: no se compara acá
    if (tipo !== 'kit' && !o.sinLimite && valor(o, 'stock') != null && +valor(o, 'stock') !== Math.max(0, Math.floor(+stock - +fallas))) d.num.push('stock');
    if (valor(o, 'visible') !== false && (!activa || !prodActivo)) d.num.push('apagado en Percha');
    const tw = valor(o, 'talle'), cw = valor(o, 'color');
    if (o.P.atributos.some(a => /^(talle|talles|talla|tama[ñn]o|medida)$/i.test(a)) && (tw ?? '') !== (talle ?? '')) d.nom.push('talle');
    if (o.P.atributos.some(a => /^(color|colores|estampa)$/i.test(a)) && (cw ?? '') !== (color ?? '')) d.nom.push('color');
    return d;
  }
  function analizar(g) {
    g.n = { ops: 0, dif: 0, nom: 0, sin: 0, ed: 0, oc: 0, solo: (g.solo || []).length };
    g.nombres = g.pubs.map(p => valor(p, 'nombre'));
    for (const p of g.pubs) {
      if (valor(p, 'visible') === false) g.n.oc++;
      if (Object.keys(p.m).length) g.n.ed++;
      for (const o of p.ops) { g.n.ops++; o.d = difs(o); if (o.d.num.length) g.n.dif++; if (o.d.nom.length) g.n.nom++; if (!o.vid) g.n.sin++; if (Object.keys(o.m).length) g.n.ed++; }
    }
    g.fam = FAMILIAS[String(g.codigo).slice(0, 2)] || 'Otros';
    g.texto = (g.codigo + ' ' + g.nombres.join(' ') + ' ' + g.pubs.flatMap(p => p.ops.map(o => (o.valores || []).join(' ') + ' ' + (o.pe ? o.pe[1] + ' ' + (o.pe[2] || '') + ' ' + (o.pe[3] || '') : ''))).join(' ') + ' ' + (g.solo || []).map(s => s[2] + ' ' + (s[3] || '') + ' ' + (s[4] || '')).join(' ')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  armar();

  // ---------- estado de la pantalla ----------
  const S = { q: '', fam: '', vista: 'todo', abiertos: new Set(), mostrar: 60 };
  const VISTAS = [
    ['todo', 'Códigos', g => true, g => 1],
    ['dif', 'Con diferencias', g => g.n.dif > 0, g => g.n.dif, true],
    ['nom', 'Nombre distinto', g => g.n.nom > 0, g => g.n.nom],
    ['sin', 'Sin conectar', g => g.n.sin > 0, g => g.n.sin, true],
    ['solo', 'Solo en Percha', g => g.n.solo > 0, g => g.n.solo],
    ['oc', 'Ocultas', g => g.n.oc > 0, g => g.n.oc],
    ['ed', 'Editado', g => g.n.ed > 0, g => g.n.ed]];
  const filtrar = () => {
    const vista = VISTAS.find(v => v[0] === S.vista), q = S.q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean);
    return codigos.filter(g => vista[2](g) && (!S.fam || g.fam === S.fam) && q.every(w => g.texto.includes(w)));
  };

  // ---------- pintar ----------
  function pintar() {
    const lista = filtrar(), lect = D.lectura, buena = D.ultima_buena;
    const tot = k => codigos.reduce((s, g) => s + (k === 'todo' ? 1 : VISTAS.find(v => v[0] === k)[3](g) * (VISTAS.find(v => v[0] === k)[2](g) ? 1 : 0)), 0);
    raiz.innerHTML = `
      <div class="m-cab">
        <div class="lect">${buena ? `Última lectura de la web: <b>${hora(buena.fin)}</b> · ${C.n(buena.publicaciones)} publicaciones · ${C.n(buena.opciones)} opciones` : 'Todavía no se leyó la web.'}
          ${lect && lect.estado === 'error' ? `<br><span style="color:#8F2A24">La última lectura falló: ${esc(lect.error || '')}</span>` : ''}</div>
        <div style="display:flex;gap:8px;align-items:center"><span class="progreso" id="prog"></span>
          <button class="boton sec" id="exportar">Exportar a Excel</button>
          <button class="boton" id="traer" ${C.local ? 'disabled title="En la vista local no se lee la web"' : ''}>Traer de la web</button></div>
      </div>
      <div class="m-kpis">${VISTAS.map(v => `<button class="m-kpi${S.vista === v[0] ? ' activo' : ''}${v[4] && v[0] !== 'todo' && tot(v[0]) ? ' alerta' : ''}" data-vista="${v[0]}"><div class="et">${v[1]}${{ todo: '', solo: ' (talle·color)', oc: ' (publicaciones)', ed: ' (filas)' }[v[0]] ?? ' (opciones)'}</div><div class="v">${C.n(tot(v[0]))}</div></button>`).join('')}</div>
      <div class="m-leyenda"><span class="mk dif">precio / oferta / stock / código distinto</span><span class="mk nom">nombre de talle o color distinto</span><span class="mk sin">sin conectar a Percha</span><span class="mk ed">editado en el maestro</span><span><span class="esp">␣</span> espacio de más</span><span>Tocá un valor para editarlo · Enter guarda · Esc cancela · «web» vuelve al valor de la web</span></div>
      <div class="m-filtros">
        <input type="search" id="q" placeholder="Buscar código, nombre, talle o color…" value="${esc(S.q)}">
        <select id="fam"><option value="">Todas las familias</option>${[...new Set(codigos.map(g => g.fam))].sort().map(f => `<option${S.fam === f ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select>
        <span class="cuenta">${C.n(lista.length)} código${lista.length === 1 ? '' : 's'}</span>
      </div>
      <div class="m-lista">${lista.slice(0, S.mostrar).map(fila).join('') || '<div class="aviso">Nada con ese filtro.</div>'}</div>
      ${lista.length > S.mostrar ? `<div class="mas"><button class="boton sec" id="mas">Ver ${Math.min(60, lista.length - S.mostrar)} más (quedan ${C.n(lista.length - S.mostrar)})</button></div>` : ''}`;
    enganchar(lista);
  }
  const marcas = g => [
    g.n.dif ? `<span class="mk dif">${g.n.dif} con diferencias</span>` : '', g.n.nom ? `<span class="mk nom">${g.n.nom} nombre distinto</span>` : '',
    g.n.sin ? `<span class="mk sin">${g.n.sin} sin conectar</span>` : '', g.n.solo ? `<span class="mk sin">${g.n.solo} solo en Percha</span>` : '',
    g.n.oc ? `<span class="mk oc">${g.n.oc} oculta${g.n.oc > 1 ? 's' : ''}</span>` : '', g.n.ed ? `<span class="mk ed">editado</span>` : '',
    !g.n.dif && !g.n.nom && !g.n.sin && !g.n.solo && g.pubs.length ? '<span class="mk ok">igual a Percha</span>' : ''].join('');
  function fila(g) {
    const abierto = S.abiertos.has(g.codigo);
    return `<details class="m-cod" data-cod="${esc(g.codigo)}" ${abierto ? 'open' : ''}>
      <summary><span class="cod">${esc(g.codigo)}</span>
        <span class="nom">${g.nombres.length ? g.nombres.map(exacto).join(' · ') : esc((g.solo || [])[0]?.[2] || '')}<small>${esc(g.fam)} · ${g.pubs.length} publicaci${g.pubs.length === 1 ? 'ón' : 'ones'} · ${g.n.ops} opci${g.n.ops === 1 ? 'ón' : 'ones'}${g.n.solo ? ' · ' + g.n.solo + ' solo en Percha' : ''}</small></span>
        <span class="marcas">${marcas(g)}</span></summary>
      ${abierto ? detalle(g) : ''}</details>`;
  }
  // una celda editable: lo que vale en el maestro; si se editó, debajo lo de la web tachado
  function celda(tipo, x, campo, mostrar) {
    const v = valor(x, campo), ed = editado(x, campo);
    return `<span class="ed${ed ? ' editado' : ''}" data-tipo="${tipo}" data-clave="${esc(x.ext)}" data-campo="${campo}" title="Tocá para editar">${mostrar(v)}${ed ? `<a class="volver" data-volver="1" data-tipo="${tipo}" data-clave="${esc(x.ext)}" data-campo="${campo}" title="Volver al valor de la web">web</a><span class="web">${mostrar(x[campo])}</span>` : ''}</span>`;
  }
  const verTexto = v => exacto(v), verPlata = v => v == null ? '<span class="vacio-v">sin oferta</span>' : plata(v), verPrecio = v => v == null ? '<span class="vacio-v">—</span>' : plata(v);
  const verStock = v => v == null ? '<span class="vacio-v">sin límite</span>' : C.n(v), verVis = v => v === false ? 'oculta' : 'visible';
  function detalle(g) {
    return g.pubs.map(p => {
      const iT = p.atributos.findIndex(a => /^(talle|talles|talla|tama[ñn]o|medida)$/i.test(a)), iC = p.atributos.findIndex(a => /^(color|colores|estampa)$/i.test(a));
      const otrosAttr = p.atributos.filter((a, i) => i !== iT && i !== iC);
      return `<div class="m-pub">
        <div class="m-pub-cab">${p.foto ? `<img src="${esc(p.foto)}" alt="" loading="lazy">` : '<img alt="">'}
          <div class="info"><div style="font:700 15px var(--f-ui)">${celda('publicacion', p, 'nombre', verTexto)}</div>
            <div class="det">Publicación #${esc(p.ext)} · ${celda('publicacion', p, 'visible', verVis)} · atributos: ${p.atributos.length ? p.atributos.map(a => '«' + exacto(a) + '»').join(', ') : 'ninguno'} · ${p.fotos || 0} foto${p.fotos === 1 ? '' : 's'}${p.categorias.length ? ' · ' + p.categorias.map(esc).join(', ') : ''}${p.url ? ` · <a href="${esc(p.url)}" target="_blank" rel="noopener">ver en la web ↗</a>` : ''}${!p.enWeb ? ' · <b style="color:#8F2A24">ya no está en la web</b>' : ''}${p.codigosVarios ? ' · <b style="color:#8F2A24">sus opciones tienen distintos SKU</b>' : ''}</div></div></div>
        <table class="mt"><thead>
          <tr><th class="grupo" colspan="${7 + otrosAttr.length}">Web · maestro (editable)</th><th class="grupo sep" colspan="5">Percha</th></tr>
          <tr>${iT >= 0 ? `<th>${esc(p.atributos[iT])}</th>` : '<th>Talle</th>'}${iC >= 0 ? `<th>${esc(p.atributos[iC])}</th>` : '<th>Color</th>'}${otrosAttr.map(a => `<th>${esc(a)}</th>`).join('')}
            <th>SKU</th><th class="n">Precio</th><th class="n">Oferta</th><th class="n">Stock</th><th>Visible</th>
            <th class="sep">Talle · color</th><th>Código</th><th class="n">Precio</th><th class="n">Oferta</th><th class="n">Stock</th></tr></thead>
        <tbody>${p.ops.map(o => opcion(o, iT, iC, otrosAttr.length)).join('')}</tbody></table>
        ${p.nota ? `<div class="det">Nota: ${esc(p.nota)}</div>` : ''}</div>`;
    }).join('') + (g.solo ? soloPercha(g.solo) : '');
  }
  function opcion(o, iT, iC, nOtros) {
    const p = o.pe, d = o.d || { num: [], nom: [] }, marca = (k, html) => d.num.includes(k) ? `<span class="dif-v">${html}</span>` : html;
    const otros = (o.otros || '').split(' / ');
    const per = p ? `<td class="sep percha">${d.nom.length ? `<span class="nom-v">${exacto(p[2] || '')}${p[3] ? ' · ' + exacto(p[3]) : ''}</span>` : `${exacto(p[2] || '')}${p[3] ? ' · ' + exacto(p[3]) : ''}`}${!p[8] || !p[9] ? ' <span class="mk dif">apagado</span>' : ''}<div class="det" style="font-size:11.5px;color:var(--tinta-3)">${esc(p[1])}</div></td>
      <td class="percha tm">${marca('código', esc(p[0]))}</td><td class="n percha">${marca('precio', plata(p[6]))}</td><td class="n percha">${marca('oferta', p[7] == null ? '<span class="vacio-v">sin oferta</span>' : plata(p[7]))}</td>
      <td class="n percha">${p[11] === 'kit' ? '<span class="vacio-v" title="El stock de un pack sale de las prendas que lo forman">pack</span>' : marca('stock', C.n(Math.max(0, Math.floor(+p[4] - +p[5]))) + (+p[5] ? ` <small title="con falla, solo en el local">(+${C.n(p[5])} falla)</small>` : ''))}</td>`
      : `<td class="sep percha" colspan="5"><span class="mk sin">sin conectar a Percha</span></td>`;
    return `<tr class="${valor(o, 'visible') === false ? 'apagada' : ''}">
      <td>${iT >= 0 ? celda('opcion', o, 'talle', verTexto) : '<span class="vacio-v">—</span>'}</td>
      <td>${iC >= 0 ? celda('opcion', o, 'color', verTexto) : '<span class="vacio-v">—</span>'}</td>
      ${Array.from({ length: nOtros }, (_, i) => `<td>${exacto(otros[i] ?? '')}</td>`).join('')}
      <td class="tm">${celda('opcion', o, 'sku', verTexto)}</td>
      <td class="n">${celda('opcion', o, 'precio', verPrecio)}</td><td class="n">${celda('opcion', o, 'oferta', verPlata)}</td>
      <td class="n">${o.sinLimite ? '<span class="vacio-v">sin límite</span>' : celda('opcion', o, 'stock', verStock)}</td>
      <td>${celda('opcion', o, 'visible', verVis)}${!o.enWeb ? '<div class="mk dif">ya no está</div>' : ''}</td>${per}</tr>`;
  }
  const soloPercha = filas => `<div class="m-pub solo-p"><div class="det" style="font:700 13px var(--f-ui);color:var(--ciruela);margin-bottom:6px">Solo en Percha (prendido y sin opción en la web)</div>
    <table class="mt"><thead><tr><th>Prenda</th><th>Talle</th><th>Color</th><th class="n">Precio</th><th class="n">Oferta</th><th class="n">Stock</th></tr></thead>
    <tbody>${filas.map(s => `<tr><td>${exacto(s[2])}${s[8] !== 'prenda' ? ` <small>(${esc(s[8])})</small>` : ''}</td><td>${exacto(s[3] || '')}</td><td>${exacto(s[4] || '')}</td><td class="n">${plata(s[6])}</td><td class="n">${s[7] == null ? '' : plata(s[7])}</td><td class="n">${C.n(s[5])}</td></tr>`).join('')}</tbody></table></div>`;

  // ---------- eventos ----------
  function enganchar(lista) {
    $('#q').oninput = e => { S.q = e.target.value; S.mostrar = 60; const pos = e.target.selectionStart; pintar(); const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); };
    $('#fam').onchange = e => { S.fam = e.target.value; S.mostrar = 60; pintar(); };
    raiz.querySelectorAll('[data-vista]').forEach(b => b.onclick = () => { S.vista = b.dataset.vista; S.mostrar = 60; pintar(); });
    const mas = $('#mas'); if (mas) mas.onclick = () => { S.mostrar += 60; pintar(); };
    raiz.querySelectorAll('details.m-cod').forEach(dt => dt.addEventListener('toggle', () => {
      const cod = dt.dataset.cod, g = porCodigo.get(cod);
      if (dt.open) { S.abiertos.add(cod); if (!dt.querySelector('.m-pub')) { dt.insertAdjacentHTML('beforeend', detalle(g)); engancharEd(dt); } } else S.abiertos.delete(cod);
    }));
    raiz.querySelectorAll('details.m-cod[open]').forEach(engancharEd);
    $('#traer').onclick = traer; $('#exportar').onclick = () => exportar(lista);
  }
  function engancharEd(cont) {
    cont.querySelectorAll('.ed').forEach(el => el.onclick = e => { if (e.target.closest('[data-volver]') || el.querySelector('input,select')) return; e.preventDefault(); editar(el); });
    cont.querySelectorAll('[data-volver]').forEach(a => a.onclick = async e => { e.preventDefault(); e.stopPropagation(); await guardar(a.dataset.tipo, a.dataset.clave, a.dataset.campo, null, true); });
  }
  const objeto = (tipo, clave) => tipo === 'publicacion' ? PUBS.get(clave) : OPS.find(o => o.ext === clave);
  function editar(el) {
    const { tipo, clave, campo } = el.dataset, x = objeto(tipo, clave), v = valor(x, campo);
    const clase = tipo === 'publicacion' ? (campo === 'visible' ? 'boolean' : 'string') : CAMPOS_OP[campo];
    let ctl;
    if (clase === 'boolean') ctl = `<select><option value="true"${v !== false ? ' selected' : ''}>visible</option><option value="false"${v === false ? ' selected' : ''}>oculta</option></select>`;
    else ctl = `<input type="text" value="${esc(v ?? '')}" ${clase === 'number' ? `inputmode="decimal" placeholder="${campo === 'oferta' ? 'vacío = sin oferta' : ''}"` : ''}>`;
    el.innerHTML = ctl; const inp = el.querySelector('input,select'); inp.focus(); if (inp.select) inp.select();
    let hecho = false;   // Enter guarda y después el campo pierde el foco: que no se guarde dos veces
    const fin = async ok => {
      if (hecho) return; hecho = true;
      if (!ok) return repintarCodigo(x);
      let nuevo;
      if (clase === 'boolean') nuevo = inp.value === 'true';
      else if (clase === 'number') { const t = inp.value.trim().replace(/\$/g, '').replace(/\./g, '').replace(',', '.'); if (t === '') nuevo = null; else { nuevo = Number(t); if (!isFinite(nuevo) || nuevo < 0) { inp.style.borderColor = '#8F2A24'; inp.title = 'Número inválido'; return; } } }
      else nuevo = inp.value;   // EXACTO: no se recorta
      if (JSON.stringify(nuevo) === JSON.stringify(v)) return repintarCodigo(x);
      await guardar(tipo, clave, campo, nuevo, false);
    };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); fin(true); } else if (e.key === 'Escape') { e.preventDefault(); fin(false); } };
    if (clase === 'boolean') inp.onchange = () => fin(true); else inp.onblur = () => fin(true);
  }
  async function guardar(tipo, clave, campo, valorNuevo, volver) {
    const x = objeto(tipo, clave);
    if (!C.local) {
      const { error } = await sb.rpc('maestro_editar', { p_tipo: tipo, p_clave: clave, p_campo: campo, p_valor: valorNuevo, p_volver: volver });
      if (error) { alert('No se guardó: ' + error.message); return repintarCodigo(x); }
    }
    if (volver) delete x.m[campo]; else x.m[campo] = valorNuevo;
    repintarCodigo(x);
  }
  function repintarCodigo(x) {
    const p = x.P || x, g = porCodigo.get(p.codigo); analizar(g);
    const dt = [...raiz.querySelectorAll('details.m-cod')].find(d => d.dataset.cod === g.codigo); if (!dt) return pintar();
    const tmp = document.createElement('div'); tmp.innerHTML = fila(g); const nuevo = tmp.firstElementChild; dt.replaceWith(nuevo);
    nuevo.addEventListener('toggle', () => { if (nuevo.open) { S.abiertos.add(g.codigo); if (!nuevo.querySelector('.m-pub')) { nuevo.insertAdjacentHTML('beforeend', detalle(g)); engancharEd(nuevo); } } else S.abiertos.delete(g.codigo); });
    engancharEd(nuevo);
  }

  // ---------- leer la web (a pedido) ----------
  async function traer() {
    const b = $('#traer'), prog = $('#prog'); b.disabled = true; prog.textContent = 'Pidiendo la web…';
    try {
      const { data: t, error } = await sb.rpc('maestro_traer'); if (error) throw error;
      for (let i = 0; i < 200; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const { data: s, error: e2 } = await sb.rpc('maestro_paso', { p_lectura: t.lectura }); if (e2) throw e2;
        if (s.estado === 'leyendo') { prog.textContent = `Leyendo la web: página ${s.pagina}${s.reintento ? ' (la web pidió esperar, reintento ' + s.reintento + ')' : ''}…`; continue; }
        if (s.estado === 'error') throw new Error(s.error || 'la lectura falló');
        prog.textContent = `Listo: ${C.n(s.publicaciones)} publicaciones · ${C.n(s.opciones)} opciones`; break;
      }
      D = await cargar(); armar(); pintar();
    } catch (e) { prog.textContent = ''; alert('No se pudo leer la web: ' + e.message); b.disabled = false; }
  }

  // ---------- exportar (todo lo filtrado, una fila por opción; con ; y BOM para Excel) ----------
  function exportar(lista) {
    const q = v => { v = v == null ? '' : String(v); return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const cab = ['Código', 'Familia', 'Publicación', 'Nombre web', 'Nombre maestro', 'Publicación visible', 'Atributos', 'Opción', 'Valores web (exactos)', 'Talle web', 'Talle maestro', 'Color web', 'Color maestro', 'Otros atributos',
      'SKU web', 'SKU maestro', 'Precio web', 'Precio maestro', 'Oferta web', 'Oferta maestro', 'Stock web', 'Stock maestro', 'Visible web', 'Visible maestro',
      'Percha código', 'Percha prenda', 'Percha talle', 'Percha color', 'Percha precio web', 'Percha oferta', 'Percha stock web', 'Percha fallas', 'Percha prendido', 'Diferencias', 'Nombre distinto'];
    const filas = [cab.join(';')];
    for (const g of lista) {
      for (const p of g.pubs) for (const o of p.ops) {
        const pe = o.pe || [], d = o.d || { num: [], nom: [] };
        filas.push([g.codigo, g.fam, p.ext, p.nombre, valor(p, 'nombre'), p.visible ? 'sí' : 'no', p.atributos.join(' / '), o.ext, (o.valores || []).join(' / '), o.talle, valor(o, 'talle'), o.color, valor(o, 'color'), o.otros,
          o.sku, valor(o, 'sku'), o.precio, valor(o, 'precio'), o.oferta, valor(o, 'oferta'), o.sinLimite ? 'sin límite' : o.stock, o.sinLimite ? 'sin límite' : valor(o, 'stock'), o.visible ? 'sí' : 'no', valor(o, 'visible') === false ? 'no' : 'sí',
          pe[0], pe[1], pe[2], pe[3], pe[6], pe[7], pe.length ? Math.max(0, Math.floor(+pe[4] - +pe[5])) : '', pe[5], pe.length ? (pe[8] && pe[9] ? 'sí' : 'no') : '', d.num.join(', '), d.nom.join(', ')].map(q).join(';'));
      }
      for (const s of g.solo || []) filas.push([g.codigo, g.fam, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', s[1], s[2], s[3], s[4], s[6], s[7], s[5], '', 'sí', 'solo en Percha', ''].map(q).join(';'));
    }
    const blob = new Blob(['﻿' + filas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `maestro-augusta-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  pintar();
})();
