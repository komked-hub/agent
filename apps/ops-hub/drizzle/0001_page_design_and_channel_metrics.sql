CREATE TABLE site_page_layouts (
  page TEXT PRIMARY KEY NOT NULL,
  settings TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE site_channel_metrics (
  channel TEXT NOT NULL,
  day TEXT NOT NULL,
  values_json TEXT NOT NULL,
  period TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (channel, day)
);
