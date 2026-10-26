-- Core de Augusta · 014 · Lo pesado se calcula una vez por día
-- Problema (26/10): core_clima_paquete tardaba ~80 s (cruzaba cada venta con 130.000 días de clima en cada visita) y Supabase
-- corta a los 8 s para usuarios. Ahora:
--   core_lineas_fs_m     histórico de FactuSOL ya prorrateado (no cambia); core_lineas lo une EN VIVO con fs_remitos para no
--                        contar lo que ya pasó a Percha, y suma las ventas de Percha en vivo.
--   core_clima_t7_m      temperatura de 7 días por zona y día
--   core_clima_normal_m  normal de cada mes por zona (2015-2025)
--   core_ventas_geo_m    cada venta con lugar y su temperatura
-- Se refrescan con core_refrescar(), que llama core_clima_paso() al terminar la actualización diaria (8 a 9 h).
-- Las vistas materializadas no tienen RLS: nadie las lee directo; las funciones del Core pasan a SECURITY DEFINER y
-- siguen validando es_miembro(Augusta) antes de devolver nada.

create table if not exists core_refrescos (nombre text primary key, cuando timestamptz, segundos numeric);
alter table core_refrescos enable row level security;

-- ---------- histórico de FactuSOL ----------
create materialized view if not exists core_lineas_fs_m as
  select r.id as doc, r.fecha as f,
    case when upper(r.cliente_nombre) like 'CONS. FINAL%' then 'Local'
         when upper(r.cliente_nombre) like 'ONLINE%' then
           case when fp.nombre ~* 'mercado ?libre' then 'Mercado Libre' when upper(r.cliente_nombre) like '%CONTADO%' then 'WhatsApp y redes' else 'Tienda Nube' end
         else 'Clientas con ficha' end as canal,
    l.articulo as codigo, coalesce(a.familia, '') as fam,
    case l.articulo when '100000' then 'sena' when '200000' then 'envio' when '300000' then 'gift_card' when '400000' then 'varios'
      else case when a.familia = '99' or coalesce(l.articulo, '') = '' then 'varios' else 'prenda' end end as tipo,
    coalesce(l.cantidad, 0) as u,
    coalesce(l.total, 0) * case when abs(s.tl) < 0.005 then 1 else coalesce(r.total, 0) / s.tl end as v,
    coalesce(l.costo_unit, 0) as cu,
    nullif(trim(coalesce(t.nombre, l.talle)), '') as talle,
    nullif(trim(coalesce(co.nombre, l.color)), '') as color
  from fs_remitos r
  join fs_remito_lineas l on l.remito_id = r.id
  join (select remito_id, sum(coalesce(total, 0)) as tl from fs_remito_lineas group by remito_id) s on s.remito_id = r.id
  left join fs_articulos_anio a on a.ejercicio = r.ejercicio and a.codigo = l.articulo
  left join fs_formas_pago_anio fp on fp.ejercicio = r.ejercicio and fp.codigo = r.forma_pago
  left join fs_talles_anio t on t.ejercicio = r.ejercicio and t.codigo = l.talle
  left join fs_colores_anio co on co.ejercicio = r.ejercicio and co.codigo = l.color
  where r.cliente_nombre is distinct from 'AJUSTE DE STOCK' and r.fecha is not null;
create index if not exists core_lineas_fs_m_doc on core_lineas_fs_m (doc);
create index if not exists core_lineas_fs_m_f on core_lineas_fs_m (f);

create or replace view core_lineas with (security_invoker = true) as
  select 'factusol'::text as fuente, m.doc, m.f, m.canal, m.codigo, m.fam, m.tipo, m.u, m.v, m.cu, m.talle, m.color
    from core_lineas_fs_m m join fs_remitos r on r.id = m.doc
   where r.venta_id is null and r.omitido is null          -- en vivo: lo que ya pasó a Percha no se cuenta dos veces
  union all
  select 'percha', v.id::text, (v.fecha at time zone 'America/Argentina/Buenos_Aires')::date,
    case v.origen when 'tiendanube' then 'Tienda Nube' when 'mercadolibre' then 'Mercado Libre'
      when 'whatsapp' then 'WhatsApp y redes' when 'online' then 'WhatsApp y redes' when 'factusol' then 'WhatsApp y redes' else 'Local' end,
    p.codigo, coalesce(c.codigo, ''),
    case when p.id is null then case when l.descripcion ~* '^env' then 'envio' else 'varios' end
         when p.tipo in ('sena') then 'sena' when p.tipo = 'gift_card' then 'gift_card' when p.tipo in ('servicio', 'varios') or c.codigo = '99' then 'varios'
         else 'prenda' end,
    coalesce(l.cantidad, 0),
    coalesce(l.total, 0) * case when abs(sum(coalesce(l.total, 0)) over (partition by v.id)) < 0.005 then 1
                               else coalesce(v.total, 0) / sum(coalesce(l.total, 0)) over (partition by v.id) end,
    coalesce(l.costo_unit, 0), nullif(trim(l.talle), ''), nullif(trim(l.color), '')
  from ventas v
  join venta_lineas l on l.venta_id = v.id
  left join productos p on p.id = l.producto_id
  left join categorias c on c.id = p.categoria_id
  where v.empresa_id = '82c05bbf-e63e-4d25-a762-6f1ee6d27f43' and v.estado <> 'anulada' and not coalesce(v.reservada, false);

