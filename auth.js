const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('./db');

const JWT_SECRET = 'your-secret-key'; // In production, use environment variable

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Token required' } });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Invalid token' } });
    req.user = user;
    next();
  });
}

function authorizeRole(roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }
    next();
  };
}

async function register(email, name, password, role = 'user') {
  const hashedPassword = await bcrypt.hash(password, 10);
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [name, email, hashedPassword, role], function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, name, email, role });
    });
  });
}

async function login(email, password) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
      if (err) reject(err);
      else if (!user) reject(new Error('User not found'));
      else {
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) reject(new Error('Invalid password'));
        else {
          const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET);
          resolve({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
        }
      }
    });
  });
}

module.exports = { authenticateToken, authorizeRole, register, login };