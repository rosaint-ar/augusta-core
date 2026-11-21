-- Core de Augusta · 016 · MAESTRO DE PRODUCTOS (21/11/2026, Diego: "una base maestra de productos en el Core: todo
-- ordenado por código, nombre de la web exacto, variantes, talles, colores, precios web y Percha… siempre tomando de
-- referencia la web, y la posibilidad de editar todos los campos").
-- FASE 1: el maestro solo LEE la web (a pedido, con el botón «Traer de la web») y Percha. Editar en el maestro NO cambia la
-- web ni Percha: queda guardado en la columna m (jsonb) de cada fila, con historial en maestro_cambios.
--   maestro_lecturas       cada «Traer de la web»: estado, páginas, cuántas publicaciones y opciones
--   maestro_web_paginas    lo que respondió la web, tal cual (una fila por página de 200 publicaciones)
--   maestro_publicaciones  cada publicación de la web: nombre EXACTO, visible, atributos en su orden, categorías, foto
--   maestro_opciones       cada opción: valores EXACTOS (talle, color), SKU, precio, oferta, stock, visible, foto
--   maestro_cambios        quién cambió qué en el maestro y cuándo
-- m = lo editado en el maestro: {"nombre": "…", "precio": 6000, "oferta": null…}. Una clave que no está = igual a la web.
-- Una clave con null = vacío a propósito (p. ej. sin oferta).

create table if not exists maestro_lecturas (
  id bigserial primary key, empresa_id uuid not null, conexion_id uuid not null,
  estado text not null default 'leyendo' check (estado in ('leyendo', 'listo', 'error')),
  pagina int not null default 1, req_id bigint, reintentos int not null default 0,
  publicaciones int, opciones int, error text,
  inicio timestamptz not null default now(), fin timestamptz, pedido_por uuid default auth.uid());
create table if not exists maestro_web_paginas (
  lectura_id bigint not null references maestro_lecturas(id) on delete cascade, pagina int not null, contenido jsonb not null,
  primary key (lectura_id, pagina));
create table if not exists maestro_publicaciones (
  publicacion_ext text primary key, empresa_id uuid not null, conexion_id uuid not null,
  nombre text, handle text, url text, visible boolean, atributos text[], categorias jsonb, n_fotos int, foto text,
  creada_web timestamptz, modificada_web timestamptz,
  leida timestamptz not null default now(), en_web boolean not null default true,
  m jsonb not null default '{}'::jsonb, nota text, editado timestamptz, editado_por uuid);
create table if not exists maestro_opciones (
  opcion_ext text primary key, publicacion_ext text not null references maestro_publicaciones(publicacion_ext) on delete cascade,
  empresa_id uuid not null, posicion int, valores text[], talle text, color text, otros text,
  sku text, mpn text, barcode text, precio numeric, oferta numeric, precio_comparar numeric,
  stock numeric, sin_limite boolean not null default false, visible boolean, foto text, peso numeric,
  leida timestamptz not null default now(), en_web boolean not null default true,
  m jsonb not null default '{}'::jsonb, nota text, editado timestamptz, editado_por uuid);
create index if not exists maestro_opciones_pub on maestro_opciones (publicacion_ext);
create table if not exists maestro_cambios (
  id bigserial primary key, empresa_id uuid not null, tipo text not null, clave text not null, campo text not null,
  antes jsonb, despues jsonb, volver boolean not null default false, quien uuid default auth.uid(), cuando timestamptz not null default now());
create index if not exists maestro_cambios_clave on maestro_cambios (tipo, clave, cuando desc);

-- solo la gente de Augusta lee; nadie escribe directo (todo por las funciones de abajo)
do $$ declare t text; begin
  foreach t in array array['maestro_lecturas', 'maestro_web_paginas', 'maestro_publicaciones', 'maestro_opciones', 'maestro_cambios'] loop
    execute format('alter table %I enable row level security', t);
    if t <> 'maestro_web_paginas' then   -- esa no tiene empresa_id: su permiso va abajo
      execute format('drop policy if exists %I on %I', t || '_ver', t);
      execute format('create policy %I on %I for select using (es_miembro(empresa_id))', t || '_ver', t);
    end if;
    execute format('revoke all on %I from anon', t);
    execute format('grant select on %I to authenticated', t);
  end loop; end $$;
-- maestro_web_paginas no tiene empresa_id: se ve por su lectura
drop policy if exists maestro_web_paginas_ver on maestro_web_paginas;
create policy maestro_web_paginas_ver on maestro_web_paginas for select using (exists (select 1 from maestro_lecturas l where l.id = lectura_id and es_miembro(l.empresa_id)));

-- ===================== leer la web (a pedido, página por página: sin apurar a la web) =====================
create or replace function maestro_pedir_pagina(p_lectura bigint) returns void
language plpgsql security definer set search_path = public as $$
declare l maestro_lecturas%rowtype; cx conexiones%rowtype; tok text; rid bigint;
begin
  select * into l from maestro_lecturas where id = p_lectura;
  select * into cx from conexiones where id = l.conexion_id;
  select access_token into tok from conexion_secretos where conexion_id = cx.id;
  select net.http_get(
    'https://api.tiendanube.com/2025-03/' || cx.externo_id || '/products?per_page=200&page=' || l.pagina
      || '&fields=id,name,handle,published,attributes,variants,images,categories,canonical_url,created_at,updated_at',
    '{}'::jsonb, jsonb_build_object('Authentication', 'bearer ' || tok, 'User-Agent', 'Augusta Core (integracion Tienda Nube)'), 120000) into rid;
  update maestro_lecturas set req_id = rid where id = p_lectura;
end $$;
revoke execute on function maestro_pedir_pagina(bigint) from public, anon, authenticated;

-- botón «Traer de la web»: arranca una lectura (si hay otra en curso hace menos de 5 min, sigue esa)
create or replace function maestro_traer() returns jsonb
language plpgsql security definer set search_path = public as $$
declare e uuid := '82c05bbf-e63e-4d25-a762-6f1ee6d27f43'; cx uuid; id bigint;
begin
  if not es_admin(e) then raise exception 'Solo administración trae la web'; end if;
  select l.id into id from maestro_lecturas l where l.empresa_id = e and l.estado = 'leyendo' and l.inicio > now() - interval '5 minutes' order by l.id desc limit 1;
  if id is not null then return jsonb_build_object('lectura', id, 'ya_estaba', true); end if;
  update maestro_lecturas set estado = 'error', error = 'quedó colgada', fin = now() where empresa_id = e and estado = 'leyendo';
  select c.id into cx from conexiones c where c.empresa_id = e and c.canal = 'tiendanube' order by c.creada limit 1;
  if cx is null then raise exception 'No hay conexión con Tienda Nube'; end if;
  insert into maestro_lecturas (empresa_id, conexion_id) values (e, cx) returning maestro_lecturas.id into id;
  perform maestro_pedir_pagina(id);
  return jsonb_build_object('lectura', id);
end $$;
grant execute on function maestro_traer() to authenticated;

-- la pantalla lo llama cada 2 s mientras lee: guarda la página que llegó y pide la siguiente; al final arma las tablas
create or replace function maestro_paso(p_lectura bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l maestro_lecturas%rowtype; r record; lote jsonb; n int;
begin
  select * into l from maestro_lecturas where id = p_lectura;
  if l.id is null or not es_miembro(l.empresa_id) then raise exception 'Lectura inexistente'; end if;
  if l.estado <> 'leyendo' then return jsonb_build_object('estado', l.estado, 'publicaciones', l.publicaciones, 'opciones', l.opciones, 'error', l.error); end if;
  select status_code, content, error_msg, timed_out into r from net._http_response where id = l.req_id;
  if not found then return jsonb_build_object('estado', 'leyendo', 'pagina', l.pagina); end if;   -- todavía no respondió
  if r.status_code = 429 or r.timed_out or (r.status_code is null and r.error_msg is not null) then   -- la web pidió esperar: se repite esa página
    if l.reintentos >= 8 then update maestro_lecturas set estado = 'error', error = 'La web no respondió la página ' || l.pagina, fin = now() where id = l.id; return jsonb_build_object('estado', 'error'); end if;
    update maestro_lecturas set reintentos = reintentos + 1 where id = l.id; perform maestro_pedir_pagina(l.id);
    return jsonb_build_object('estado', 'leyendo', 'pagina', l.pagina, 'reintento', l.reintentos + 1);
  end if;
  if r.status_code = 404 then lote := '[]'::jsonb;   -- la web contesta 404 cuando la página ya no existe
  elsif r.status_code <> 200 then
    update maestro_lecturas set estado = 'error', error = 'La web respondió ' || r.status_code || ': ' || left(coalesce(r.content, ''), 200), fin = now() where id = l.id;
    return jsonb_build_object('estado', 'error', 'error', 'La web respondió ' || r.status_code);
  else lote := r.content::jsonb; end if;
  n := coalesce(jsonb_array_length(lote), 0);
  if n > 0 then insert into maestro_web_paginas (lectura_id, pagina, contenido) values (l.id, l.pagina, lote) on conflict (lectura_id, pagina) do update set contenido = excluded.contenido; end if;
  if n = 200 then
    update maestro_lecturas set pagina = pagina + 1, reintentos = 0 where id = l.id; perform maestro_pedir_pagina(l.id);
    return jsonb_build_object('estado', 'leyendo', 'pagina', l.pagina + 1);
  end if;
  return maestro_aplicar(l.id);
end $$;
grant execute on function maestro_paso(bigint) to authenticated;

-- arma publicaciones y opciones con los valores EXACTOS de la web (sin recortar espacios ni cambiar mayúsculas)
create or replace function maestro_aplicar(p_lectura bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l maestro_lecturas%rowtype; np int; no int;
begin
  select * into l from maestro_lecturas where id = p_lectura;
  with prods as (select jsonb_array_elements(contenido) p from maestro_web_paginas where lectura_id = l.id)
  insert into maestro_publicaciones as mp (publicacion_ext, empresa_id, conexion_id, nombre, handle, url, visible, atributos, categorias, n_fotos, foto, creada_web, modificada_web, leida, en_web)
  select p->>'id', l.empresa_id, l.conexion_id, p->'name'->>'es', p->'handle'->>'es', p->>'canonical_url', (p->>'published')::boolean,
    array(select a->>'es' from jsonb_array_elements(coalesce(p->'attributes', '[]'::jsonb)) with ordinality x(a, i) order by i),
    (select jsonb_agg(jsonb_build_object('id', c->>'id', 'nombre', c->'name'->>'es')) from jsonb_array_elements(coalesce(p->'categories', '[]'::jsonb)) c),
    jsonb_array_length(coalesce(p->'images', '[]'::jsonb)),
    (select im->>'src' from jsonb_array_elements(coalesce(p->'images', '[]'::jsonb)) im order by (im->>'position')::int nulls last, (im->>'id')::bigint limit 1),
    (p->>'created_at')::timestamptz, (p->>'updated_at')::timestamptz, now(), true
  from prods
  on conflict (publicacion_ext) do update set nombre = excluded.nombre, handle = excluded.handle, url = excluded.url, visible = excluded.visible,
    atributos = excluded.atributos, categorias = excluded.categorias, n_fotos = excluded.n_fotos, foto = excluded.foto,
    creada_web = excluded.creada_web, modificada_web = excluded.modificada_web, leida = excluded.leida, en_web = true;
  get diagnostics np = row_count;

  with prods as (select jsonb_array_elements(contenido) p from maestro_web_paginas where lectura_id = l.id),
  attrs as (select p->>'id' pe, lower(translate(a->>'es', 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUaeiouNn')) an, i::int ai, p from prods, jsonb_array_elements(coalesce(p->'attributes', '[]'::jsonb)) with ordinality x(a, i)),
  idx as (select pe, min(ai) filter (where an in ('talle', 'talles', 'talla', 'tamano', 'medida')) ti, min(ai) filter (where an in ('color', 'colores', 'estampa')) ci from attrs group by pe),
  vars as (select p->>'id' pe, p, v from prods, jsonb_array_elements(coalesce(p->'variants', '[]'::jsonb)) v)
  insert into maestro_opciones as mo (opcion_ext, publicacion_ext, empresa_id, posicion, valores, talle, color, otros, sku, mpn, barcode, precio, oferta, precio_comparar,
    stock, sin_limite, visible, foto, peso, leida, en_web)
  select v->>'id', vars.pe, l.empresa_id, (v->>'position')::int,
    array(select x->>'es' from jsonb_array_elements(coalesce(v->'values', '[]'::jsonb)) with ordinality z(x, i) order by i),
    case when idx.ti is not null then (v->'values'->(idx.ti - 1))->>'es' end,
    case when idx.ci is not null then (v->'values'->(idx.ci - 1))->>'es' end,
    (select string_agg(x->>'es', ' / ' order by i) from jsonb_array_elements(coalesce(v->'values', '[]'::jsonb)) with ordinality z(x, i) where i is distinct from idx.ti and i is distinct from idx.ci),
    v->>'sku', v->>'mpn', v->>'barcode',
    (v->>'price')::numeric, case when (v->>'promotional_price')::numeric > 0 then (v->>'promotional_price')::numeric end, (v->>'compare_at_price')::numeric,
    case when (v->>'stock_management')::boolean is false then null else (v->>'stock')::numeric end, coalesce((v->>'stock_management')::boolean is false, false),
    coalesce((v->>'visible')::boolean, true),
    (select im->>'src' from jsonb_array_elements(coalesce(vars.p->'images', '[]'::jsonb)) im where im->>'id' = v->>'image_id' limit 1),
    (v->>'weight')::numeric, now(), true
  from vars left join idx on idx.pe = vars.pe
  on conflict (opcion_ext) do update set publicacion_ext = excluded.publicacion_ext, posicion = excluded.posicion, valores = excluded.valores, talle = excluded.talle, color = excluded.color,
    otros = excluded.otros, sku = excluded.sku, mpn = excluded.mpn, barcode = excluded.barcode, precio = excluded.precio, oferta = excluded.oferta, precio_comparar = excluded.precio_comparar,
    stock = excluded.stock, sin_limite = excluded.sin_limite, visible = excluded.visible, foto = excluded.foto, peso = excluded.peso, leida = excluded.leida, en_web = true;
  get diagnostics no = row_count;

  -- lo que no vino en esta lectura ya no está en la web (no se borra: queda marcado, con lo editado)
  update maestro_publicaciones set en_web = false where empresa_id = l.empresa_id and leida < l.inicio and en_web;
  update maestro_opciones set en_web = false where empresa_id = l.empresa_id and leida < l.inicio and en_web;
  update maestro_lecturas set estado = 'listo', publicaciones = np, opciones = no, fin = now() where id = l.id;
  delete from maestro_web_paginas where lectura_id in (select id from maestro_lecturas where empresa_id = l.empresa_id and id < l.id);   -- se guarda solo la última respuesta cruda
  return jsonb_build_object('estado', 'listo', 'publicaciones', np, 'opciones', no);
end $$;
revoke execute on function maestro_aplicar(bigint) from public, anon, authenticated;

-- ===================== lo que muestra la pantalla =====================
-- precio de Percha para la web = la cuenta de tn-precios: con la lista «Tienda Nube» al 100 % es el precio tal cual (SIN redondear);
-- con otro porcentaje, × porcentaje y redondeo «10+» (a la decena para arriba);
-- oferta de Percha = la rebaja vigente para la web más baja (por talle·color o por prenda), si es menor que el precio.
create or replace function maestro_datos() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e uuid := '82c05bbf-e63e-4d25-a762-6f1ee6d27f43'; pct numeric := coalesce((select porcentaje from listas_precios where empresa_id = '82c05bbf-e63e-4d25-a762-6f1ee6d27f43' and canal = 'tiendanube' and activa limit 1), 100); hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  dow int := extract(isodow from (now() at time zone 'America/Argentina/Buenos_Aires'))::int; r jsonb;
begin
  if not es_miembro(e) then raise exception 'Sin permiso'; end if;
  with rebajas as (
    select p.id from promociones p where p.empresa_id = e and p.activa and p.tipo = 'rebaja'
      and (p.desde is null or p.desde <= hoy) and (p.hasta is null or p.hasta >= hoy)
      and (p.dias_semana is null or cardinality(p.dias_semana) = 0 or dow = any(p.dias_semana))
      and (p.canales is null or cardinality(p.canales) = 0 or 'tiendanube' = any(p.canales))),
  pv as (
    select v.id, p.id pid, p.codigo, p.nombre, p.activo, p.tipo, p.es_generico, v.activa, v.sku vsku, t.nombre talle, c.nombre color,
      coalesce((select sum(s.cantidad) from stock s where s.variante_id = v.id), 0) stock, coalesce(v.fallas, 0) fallas,
      coalesce(v.precio, p.precio) base
    from variantes v join productos p on p.id = v.producto_id left join atributos t on t.id = v.talle_id left join atributos c on c.id = v.color_id
    where p.empresa_id = e),
  pc as (
    select pv.*, case when pct = 100 then pv.base when coalesce(pv.base * pct / 100, 0) >= 10 then ceil(round(pv.base * pct / 100 / 10, 2)) * 10 else ceil(round(pv.base * pct / 100, 2)) end precio_web,
      (select min(coalesce(
         (select rp.precio from rebaja_precios rp where rp.promocion_id = rb.id and rp.producto_id = pv.pid and rp.variante_id = pv.id),
         (select rp.precio from rebaja_precios rp where rp.promocion_id = rb.id and rp.producto_id = pv.pid and rp.variante_id is null))) from rebajas rb) oferta_cruda
    from pv),
  conectadas as (select distinct ci.variante_id from canal_items ci where ci.variante_id is not null)
  select jsonb_build_object(
    'lectura', (select to_jsonb(x) from (select id, estado, publicaciones, opciones, inicio, fin, error from maestro_lecturas where empresa_id = e order by id desc limit 1) x),
    'ultima_buena', (select to_jsonb(x) from (select id, publicaciones, opciones, fin from maestro_lecturas where empresa_id = e and estado = 'listo' order by id desc limit 1) x),
    'pubs', (select coalesce(jsonb_agg(jsonb_build_array(publicacion_ext, nombre, handle, url, visible, atributos, (select jsonb_agg(c->>'nombre') from jsonb_array_elements(coalesce(categorias, '[]'::jsonb)) c), n_fotos, foto, en_web, m, nota, modificada_web) order by nombre), '[]') from maestro_publicaciones where empresa_id = e),
    'ops', (select coalesce(jsonb_agg(jsonb_build_array(o.opcion_ext, o.publicacion_ext, o.posicion, o.valores, o.talle, o.color, o.otros, o.sku, o.precio, o.oferta, o.stock, o.sin_limite, o.visible, o.foto, o.en_web, o.m, o.nota,
                (select ci.variante_id from canal_items ci where ci.variante_ext = o.opcion_ext limit 1), o.mpn, o.barcode, o.precio_comparar) order by o.publicacion_ext, o.posicion), '[]') from maestro_opciones o where o.empresa_id = e),
    -- Percha de cada talle·color conectado: [código, prenda, talle, color, stock, fallas, precio web, oferta web, talle·color prendido, prenda prendida, id prenda, tipo]
    -- (en un pack/kit el stock de la web se calcula con sus prendas: no se compara con el de su variante)
    'percha', (select coalesce(jsonb_object_agg(pc.id, jsonb_build_array(pc.codigo, pc.nombre, pc.talle, pc.color, pc.stock, pc.fallas, pc.precio_web,
                 case when pc.oferta_cruda < pc.precio_web then pc.oferta_cruda end, pc.activa, pc.activo, pc.pid, pc.tipo)), '{}') from pc where pc.id in (select variante_id from conectadas)),
    -- lo que Percha tiene prendido y no está en ninguna opción de la web
    'solo_percha', (select coalesce(jsonb_agg(jsonb_build_array(pc.id, pc.codigo, pc.nombre, pc.talle, pc.color, pc.stock, pc.precio_web,
                 case when pc.oferta_cruda < pc.precio_web then pc.oferta_cruda end, pc.tipo) order by pc.codigo, pc.nombre, pc.talle, pc.color), '[]')
       from pc where pc.activa and pc.activo and not pc.es_generico and pc.tipo in ('prenda', 'kit', 'varios') and coalesce(pc.vsku, '') !~* '-SD$'
         and pc.id not in (select variante_id from conectadas))
  ) into r;
  return r;
end $$;
grant execute on function maestro_datos() to authenticated;

-- ===================== editar el maestro (no toca la web ni Percha) =====================
-- p_valor: el valor nuevo (jsonb: texto, número, true/false o null = vacío a propósito). p_volver = true: se borra lo editado
-- y vuelve a valer lo de la web. Los textos se guardan EXACTOS (no se recortan espacios).
create or replace function maestro_editar(p_tipo text, p_clave text, p_campo text, p_valor jsonb, p_volver boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e uuid := '82c05bbf-e63e-4d25-a762-6f1ee6d27f43'; antes jsonb; m0 jsonb; tipo_ok text;
begin
  if not es_admin(e) then raise exception 'Solo administración edita el maestro'; end if;
  if p_tipo = 'publicacion' then
    if p_campo not in ('nombre', 'visible', 'nota') then raise exception 'Campo no editable: %', p_campo; end if;
    select m into m0 from maestro_publicaciones where publicacion_ext = p_clave and empresa_id = e;
  elsif p_tipo = 'opcion' then
    if p_campo not in ('sku', 'talle', 'color', 'precio', 'oferta', 'stock', 'visible', 'nota') then raise exception 'Campo no editable: %', p_campo; end if;
    select m into m0 from maestro_opciones where opcion_ext = p_clave and empresa_id = e;
  else raise exception 'Tipo inválido'; end if;
  if m0 is null then raise exception 'No existe en el maestro'; end if;
  -- tipos
  tipo_ok := case when p_campo in ('precio', 'oferta', 'stock') then 'number' when p_campo = 'visible' then 'boolean' else 'string' end;
  if not p_volver and p_valor is not null and jsonb_typeof(p_valor) not in (tipo_ok, 'null') then raise exception 'Valor inválido para %', p_campo; end if;
  if not p_volver and p_campo in ('precio', 'oferta', 'stock') and jsonb_typeof(p_valor) = 'number' and (p_valor)::text::numeric < 0 then raise exception 'No puede ser negativo'; end if;
  if p_campo = 'nota' then
    if p_tipo = 'publicacion' then select to_jsonb(nota) into antes from maestro_publicaciones where publicacion_ext = p_clave;
      update maestro_publicaciones set nota = case when p_volver then null else p_valor #>> '{}' end, editado = now(), editado_por = auth.uid() where publicacion_ext = p_clave;
    else select to_jsonb(nota) into antes from maestro_opciones where opcion_ext = p_clave;
      update maestro_opciones set nota = case when p_volver then null else p_valor #>> '{}' end, editado = now(), editado_por = auth.uid() where opcion_ext = p_clave; end if;
  else
    antes := m0 -> p_campo;
    if p_tipo = 'publicacion' then
      update maestro_publicaciones set m = case when p_volver then m - p_campo else m || jsonb_build_object(p_campo, coalesce(p_valor, 'null'::jsonb)) end, editado = now(), editado_por = auth.uid() where publicacion_ext = p_clave;
    else
      update maestro_opciones set m = case when p_volver then m - p_campo else m || jsonb_build_object(p_campo, coalesce(p_valor, 'null'::jsonb)) end, editado = now(), editado_por = auth.uid() where opcion_ext = p_clave;
    end if;
  end if;
  insert into maestro_cambios (empresa_id, tipo, clave, campo, antes, despues, volver) values (e, p_tipo, p_clave, p_campo, antes, case when p_volver then null else p_valor end, p_volver);
  return jsonb_build_object('ok', true);
end $$;
grant execute on function maestro_editar(text, text, text, jsonb, boolean) to authenticated;
