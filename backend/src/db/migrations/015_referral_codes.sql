-- 015_referral_codes.sql
-- Referral system: each user gets a unique referral code.
-- Referred users are tracked for growth analytics.

ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(8) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Generate referral codes for existing users (8-char alphanumeric)
UPDATE users SET referral_code = UPPER(SUBSTR(MD5(id::text || created_at::text), 1, 8))
WHERE referral_code IS NULL;

-- Make referral_code NOT NULL for new users (generated on insert)
-- Note: can't easily add NOT NULL after the fact without migration, so keep nullable
-- and generate on user creation.
