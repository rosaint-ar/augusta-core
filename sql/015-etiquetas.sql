-- Core de Augusta · 015 · Etiquetas de la web (reemplazo de la app de Tienda Nube)
-- La web de Augusta (www, en Donweb) dibuja sus propias tarjetas y fichas: las etiquetas las pone etiquetas.js de la web,
-- que lee la vista pública v_web_etiquetas. Se administran desde el Core (pantalla Etiquetas).
--   web_conjuntos  grupos de productos: elegidos a mano (ids de publicación de Tienda Nube) y/o por reglas
--   web_etiquetas  qué dice, cómo se ve, dónde va, desde/hasta, a qué conjuntos se aplica
-- Las reglas las evalúan IGUAL el Core y la web, con el mismo catálogo público (catalog.js de www).

create table if not exists web_conjuntos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  productos bigint[] not null default '{}',          -- elegidos a mano (product_id de Tienda Nube)
  excluidos bigint[] not null default '{}',          -- nunca entran, aunque cumplan las reglas
  reglas jsonb not null default '{}'::jsonb,         -- {categorias:[ids], palabras:[], sin_palabras:[], stock:'con'|'sin'|'', precio_min, precio_max}
  creado timestamptz not null default now(),
  modificado timestamptz not null default now(),
  creado_por uuid default auth.uid());

create table if not exists web_etiquetas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,                              -- para reconocerla en el Core
  texto text not null,                               -- lo que dice la etiqueta (PREVENTA)
  texto_2 text,                                      -- segunda línea opcional (Llega el 5/12)
  estilo jsonb not null default '{}'::jsonb,         -- forma, colores, fuente, tamaño, icono, animación…
  posicion text not null default 'arriba-izq',       -- arriba-izq|arriba-der|abajo-izq|abajo-der|centro|franja-arriba|franja-abajo|cinta
  en_tarjeta boolean not null default true,          -- sobre la foto en listados
  en_ficha boolean not null default true,            -- sobre la foto principal de la ficha
  texto_ficha text,                                  -- recuadro arriba del precio en la ficha
  texto_boton text,                                  -- reemplaza «Agregar a mi bolsa» (p. ej. «Reservar en preventa»)
  conjuntos uuid[] not null default '{}',
  prioridad int not null default 0,                  -- si dos etiquetas caen en el mismo lugar, va la de mayor prioridad
  activa boolean not null default false,
  desde timestamptz,
  hasta timestamptz,
  creado timestamptz not null default now(),
  modificado timestamptz not null default now(),
  creado_por uuid default auth.uid());

-- solo la gente de Augusta: miembros leen, admin/dueña escriben
do $$ declare t text; begin
  foreach t in array array['web_conjuntos', 'web_etiquetas'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_ver', t);
    execute format('create policy %I on %I for select using (es_miembro(%L::uuid))', t || '_ver', t, '82c05bbf-e63e-4d25-a762-6f1ee6d27f43');
    execute format('drop policy if exists %I on %I', t || '_escribir', t);
    execute format('create policy %I on %I for all using (es_admin(%L::uuid)) with check (es_admin(%L::uuid))', t || '_escribir', t,
                   '82c05bbf-e63e-4d25-a762-6f1ee6d27f43', '82c05bbf-e63e-4d25-a762-6f1ee6d27f43');
    execute format('revoke all on %I from anon', t);
  end loop; end $$;

create or replace function web_tocar_modificado() returns trigger language plpgsql as $$ begin new.modificado := now(); return new; end $$;
drop trigger if exists web_conjuntos_mod on web_conjuntos;
create trigger web_conjuntos_mod before update on web_conjuntos for each row execute function web_tocar_modificado();
drop trigger if exists web_etiquetas_mod on web_etiquetas;
create trigger web_etiquetas_mod before update on web_etiquetas for each row execute function web_tocar_modificado();

-- Lo que lee la web: TODAS las etiquetas no borradas con sus conjuntos ya armados. La web muestra solo las vigentes
-- (activa y dentro de desde/hasta); con ?etiquetas=prueba muestra también las pausadas y programadas, para verlas antes.
-- No es actualizable (tiene agregados) y la web solo tiene permiso de lectura.
create or replace view v_web_etiquetas as
  select e.id, e.texto, e.texto_2, e.estilo, e.posicion, e.en_tarjeta, e.en_ficha, e.texto_ficha, e.texto_boton, e.prioridad,
         e.activa, e.desde, e.hasta, e.modificado,
         coalesce((select jsonb_agg(jsonb_build_object('productos', c.productos, 'excluidos', c.excluidos, 'reglas', c.reglas))
                     from web_conjuntos c where c.id = any(e.conjuntos)), '[]'::jsonb) as conjuntos
    from web_etiquetas e
   where cardinality(e.conjuntos) > 0;
revoke all on v_web_etiquetas from anon, authenticated;
grant select on v_web_etiquetas to anon, authenticated;
