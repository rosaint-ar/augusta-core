// Augusta Core · Etiquetas de la web
// Se arman acá y las coloca etiquetas.js en www (lee la vista pública v_web_etiquetas). El motor (motor.js) es el mismo en los dos
// lados: qué productos entran en cada conjunto y cómo se dibuja cada etiqueta. Los productos salen del catálogo público de la
// web (catalog.js de www, el mismo que usa la tienda), así las fotos y las reglas coinciden con lo que ve la clienta.
(async function () {
  if (!(await CORE.listo)) return;
  const C = CORE, M = window.AugustaEtiquetasMotor, $ = s => document.querySelector(s), raiz = $('#contenido');
  const WEB = 'https://www.augustaintimates.com/';

  // ---------- datos: base de Augusta (o memoria del navegador en la vista local sin login) ----------
  const CAMPOS = {
    web_etiquetas: ['nombre', 'texto', 'texto_2', 'estilo', 'posicion', 'en_tarjeta', 'en_ficha', 'texto_ficha', 'texto_boton', 'conjuntos', 'prioridad', 'activa', 'desde', 'hasta'],
    web_conjuntos: ['nombre', 'descripcion', 'productos', 'excluidos', 'reglas'] };
  const limpio = (t, f) => Object.fromEntries(CAMPOS[t].map(k => [k, f[k] === undefined ? null : f[k]]));
  const LS = 'core_etiquetas_local';
  const Datos = C.local ? {
    async listar(t) { try { return (JSON.parse(localStorage.getItem(LS) || '{}')[t]) || []; } catch { return []; } },
    async guardar(t, f) { const d = JSON.parse(localStorage.getItem(LS) || '{}'), l = d[t] || [], fila = Object.assign({}, limpio(t, f), { id: f.id || crypto.randomUUID(), modificado: new Date().toISOString() });
      d[t] = [fila, ...l.filter(x => x.id !== fila.id)]; localStorage.setItem(LS, JSON.stringify(d)); return fila; },
    async borrar(t, id) { const d = JSON.parse(localStorage.getItem(LS) || '{}'); d[t] = (d[t] || []).filter(x => x.id !== id); localStorage.setItem(LS, JSON.stringify(d)); }
  } : {
    async listar(t) { const { data, error } = await sb.from(t).select('*').order('modificado', { ascending: false }); if (error) throw new Error(error.message); return data || []; },
    async guardar(t, f) { const datos = limpio(t, f);
      const q = f.id ? sb.from(t).update(datos).eq('id', f.id).select().single() : sb.from(t).insert(datos).select().single();
      const { data, error } = await q; if (error) throw new Error(/row-level|permission/i.test(error.message) ? 'Tu usuario no tiene permiso para cambiar etiquetas (hace falta ser dueña o admin).' : error.message); return data; },
    async borrar(t, id) { const { error } = await sb.from(t).delete().eq('id', id); if (error) throw new Error(error.message); }
  };

  // ---------- catálogo de la web ----------
  function traerCatalogo() {
    return new Promise((ok, mal) => {
      if (window.AUGUSTA_CATALOG) return ok(window.AUGUSTA_CATALOG);
      const s = document.createElement('script'); s.src = WEB + 'catalog.js?core=' + Math.floor(Date.now() / 600000);
      s.onload = () => window.AUGUSTA_CATALOG ? ok(window.AUGUSTA_CATALOG) : mal(new Error('El catálogo de la web vino vacío.'));
      s.onerror = () => mal(new Error('No pude leer el catálogo de la web (www.augustaintimates.com).')); document.head.appendChild(s);
    });
  }
  let CAT, PRODS = [], POR_ID = new Map(), CATS = new Map(), ETQ = [], CNJ = [];
  try { [CAT, ETQ, CNJ] = await Promise.all([traerCatalogo(), Datos.listar('web_etiquetas'), Datos.listar('web_conjuntos')]); }
  catch (e) { raiz.innerHTML = `<div class="aviso">No pude abrir Etiquetas: ${C.esc(e.message)}</div>`; return; }
  PRODS = CAT.products || []; POR_ID = new Map(PRODS.map(p => [Number(p.id), p])); CATS = new Map((CAT.categories || []).map(c => [Number(c.id), c]));

  const foto = (p, w = 480) => { const s = String(p?.images?.[0]?.src || ''); return /mitiendanube\.com\/.+-\d+-\d+\.(?:png|jpe?g|webp)$/i.test(s) ? s.replace(/-\d+-\d+\.(?:png|jpe?g|webp)$/i, w >= 1024 ? '-1024-1024.webp' : `-${w}-0.webp`) : s; };
  const partes = p => { const n = M.nombreDe(p), m = n.match(/^(.*?)«(.+?)»(.*)$/);
    return m ? { tipo: m[1].trim() || 'Augusta', titulo: m[2].trim(), mat: m[3].trim() } : { tipo: 'Augusta', titulo: n, mat: '' }; };
  const cap = s => s ? s.charAt(0) + s.slice(1).toLowerCase() : '';
  const hay = p => (p.variants || []).some(M.disponible);
  const rutaCat = id => { const c = CATS.get(Number(id)); if (!c) return 'Categoría ' + id; const papa = c.parent && CATS.get(Number(c.parent)); return (papa && papa.parent ? papa.name + ' › ' : '') + c.name; };
  const conjunto = id => CNJ.find(c => c.id === id);
  const idsDe = c => c ? M.productosDe(c, PRODS) : [];
  const idsEtq = e => [...new Set((e.conjuntos || []).flatMap(id => idsDe(conjunto(id))))];
  const conConjuntos = e => Object.assign({}, e, { conjuntos: (e.conjuntos || []).map(conjunto).filter(Boolean) });   // formato de la vista pública
  const fechaCorta = f => f ? new Date(f).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const ESTADO_CLASE = { 'en la web': 's-web', programada: 's-programada', pausada: 's-pausada', vencida: 's-vencida' };

  // ---------- pantalla principal ----------
  const S = { pestana: 'etiquetas' };
  function pintar() {
    raiz.innerHTML = `<div class="pestanas">
        <button class="chip ${S.pestana === 'etiquetas' ? 'activo' : ''}" data-pestana="etiquetas">Etiquetas (${ETQ.length})</button>
        <button class="chip ${S.pestana === 'conjuntos' ? 'activo' : ''}" data-pestana="conjuntos">Conjuntos de productos (${CNJ.length})</button>
        <span class="der">${S.pestana === 'etiquetas' ? `<a class="chip" href="${WEB}?etiquetas=prueba#catalogo/todos" target="_blank" rel="noopener" title="La web muestra también las pausadas y programadas">Ver en la web (prueba) ↗</a><button class="boton" data-nueva-etq>+ Nueva etiqueta</button>`
          : '<button class="boton" data-nuevo-cnj>+ Nuevo conjunto</button>'}</span></div>
      <div id="lista"></div>
      ${C.local ? '<p class="aviso-suave" style="margin-top:16px;position:relative;z-index:1">Vista local de prueba: lo que guardes queda solo en este navegador.</p>' : ''}`;
    S.pestana === 'etiquetas' ? listaEtiquetas() : listaConjuntos();
  }
  function listaEtiquetas() {
    const el = $('#lista');
    if (!ETQ.length) { el.innerHTML = `<div class="vacio-grande"><h2>Todavía no hay etiquetas</h2><p>Armá la primera: por ejemplo <b>PREVENTA</b> para un conjunto de productos.<br>Primero creás (o elegís) el conjunto de productos y después le ponés la etiqueta.</p><button class="boton" data-nueva-etq>+ Nueva etiqueta</button></div>`; return; }
    el.innerHTML = `<div class="grilla-et">${ETQ.map(e => { const ids = idsEtq(e), p = POR_ID.get(ids[0]) || PRODS.find(hay), est = M.estado(e);
      return `<article class="et-card"><div class="foto aet-anfitrion">${p ? `<img src="${C.esc(foto(p))}" alt="" loading="lazy">` : ''}${M.capa([e])}</div>
        <div class="cuerpo"><span class="estado ${ESTADO_CLASE[est]}">${est === 'en la web' ? 'En la web' : cap(est)}</span><h3>${C.esc(e.nombre || e.texto)}</h3>
          <div class="sub">${C.n(ids.length)} productos · ${C.esc((e.conjuntos || []).map(id => conjunto(id)?.nombre).filter(Boolean).join(', ') || 'sin conjunto')}</div>
          <div class="sub">${[e.en_tarjeta && 'tarjetas', e.en_ficha && 'ficha', e.texto_ficha && 'recuadro en la ficha', e.texto_boton && 'botón'].filter(Boolean).join(' · ')}${e.desde || e.hasta ? ` · ${e.desde ? 'desde ' + fechaCorta(e.desde) : ''}${e.hasta ? ' hasta ' + fechaCorta(e.hasta) : ''}` : ''}</div>
          <div class="acciones"><button class="chip chico" data-editar="${e.id}">Editar</button><button class="chip chico" data-alternar="${e.id}">${e.activa ? 'Pausar' : 'Activar'}</button>
            <button class="chip chico" data-duplicar="${e.id}">Duplicar</button>${ids[0] ? `<a class="chip chico" target="_blank" rel="noopener" href="${WEB}?etiquetas=prueba#producto/${ids[0]}">Ver ↗</a>` : ''}</div></div></article>`; }).join('')}</div>`;
  }
  function listaConjuntos() {
    const el = $('#lista');
    if (!CNJ.length) { el.innerHTML = `<div class="vacio-grande"><h2>Todavía no hay conjuntos</h2><p>Un conjunto es un grupo de productos de la web: los elegís a mano, por reglas (categoría, palabra, sin stock, precio) o las dos cosas.</p><button class="boton" data-nuevo-cnj>+ Nuevo conjunto</button></div>`; return; }
    el.innerHTML = `<div class="grilla-et">${CNJ.map(c => { const ids = idsDe(c), usan = ETQ.filter(e => (e.conjuntos || []).includes(c.id));
      return `<article class="et-card conj-card"><div class="fotos">${ids.slice(0, 5).map(id => `<img src="${C.esc(foto(POR_ID.get(id), 240))}" alt="" loading="lazy">`).join('') || '<div style="grid-column:1/-1;padding:30px;text-align:center;color:var(--tinta-3)">Sin productos</div>'}</div>
        <div class="cuerpo"><h3>${C.esc(c.nombre)}</h3><div class="sub">${C.n(ids.length)} productos${(c.productos || []).length ? ` · ${C.n(c.productos.length)} a mano` : ''}${M.tieneReglas(c.reglas) ? ' · con reglas' : ''}</div>
          <div class="sub">${usan.length ? 'Lo usa: ' + C.esc(usan.map(e => e.nombre || e.texto).join(', ')) : 'Ninguna etiqueta lo usa todavía'}</div>
          <div class="acciones"><button class="chip chico" data-editar-cnj="${c.id}">Editar</button><button class="chip chico" data-duplicar-cnj="${c.id}">Duplicar</button></div></div></article>`; }).join('')}</div>`;
  }

  // ---------- editor de etiqueta ----------
  const ed = $('#editor'), velo = $('#velo');
  const abrir = html => { ed.innerHTML = html; ed.classList.add('abierto'); velo.classList.add('abierto'); ed.setAttribute('aria-hidden', 'false'); };
  const cerrar = () => { ed.classList.remove('abierto'); velo.classList.remove('abierto'); ed.setAttribute('aria-hidden', 'true'); ed.innerHTML = ''; };
  velo.onclick = () => { if (confirmarSalida()) cerrar(); };
  let sucio = false; const confirmarSalida = () => !sucio || window.confirm('Hay cambios sin guardar. ¿Salir igual?');
  addEventListener('keydown', ev => { if (ev.key === 'Escape' && ed.classList.contains('abierto') && confirmarSalida()) { const vuelve = ed.dataset.vuelve; cerrar(); if (vuelve) editarEtiqueta(JSON.parse(vuelve)); } });

  const NUEVA = () => ({ nombre: '', texto: 'PREVENTA', texto_2: '', estilo: { base: 'web-ciruela' }, posicion: 'arriba-izq', en_tarjeta: true, en_ficha: true, texto_ficha: '', texto_boton: '', conjuntos: [], prioridad: 0, activa: false, desde: null, hasta: null });
  const COLORES = ['#604668', '#70547B', '#9873A6', '#E6DEF0', '#94D8CB', '#465362', '#2b2530', '#ffffff', '#F7F8F4'];
  const ICONOS_LISTA = ['', 'rayo', 'reloj', 'estrella', 'brillo', 'corazon', 'fuego', 'regalo', 'camion', 'check', 'porcentaje'];
  const POS_ZONAS = { 'arriba-izq': 'left:4%;top:3%;width:42%;height:12%', 'arriba-der': 'right:4%;top:3%;width:42%;height:12%', 'abajo-izq': 'left:4%;bottom:3%;width:42%;height:12%',
    'abajo-der': 'right:4%;bottom:3%;width:42%;height:12%', 'centro': 'left:20%;top:44%;width:60%;height:12%', 'franja-arriba': 'left:0;top:17%;width:100%;height:8%',
    'franja-abajo': 'left:0;bottom:17%;width:100%;height:8%', 'cinta': 'left:0;top:28%;width:36%;height:9%' };
  const NOMBRE_POS = { 'arriba-izq': 'Arriba a la izquierda', 'arriba-der': 'Arriba a la derecha', 'abajo-izq': 'Abajo a la izquierda', 'abajo-der': 'Abajo a la derecha', centro: 'Al centro', 'franja-arriba': 'Franja arriba', 'franja-abajo': 'Franja abajo', cinta: 'Cinta en la esquina' };
  const CORTO_POS = { 'arriba-izq': '↖', 'arriba-der': '↗', 'abajo-izq': '↙', 'abajo-der': '↘', centro: '•', 'franja-arriba': 'franja', 'franja-abajo': 'franja', cinta: 'cinta' };

  let E = null, vistaModo = { donde: 'tarjeta', aparato: 'compu' };
  function editarEtiqueta(e) {
    E = JSON.parse(JSON.stringify(e)); E.estilo = E.estilo || {}; sucio = false; delete ed.dataset.vuelve;
    abrir(`<header class="cab-e"><h2>${E.id ? 'Editar etiqueta' : 'Nueva etiqueta'}</h2><div class="der">${E.id ? '<button class="chip peligro" data-borrar-etq>Borrar</button>' : ''}<button class="chip" data-cancelar>Cancelar</button><button class="boton" data-guardar-etq>Guardar</button></div></header>
      <div class="cuerpo-e"><div class="form" id="f-etq"></div><div class="vista"><div class="vista-cab">
        <span class="seg" id="v-donde"><button data-vd="tarjeta">Tarjetas</button><button data-vd="ficha">Ficha</button></span>
        <span class="seg" id="v-aparato"><button data-va="compu">Compu</button><button data-va="celular">Celular</button></span><span class="nota" id="v-nota"></span></div><div id="v-cuerpo"></div></div></div>`);
    formEtiqueta(); vista();
  }
  const est = () => M.estiloCompleto(E);
  function formEtiqueta() {
    const s = est(), conj = CNJ.map(c => `<button class="chip chico ${E.conjuntos.includes(c.id) ? 'activo' : ''}" data-tcnj="${c.id}">${C.esc(c.nombre)} · ${C.n(idsDe(c).length)}</button>`).join('');
    const estiloBtn = (k, v) => `<button class="${(E.estilo.base || 'web-ciruela') === k && Object.keys(E.estilo).length <= 1 ? 'activo' : ''}" data-estilo="${k}"><span class="muestra">${M.html({ texto: E.texto || 'PREVENTA', estilo: { base: k } })}</span>${C.esc(v.titulo)}</button>`;
    const sw = (campo, actual) => `<div class="colores">${COLORES.map(c => `<button style="background:${c}" class="${String(actual).toLowerCase() === c.toLowerCase() ? 'activo' : ''}" data-color="${campo}" data-valor="${c}" aria-label="${c}"></button>`).join('')}<input type="color" data-colorlibre="${campo}" value="${/^#[0-9a-f]{6}$/i.test(actual) ? actual : '#604668'}" aria-label="Otro color"></div>`;
    const rango = (campo, min, max, paso, val, suf) => `<div class="rango"><input type="range" min="${min}" max="${max}" step="${paso}" value="${val}" data-rango="${campo}"><output>${val}${suf}</output></div>`;
    const dtl = v => v ? new Date(new Date(v).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
    $('#f-etq').innerHTML = `
      <div class="bloque"><h3>Qué dice</h3>
        <label class="campo">Texto de la etiqueta<input type="text" data-c="texto" value="${C.esc(E.texto)}" maxlength="40" placeholder="PREVENTA"></label>
        <label class="campo">Segunda línea (opcional)<input type="text" data-c="texto_2" value="${C.esc(E.texto_2 || '')}" maxlength="40" placeholder="Llega el 5/12"></label>
        <label class="campo">Nombre para reconocerla en el Core<input type="text" data-c="nombre" value="${C.esc(E.nombre || '')}" placeholder="${C.esc(E.texto || 'Preventa verano')}"><small>Solo lo ves vos; si lo dejás vacío se usa el texto.</small></label></div>
      <div class="bloque"><h3>Estilo</h3>
        <div class="estilos"><h4>Copiar el estilo de la web</h4>${['web-ciruela', 'web-lila', 'web-blanca'].map(k => estiloBtn(k, M.ESTILOS[k])).join('')}
          <h4>Más estilos de Augusta</h4>${Object.entries(M.ESTILOS).filter(([k]) => !k.startsWith('web-')).map(([k, v]) => estiloBtn(k, v)).join('')}</div>
        <label class="campo">Forma<span class="seg">${[['rect', 'Recta'], ['redondeada', 'Redondeada'], ['pildora', 'Píldora'], ['circulo', 'Sello redondo']].map(([k, t]) => `<button data-e="forma" data-v="${k}" class="${s.forma === k ? 'activo' : ''}">${t}</button>`).join('')}</span></label>
        <label class="campo">Fondo${sw('fondo', s.fondo)}<span class="seg"><button data-e="fondo" data-v="linear-gradient(135deg,#3f2f47 0%,#604668 55%,#7a5d86 100%)" class="${String(s.fondo).startsWith('linear') ? 'activo' : ''}">Degradé ciruela</button></span></label>
        <label class="campo">Color del texto${sw('color', s.color)}</label>
        <div class="fila2"><label class="campo">Borde${sw('borde', s.borde || '')}</label><label class="campo">Grosor del borde${rango('borde_ancho', 0, 3, 1, s.borde_ancho || 0, ' px')}</label></div>
        <div class="fila2"><label class="campo">Letra<select data-e-sel="fuente">${[['dm', 'DM Sans (la de las insignias de la web)'], ['fraunces', 'Fraunces (títulos)'], ['fraunces-italica', 'Fraunces itálica'], ['source', 'Source Sans (textos)']].map(([k, t]) => `<option value="${k}" ${s.fuente === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="campo">Tamaño${rango('tam', 8, 20, 1, s.tam, ' px')}</label></div>
        <div class="fila3"><label class="campo">Espaciado${rango('esp', 0, 3, 0.1, s.esp, '')}</label><label class="campo">Aire a los lados${rango('px', 2, 24, 1, s.px, '')}</label><label class="campo">Aire arriba/abajo${rango('py', 1, 14, 1, s.py, '')}</label></div>
        <div class="fila2"><label class="interruptor"><input type="checkbox" data-e-check="mayus" ${s.mayus ? 'checked' : ''}> Todo en mayúsculas</label><label class="interruptor"><input type="checkbox" data-e-check="sombra" ${s.sombra ? 'checked' : ''}> Sombra suave</label></div>
        <label class="campo">Ícono<div class="iconos">${ICONOS_LISTA.map(k => `<button data-e="icono" data-v="${k}" class="${(s.icono || '') === k ? 'activo' : ''}" title="${k || 'sin ícono'}">${k ? `<svg viewBox="0 0 24 24">${M.ICONOS[k]}</svg>` : 'no'}</button>`).join('')}</div></label>
        <label class="campo">Movimiento<span class="seg">${[['', 'Quieta'], ['brillo', 'Brillo'], ['pulso', 'Pulso'], ['latido', 'Latido'], ['balanceo', 'Balanceo']].map(([k, t]) => `<button data-e="anim" data-v="${k}" class="${(s.anim || '') === k ? 'activo' : ''}">${t}</button>`).join('')}</span><small>Con moderación: una sola etiqueta con movimiento por página llama más la atención que muchas.</small></label></div>
      <div class="bloque"><h3>Dónde va</h3>
        <div class="pos-fila"><div class="pos-mini">${Object.entries(POS_ZONAS).map(([k, st]) => `<button style="${st}" data-pos="${k}" class="${E.posicion === k ? 'activo' : ''}" title="${NOMBRE_POS[k]}">${CORTO_POS[k]}</button>`).join('')}</div>
          <div style="display:grid;gap:8px;flex:1;min-width:200px"><b style="font:600 13.5px var(--f-ui);color:var(--tinta)">${NOMBRE_POS[E.posicion]}</b>
            <span style="font-size:12.5px;color:var(--tinta-2)">Arriba a la derecha ya aparece la insignia de los eventos (CyberMonday) y abajo a la derecha el contador de fotos: mejor no usar esas esquinas.</span>
            <label class="interruptor"><input type="checkbox" data-c-check="en_tarjeta" ${E.en_tarjeta ? 'checked' : ''}> En las tarjetas (listados, categorías, búsquedas)</label>
            <label class="interruptor"><input type="checkbox" data-c-check="en_ficha" ${E.en_ficha ? 'checked' : ''}> Sobre la foto principal de la ficha</label></div></div>
        <label class="campo">Recuadro en la ficha, arriba del precio (opcional)<input type="text" data-c="texto_ficha" value="${C.esc(E.texto_ficha || '')}" maxlength="160" placeholder="Preventa: la despachamos a partir del 5 de diciembre."></label>
        <label class="campo">Texto del botón de compra (opcional)<input type="text" data-c="texto_boton" value="${C.esc(E.texto_boton || '')}" maxlength="40" placeholder="Reservar en preventa"><small>Reemplaza «Agregar a mi bolsa» solo en estos productos. Vacío = queda como siempre.</small></label></div>
      <div class="bloque"><h3>A qué productos</h3>
        <div class="conj-chips">${conj || '<span style="font-size:13px;color:var(--tinta-2)">Todavía no hay conjuntos.</span>'}<button class="chip chico" data-nuevo-cnj-desde-etq>+ Crear conjunto</button></div>
        <span style="font-size:13px;color:var(--tinta-2)" id="cuenta-prod"></span></div>
      <div class="bloque"><h3>Cuándo</h3>
        <label class="interruptor"><input type="checkbox" data-c-check="activa" ${E.activa ? 'checked' : ''}> Activa en la web</label>
        <div class="fila2"><label class="campo">Desde (opcional)<input type="datetime-local" data-fecha="desde" value="${dtl(E.desde)}"></label><label class="campo">Hasta (opcional)<input type="datetime-local" data-fecha="hasta" value="${dtl(E.hasta)}"></label></div>
        <label class="campo">Prioridad<input type="number" data-c-num="prioridad" value="${Number(E.prioridad) || 0}" min="-10" max="10"><small>Si dos etiquetas caen en el mismo producto y la misma esquina, se apilan: arriba la de mayor prioridad.</small></label></div>`;
    cuentaProd();
  }
  function cuentaProd() { const n = idsEtq(E).length, el = $('#cuenta-prod'); if (el) el.textContent = E.conjuntos.length ? `La etiqueta va a aparecer en ${n} producto${n === 1 ? '' : 's'} de la web.` : 'Elegí al menos un conjunto: sin productos la etiqueta no aparece en ningún lado.'; }

  // vista previa: réplica de la tarjeta y de la ficha de la web, con productos reales del conjunto
  function vista() {
    ed.querySelectorAll('[data-vd]').forEach(b => b.classList.toggle('activo', b.dataset.vd === vistaModo.donde));
    ed.querySelectorAll('[data-va]').forEach(b => b.classList.toggle('activo', b.dataset.va === vistaModo.aparato));
    const ids = idsEtq(E), lista = (ids.length ? ids.map(id => POR_ID.get(id)) : PRODS.filter(hay)).filter(Boolean).slice(0, vistaModo.aparato === 'celular' ? 4 : 6);
    $('#v-nota').textContent = ids.length ? `Productos reales del conjunto (${C.n(ids.length)})` : 'Productos de muestra (todavía no hay conjunto)';
    const etq = conConjuntos(E), card = p => { const pt = partes(p), pr = M.precioDe(p);
      return `<article class="w-card"><div class="w-img aet-anfitrion"><img src="${C.esc(foto(p))}" alt="" loading="lazy"><span class="w-fotos">${(p.images || []).length} fotos</span>${E.en_tarjeta ? M.capa([etq]) : ''}</div>
        <div class="w-copy"><div class="w-tipo">${C.esc(cap(pt.tipo))}</div><div class="w-tit">${C.esc(cap(pt.titulo))}</div><div class="w-mat">${C.esc(cap(pt.mat) || ' ')}</div><div class="w-precio">$${C.n(pr)}</div></div></article>`; };
    const p0 = lista[0];
    $('#v-cuerpo').innerHTML = `<div class="w-marco ${vistaModo.aparato}">${vistaModo.donde === 'tarjeta'
      ? (E.en_tarjeta ? `<div class="w-grid">${lista.map(card).join('')}</div>` : '<p class="aviso-suave">Esta etiqueta no va en las tarjetas.</p>')
      : (p0 ? `<div class="w-ficha"><div class="w-foto aet-anfitrion"><img src="${C.esc(foto(p0, 640))}" alt="">${E.en_ficha ? M.capa([etq]) : ''}</div>
          <div><h4>${C.esc(cap(partes(p0).titulo))}</h4><div class="w-mat" style="font:400 14px Source,'Source Sans 3',sans-serif;color:#465362">${C.esc(cap(partes(p0).mat))}</div>
          ${E.texto_ficha ? M.textoFicha(etq) : ''}<div class="w-precio">$${C.n(M.precioDe(p0))}</div>
          <div class="w-boton">${C.esc(E.texto_boton || 'Agregar a mi bolsa')} <span>→</span></div></div></div>` : '')}</div>`;
  }

  // ---------- eventos del editor de etiqueta ----------
  function tocar(fn, conForm) { fn(); sucio = true; if (conForm) formEtiqueta(); else cuentaProd(); vista(); }
  ed.addEventListener('input', ev => {
    const t = ev.target; if (!E || !ed.querySelector('#f-etq')) return;
    if (t.dataset.c) tocar(() => { E[t.dataset.c] = t.value; });
    else if (t.dataset.rango) { tocar(() => { E.estilo[t.dataset.rango] = Number(t.value); }); t.nextElementSibling.textContent = t.value + (t.dataset.rango === 'tam' || t.dataset.rango === 'borde_ancho' ? ' px' : ''); }
    else if (t.dataset.colorlibre) tocar(() => { E.estilo[t.dataset.colorlibre] = t.value; });
    else if (t.dataset.cNum) tocar(() => { E[t.dataset.cNum] = Number(t.value) || 0; });
  });
  ed.addEventListener('change', ev => {
    const t = ev.target; if (!E || !ed.querySelector('#f-etq')) return;
    if (t.dataset.eSel) tocar(() => { E.estilo[t.dataset.eSel] = t.value; });
    else if (t.dataset.eCheck) tocar(() => { E.estilo[t.dataset.eCheck] = t.checked; });
    else if (t.dataset.cCheck) tocar(() => { E[t.dataset.cCheck] = t.checked; });
    else if (t.dataset.fecha) tocar(() => { E[t.dataset.fecha] = t.value ? new Date(t.value).toISOString() : null; });
    else if (t.dataset.colorlibre) formEtiqueta();
  });
  ed.addEventListener('click', async ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.cancelar !== undefined) { if (confirmarSalida()) { const vuelve = ed.dataset.vuelve; cerrar(); if (vuelve) editarEtiqueta(JSON.parse(vuelve)); } return; }
    if (b.dataset.vd) { vistaModo.donde = b.dataset.vd; return vista(); }
    if (b.dataset.va) { vistaModo.aparato = b.dataset.va; return vista(); }
    if (!E || !ed.querySelector('#f-etq')) return;
    ev.preventDefault();
    if (b.dataset.estilo) return tocar(() => { E.estilo = { base: b.dataset.estilo }; }, true);
    if (b.dataset.e) return tocar(() => { E.estilo[b.dataset.e] = b.dataset.v; if (b.dataset.e === 'forma' && b.dataset.v === 'circulo' && E.posicion.startsWith('franja')) E.posicion = 'arriba-izq'; }, true);
    if (b.dataset.color) return tocar(() => { E.estilo[b.dataset.color] = b.dataset.valor; if (b.dataset.color === 'borde' && !E.estilo.borde_ancho) E.estilo.borde_ancho = 1; }, true);
    if (b.dataset.pos) return tocar(() => { E.posicion = b.dataset.pos; }, true);
    if (b.dataset.tcnj) return tocar(() => { const id = b.dataset.tcnj; E.conjuntos = E.conjuntos.includes(id) ? E.conjuntos.filter(x => x !== id) : [...E.conjuntos, id]; }, true);
    if (b.dataset.nuevoCnjDesdeEtq !== undefined) { const vuelve = JSON.stringify(E); editarConjunto({ nombre: E.texto ? cap(E.texto) : '', descripcion: '', productos: [], excluidos: [], reglas: {} }, vuelve); return; }
    if (b.dataset.guardarEtq !== undefined) return guardarEtiqueta(b);
    if (b.dataset.borrarEtq !== undefined) { if (!window.confirm(`¿Borrar la etiqueta «${E.nombre || E.texto}»? Sale de la web en unos minutos.`)) return;
      try { await Datos.borrar('web_etiquetas', E.id); ETQ = ETQ.filter(x => x.id !== E.id); sucio = false; cerrar(); pintar(); } catch (e) { window.alert(e.message); } }
  });
  async function guardarEtiqueta(btn) {
    if (!String(E.texto || '').trim()) return window.alert('La etiqueta necesita un texto.');
    if (E.desde && E.hasta && Date.parse(E.hasta) <= Date.parse(E.desde)) return window.alert('«Hasta» tiene que ser después de «Desde».');
    if (E.activa && !E.conjuntos.length && !window.confirm('Está activa pero no tiene conjunto: no va a aparecer en ningún producto. ¿Guardar igual?')) return;
    btn.disabled = true; btn.textContent = 'Guardando…';
    try { const fila = await Datos.guardar('web_etiquetas', Object.assign({}, E, { nombre: E.nombre || E.texto }));
      ETQ = [fila, ...ETQ.filter(x => x.id !== fila.id)]; sucio = false; cerrar(); S.pestana = 'etiquetas'; pintar(); }
    catch (e) { window.alert('No se pudo guardar: ' + e.message); btn.disabled = false; btn.textContent = 'Guardar'; }
  }

  // ---------- editor de conjunto ----------
  let K = null, busq = '', mostrar = 60;
  function editarConjunto(c, vuelve) {
    K = JSON.parse(JSON.stringify(c)); K.reglas = K.reglas || {}; K.productos = (K.productos || []).map(Number); K.excluidos = (K.excluidos || []).map(Number); busq = ''; mostrar = 60; sucio = false;
    abrir(`<header class="cab-e"><h2>${K.id ? 'Editar conjunto' : 'Nuevo conjunto'}</h2><div class="der">${K.id ? '<button class="chip peligro" data-borrar-cnj>Borrar</button>' : ''}<button class="chip" data-cancelar>${vuelve ? 'Volver a la etiqueta' : 'Cancelar'}</button><button class="boton" data-guardar-cnj>Guardar conjunto</button></div></header>
      <div class="cuerpo-e"><div class="form" id="f-cnj"></div><div class="vista" id="r-cnj"></div></div>`);
    if (vuelve) ed.dataset.vuelve = vuelve; else delete ed.dataset.vuelve;
    E = null; formConjunto(); resultado();
  }
  function formConjunto() {
    const r = K.reglas, cats = new Set((r.categorias || []).map(Number));
    // árbol de categorías de la web (padres antes que hijas)
    const hijos = id => (CAT.categories || []).filter(c => Number(c.parent || 0) === Number(id || 0));
    const rama = (id, nivel) => hijos(id).map(c => `<label style="padding-left:${nivel * 16}px"><input type="checkbox" data-cat="${c.id}" ${cats.has(Number(c.id)) ? 'checked' : ''}> ${C.esc(c.name)}</label>${rama(c.id, nivel + 1)}`).join('');
    $('#f-cnj').innerHTML = `
      <div class="bloque"><h3>Nombre</h3><label class="campo">Nombre del conjunto<input type="text" data-k="nombre" value="${C.esc(K.nombre || '')}" placeholder="Preventa verano"></label>
        <label class="campo">Para qué es (opcional)<input type="text" data-k="descripcion" value="${C.esc(K.descripcion || '')}" placeholder="Pijamas que llegan en diciembre"></label></div>
      <div class="bloque"><h3>Elegir a mano</h3><label class="campo">Buscar en la web<input type="text" id="k-buscar" value="${C.esc(busq)}" placeholder="Nombre del producto (p. ej. «cielo», «bikini», «pantufla»)"></label>
        <div class="prod-grid" id="k-res"></div></div>
      <div class="bloque"><h3>O por reglas (se actualiza solo)</h3>
        <p style="margin:0;font-size:13px;color:var(--tinta-2)">Entran los productos que cumplen <b>todas</b> las reglas que completes. Sirve para que el conjunto se mantenga solo: por ejemplo «todo Pijamas de verano» o «lo que no tiene stock».</p>
        <label class="campo">Categorías de la web (alguna de estas)<div class="arbol">${rama(null, 0) || rama(0, 0)}</div></label>
        <div class="fila2"><label class="campo">Que el nombre tenga alguna de estas palabras<input type="text" data-r="palabras" value="${C.esc((r.palabras || []).join(', '))}" placeholder="cielo, magnolia"></label>
          <label class="campo">Y que NO tenga<input type="text" data-r="sin_palabras" value="${C.esc((r.sin_palabras || []).join(', '))}" placeholder="pack, box"></label></div>
        <label class="campo">Stock<span class="seg">${[['', 'Da igual'], ['con', 'Solo con stock'], ['sin', 'Solo sin stock']].map(([k, t]) => `<button data-stock="${k}" class="${(r.stock || '') === k ? 'activo' : ''}">${t}</button>`).join('')}</span><small>«Sin stock» se usa para preventas de prendas que todavía no llegaron. Ojo: hoy la web oculta lo que no tiene stock (ver el aviso de la derecha).</small></label>
        <div class="fila2"><label class="campo">Precio desde<input type="number" data-r-num="precio_min" value="${r.precio_min || ''}" min="0" placeholder="0"></label><label class="campo">Precio hasta<input type="number" data-r-num="precio_max" value="${r.precio_max || ''}" min="0" placeholder="sin tope"></label></div></div>`;
    buscar();
  }
  function buscar() {
    const el = $('#k-res'); if (!el) return;
    const q = M.sinAcento(busq).trim();
    if (!q) { el.innerHTML = `<p style="grid-column:1/-1;margin:0;font-size:13px;color:var(--tinta-2)">${K.productos.length ? `${C.n(K.productos.length)} elegidos a mano (se ven a la derecha). ` : ''}Escribí para buscar entre los ${C.n(PRODS.length)} productos publicados.</p>`; return; }
    const res = PRODS.filter(p => q.split(/\s+/).every(w => M.sinAcento(M.nombreDe(p) + ' ' + p.id).includes(w))).slice(0, 48);
    el.innerHTML = res.map(p => { const el2 = K.productos.includes(Number(p.id));
      return `<div class="prod ${el2 ? 'elegido' : ''}"><img src="${C.esc(foto(p, 240))}" alt="" loading="lazy"><button class="accion" data-amano="${p.id}" title="${el2 ? 'Sacar' : 'Agregar'}">${el2 ? '✓' : '+'}</button>
        <div class="n">${C.esc(M.nombreDe(p))}</div><div class="d">$${C.n(M.precioDe(p))} · ${hay(p) ? 'con stock' : '<span class="sin">sin stock</span>'}</div></div>`; }).join('') || '<p style="grid-column:1/-1;margin:0;font-size:13px;color:var(--tinta-2)">Nada con ese nombre.</p>';
  }
  function resultado() {
    const el = $('#r-cnj'); if (!el) return;
    const ids = idsDe(K), lista = ids.map(id => POR_ID.get(id)).filter(Boolean).slice(0, mostrar), sinStock = ids.filter(id => !hay(POR_ID.get(id))).length;
    const faltan = K.productos.filter(id => !POR_ID.has(id)).length;
    el.innerHTML = `<div class="resultado-cab"><h3>Entran ${C.n(ids.length)} productos</h3><span style="font-size:13px;color:var(--tinta-2)">${C.n(K.productos.length)} a mano${M.tieneReglas(K.reglas) ? ` · ${C.n(ids.length - K.productos.filter(id => ids.includes(id)).length)} por reglas` : ''}${K.excluidos.length ? ` · ${C.n(K.excluidos.length)} excluidos` : ''}</span></div>
      ${sinStock ? `<p class="aviso-suave">${C.n(sinStock)} de estos productos hoy no tienen stock: la web los oculta, así que la etiqueta no se va a ver en ellos hasta que tengan stock en Percha.</p>` : ''}
      ${faltan ? `<p class="aviso-suave">${C.n(faltan)} productos elegidos a mano ya no están publicados en la web.</p>` : ''}
      <div class="prod-grid" style="margin-top:10px">${lista.map(p => { const aMano = K.productos.includes(Number(p.id));
        return `<div class="prod"><img src="${C.esc(foto(p, 240))}" alt="" loading="lazy">${aMano ? '' : '<span class="por">por regla</span>'}<button class="accion" data-quitar="${p.id}" title="Sacar del conjunto">×</button>
          <div class="n">${C.esc(M.nombreDe(p))}</div><div class="d">$${C.n(M.precioDe(p))} · ${hay(p) ? 'con stock' : '<span class="sin">sin stock</span>'}</div></div>`; }).join('') || '<p style="grid-column:1/-1;font-size:13px;color:var(--tinta-2)">Elegí productos a mano o completá alguna regla.</p>'}</div>
      ${ids.length > mostrar ? `<button class="chip" data-mas style="margin-top:12px">Ver ${C.n(Math.min(60, ids.length - mostrar))} más</button>` : ''}
      ${K.excluidos.length ? `<details style="margin-top:16px"><summary style="cursor:pointer;font:600 13px var(--f-ui);color:var(--tinta-2)">Excluidos a mano (${K.excluidos.length})</summary><div class="prod-grid" style="margin-top:10px">${K.excluidos.map(id => POR_ID.get(id)).filter(Boolean).map(p => `<div class="prod"><img src="${C.esc(foto(p, 240))}" alt="" loading="lazy"><button class="accion" data-reponer="${p.id}" title="Volver a incluir">↺</button><div class="n">${C.esc(M.nombreDe(p))}</div></div>`).join('')}</div></details>` : ''}`;
  }
  const cambioK = fn => { fn(); sucio = true; resultado(); };
  ed.addEventListener('input', ev => {
    const t = ev.target; if (!K || !ed.querySelector('#f-cnj')) return;
    if (t.id === 'k-buscar') { busq = t.value; buscar(); return; }
    if (t.dataset.k) cambioK(() => { K[t.dataset.k] = t.value; });
    else if (t.dataset.r) cambioK(() => { K.reglas[t.dataset.r] = t.value.split(',').map(s => s.trim()).filter(Boolean); });
    else if (t.dataset.rNum) cambioK(() => { const n = Number(t.value); if (n > 0) K.reglas[t.dataset.rNum] = n; else delete K.reglas[t.dataset.rNum]; });
  });
  ed.addEventListener('change', ev => {
    const t = ev.target; if (!K || !ed.querySelector('#f-cnj') || !t.dataset.cat) return;
    cambioK(() => { const id = Number(t.dataset.cat), l = new Set((K.reglas.categorias || []).map(Number)); t.checked ? l.add(id) : l.delete(id); K.reglas.categorias = [...l]; });
  });
  ed.addEventListener('click', async ev => {
    const b = ev.target.closest('button'); if (!b || !K || !ed.querySelector('#f-cnj')) return;
    ev.preventDefault();
    if (b.dataset.amano) { const id = Number(b.dataset.amano); cambioK(() => { K.productos = K.productos.includes(id) ? K.productos.filter(x => x !== id) : [...K.productos, id]; K.excluidos = K.excluidos.filter(x => x !== id); }); buscar(); return; }
    if (b.dataset.quitar) { const id = Number(b.dataset.quitar); cambioK(() => { if (K.productos.includes(id)) K.productos = K.productos.filter(x => x !== id); if (M.cumple(POR_ID.get(id), K.reglas)) K.excluidos = [...new Set([...K.excluidos, id])]; }); buscar(); return; }
    if (b.dataset.reponer) { const id = Number(b.dataset.reponer); cambioK(() => { K.excluidos = K.excluidos.filter(x => x !== id); }); return; }
    if (b.dataset.stock !== undefined) { cambioK(() => { if (b.dataset.stock) K.reglas.stock = b.dataset.stock; else delete K.reglas.stock; }); ed.querySelectorAll('[data-stock]').forEach(x => x.classList.toggle('activo', x === b)); return; }
    if (b.dataset.mas !== undefined) { mostrar += 60; resultado(); return; }
    if (b.dataset.guardarCnj !== undefined) return guardarConjunto(b);
    if (b.dataset.borrarCnj !== undefined) {
      const usan = ETQ.filter(e => (e.conjuntos || []).includes(K.id));
      if (!window.confirm(usan.length ? `Este conjunto lo usan ${usan.length} etiqueta(s): ${usan.map(e => e.nombre || e.texto).join(', ')}. Si lo borrás, esas etiquetas dejan de aparecer en sus productos. ¿Borrar igual?` : `¿Borrar el conjunto «${K.nombre}»?`)) return;
      try { await Datos.borrar('web_conjuntos', K.id); for (const e of usan) { const f = await Datos.guardar('web_etiquetas', Object.assign({}, e, { conjuntos: e.conjuntos.filter(x => x !== K.id) })); ETQ = ETQ.map(x => x.id === f.id ? f : x); }
        CNJ = CNJ.filter(x => x.id !== K.id); sucio = false; cerrar(); pintar(); } catch (e) { window.alert(e.message); }
    }
  });
  async function guardarConjunto(btn) {
    if (!String(K.nombre || '').trim()) return window.alert('Ponele un nombre al conjunto.');
    if (!K.productos.length && !M.tieneReglas(K.reglas) && !window.confirm('El conjunto está vacío (sin productos a mano ni reglas). ¿Guardar igual?')) return;
    btn.disabled = true; btn.textContent = 'Guardando…';
    try { const fila = await Datos.guardar('web_conjuntos', K); CNJ = [fila, ...CNJ.filter(x => x.id !== fila.id)]; sucio = false;
      const vuelve = ed.dataset.vuelve; cerrar();
      if (vuelve) { const e = JSON.parse(vuelve); if (!e.conjuntos.includes(fila.id)) e.conjuntos.push(fila.id); editarEtiqueta(e); sucio = true; } else { S.pestana = 'conjuntos'; pintar(); } }
    catch (e) { window.alert('No se pudo guardar: ' + e.message); btn.disabled = false; btn.textContent = 'Guardar conjunto'; }
  }

  // ---------- eventos de la pantalla ----------
  raiz.addEventListener('click', async ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.pestana) { S.pestana = b.dataset.pestana; return pintar(); }
    if (b.dataset.nuevaEtq !== undefined) return editarEtiqueta(NUEVA());
    if (b.dataset.nuevoCnj !== undefined) return editarConjunto({ nombre: '', descripcion: '', productos: [], excluidos: [], reglas: {} });
    if (b.dataset.editar) return editarEtiqueta(ETQ.find(e => e.id === b.dataset.editar));
    if (b.dataset.editarCnj) return editarConjunto(CNJ.find(c => c.id === b.dataset.editarCnj));
    if (b.dataset.duplicar) { const e = ETQ.find(x => x.id === b.dataset.duplicar); const copia = Object.assign({}, e, { id: undefined, nombre: (e.nombre || e.texto) + ' (copia)', activa: false }); return editarEtiqueta(copia); }
    if (b.dataset.duplicarCnj) { const c = CNJ.find(x => x.id === b.dataset.duplicarCnj); return editarConjunto(Object.assign({}, c, { id: undefined, nombre: c.nombre + ' (copia)' })); }
    if (b.dataset.alternar) { const e = ETQ.find(x => x.id === b.dataset.alternar);
      if (!e.activa && !(e.conjuntos || []).length) return window.alert('Primero elegí a qué productos va (un conjunto).');
      b.disabled = true; try { const f = await Datos.guardar('web_etiquetas', Object.assign({}, e, { activa: !e.activa })); ETQ = ETQ.map(x => x.id === f.id ? f : x); pintar(); } catch (er) { window.alert(er.message); b.disabled = false; } }
  });
  pintar();
})();
