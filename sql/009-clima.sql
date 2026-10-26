-- Core de Augusta · 009 · Clima por zona
-- Zonas de clima donde compran las clientas (una por provincia + divisiones donde el clima cambia mucho dentro de la provincia).
-- Datos de Open-Meteo (sin clave): histórico diario desde 2015 (archive-api, ERA5) y los últimos 14 días + pronóstico de 16 (forecast).
-- Todo se pide desde la base con pg_net y se guarda en core_clima_dia; "normal" = promedio 2015-2025 de cada mes.

create table if not exists core_clima_zonas (id text primary key, nombre text not null, provincia text not null, lat numeric not null, lon numeric not null, orden int);
create table if not exists core_clima_dia (zona text not null references core_clima_zonas(id), fecha date not null, tmed numeric, tmin numeric, tmax numeric, lluvia numeric,
  pronostico boolean not null default false, actualizado timestamptz default now(), primary key (zona, fecha));
create table if not exists core_clima_req (id bigint primary key, zona text, tipo text, pedido timestamptz default now(), procesado timestamptz, resultado text);
alter table core_clima_zonas enable row level security; alter table core_clima_dia enable row level security; alter table core_clima_req enable row level security;
drop policy if exists core_clima_zonas_ver on core_clima_zonas; create policy core_clima_zonas_ver on core_clima_zonas for select using (true);
drop policy if exists core_clima_dia_ver on core_clima_dia; create policy core_clima_dia_ver on core_clima_dia for select using (true);

insert into core_clima_zonas (id, nombre, provincia, lat, lon, orden) values
 ('jujuy', 'San Salvador de Jujuy', 'Jujuy', -24.19, -65.30, 1), ('salta', 'Salta', 'Salta', -24.79, -65.41, 2),
 ('formosa', 'Formosa', 'Formosa', -26.18, -58.17, 3), ('tucuman', 'San Miguel de Tucumán', 'Tucumán', -26.82, -65.22, 4),
 ('posadas', 'Posadas', 'Misiones', -27.37, -55.90, 5), ('resistencia', 'Resistencia', 'Chaco', -27.45, -58.99, 6),
 ('corrientes', 'Corrientes', 'Corrientes', -27.47, -58.83, 7), ('santiago', 'Santiago del Estero', 'Santiago del Estero', -27.79, -64.26, 8),
 ('catamarca', 'Catamarca', 'Catamarca', -28.47, -65.78, 9), ('larioja', 'La Rioja', 'La Rioja', -29.41, -66.86, 10),
 ('cordoba', 'Córdoba capital y sierras', 'Córdoba', -31.42, -64.18, 11), ('sanjuan', 'San Juan', 'San Juan', -31.54, -68.53, 12),
 ('parana', 'Paraná', 'Entre Ríos', -31.73, -60.53, 13), ('rosario', 'Rosario', 'Santa Fe', -32.95, -60.64, 14),
 ('mendoza', 'Mendoza', 'Mendoza', -32.89, -68.83, 15), ('riocuarto', 'Río Cuarto (el local)', 'Córdoba', -33.13, -64.35, 16),
 ('sanluis', 'San Luis', 'San Luis', -33.30, -66.34, 17), ('amba', 'Buenos Aires y conurbano', 'Buenos Aires', -34.61, -58.38, 18),
 ('santarosa', 'Santa Rosa', 'La Pampa', -36.62, -64.29, 19), ('tandil', 'Centro de Buenos Aires', 'Buenos Aires', -37.32, -59.13, 20),
 ('mardelplata', 'Mar del Plata y costa', 'Buenos Aires', -38.00, -57.55, 21), ('bahiablanca', 'Bahía Blanca', 'Buenos Aires', -38.72, -62.27, 22),
 ('altovalle', 'Neuquén y Alto Valle', 'Neuquén', -38.95, -68.06, 23), ('viedma', 'Viedma', 'Río Negro', -40.81, -62.99, 24),
 ('bariloche', 'Bariloche y cordillera', 'Río Negro', -41.13, -71.31, 25), ('trelew', 'Trelew y Puerto Madryn', 'Chubut', -43.25, -65.31, 26),
 ('esquel', 'Esquel', 'Chubut', -42.91, -71.32, 27), ('comodoro', 'Comodoro y Caleta Olivia', 'Chubut', -45.86, -67.48, 28),
 ('riogallegos', 'Río Gallegos', 'Santa Cruz', -51.62, -69.22, 29), ('ushuaia', 'Tierra del Fuego', 'Tierra del Fuego', -54.80, -68.30, 30)
