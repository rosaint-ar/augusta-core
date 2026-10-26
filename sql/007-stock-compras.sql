-- Core de Augusta · 007 · Stock y compras
-- core_compras() devuelve lo necesario para decidir compras:
--   compras   [fecha, proveedor, código, familia, talle, color, unidades, costo unitario]  (FactuSOL + compras recibidas en Percha)
--   stock     [código, familia, talle, color, stock, costo unitario, genérico]           (Percha hoy, por variante; sin kits ni servicios)
--   ventas90  [código, talle, color, unidades]                                          (prendas vendidas en los últimos 90 días)

create or replace function core_compras() returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare e constant uuid := '82c05bbf-e63e-4d25-a762-6f1ee6d27f43'; hasta date; res jsonb;
begin
  if not es_miembro(e) then raise exception 'Sin acceso a Augusta'; end if;
  select max(f) into hasta from core_lineas where tipo = 'prenda';
  select jsonb_build_object(
    'generado', now(), 'hasta', hasta,
    'ipc', (select jsonb_object_agg(to_char(mes, 'YYYY-MM'), indice) from core_ipc),
    'compras', (select coalesce(jsonb_agg(jsonb_build_array(fecha, proveedor, codigo, fam, talle, color, round(u, 2), round(costo, 2)) order by fecha), '[]') from (
        select co.fecha, coalesce(pr.nombre, co.proveedor_nombre, 'Sin proveedor') proveedor, cl.articulo codigo, coalesce(a.familia, '') fam,
               nullif(trim(coalesce(t.nombre, cl.talle)), '') talle, nullif(trim(coalesce(cc.nombre, cl.color)), '') color, cl.cantidad u, cl.precio costo
          from fs_compra_lineas cl join fs_compras co on co.id = cl.compra_id
          left join fs_articulos_anio a on a.ejercicio = co.ejercicio and a.codigo = cl.articulo
          left join fs_proveedores pr on pr.ejercicio = co.ejercicio and pr.codigo = co.proveedor_cod
          left join fs_talles_anio t on t.ejercicio = co.ejercicio and t.codigo = cl.talle
          left join fs_colores_anio cc on cc.ejercicio = co.ejercicio and cc.codigo = cl.color
         where co.fecha is not null and coalesce(a.familia, '') <> '99' and coalesce(cl.articulo, '') not in ('', '100000', '200000', '300000', '400000')
           and coalesce(cl.cantidad, 0) <> 0
        union all
        select (co.fecha at time zone 'America/Argentina/Buenos_Aires')::date, coalesce(pv.nombre, 'Sin proveedor'), p.codigo, coalesce(c.codigo, ''),
               nullif(trim(cl.talle), ''), nullif(trim(cl.color), ''), cl.recibida, cl.costo_unit
          from compra_lineas cl join compras co on co.id = cl.compra_id
          join productos p on p.id = cl.producto_id left join categorias c on c.id = p.categoria_id
          left join proveedores pv on pv.id = co.proveedor_id
         where co.empresa_id = e and co.estado in ('parcial', 'recibida') and coalesce(cl.recibida, 0) <> 0) x),
    'stock', (select coalesce(jsonb_agg(jsonb_build_array(p.codigo, coalesce(c.codigo, ''), v.talle_nombre, v.color_nombre, round(v.stock, 2),
                                  round(coalesce(nullif(v.costo, 0), p.costo, 0), 2), coalesce(p.es_generico, false))), '[]')
        from v_variantes v join productos p on p.id = v.producto_id left join categorias c on c.id = p.categoria_id
       where p.empresa_id = e and p.tipo <> 'kit' and coalesce(c.codigo, '') <> '99' and coalesce(v.stock, 0) <> 0),
    'ventas90', (select coalesce(jsonb_agg(jsonb_build_array(codigo, talle, color, round(u, 2))), '[]') from (
        select codigo, talle, color, sum(u) u from core_lineas where tipo = 'prenda' and f > hasta - 90 and codigo is not null
         group by 1, 2, 3 having sum(u) <> 0) x)
  ) into res;
  return res;
end $$;
revoke all on function core_compras() from public, anon;
grant execute on function core_compras() to authenticated;
