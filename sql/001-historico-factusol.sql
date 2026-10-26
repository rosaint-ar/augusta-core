-- Core de Augusta · 001 · Histórico completo de FactuSOL (17/12/2022 en adelante)
-- Las tablas fs_remitos / fs_remito_lineas / fs_articulos / fs_familias / fs_formas_pago ya existían (2025-2026).
-- Acá se suma lo que hace falta para métricas de varios años: el catálogo, las formas de pago y los proveedores
-- tal como eran CADA año (los códigos de FactuSOL se reusaron), las compras, el stock de cada copia y los precios.
-- Solo lectura para la app: se cargan por CLI desde los CSV de "08 - Datos FactuSOL".

create table if not exists fs_articulos_anio (
  ejercicio int not null, codigo text not null, descripcion text, familia text, costo numeric, ean text, alta date, modificado date,
  primary key (ejercicio, codigo));
create table if not exists fs_familias_anio (ejercicio int not null, codigo text not null, nombre text, primary key (ejercicio, codigo));
create table if not exists fs_formas_pago_anio (ejercicio int not null, codigo int not null, nombre text, primary key (ejercicio, codigo));
create table if not exists fs_talles_anio (ejercicio int not null, codigo text not null, nombre text, primary key (ejercicio, codigo));
create table if not exists fs_colores_anio (ejercicio int not null, codigo text not null, nombre text, primary key (ejercicio, codigo));
create table if not exists fs_tarifas (ejercicio int not null, codigo int not null, nombre text, primary key (ejercicio, codigo));
create table if not exists fs_precios (ejercicio int not null, tarifa int not null, articulo text not null, precio numeric, primary key (ejercicio, tarifa, articulo));
create table if not exists fs_proveedores (
  ejercicio int not null, codigo int not null, nombre text, localidad text, provincia text, alta date, primary key (ejercicio, codigo));

-- compras = entradas de mercadería de proveedores (F_ENT / F_LEN); id = ejercicio-tipo-codigo como los remitos
create table if not exists fs_compras (
  id text primary key, ejercicio int not null, tipo text, codigo int not null, fecha date, proveedor_cod int, proveedor_nombre text,
  forma_pago int, total_lineas numeric, descuento numeric, total numeric, almacen text, obs text);
create table if not exists fs_compra_lineas (
  compra_id text not null references fs_compras(id) on delete cascade, pos int not null, articulo text, descripcion text,
  talle text, color text, cantidad numeric, precio numeric, total numeric, primary key (compra_id, pos));

-- stock de cada copia de FactuSOL (F_STC), por talle y color; fecha_foto = último movimiento de ese archivo
create table if not exists fs_stock_foto (
  ejercicio int not null, fecha_foto date not null, articulo text not null, almacen text not null default '',
  talle text not null default '', color text not null default '', stock numeric,
  primary key (ejercicio, articulo, almacen, talle, color));

create index if not exists fs_remitos_fecha on fs_remitos (fecha);
create index if not exists fs_compras_fecha on fs_compras (fecha);
create index if not exists fs_compra_lineas_art on fs_compra_lineas (articulo);
create index if not exists fs_remito_lineas_art on fs_remito_lineas (articulo);

-- lectura: solo miembros de Augusta (misma regla que las fs_ existentes)
do $$ declare t text; begin
  foreach t in array array['fs_articulos_anio','fs_familias_anio','fs_formas_pago_anio','fs_talles_anio','fs_colores_anio',
                           'fs_tarifas','fs_precios','fs_proveedores','fs_compras','fs_compra_lineas','fs_stock_foto'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_ver', t);
    execute format('create policy %I on %I for select using (es_miembro(%L::uuid))', t || '_ver', t, '82c05bbf-e63e-4d25-a762-6f1ee6d27f43');
  end loop; end $$;
