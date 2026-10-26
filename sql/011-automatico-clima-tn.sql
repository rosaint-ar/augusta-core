-- Core de Augusta · 011 · Actualización diaria de clima y pedidos de Tienda Nube
-- core_tn_paso(): guarda lo que llegó y, si hace más de 20 h que no pide, trae los pedidos actualizados desde 2 días antes del último.
create or replace function core_tn_paso() returns text language plpgsql security definer set search_path = public as $$
declare g jsonb; desde timestamptz;
begin
  g := core_tn_guardar();
  if exists (select 1 from core_tn_pedidos_req where procesado is null) then return 'esperando ' || g::text; end if;
  if exists (select 1 from core_tn_pedidos_req where pedido > now() - interval '20 hours') then return 'al día ' || g::text; end if;
  select max(actualizado) - interval '2 days' into desde from core_tn_pedidos;
  perform core_tn_pedir(1, 3, desde);
  return 'pedido desde ' || desde;
end $$;
revoke all on function core_tn_paso() from public, anon, authenticated;

-- La programación diaria está en 012-cron-clima-tn.sql
