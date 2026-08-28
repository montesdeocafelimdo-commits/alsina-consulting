-- ── INFORME PRIVADO: ELECTROMOVILIDAD ZONA NORTE ─────────────────────
-- Nuevo recurso gateado por la misma capacidad que ya usan PBG Municipal
-- y "Un empleo cada 23 vecinos" (report_premium_view, solo Gobernador,
-- ver 20260820210041_fase1_foundations.sql). No crea features ni
-- plan_features nuevos — Gobernador ya tiene report_premium_view en
-- 'full' desde la migración fundacional.

INSERT INTO resources (slug, title, resource_type) VALUES
  ('informe-electromovilidad-zona-norte', 'Electromovilidad en el territorio — Zona Norte', 'dashboard')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO resource_features (resource_id, feature_id, required_level)
SELECT r.id, f.id, 'full'
FROM resources r, features f
WHERE r.slug = 'informe-electromovilidad-zona-norte'
  AND f.key = 'report_premium_view'
ON CONFLICT (resource_id, feature_id) DO NOTHING;
