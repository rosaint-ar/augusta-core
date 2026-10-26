-- Core de Augusta · 005 · Ficha de producto
-- core_producto(código) devuelve toda la historia de un producto: datos de hoy (Percha), ventas por mes·canal·talle·color
-- desde 2022, compras (FactuSOL y Percha), stock actual por talle·color y precio de lista de cada año.
-- Une el código actual con los códigos viejos que Percha guardó como "Código anterior: X".

create or replace function core_producto(p_codigo text) returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  e constant uuid := '82c05bbf-e63e-4d25-a762-6f1ee6d27f43';
  actual text; codigos text[]; pid uuid; res jsonb;
begin
  if not es_miembro(e) then raise exception 'Sin acceso a Augusta'; end if;
  -- si me pasan un código viejo, voy al actual
  actual := coalesce(core_alias() ->> p_codigo, p_codigo);
  select id into pid from productos where empresa_id = e and codigo = actual order by activo desc limit 1;
  select array_agg(distinct c) into codigos from (
    select actual c
    union select key from jsonb_each_text(core_alias()) where value = actual) x;

  with l as (select * from core_lineas where tipo = 'prenda' and codigo = any(codigos))
  select jsonb_build_object(
    'codigo', actual, 'codigos', to_jsonb(codigos),
    'producto', (select jsonb_build_object('nombre', p.nombre, 'familia', c.codigo, 'familia_nombre', c.nombre, 'precio', p.precio, 'costo', p.costo,
                        'foto', p.imagen_url, 'activo', p.activo, 'tipo', p.tipo, 'generico', p.es_generico, 'creado', p.creado)
                   from productos p left join categorias c on c.id = p.categoria_id where p.id = pid),
    'nombre_fs', (select descripcion from fs_articulos_anio where codigo = any(codigos) order by ejercicio desc limit 1),
    'familia_fs', (select familia from fs_articulos_anio where codigo = any(codigos) order by ejercicio desc limit 1),
    'nombres', (select coalesce(jsonb_agg(jsonb_build_array(ejercicio, codigo, descripcion) order by ejercicio, codigo), '[]') from fs_articulos_anio where codigo = any(codigos)),
    'ventas', (select coalesce(jsonb_agg(jsonb_build_array(m, canal, talle, color, round(u, 2), round(v, 2), round(c, 2), round(vc, 2)) order by m), '[]') from (
        select to_char(f, 'YYYY-MM') m, canal, talle, color, sum(u) u, sum(v) v,
               sum(case when cu > 0 then u * cu else 0 end) c, sum(case when cu > 0 then v else 0 end) vc
          from l group by 1, 2, 3, 4) x),
    'primera_venta', (select min(f) from l where u > 0), 'ultima_venta', (select max(f) from l where u > 0),
    'compras', (select coalesce(jsonb_agg(jsonb_build_array(fecha, proveedor, talle, color, round(u, 2), round(costo, 2), fuente) order by fecha), '[]') from (
        select co.fecha, coalesce(pr.nombre, co.proveedor_nombre) proveedor, nullif(trim(coalesce(t.nombre, cl.talle)), '') talle,
               nullif(trim(coalesce(cc.nombre, cl.color)), '') color, cl.cantidad u, cl.precio costo, 'factusol' fuente
          from fs_compra_lineas cl join fs_compras co on co.id = cl.compra_id
          left join fs_proveedores pr on pr.ejercicio = co.ejercicio and pr.codigo = co.proveedor_cod
          left join fs_talles_anio t on t.ejercicio = co.ejercicio and t.codigo = cl.talle
          left join fs_colores_anio cc on cc.ejercicio = co.ejercicio and cc.codigo = cl.color
         where cl.articulo = any(codigos) and co.fecha is not null
        union all
        select (co.fecha at time zone 'America/Argentina/Buenos_Aires')::date, pv.nombre, nullif(trim(cl.talle), ''), nullif(trim(cl.color), ''),
               cl.recibida, cl.costo_unit, 'percha'
          from compra_lineas cl join compras co on co.id = cl.compra_id left join proveedores pv on pv.id = co.proveedor_id
         where cl.producto_id = pid and co.estado in ('parcial', 'recibida') and coalesce(cl.recibida, 0) <> 0) x),
    'stock', (select coalesce(jsonb_agg(jsonb_build_array(talle_nombre, color_nombre, round(stock, 2), round(coalesce(fallas, 0), 2), talle_orden, color_hex) order by talle_orden, color_nombre), '[]')
                from v_variantes where producto_id = pid and (activa or coalesce(stock, 0) <> 0) and not (talle is null and color is null and coalesce(stock, 0) = 0 and
                  exists (select 1 from v_variantes v2 where v2.producto_id = pid and (v2.talle is not null or v2.color is not null)))),
    'precios', (select coalesce(jsonb_agg(jsonb_build_array(ejercicio, round(precio, 2)) order by ejercicio), '[]') from (
        select ejercicio, max(precio) precio from fs_precios where tarifa = 1 and articulo = any(codigos) and precio > 0 group by ejercicio) x)
  ) into res;
  return res;
end $$;
revoke all on function core_producto(text) from public, anon;
grant execute on function core_producto(text) to authenticated;
