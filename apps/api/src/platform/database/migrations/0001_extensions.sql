-- btree_gist lets a GiST index compare plain scalar columns (such as uuid) with `=`.
-- The booking exclusion constraints need that next to the range-overlap operator `&&`:
--   EXCLUDE USING gist (unit_id WITH =, nights WITH &&)
CREATE EXTENSION IF NOT EXISTS btree_gist;
