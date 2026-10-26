-- Core de Augusta · 006 · Horarios del local
-- core_horario() devuelve cada ticket del LOCAL con su hora real: FactuSOL = remitos de la caja (TPV) que no son online;
-- Percha = ventas de origen local. Solo cuenta prendas (sin envíos, señas ni gift cards), igual que Métricas.
-- Fila: [fecha, 'HH:MI', venta, costo, venta_con_costo, unidades].

create or replace function core_horario() returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare e constant uuid := '82c05bbf-e63e-4d25-a762-6f1ee6d27f43'; res jsonb;
begin
  if not es_miembro(e) then raise exception 'Sin acceso a Augusta'; end if;
  with t as (
    select l.f, to_char(r.hora, 'HH24:MI') h, sum(l.v) v, sum(case when l.cu > 0 then l.u * l.cu else 0 end) c, sum(case when l.cu > 0 then l.v else 0 end) vc, sum(l.u) u
      from core_lineas l join fs_remitos r on r.id = l.doc
     where l.fuente = 'factusol' and l.tipo = 'prenda' and r.tpv_id is not null and r.hora is not null and upper(r.cliente_nombre) not like 'ONLINE%'
     group by l.doc, l.f, r.hora
    union all
    select l.f, to_char(v.fecha at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'), sum(l.v), sum(case when l.cu > 0 then l.u * l.cu else 0 end), sum(case when l.cu > 0 then l.v else 0 end), sum(l.u)
      from core_lineas l join ventas v on v.id::text = l.doc
     where l.fuente = 'percha' and l.tipo = 'prenda' and v.origen = 'local'
     group by l.doc, l.f, v.fecha)
  select jsonb_build_object('generado', now(), 'hasta', (select max(f) from t),
    'ipc', (select jsonb_object_agg(to_char(mes, 'YYYY-MM'), indice) from core_ipc),
    'tickets', coalesce(jsonb_agg(jsonb_build_array(f, h, round(v, 2), round(c, 2), round(vc, 2), round(u, 2)) order by f, h), '[]'))
    into res from t where u <> 0 or v <> 0;
  return res;
end $$;
revoke all on function core_horario() from public, anon;
grant execute on function core_horario() to authenticated;
