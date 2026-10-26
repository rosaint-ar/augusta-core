-- Core de Augusta · 012 · Programa la actualización diaria (funciones en 009 y 011)
-- 8:00 a 8:58 (hora de Argentina = 11 UTC): clima zona por zona cada 2 minutos; pedidos de TN a las 8:00 y se guardan a las 8:10
select cron.unschedule(jobid) from cron.job where jobname in ('core_clima_paso', 'core_tn_pedir', 'core_tn_guardar');
select cron.schedule('core_clima_paso', '*/2 11 * * *', 'select core_clima_paso()');
select cron.schedule('core_tn_pedir', '0 11 * * *', 'select core_tn_paso()');
select cron.schedule('core_tn_guardar', '10 11 * * *', 'select core_tn_paso()');
