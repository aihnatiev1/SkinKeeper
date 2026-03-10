-- Reset inspection cache for items with stickers that have empty image URLs.
-- The inspect service was mapping the wrong field (s.image instead of s.icon_url),
-- so all cached sticker data has empty image strings. This forces re-inspection.
UPDATE inventory_items
SET inspected_at = NULL
WHERE stickers IS NOT NULL
  AND stickers::text LIKE '%"image":""%';
