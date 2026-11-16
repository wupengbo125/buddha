-- 愿单：像歌单一样把发愿分组，一个发愿可以同时进多个愿单，不影响念诵与累计。
CREATE TABLE IF NOT EXISTS wishlists (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS wishlists_owner ON wishlists(owner_id, created_at);

CREATE TABLE IF NOT EXISTS wishlist_items (
  wishlist_id TEXT NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (wishlist_id, practice_id)
);

CREATE INDEX IF NOT EXISTS wishlist_items_practice ON wishlist_items(practice_id);
