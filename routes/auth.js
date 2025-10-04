const express = require('express');
const { register, login } = require('../auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { email, name, password, role } = req.body;
    if (!email || !name || !password) {
      return res.status(400).json({ error: { code: 'FIELD_REQUIRED', field: 'email', message: 'Email, name, and password are required' } });
    }
    const user = await register(email, name, password, role);
    res.status(201).json(user);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: { code: 'DUPLICATE_EMAIL', message: 'Email already exists' } });
    } else {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Registration failed' } });
    }
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: { code: 'FIELD_REQUIRED', field: 'email', message: 'Email and password are required' } });
    }
    const result = await login(email, password);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
  }
});

module.exports = router;