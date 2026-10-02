-- ContextBridge initial schema (001)
-- All timestamps are ISO-8601 UTC text. All ids are UUID text.

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  repository_path TEXT NOT NULL DEFAULT '',
  active_capsule_id TEXT REFERENCES capsules(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE capsules (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'Master Context', 'Architecture', 'Decision', 'Current Task',
    'Session Handoff', 'Bug Report', 'Research', 'Prompt Template',
    'Release Notes', 'Other'
  )),
  status TEXT NOT NULL CHECK (status IN (
    'Draft', 'Active', 'Verified', 'Deprecated', 'Archived'
  )),
  summary TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT '',
  current_task TEXT NOT NULL DEFAULT '',
  completed_work TEXT NOT NULL DEFAULT '',
  changed_files TEXT NOT NULL DEFAULT '[]',
  commands_run TEXT NOT NULL DEFAULT '[]',
  verification_results TEXT NOT NULL DEFAULT '',
  known_issues TEXT NOT NULL DEFAULT '',
  next_task TEXT NOT NULL DEFAULT '',
  rules_constraints TEXT NOT NULL DEFAULT '',
  architecture_notes TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  content_markdown TEXT NOT NULL DEFAULT '',
  git_head TEXT NOT NULL DEFAULT '',
  git_branch TEXT NOT NULL DEFAULT '',
  git_snapshot TEXT,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  imported_original_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  parent_capsule_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  deleted_at TEXT
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE capsule_tags (
  capsule_id TEXT NOT NULL REFERENCES capsules(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (capsule_id, tag_id)
);

CREATE TABLE capsule_revisions (
  id TEXT PRIMARY KEY,
  capsule_id TEXT NOT NULL REFERENCES capsules(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_capsules_project ON capsules(project_id);
CREATE INDEX idx_capsules_type ON capsules(type);
CREATE INDEX idx_capsules_status ON capsules(status);
CREATE INDEX idx_capsules_updated ON capsules(updated_at DESC);
CREATE INDEX idx_capsule_revisions_capsule ON capsule_revisions(capsule_id, version DESC);
CREATE INDEX idx_projects_archived ON projects(archived_at);

-- Full-text search (external content, kept in sync by triggers)
CREATE VIRTUAL TABLE capsules_fts USING fts5(
  title,
  summary,
  goal,
  current_task,
  completed_work,
  known_issues,
  next_task,
  rules_constraints,
  architecture_notes,
  notes,
  content_markdown,
  content='capsules',
  content_rowid='rowid'
);

CREATE TRIGGER capsules_fts_ai AFTER INSERT ON capsules BEGIN
  INSERT INTO capsules_fts(
    rowid, title, summary, goal, current_task, completed_work, known_issues,
    next_task, rules_constraints, architecture_notes, notes, content_markdown
  ) VALUES (
    new.rowid, new.title, new.summary, new.goal, new.current_task,
    new.completed_work, new.known_issues, new.next_task, new.rules_constraints,
    new.architecture_notes, new.notes, new.content_markdown
  );
END;

CREATE TRIGGER capsules_fts_ad AFTER DELETE ON capsules BEGIN
  INSERT INTO capsules_fts(
    capsules_fts, rowid, title, summary, goal, current_task, completed_work,
    known_issues, next_task, rules_constraints, architecture_notes, notes,
    content_markdown
  ) VALUES (
    'delete', old.rowid, old.title, old.summary, old.goal, old.current_task,
    old.completed_work, old.known_issues, old.next_task, old.rules_constraints,
    old.architecture_notes, old.notes, old.content_markdown
  );
END;

CREATE TRIGGER capsules_fts_au AFTER UPDATE ON capsules BEGIN
  INSERT INTO capsules_fts(
    capsules_fts, rowid, title, summary, goal, current_task, completed_work,
    known_issues, next_task, rules_constraints, architecture_notes, notes,
    content_markdown
  ) VALUES (
    'delete', old.rowid, old.title, old.summary, old.goal, old.current_task,
    old.completed_work, old.known_issues, old.next_task, old.rules_constraints,
    old.architecture_notes, old.notes, old.content_markdown
  );
  INSERT INTO capsules_fts(
    rowid, title, summary, goal, current_task, completed_work, known_issues,
    next_task, rules_constraints, architecture_notes, notes, content_markdown
  ) VALUES (
    new.rowid, new.title, new.summary, new.goal, new.current_task,
    new.completed_work, new.known_issues, new.next_task, new.rules_constraints,
    new.architecture_notes, new.notes, new.content_markdown
  );
END;
