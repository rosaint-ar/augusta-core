# Augusta Core

Panel interno de Augusta Intimates: métricas del negocio sobre el histórico completo de FactuSOL (desde el 17/12/2022) y las ventas de Percha (desde el 23/10/2026).

- HTML/JS estático, sin compilación. Login con Supabase (mismos usuarios que Percha).
- Datos: proyecto Supabase de Augusta. El Core solo LEE: `core_dataset()` arma el paquete de métricas (ver `sql/`).
- `sql/001-historico-factusol.sql` tablas del histórico · `sql/002-metricas.sql` vista `core_lineas`, IPC y `core_dataset()`.
- Vista local sin login: servir la carpeta y abrir `metricas/?datos=local` (lee `_local/dataset.json`, que NO se publica).
- Los datos de FactuSOL rescatados están en Drive: `AUGUSTA Intimates/08 - Datos FactuSOL` (ver LEEME.txt).
