-- Core de Augusta · 010 · Clima de cada producto, temporada de cada zona y paquete para la pantalla Clima
-- Ventas con lugar: LOCAL (Río Cuarto) desde core_lineas + pedidos pagados de TIENDA NUBE (zona de la clienta).
-- WhatsApp y Mercado Libre no tienen ubicación: no se usan para aprender el clima.
-- Temperatura de una venta = promedio de los 7 días anteriores (incluido el día) en su zona.

-- ventas con zona (una fila por renglón)
create or replace view core_ventas_geo with (security_invoker = true) as
  select 'local'::text fuente, 'riocuarto'::text zona, l.f fecha, l.codigo, l.fam, l.u
    from core_lineas l where l.tipo = 'prenda' and l.canal = 'Local' and l.codigo is not null
  union all
  select 'tiendanube', core_zona(o.provincia, o.ciudad), (o.creado at time zone 'America/Argentina/Buenos_Aires')::date,
         coalesce(pv.codigo, core_alias() ->> substring(p->>'sku' from '^[0-9]{6}'), substring(p->>'sku' from '^[0-9]{6}')),
         coalesce(cv.codigo, ''), nullif(p->>'cantidad', '')::numeric
    from core_tn_pedidos o
    cross join jsonb_array_elements(o.productos) p
    left join canal_items ci on ci.variante_ext = p->>'variante' and ci.variante_id is not null
    left join variantes vv on vv.id = ci.variante_id
    left join productos pv on pv.id = vv.producto_id
    left join categorias cv on cv.id = pv.categoria_id
   where o.pago = 'paid' and o.cancelado is null;

-- temperatura suavizada (7 días) por zona y día
create or replace view core_clima_t7 with (security_invoker = true) as
  select zona, fecha, tmed, avg(tmed) over (partition by zona order by fecha rows between 6 preceding and current row) t7, pronostico
    from core_clima_dia;

create or replace function core_clima_paquete() returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare e constant uuid := '82c05bbf-e63e-4d25-a762-6f1ee6d27f43'; res jsonb; hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if not es_miembro(e) then raise exception 'Sin acceso a Augusta'; end if;
  with g as (
    select v.*, t.t7 from core_ventas_geo v join core_clima_t7 t on t.zona = v.zona and t.fecha = v.fecha where v.u <> 0 and v.codigo is not null),
  normal as (
    select zona, extract(month from fecha)::int mes, round(avg(tmed), 1) tmed, round(avg(tmin), 1) tmin, round(avg(tmax), 1) tmax, round(sum(lluvia) / count(distinct extract(year from fecha)), 0) lluvia
      from core_clima_dia where not pronostico and fecha >= '2015-01-01' and fecha < '2026-01-01' group by 1, 2),
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
  famzona as (
    select zona, fam, sum(u) u from core_ventas_geo where fuente = 'tiendanube' and u > 0 group by 1, 2)
  select jsonb_build_object(
    'generado', now(), 'hoy', hoy,
    'zonas', (select jsonb_agg(jsonb_build_object('id', z.id, 'nombre', z.nombre, 'provincia', z.provincia, 'lat', z.lat, 'lon', z.lon, 'orden', z.orden,
        't_semana', a.t_semana, 't_pronostico', a.t_pronostico, 'dias', a.dias,
        'normal', (select jsonb_agg(jsonb_build_array(n.mes, n.tmed, n.tmin, n.tmax, n.lluvia) order by n.mes) from normal n where n.zona = z.id),
        'clientas', coalesce(c.clientas, 0), 'clientas_2a', coalesce(c.clientas_2a, 0), 'pedidos', coalesce(c.pedidos, 0),
        'familias', (select jsonb_object_agg(fam, u) from famzona f where f.zona = z.id)) order by z.orden)
      from core_clima_zonas z left join ahora a on a.zona = z.id left join clientas c on c.zona = z.id),
    -- ventas de cada producto por franja de temperatura: <12 frío · 12-17 fresco · 17-22 templado · 22+ calor
    -- ventas de cada producto por AÑO y franja de temperatura: <12 frío · 12-17 fresco · 17-22 templado · 22+ calor.
    -- Va el nombre que tenía el código ese año en FactuSOL: la pantalla descarta los años en que el código era de otra prenda.
    'productos', (select coalesce(jsonb_agg(jsonb_build_array(codigo, fam, round(u, 1), round(f, 1), round(fr, 1), round(te, 1), round(ca, 1), round(med, 1), anio, meses,
                   (select descripcion from fs_articulos_anio a where a.ejercicio = x.anio and a.codigo = x.codigo))), '[]') from (
        select codigo, extract(year from fecha)::int anio, max(fam) fam, sum(u) u,
               sum(u) filter (where t7 < 12) f, sum(u) filter (where t7 >= 12 and t7 < 17) fr, sum(u) filter (where t7 >= 17 and t7 < 22) te, sum(u) filter (where t7 >= 22) ca,
               percentile_cont(0.5) within group (order by t7)::numeric med, count(distinct to_char(fecha, 'YYYY-MM')) meses
          from g where u > 0 group by codigo, extract(year from fecha)) x),
    'base', (select jsonb_build_array(round(sum(u) filter (where t7 < 12), 1), round(sum(u) filter (where t7 >= 12 and t7 < 17), 1),
                                      round(sum(u) filter (where t7 >= 17 and t7 < 22), 1), round(sum(u) filter (where t7 >= 22), 1),
                                      round(percentile_cont(0.5) within group (order by t7)::numeric, 1)) from g where u > 0),
    -- ventas de la web por zona y mes del año (para ver cuándo compra cada región)
    'zona_mes', (select coalesce(jsonb_agg(jsonb_build_array(zona, mes, round(u, 1))), '[]') from (
        select zona, extract(month from fecha)::int mes, sum(u) u from core_ventas_geo where fuente = 'tiendanube' and u > 0 group by 1, 2) x)
  ) into res;
  return res;
end $$;
revoke all on function core_clima_paquete() from public, anon;
grant execute on function core_clima_paquete() to authenticated;