-- ---------- clima ----------
create materialized view if not exists core_clima_t7_m as
  select zona, fecha, tmed, avg(tmed) over (partition by zona order by fecha rows between 6 preceding and current row) t7, pronostico from core_clima_dia;
create unique index if not exists core_clima_t7_m_pk on core_clima_t7_m (zona, fecha);

create materialized view if not exists core_clima_normal_m as
  select zona, extract(month from fecha)::int mes, round(avg(tmed), 1) tmed, round(avg(tmin), 1) tmin, round(avg(tmax), 1) tmax,
         round(sum(lluvia) / count(distinct extract(year from fecha)), 0) lluvia
    from core_clima_dia where not pronostico and fecha >= '2015-01-01' and fecha < '2026-01-01' group by 1, 2;

-- ventas con lugar: el alias de códigos se calcula UNA vez (antes se llamaba core_alias() por cada renglón)
create or replace view core_ventas_geo with (security_invoker = true) as
  with al as (select core_alias() a)
  select 'local'::text fuente, 'riocuarto'::text zona, l.f fecha, l.codigo, l.fam, l.u
    from core_lineas l where l.tipo = 'prenda' and l.canal = 'Local' and l.codigo is not null
  union all
  select 'tiendanube', core_zona(o.provincia, o.ciudad), (o.creado at time zone 'America/Argentina/Buenos_Aires')::date,
         coalesce(pv.codigo, al.a ->> substring(p->>'sku' from '^[0-9]{6}'), substring(p->>'sku' from '^[0-9]{6}')),
         coalesce(cv.codigo, ''), nullif(p->>'cantidad', '')::numeric
    from core_tn_pedidos o cross join al
    cross join jsonb_array_elements(o.productos) p
    left join canal_items ci on ci.variante_ext = p->>'variante' and ci.variante_id is not null
    left join variantes vv on vv.id = ci.variante_id
    left join productos pv on pv.id = vv.producto_id
    left join categorias cv on cv.id = pv.categoria_id
   where o.pago = 'paid' and o.cancelado is null;

create materialized view if not exists core_ventas_geo_m as
  select v.fuente, v.zona, v.fecha, v.codigo, v.fam, v.u, t.t7
    from core_ventas_geo v join core_clima_t7_m t on t.zona = v.zona and t.fecha = v.fecha
   where v.u <> 0 and v.codigo is not null;

revoke all on core_lineas_fs_m, core_clima_t7_m, core_clima_normal_m, core_ventas_geo_m from public, anon, authenticated;
revoke all on core_lineas, core_ventas_geo, core_clima_t7 from anon, authenticated;

create or replace function core_refrescar() returns text language plpgsql security definer set search_path = public as $$
declare t0 timestamptz := clock_timestamp();
begin
  refresh materialized view core_lineas_fs_m;
  refresh materialized view core_clima_t7_m;
  refresh materialized view core_clima_normal_m;
  refresh materialized view core_ventas_geo_m;
  insert into core_refrescos values ('core', now(), extract(epoch from clock_timestamp() - t0))
    on conflict (nombre) do update set cuando = excluded.cuando, segundos = excluded.segundos;
  return 'refrescado en ' || round(extract(epoch from clock_timestamp() - t0)::numeric, 1) || ' s';
end $$;
revoke all on function core_refrescar() from public, anon, authenticated;

-- al terminar la actualización diaria del clima, se recalcula todo una vez
create or replace function core_clima_paso() returns text language plpgsql security definer set search_path = public as $$
declare g jsonb; z text; hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  g := core_clima_guardar();
  if exists (select 1 from core_clima_req where procesado is null) then return 'esperando ' || g::text; end if;
  select id into z from core_clima_zonas zz where (select count(*) from core_clima_dia d where d.zona = zz.id and not d.pronostico) < 3000 order by orden limit 1;
  if z is not null then perform core_clima_pedir('historico', array[z]); return 'histórico ' || z; end if;
  select zz.id into z from core_clima_zonas zz
   where coalesce((select max(d.actualizado) from core_clima_dia d where d.zona = zz.id and d.fecha > hoy), '-infinity') < now() - interval '20 hours'
   order by orden limit 1;
  if z is not null then perform core_clima_pedir('reciente', array[z]); return 'reciente ' || z; end if;
  if coalesce((select cuando from core_refrescos where nombre = 'core'), '-infinity') < now() - interval '20 hours' then return 'al día; ' || core_refrescar(); end if;
  return 'al día';
