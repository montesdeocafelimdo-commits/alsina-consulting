-- Rollback de 20260825150000_electromovilidad_resource.sql

DELETE FROM resource_features
WHERE resource_id = (SELECT id FROM resources WHERE slug = 'informe-electromovilidad-zona-norte');

DELETE FROM resources WHERE slug = 'informe-electromovilidad-zona-norte';
