-- Core de Augusta · 002 · Paquete de métricas
-- core_dataset() devuelve en un solo JSON todo lo que la pantalla Métricas necesita; la pantalla calcula períodos y
-- comparaciones en el navegador. Fuentes, sin contar dos veces:
--   · FactuSOL (fs_remitos): todo lo que NO pasó a Percha (venta_id nulo) y no se omitió por ser un pedido de Tienda Nube
--     que Percha ya trae por la conexión (omitido nulo).
--   · Percha (ventas): todo lo no anulado de Augusta. Las reservadas quedan afuera (RLS las oculta igual).
-- Canal: Local · Tienda Nube · Mercado Libre · WhatsApp y redes · Clientas con ficha.
-- "venta" = importe del renglón con el descuento/recargo general del comprobante repartido (cuadra al centavo con el total).

create table if not exists core_ipc (mes date primary key, indice numeric not null, fuente text default 'INDEC IPC nivel general nacional (datos.gob.ar 148.3_INIVELNAL_DICI_M_26)');
alter table core_ipc enable row level security;
drop policy if exists core_ipc_ver on core_ipc;
create policy core_ipc_ver on core_ipc for select using (true);
insert into core_ipc (mes, indice) values
 ('2022-11-01',1079.2787),('2022-12-01',1134.5875),('2023-01-01',1202.979),('2023-02-01',1282.7091),('2023-03-01',1381.1601),('2023-04-01',1497.2147),
 ('2023-05-01',1613.5895),('2023-06-01',1709.6115),('2023-07-01',1818.0838),('2023-08-01',2044.2832),('2023-09-01',2304.9242),('2023-10-01',2496.273),
 ('2023-11-01',2816.0628),('2023-12-01',3533.1922),('2024-01-01',4261.5324),('2024-02-01',4825.7881),('2024-03-01',5357.0929),('2024-04-01',5830.2271),
 ('2024-05-01',6073.7),('2024-06-01',6351.7145),('2024-07-01',6607.7479),('2024-08-01',6883.4412),('2024-09-01',7122.2421),('2024-10-01',7313.9542),
 ('2024-11-01',7491.4314),('2024-12-01',7694.0075),('2025-01-01',7864.1257),('2025-02-01',8052.9927),('2025-03-01',8353.3158),('2025-04-01',8585.6078),
 ('2025-05-01',8714.4871),('2025-06-01',8855.5681),('2025-07-01',9023.973),('2025-08-01',9193.2441),('2025-09-01',9384.0922),('2025-10-01',9603.8623),
 ('2025-11-01',9841.3581),('2025-12-01',10121.3715),('2026-01-01',10413.0309),('2026-02-01',10714.6255),('2026-03-01',11077.0608),('2026-04-01',11363.0904),
 ('2026-05-01',11607.3937),('2026-06-01',11826.4103),('2026-07-01',12076.3937),('2026-08-01',12276.766)
on conflict (mes) do update set indice = excluded.indice;

-- Renglones de venta unificados (una fila por renglón, ya prorrateado). security_invoker: respeta RLS de quien consulta.
create or replace view core_lineas with (security_invoker = true) as
with fs as (
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
    nullif(trim(coalesce(t.nombre, l.talle)), '') as talle
  from fs_remitos r
  join fs_remito_lineas l on l.remito_id = r.id
  join (select remito_id, sum(coalesce(total, 0)) as tl from fs_remito_lineas group by remito_id) s on s.remito_id = r.id
  left join fs_articulos_anio a on a.ejercicio = r.ejercicio and a.codigo = l.articulo
  left join fs_formas_pago_anio fp on fp.ejercicio = r.ejercicio and fp.codigo = r.forma_pago
  left join fs_talles_anio t on t.ejercicio = r.ejercicio and t.codigo = l.talle
  where r.cliente_nombre is distinct from 'AJUSTE DE STOCK' and r.fecha is not null and r.venta_id is null and r.omitido is null
), pv as (
  select v.id::text as doc, (v.fecha at time zone 'America/Argentina/Buenos_Aires')::date as f,
    case v.origen when 'tiendanube' then 'Tienda Nube' when 'mercadolibre' then 'Mercado Libre'
      when 'whatsapp' then 'WhatsApp y redes' when 'online' then 'WhatsApp y redes' when 'factusol' then 'WhatsApp y redes' else 'Local' end as canal,
    p.codigo, coalesce(c.codigo, '') as fam,
    case when p.id is null then case when l.descripcion ~* '^env' then 'envio' else 'varios' end
         when p.tipo in ('sena') then 'sena' when p.tipo = 'gift_card' then 'gift_card' when p.tipo in ('servicio', 'varios') or c.codigo = '99' then 'varios'
         else 'prenda' end as tipo,
    coalesce(l.cantidad, 0) as u,
    coalesce(l.total, 0) * case when abs(sum(coalesce(l.total, 0)) over (partition by v.id)) < 0.005 then 1
                               else coalesce(v.total, 0) / sum(coalesce(l.total, 0)) over (partition by v.id) end as v,
    coalesce(l.costo_unit, 0) as cu,
    nullif(trim(l.talle), '') as talle
  from ventas v
  join venta_lineas l on l.venta_id = v.id
  left join productos p on p.id = l.producto_id
  left join categorias c on c.id = p.categoria_id
  where v.empresa_id = '82c05bbf-e63e-4d25-a762-6f1ee6d27f43' and v.estado <> 'anulada' and not coalesce(v.reservada, false)
)
select 'factusol'::text as fuente, * from fs union all select 'percha', * from pv;

create or replace function core_dataset() returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  e constant uuid := '82c05bbf-e63e-4d25-a762-6f1ee6d27f43';
  res jsonb;
