-- Core de Augusta · 013 · Clientas (pedidos de Tienda Nube: es la única fuente con la clienta identificada)
-- core_clientas(): pedidos pagados y no cancelados [fecha, clienta, zona, total, unidades, cupón] + nombre de cada clienta + IPC.
create or replace function core_clientas() returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare e constant uuid := '82c05bbf-e63e-4d25-a762-6f1ee6d27f43'; res jsonb;
begin
  if not es_miembro(e) then raise exception 'Sin acceso a Augusta'; end if;
  with o as (
    select coalesce(cliente_id::text, lower(email), 'pedido-' || id) cid, (creado at time zone 'America/Argentina/Buenos_Aires')::date f, core_zona(provincia, ciudad) zona,
           total, (select coalesce(sum(nullif(p->>'cantidad', '')::numeric), 0) from jsonb_array_elements(productos) p) u, nullif(cupon, '') cupon, nombre, ciudad, provincia
      from core_tn_pedidos where pago = 'paid' and cancelado is null)
  select jsonb_build_object('generado', now(), 'hasta', (select max(f) from o),
    'ipc', (select jsonb_object_agg(to_char(mes, 'YYYY-MM'), indice) from core_ipc),
    'zonas', (select jsonb_object_agg(id, nombre) from core_clima_zonas),
    'pedidos', (select coalesce(jsonb_agg(jsonb_build_array(f, cid, zona, round(total, 2), u, cupon) order by f), '[]') from o),
    'clientas', (select jsonb_object_agg(cid, jsonb_build_array(nombre, ciudad, provincia)) from (select distinct on (cid) cid, nombre, ciudad, provincia from o order by cid, f desc) x)
  ) into res;
  return res;
end $$;
revoke all on function core_clientas() from public, anon;
grant execute on function core_clientas() to authenticated;
