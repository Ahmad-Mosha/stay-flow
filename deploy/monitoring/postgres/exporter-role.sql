-- The metrics exporter's login. pg_monitor lets it read Postgres's statistics, and no table: not
-- one guest's details. deploy.sh runs this on every deploy, so a new password in .env applies.
\getenv password EXPORTER_PASSWORD
SELECT 'CREATE ROLE stayflow_exporter'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'stayflow_exporter') \gexec
ALTER ROLE stayflow_exporter WITH LOGIN PASSWORD :'password' CONNECTION LIMIT 2;
GRANT pg_monitor TO stayflow_exporter;
