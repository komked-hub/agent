CREATE TABLE receipts (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  paid_date TEXT NOT NULL,
  payer TEXT NOT NULL,
  account_group TEXT NOT NULL,
  account_section TEXT NOT NULL,
  account_item TEXT NOT NULL,
  description TEXT NOT NULL,
  media_type TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  PRIMARY KEY (owner_id, id)
);
CREATE INDEX receipts_by_owner_date ON receipts (owner_id, created_at DESC, id DESC);

CREATE TABLE messages (
  id TEXT PRIMARY KEY NOT NULL,
  author_id TEXT NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX messages_by_date ON messages (created_at DESC, id DESC);

CREATE TABLE message_comments (
  id TEXT PRIMARY KEY NOT NULL,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX comments_by_message ON message_comments (message_id, created_at, id);