end $$;

-- ---------- paquete de clima: ahora solo lee lo precalculado ----------
create or replace function core_clima_paquete() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e constant uuid := '82c05bbf-e63e-4d25-a762-6f1ee6d27f43'; res jsonb; hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if not es_miembro(e) then raise exception 'Sin acceso a Augusta'; end if;
  with g as (select * from core_ventas_geo_m where u > 0),
  ahora as (
    select zona,
      round(avg(tmed) filter (where fecha between hoy - 6 and hoy), 1) t_semana,
      round(avg(tmed) filter (where fecha > hoy), 1) t_pronostico,
      jsonb_agg(jsonb_build_array(fecha, round(tmed, 1), round(tmin, 1), round(tmax, 1), round(lluvia, 1)) order by fecha) filter (where fecha > hoy - 14) dias
      from core_clima_dia where fecha > hoy - 14 group by zona),
  clientas as (
    select core_zona(provincia, ciudad) zona, count(distinct coalesce(cliente_id::text, email)) clientas,
           count(distinct coalesce(cliente_id::text, email)) filter (where creado > now() - interval '2 years') clientas_2a, count(*) pedidos
      from core_tn_pedidos where pago = 'paid' and cancelado is null group by 1),
  famzona as (select zona, fam, sum(u) u from g where fuente = 'tiendanube' group by 1, 2)
  select jsonb_build_object(
    'generado', now(), 'hoy', hoy, 'calculado', (select cuando from core_refrescos where nombre = 'core'),
    'zonas', (select jsonb_agg(jsonb_build_object('id', z.id, 'nombre', z.nombre, 'provincia', z.provincia, 'lat', z.lat, 'lon', z.lon, 'orden', z.orden,
        't_semana', a.t_semana, 't_pronostico', a.t_pronostico, 'dias', a.dias,
        'normal', (select jsonb_agg(jsonb_build_array(n.mes, n.tmed, n.tmin, n.tmax, n.lluvia) order by n.mes) from core_clima_normal_m n where n.zona = z.id),
        'clientas', coalesce(c.clientas, 0), 'clientas_2a', coalesce(c.clientas_2a, 0), 'pedidos', coalesce(c.pedidos, 0),
        'familias', (select jsonb_object_agg(fam, u) from famzona f where f.zona = z.id)) order by z.orden)
      from core_clima_zonas z left join ahora a on a.zona = z.id left join clientas c on c.zona = z.id),
    'productos', (select coalesce(jsonb_agg(jsonb_build_array(codigo, fam, round(u, 1), round(f, 1), round(fr, 1), round(te, 1), round(ca, 1), round(med, 1), anio, meses,
                   (select descripcion from fs_articulos_anio a where a.ejercicio = x.anio and a.codigo = x.codigo))), '[]') from (
        select codigo, extract(year from fecha)::int anio, max(fam) fam, sum(u) u,
               sum(u) filter (where t7 < 12) f, sum(u) filter (where t7 >= 12 and t7 < 17) fr, sum(u) filter (where t7 >= 17 and t7 < 22) te, sum(u) filter (where t7 >= 22) ca,
               percentile_cont(0.5) within group (order by t7)::numeric med, count(distinct to_char(fecha, 'YYYY-MM')) meses
          from g group by codigo, extract(year from fecha)) x),
    'base', (select jsonb_build_array(round(sum(u) filter (where t7 < 12), 1), round(sum(u) filter (where t7 >= 12 and t7 < 17), 1),
                                      round(sum(u) filter (where t7 >= 17 and t7 < 22), 1), round(sum(u) filter (where t7 >= 22), 1),
                                      round(percentile_cont(0.5) within group (order by t7)::numeric, 1)) from g),
    'zona_mes', (select coalesce(jsonb_agg(jsonb_build_array(zona, mes, round(u, 1))), '[]') from (
        select zona, extract(month from fecha)::int mes, sum(u) u from g where fuente = 'tiendanube' group by 1, 2) x)
  ) into res;
  return res;
end $$;

-- el resto de las funciones del Core leen core_lineas: pasan a SECURITY DEFINER (siguen validando es_miembro adentro)
alter function core_dataset() security definer;
alter function core_producto(text) security definer;
alter function core_horario() security definer;
alter function core_compras() security definer;
alter function core_clientas() security definer;
revoke all on function core_alias() from anon;
revoke all on function core_stock_vivo() from anon;