begin
  if not es_miembro(e) then raise exception 'Sin acceso a Augusta'; end if;
  with l as (select * from core_lineas),
  p as (select * from l where tipo = 'prenda'),
  pagos as (
    select to_char(r.fecha, 'YYYY-MM') m, coalesce(fp.nombre, 'Sin dato') n, sum(r.total) t
      from fs_remitos r left join fs_formas_pago_anio fp on fp.ejercicio = r.ejercicio and fp.codigo = r.forma_pago
     where r.cliente_nombre is distinct from 'AJUSTE DE STOCK' and r.fecha is not null and r.venta_id is null and r.omitido is null
     group by 1, 2
    union all
    select to_char((v.fecha at time zone 'America/Argentina/Buenos_Aires')::date, 'YYYY-MM'), coalesce(f.nombre, 'Sin dato'), sum(vp.monto)
      from ventas v join venta_pagos vp on vp.venta_id = v.id left join formas_pago f on f.id = vp.forma_pago_id
     where v.empresa_id = e and v.estado <> 'anulada' and not coalesce(v.reservada, false) group by 1, 2),
  foto as (select max(ejercicio) ej from fs_stock_foto),
  vivo as (select core_stock_vivo() j)
  select jsonb_build_object(
    'generado', now(), 'fuente', 'base', 'hasta', (select max(f) from l),
    'ipc', (select jsonb_object_agg(to_char(mes, 'YYYY-MM'), indice) from core_ipc),
    'familias', (select jsonb_object_agg(codigo, nombre) from (select distinct on (codigo) codigo, nombre from fs_familias_anio order by codigo, ejercicio desc) x),
    'articulos', (select jsonb_object_agg(codigo, nombre) from (
        select distinct on (codigo) codigo, nombre from (
          select codigo, nombre, 1 pri from productos where empresa_id = e
          union all select codigo, descripcion, 2 from fs_articulos_anio) y
        where codigo is not null order by codigo, pri) x),
    'dias', (select coalesce(jsonb_agg(jsonb_build_array(f, canal, fam, round(u, 2), round(v, 2), round(c, 2), round(vc, 2)) order by f), '[]') from (
        select f, canal, fam, sum(u) u, sum(v) v, sum(case when cu > 0 then u * cu else 0 end) c, sum(case when cu > 0 then v else 0 end) vc
          from p group by f, canal, fam) x),
    'tickets', (select coalesce(jsonb_agg(jsonb_build_array(f, canal, n, round(v, 2))), '[]') from (
        select f, canal, count(distinct doc) n, sum(v) v from p group by f, canal) x),
    'servicios', (select coalesce(jsonb_agg(jsonb_build_array(m, canal, tipo, round(u, 2), round(v, 2))), '[]') from (
        select to_char(f, 'YYYY-MM') m, canal, tipo, sum(u) u, sum(v) v from l where tipo <> 'prenda' group by 1, 2, 3) x),
    'productos', (select coalesce(jsonb_agg(jsonb_build_array(m, canal, codigo, fam, round(u, 2), round(v, 2), round(c, 2), round(vc, 2))), '[]') from (
        select to_char(f, 'YYYY-MM') m, canal, codigo, max(fam) fam, sum(u) u, sum(v) v,
               sum(case when cu > 0 then u * cu else 0 end) c, sum(case when cu > 0 then v else 0 end) vc
          from p group by 1, 2, 3) x),
    'ultima_venta', (select jsonb_object_agg(codigo, f) from (select codigo, max(f) f from p where u > 0 and codigo is not null group by codigo) x),
    'talles', (select coalesce(jsonb_agg(jsonb_build_array(m, canal, fam, talle, round(u, 2))), '[]') from (
        select to_char(f, 'YYYY-MM') m, canal, fam, talle, sum(u) u from p where talle is not null group by 1, 2, 3, 4) x),
    'compras', (select coalesce(jsonb_agg(jsonb_build_array(m, fam, round(u, 2), round(c, 2))), '[]') from (
        select to_char(co.fecha, 'YYYY-MM') m, coalesce(a.familia, '') fam, sum(coalesce(cl.cantidad, 0)) u, sum(coalesce(cl.total, 0)) c
          from fs_compras co join fs_compra_lineas cl on cl.compra_id = co.id
          left join fs_articulos_anio a on a.ejercicio = co.ejercicio and a.codigo = cl.articulo
         where co.fecha is not null and coalesce(a.familia, '') <> '99' and cl.articulo not in ('100000', '200000', '300000', '400000')
         group by 1, 2) x),
    'pagos', (select coalesce(jsonb_agg(jsonb_build_array(m, n, round(t, 2))), '[]') from pagos),
    'stock_fuente', case when jsonb_array_length(vivo.j) > 0 then 'percha' else 'factusol' end,
    'stock_fecha', case when jsonb_array_length(vivo.j) > 0 then to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') else (select max(fecha_foto)::text from fs_stock_foto) end,
    'stock', case when jsonb_array_length(vivo.j) > 0 then vivo.j else (select coalesce(jsonb_agg(jsonb_build_array(articulo, fam, round(u, 2), round(costo, 2))), '[]') from (
        select s.articulo, max(a.familia) fam, sum(s.stock) u, sum(s.stock * coalesce(a.costo, 0)) costo
          from fs_stock_foto s join foto on s.ejercicio = foto.ej
          join fs_articulos_anio a on a.ejercicio = s.ejercicio and a.codigo = s.articulo
         where coalesce(a.familia, '') <> '99' and s.articulo not in ('100000', '200000', '300000', '400000')
         group by s.articulo having sum(s.stock) > 0) x) end
  ) into res from vivo;
  return res;
end $$;
revoke all on function core_dataset() from public, anon;
grant execute on function core_dataset() to authenticated;
