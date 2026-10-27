-- Lets GiST indexes compare scalars with `=`, as booking exclusion constraints need.
CREATE EXTENSION IF NOT EXISTS btree_gist;
