-- Core de Augusta · 003 · IPC que se actualiza solo + stock vivo de Percha en las métricas

-- ---------- IPC automático ----------
-- Todos los días a las 9:00 (hora de Argentina = 12:00 UTC) se pide la serie al INDEC (datos.gob.ar) con pg_net;
-- cinco minutos después se lee la respuesta y se guardan los meses nuevos o corregidos. Si el INDEC no responde, no se toca nada.
create table if not exists core_ipc_pedidos (id bigint primary key, pedido timestamptz not null default now(), procesado timestamptz, resultado text);
alter table core_ipc_pedidos enable row level security;   -- sin políticas: solo la base la usa

create or replace function core_ipc_pedir() returns bigint language plpgsql security definer set search_path = public as $$
declare rid bigint;
begin
  select net.http_get('https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&start_date='
           || to_char(now() - interval '14 months', 'YYYY-MM-01') || '&format=json&limit=1000') into rid;
  insert into core_ipc_pedidos (id) values (rid);
  return rid;
end $$;

create or replace function core_ipc_guardar() returns text language plpgsql security definer set search_path = public as $$
declare p record; r record; n int; msg text := '';
begin
  for p in select * from core_ipc_pedidos where procesado is null and pedido < now() - interval '30 seconds' order by id loop
    select status_code, content into r from net._http_response where id = p.id;
    if not found then
      if p.pedido < now() - interval '1 hour' then update core_ipc_pedidos set procesado = now(), resultado = 'sin respuesta' where id = p.id; end if;
      continue;
    end if;
    if r.status_code = 200 and r.content::jsonb ? 'data' then
      insert into core_ipc (mes, indice)
        select (x->>0)::date, (x->>1)::numeric from jsonb_array_elements(r.content::jsonb -> 'data') x where x->>1 is not null
      on conflict (mes) do update set indice = excluded.indice where core_ipc.indice is distinct from excluded.indice;
      get diagnostics n = row_count;
      update core_ipc_pedidos set procesado = now(), resultado = 'ok, ' || n || ' meses nuevos o corregidos' where id = p.id;
      msg := msg || 'ok ' || n || '; ';
    else
      update core_ipc_pedidos set procesado = now(), resultado = 'error ' || coalesce(r.status_code::text, '?') where id = p.id;
      msg := msg || 'error; ';
    end if;
  end loop;
  delete from core_ipc_pedidos where pedido < now() - interval '60 days';
  return msg;
end $$;
revoke all on function core_ipc_pedir() from public, anon, authenticated;
revoke all on function core_ipc_guardar() from public, anon, authenticated;

-- La programación diaria está en 004-ipc-cron.sql

-- ---------- stock vivo (Percha) para las métricas ----------
-- Por producto: unidades y valor a costo (costo de la variante si tiene, si no el del producto). Sin kits (su stock es de los
-- componentes) ni familia 99 (servicios). Las bolsas genéricas (BOMBIS VARIAS, MEDIAS VARIAS) sí cuentan: son stock real.
create or replace function core_stock_vivo() returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_array(codigo, fam, round(u, 2), round(costo, 2)) order by costo desc), '[]')
  from (
    select p.codigo, coalesce(c.codigo, '') fam, sum(s.cantidad) u,
           sum(s.cantidad * coalesce(nullif(v.costo, 0), p.costo, 0)) costo
      from stock s
      join variantes v on v.id = s.variante_id
      join productos p on p.id = v.producto_id
      left join categorias c on c.id = p.categoria_id
     where s.empresa_id = '82c05bbf-e63e-4d25-a762-6f1ee6d27f43' and p.tipo <> 'kit' and coalesce(c.codigo, '') <> '99'
     group by p.codigo, c.codigo
    having sum(s.cantidad) > 0) x
$$;

-- core_dataset() (002) toma el stock de core_stock_vivo(); si viniera vacío, usa la última foto de FactuSOL.
