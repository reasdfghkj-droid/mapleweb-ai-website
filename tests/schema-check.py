"""SQLite compatibility check for Cloudflare D1 schema; synthetic data only."""
from pathlib import Path
import sqlite3

schema = (Path(__file__).parent.parent / 'workers/schema.sql').read_text()
db = sqlite3.connect(':memory:')
db.executescript(schema)
rows = db.execute('PRAGMA table_info(submissions)').fetchall()
assert {r[1] for r in rows} >= {'id','name','email','status','answers_json','created_at'}
assert {r[1] for r in db.execute('PRAGMA table_info(submission_rate_limits)')} >= {'client_key','window_start','attempts'}
db.execute("INSERT INTO submissions (id,created_at,name,email,answers_json,status) VALUES (?,?,?,?,?,?)", ('test-1','2026-01-01T00:00:00Z','Example','test@example.org','{}','NEW'))
assert db.execute('SELECT COUNT(*) FROM submissions').fetchone()[0] == 1
try:
    db.execute("INSERT INTO submissions (id,created_at,name,email,answers_json,status) VALUES (?,?,?,?,?,?)", ('test-2','2026-01-01T00:00:00Z','Example','test@example.org','{}','INVALID'))
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError('Database must reject invalid status')
upsert = """INSERT INTO submission_rate_limits (client_key,window_start,attempts)
VALUES (?, ?, 1)
ON CONFLICT(client_key) DO UPDATE SET
  attempts = CASE WHEN submission_rate_limits.window_start = excluded.window_start
    THEN submission_rate_limits.attempts + 1 ELSE 1 END,
  window_start = excluded.window_start
RETURNING attempts"""
assert db.execute(upsert, ('test-ip-hmac',100)).fetchone()[0] == 1
assert db.execute(upsert, ('test-ip-hmac',100)).fetchone()[0] == 2
assert db.execute(upsert, ('test-ip-hmac',101)).fetchone()[0] == 1
db.execute('DELETE FROM submission_rate_limits WHERE window_start < ?', (102,))
assert db.execute('SELECT COUNT(*) FROM submission_rate_limits').fetchone()[0] == 0
db.execute('DELETE FROM submissions')
assert db.execute('SELECT COUNT(*) FROM submissions').fetchone()[0] == 0
print('D1-compatible SQLite schema PASS; valid insert, status constraint, rate-limit counter and cleanup verified')
