const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const db = new sqlite3.Database('./helpdesk.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database.');
  }
});

// Create tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'agent', 'admin'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    created_by INTEGER NOT NULL,
    assigned_to INTEGER,
    sla_seconds INTEGER NOT NULL,
    sla_due_at TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (assigned_to) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    parent_id INTEGER,
    author_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id),
    FOREIGN KEY (parent_id) REFERENCES comments(id),
    FOREIGN KEY (author_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER,
    actor_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    meta TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id),
    FOREIGN KEY (actor_id) REFERENCES users(id)
  )`);

  // Seed data
  const hashUser = bcrypt.hashSync('password123', 10);
  const hashAgent = bcrypt.hashSync('agentpass', 10);
  const hashAdmin = bcrypt.hashSync('adminpass', 10);

  db.run(`INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES
    ('Alice', 'alice@example.com', ?, 'user'),
    ('Agent', 'agent@help.com', ?, 'agent'),
    ('Admin', 'admin@help.com', ?, 'admin')`,
    [hashUser, hashAgent, hashAdmin]);

  // Get user ids
  db.get('SELECT id FROM users WHERE email = ?', ['alice@example.com'], (err, user) => {
    if (user) {
      const aliceId = user.id;
      db.get('SELECT id FROM users WHERE email = ?', ['agent@help.com'], (err, agent) => {
        if (agent) {
          const agentId = agent.id;
          const now = new Date();
          const slaDue1 = new Date(now.getTime() + 3600 * 1000).toISOString();
          const slaDue2 = new Date(now.getTime() + 7200 * 1000).toISOString();

          db.run(`INSERT OR IGNORE INTO tickets (id, title, description, status, priority, created_by, assigned_to, sla_seconds, sla_due_at, created_at) VALUES
            (1, 'Printer error', 'Printer not working', 'open', 'high', ?, ?, 3600, ?, ?),
            (2, 'VPN issue', 'Cannot connect to VPN', 'in_progress', 'normal', ?, ?, 7200, ?, ?)`,
            [aliceId, agentId, slaDue1, now.toISOString(), aliceId, agentId, slaDue2, now.toISOString()]);

          // Comments
          db.run(`INSERT OR IGNORE INTO comments (id, ticket_id, author_id, text) VALUES
            (1, 1, ?, 'Reboot printer and check again')`,
            [agentId]);
        }
      });
    }
  });
});

module.exports = db;