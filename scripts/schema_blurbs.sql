-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS person_blurbs (
  person_name text PRIMARY KEY,
  blurb       text,
  updated_at  timestamptz default now()
);

ALTER TABLE person_blurbs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON person_blurbs FOR ALL USING (true) WITH CHECK (true);

ALTER publication supabase_realtime ADD TABLE person_blurbs;
