-- Core de Augusta · 008 · Pedidos de Tienda Nube para Clientas
-- FactuSOL casi no guarda quién compra; Tienda Nube sí: cada pedido trae clienta, email, provincia, ciudad, productos y cupón.
-- Se traen TODOS los pedidos con pg_net usando el token de la conexión de Percha (queda dentro de la base, nadie lo ve)
-- y se guardan en core_tn_pedidos. Solo lectura sobre Tienda Nube.

create table if not exists core_tn_pedidos (
  id bigint primary key, numero int, creado timestamptz, pagado timestamptz, cancelado timestamptz, actualizado timestamptz,
  estado text, pago text, total numeric, subtotal numeric, descuento numeric, envio numeric, gateway text, cupon text,
  cliente_id bigint, email text, nombre text, provincia text, ciudad text, cp text, entrega text, origen text,
  productos jsonb, guardado timestamptz default now());
create index if not exists core_tn_pedidos_cliente on core_tn_pedidos (coalesce(cliente_id::text, lower(email)));
create index if not exists core_tn_pedidos_creado on core_tn_pedidos (creado);
alter table core_tn_pedidos enable row level security;
drop policy if exists core_tn_pedidos_ver on core_tn_pedidos;
create policy core_tn_pedidos_ver on core_tn_pedidos for select using (es_miembro('82c05bbf-e63e-4d25-a762-6f1ee6d27f43'));

create table if not exists core_tn_pedidos_req (id bigint primary key, pagina int, pedido timestamptz default now(), procesado timestamptz, resultado text);
alter table core_tn_pedidos_req enable row level security;   -- sin políticas: solo la base

-- pide las páginas p1..p2 (200 pedidos cada una); con p_desde = solo lo actualizado desde esa fecha
create or replace function core_tn_pedir(p1 int, p2 int, p_desde timestamptz default null) returns int language plpgsql security definer set search_path = public as $$
declare cx record; tok text; rid bigint; n int := 0; url text;
begin
  select c.id, c.externo_id into cx from conexiones c where c.empresa_id = '82c05bbf-e63e-4d25-a762-6f1ee6d27f43' and c.canal = 'tiendanube' limit 1;
  select access_token into tok from conexion_secretos where conexion_id = cx.id;
  if tok is null then raise exception 'Sin conexión a Tienda Nube'; end if;
  for pg in p1..p2 loop
    url := 'https://api.tiendanube.com/2025-03/' || cx.externo_id || '/orders?per_page=200&page=' || pg
        || '&fields=id,number,created_at,paid_at,cancelled_at,updated_at,status,payment_status,total,subtotal,discount,gateway_name,gateway,coupon,customer,shipping_address,products,storefront'
        || coalesce('&updated_at_min=' || to_char(p_desde at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '');
    select net.http_get(url, '{}'::jsonb, jsonb_build_object('Authentication', 'bearer ' || tok, 'User-Agent', 'Augusta Core (rosaint.ar@gmail.com)'), 60000) into rid;
    insert into core_tn_pedidos_req (id, pagina) values (rid, pg); n := n + 1;
  end loop;
  return n;
end $$;

create or replace function core_tn_guardar() returns jsonb language plpgsql security definer set search_path = public as $$
declare q record; r record; j jsonb; n int; tot int := 0; vacias int := 0; errores int := 0; pend int := 0;
begin
  for q in select * from core_tn_pedidos_req where procesado is null order by pagina loop
    select status_code, content into r from net._http_response where id = q.id;
    if not found then
      if q.pedido < now() - interval '30 minutes' then update core_tn_pedidos_req set procesado = now(), resultado = 'sin respuesta' where id = q.id; errores := errores + 1; else pend := pend + 1; end if;
      continue;
    end if;
    if (r.status_code = 404 and r.content !~* 'invalid') or (r.status_code = 200 and coalesce(jsonb_array_length(r.content::jsonb), 0) = 0) then
      update core_tn_pedidos_req set procesado = now(), resultado = 'vacía' where id = q.id; vacias := vacias + 1; continue;
    end if;
    if r.status_code <> 200 then update core_tn_pedidos_req set procesado = now(), resultado = 'error ' || r.status_code || ' ' || left(r.content, 200) where id = q.id; errores := errores + 1; continue; end if;
    j := r.content::jsonb;
    insert into core_tn_pedidos (id, numero, creado, pagado, cancelado, actualizado, estado, pago, total, subtotal, descuento, envio, gateway, cupon,
                                 cliente_id, email, nombre, provincia, ciudad, cp, entrega, origen, productos, guardado)
    select (o->>'id')::bigint, (o->>'number')::int, (o->>'created_at')::timestamptz, nullif(o->>'paid_at', '')::timestamptz, nullif(o->>'cancelled_at', '')::timestamptz,
           (o->>'updated_at')::timestamptz, o->>'status', o->>'payment_status',
           nullif(o->>'total', '')::numeric, nullif(o->>'subtotal', '')::numeric, nullif(o->>'discount', '')::numeric, null::numeric,
           coalesce(nullif(o->>'gateway_name', ''), o->>'gateway'),
           (select string_agg(c->>'code', ', ') from jsonb_array_elements(case when jsonb_typeof(o->'coupon') = 'array' then o->'coupon' else '[]' end) c),
           nullif(o->'customer'->>'id', '')::bigint, lower(nullif(o->'customer'->>'email', '')), o->'customer'->>'name',
           coalesce(nullif(o->'shipping_address'->>'province', ''), nullif(o->'customer'->>'billing_province', '')),
           coalesce(nullif(o->'shipping_address'->>'city', ''), nullif(o->'customer'->>'billing_city', '')),
           coalesce(nullif(o->'shipping_address'->>'zipcode', ''), nullif(o->'customer'->>'billing_zipcode', '')),
           null::text, o->>'storefront',
           (select coalesce(jsonb_agg(jsonb_build_object('producto', p->>'product_id', 'variante', p->>'variant_id', 'sku', p->>'sku', 'nombre', p->>'name',
                    'cantidad', nullif(p->>'quantity', '')::numeric, 'precio', nullif(p->>'price', '')::numeric)), '[]')
              from jsonb_array_elements(coalesce(o->'products', '[]')) p),
           now()
      from jsonb_array_elements(j) o
    on conflict (id) do update set numero = excluded.numero, pagado = excluded.pagado, cancelado = excluded.cancelado, actualizado = excluded.actualizado,
      estado = excluded.estado, pago = excluded.pago, total = excluded.total, subtotal = excluded.subtotal, descuento = excluded.descuento, envio = excluded.envio,
      gateway = excluded.gateway, cupon = excluded.cupon, cliente_id = excluded.cliente_id, email = excluded.email, nombre = excluded.nombre,
      provincia = excluded.provincia, ciudad = excluded.ciudad, cp = excluded.cp, entrega = excluded.entrega, origen = excluded.origen, productos = excluded.productos, guardado = now();
    get diagnostics n = row_count; tot := tot + n;
    update core_tn_pedidos_req set procesado = now(), resultado = 'ok ' || n where id = q.id;
  end loop;
  delete from core_tn_pedidos_req where pedido < now() - interval '30 days';
  return jsonb_build_object('pedidos', tot, 'paginas_vacias', vacias, 'errores', errores, 'pendientes', pend, 'total_guardados', (select count(*) from core_tn_pedidos));
end $$;
revoke all on function core_tn_pedir(int, int, timestamptz) from public, anon, authenticated;
revoke all on function core_tn_guardar() from public, anon, authenticated;