on conflict (id) do update set nombre = excluded.nombre, provincia = excluded.provincia, lat = excluded.lat, lon = excluded.lon, orden = excluded.orden;

-- zona de una dirección (provincia + ciudad tal como viene de Tienda Nube)
create or replace function core_zona(p_prov text, p_ciudad text) returns text language sql immutable as $$
  with x as (select lower(translate(coalesce(p_prov, ''), 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) p, lower(translate(coalesce(p_ciudad, ''), 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) c)
  select case
    when p like '%cordoba%' then case when c ~ '(^capital$|^cordoba|colon|punilla|carlos paz|santa maria|calamuchita|cosquin|la falda|alta gracia|jesus maria|rio segundo|rio primero|san justo|villa maria|tercero arriba|general san martin|union|marcos juarez)' and c !~ 'rio cuarto' then 'cordoba' else 'riocuarto' end
    when p like '%capital federal%' or p like '%ciudad%autonoma%' or p = 'caba' then 'amba'
    when p like '%buenos aires%' then case when c ~ '(pueyrredon|mar del plata|villa gesell|pinamar|la costa|miramar|necochea|balcarce|mar chiquita)' then 'mardelplata'
                                           when c ~ '(bahia blanca|tornquist|coronel (rosales|suarez|dorrego|pringles)|monte hermoso|villarino|patagones|punta alta)' then 'bahiablanca'
                                           when c ~ '(tandil|azul|olavarria|benito juarez|rauch|ayacucho|tres arroyos|bolivar|tapalque|las flores)' then 'tandil' else 'amba' end
    when p like '%santa fe%' then 'rosario' when p like '%entre rios%' then 'parana' when p like '%mendoza%' then 'mendoza'
    when p like '%san luis%' then 'sanluis' when p like '%san juan%' then 'sanjuan' when p like '%la rioja%' then 'larioja'
    when p like '%catamarca%' then 'catamarca' when p like '%tucuman%' then 'tucuman' when p like '%salta%' then 'salta' when p like '%jujuy%' then 'jujuy'
    when p like '%santiago%' then 'santiago' when p like '%chaco%' then 'resistencia' when p like '%corrientes%' then 'corrientes'
    when p like '%formosa%' then 'formosa' when p like '%misiones%' then 'posadas' when p like '%la pampa%' then 'santarosa'
    when p like '%neuquen%' then case when c ~ '(san martin de los andes|junin de los andes|villa la angostura|alumine|chos malal|los lagos|lacar|huiliches)' then 'bariloche' else 'altovalle' end
    when p like '%rio negro%' then case when c ~ '(bariloche|bolson|pilcaniyeu|ñorquinco)' then 'bariloche' when c ~ '(viedma|adolfo alsina|san antonio|conesa)' then 'viedma' else 'altovalle' end
    when p like '%chubut%' then case when c ~ '(esquel|futaleufu|cushamen|trevelin|languineo)' then 'esquel' when c ~ '(trelew|rawson|madryn|biedma|gaiman)' then 'trelew' else 'comodoro' end
    when p like '%santa cruz%' then case when c ~ '(caleta|pico truncado|las heras|deseado|perito moreno)' then 'comodoro' else 'riogallegos' end
    when p like '%fuego%' then 'ushuaia'
    else null end from x
$$;

-- pide clima a Open-Meteo: tipo 'historico' (desde p_desde hasta hace 6 días) o 'reciente' (últimos 14 días + 16 de pronóstico)
drop function if exists core_clima_pedir(text, date);
-- p_zonas: solo esas zonas (Open-Meteo corta si se le piden muchas a la vez: de a 2 o 3)
create or replace function core_clima_pedir(p_tipo text, p_zonas text[] default null, p_desde date default '2015-01-01') returns int language plpgsql security definer set search_path = public as $$
declare z record; rid bigint; n int := 0; url text; d text := 'temperature_2m_mean,temperature_2m_min,temperature_2m_max,precipitation_sum';
begin
  for z in select * from core_clima_zonas where p_zonas is null or id = any(p_zonas) order by orden loop
    url := case when p_tipo = 'historico'
      then 'https://archive-api.open-meteo.com/v1/archive?latitude=' || z.lat || '&longitude=' || z.lon || '&start_date=' || p_desde || '&end_date=' || (current_date - 6) || '&daily=' || d || '&timezone=America%2FArgentina%2FBuenos_Aires'
      else 'https://api.open-meteo.com/v1/forecast?latitude=' || z.lat || '&longitude=' || z.lon || '&past_days=14&forecast_days=16&daily=' || d || '&timezone=America%2FArgentina%2FBuenos_Aires' end;
    select net.http_get(url, '{}'::jsonb, '{"User-Agent": "Augusta Core (rosaint.ar@gmail.com)"}'::jsonb, 120000) into rid;
    insert into core_clima_req (id, zona, tipo) values (rid, z.id, p_tipo); n := n + 1;
  end loop;
  return n;
end $$;

create or replace function core_clima_guardar() returns jsonb language plpgsql security definer set search_path = public as $$
declare q record; r record; j jsonb; n int; tot int := 0; err int := 0; pend int := 0;
begin
  for q in select * from core_clima_req where procesado is null order by id loop
    select status_code, content into r from net._http_response where id = q.id;
    if not found then
      if q.pedido < now() - interval '30 minutes' then update core_clima_req set procesado = now(), resultado = 'sin respuesta' where id = q.id; err := err + 1; else pend := pend + 1; end if;
      continue;
    end if;
    if r.status_code <> 200 then update core_clima_req set procesado = now(), resultado = 'error ' || r.status_code || ' ' || left(r.content, 200) where id = q.id; err := err + 1; continue; end if;
    j := r.content::jsonb -> 'daily';
    insert into core_clima_dia (zona, fecha, tmed, tmin, tmax, lluvia, pronostico, actualizado)
    select q.zona, (j->'time'->>i)::date, nullif(j->'temperature_2m_mean'->>i, '')::numeric, nullif(j->'temperature_2m_min'->>i, '')::numeric,
           nullif(j->'temperature_2m_max'->>i, '')::numeric, nullif(j->'precipitation_sum'->>i, '')::numeric, (j->'time'->>i)::date > current_date, now()
      from generate_series(0, jsonb_array_length(j->'time') - 1) i
     where j->'temperature_2m_mean'->>i is not null
    on conflict (zona, fecha) do update set tmed = excluded.tmed, tmin = excluded.tmin, tmax = excluded.tmax, lluvia = excluded.lluvia,
      pronostico = excluded.pronostico, actualizado = now();
    get diagnostics n = row_count; tot := tot + n;
    update core_clima_req set procesado = now(), resultado = 'ok ' || n where id = q.id;
  end loop;
  delete from core_clima_req where pedido < now() - interval '30 days';
  return jsonb_build_object('dias', tot, 'errores', err, 'pendientes', pend);
end $$;
revoke all on function core_clima_pedir(text, text[], date) from public, anon, authenticated;
revoke all on function core_clima_guardar() from public, anon, authenticated;

-- un paso de actualización: guarda lo que llegó y pide la próxima zona pendiente (histórico si le falta, si no los últimos 14 días + pronóstico).
-- Pensada para correr cada 2 minutos durante una hora por día: así Open-Meteo nunca recibe muchos pedidos juntos.
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
  return 'al día';
end $$;
revoke all on function core_clima_paso() from public, anon, authenticated;
