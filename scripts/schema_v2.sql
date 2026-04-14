-- ============================================================
-- Family Todo App — Schema v2 Migration
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================


-- ── 0. CLEANUP ───────────────────────────────────────────────
-- Drop the empty digests table created in a previous attempt
DROP TABLE IF EXISTS digests;


-- ── 1. PEOPLE ────────────────────────────────────────────────
CREATE TABLE people (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  whatsapp_number text,
  role          text NOT NULL CHECK (role IN ('parent', 'child')),
  ntfy_topic    text,              -- nullable, Astrid only for now
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

-- Insert family members (add WhatsApp numbers later)
INSERT INTO people (name, role, ntfy_topic) VALUES
  ('Astrid', 'parent', 'aw-todos-13'),
  ('Niko',   'parent', null),
  ('Max',    'child',  null),
  ('Alex',   'child',  null),
  ('Vicky',  'child',  null);


-- ── 2. UPDATE TODOS TABLE ────────────────────────────────────

-- Add new columns
ALTER TABLE todos ADD COLUMN created_by         uuid REFERENCES people(id);
ALTER TABLE todos ADD COLUMN assigned_to        uuid REFERENCES people(id);
ALTER TABLE todos ADD COLUMN assignment_status  text DEFAULT 'accepted'
  CHECK (assignment_status IN ('pending', 'accepted'));
ALTER TABLE todos ADD COLUMN priority_reasoning text;
ALTER TABLE todos ADD COLUMN completed_by       uuid REFERENCES people(id);

-- Convert priority: integer → label
-- 1 → high, 2 → medium, 3 → low, 4/5 → someday, null → null
ALTER TABLE todos ADD COLUMN priority_label text
  CHECK (priority_label IN ('high', 'medium', 'low', 'someday'));

UPDATE todos SET priority_label = CASE
  WHEN priority = 1 THEN 'high'
  WHEN priority = 2 THEN 'medium'
  WHEN priority = 3 THEN 'low'
  WHEN priority >= 4 THEN 'someday'
  ELSE null
END;

ALTER TABLE todos DROP COLUMN priority;
ALTER TABLE todos RENAME COLUMN priority_label TO priority;

-- Assign all existing todos to Astrid
UPDATE todos SET
  created_by        = (SELECT id FROM people WHERE name = 'Astrid'),
  assigned_to       = (SELECT id FROM people WHERE name = 'Astrid'),
  assignment_status = 'accepted';


-- ── 3. DIGEST RUNS ───────────────────────────────────────────
-- One record per day — prevents double-sending
CREATE TABLE digest_runs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date   date NOT NULL UNIQUE,
  status     text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at    timestamptz,
  created_at timestamptz DEFAULT now()
);


-- ── 4. POLL SENDS ────────────────────────────────────────────
-- One row per person per priority level per digest
CREATE TABLE poll_sends (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_run_id   uuid REFERENCES digest_runs(id),
  person_id       uuid REFERENCES people(id),
  priority_level  text NOT NULL CHECK (priority_level IN ('high', 'medium', 'low')),
  options         jsonb,   -- [{text: "Buy groceries", todo_id: 3}, ...]
  whatsapp_msg_id text,    -- for deduplication
  sent_at         timestamptz DEFAULT now()
);


-- ── 5. POLL RESPONSES ────────────────────────────────────────
-- One row per completed todo item
CREATE TABLE poll_responses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_send_id  uuid REFERENCES poll_sends(id),
  todo_id       bigint REFERENCES todos(id),
  person_id     uuid REFERENCES people(id),
  responded_at  timestamptz DEFAULT now()
);


-- ── DONE ─────────────────────────────────────────────────────
-- Verify with:
-- SELECT name, role FROM people;
-- SELECT id, text, priority, assigned_to FROM todos LIMIT 5;
