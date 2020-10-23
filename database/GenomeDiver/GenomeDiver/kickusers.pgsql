-- need to kick users to reload schema
SET client_min_messages TO WARNING;

SELECT pg_terminate_backend(pg_stat_activity.pid)
FROM pg_stat_activity
WHERE pg_stat_activity.datname = 'genome_diver'
  AND pid <> pg_backend_pid();

