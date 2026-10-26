-- Core de Augusta · 004 · Programa la actualización diaria del IPC (funciones en 003)
-- 12:00 UTC = 9:00 en Argentina: se pide la serie; 12:05 se guarda lo que llegó.
select cron.unschedule(jobid) from cron.job where jobname in ('core_ipc_pedir', 'core_ipc_guardar');
select cron.schedule('core_ipc_pedir', '0 12 * * *', 'select core_ipc_pedir()');
select cron.schedule('core_ipc_guardar', '5 12 * * *', 'select core_ipc_guardar()');
