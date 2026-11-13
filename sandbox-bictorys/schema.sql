PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS badges (
  id TEXT PRIMARY KEY CHECK(id IN ('DEMO-001','DEMO-002')),
  name TEXT NOT NULL, balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0)
);
INSERT OR IGNORE INTO badges(id,name) VALUES ('DEMO-001','Agent fictif A'),('DEMO-002','Agent fictif B');
CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY, badge_id TEXT NOT NULL REFERENCES badges(id),
  amount INTEGER NOT NULL CHECK(amount > 0 AND amount <= 10000),
  credit_amount INTEGER NOT NULL CHECK(credit_amount > 0), fee_policy TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'creating', provider_id TEXT UNIQUE,
  checkout_url TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  provider_id TEXT NOT NULL, status TEXT NOT NULL,
  attempt_id TEXT NOT NULL REFERENCES attempts(id), payload TEXT NOT NULL,
  created_at TEXT NOT NULL, PRIMARY KEY(provider_id,status)
);
CREATE TABLE IF NOT EXISTS credits (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts(id), provider_id TEXT NOT NULL UNIQUE,
  badge_id TEXT NOT NULL REFERENCES badges(id), amount INTEGER NOT NULL CHECK(amount>0),
  created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS credit_badge AFTER INSERT ON credits BEGIN
  UPDATE badges SET balance=balance+NEW.amount WHERE id=NEW.badge_id;
  UPDATE attempts SET status='credited' WHERE id=NEW.attempt_id;
END;
CREATE TABLE IF NOT EXISTS login_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL);
