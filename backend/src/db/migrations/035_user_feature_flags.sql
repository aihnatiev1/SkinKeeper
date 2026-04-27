-- 035_user_feature_flags.sql
-- Per-user feature flag overrides. Merged at request time with env-driven
-- kill switches and canary rollout computation by services/featureFlags.ts.
-- Default '{}' means "no overrides; use canary/env".

ALTER TABLE users ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_users_feature_flags ON users USING GIN (feature_flags);
