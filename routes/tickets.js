const express = require('express');
const db = require('../db');
const { authenticateToken, authorizeRole } = require('../auth');

const router = express.Router();

// Helper to get SLA seconds based on priority
function getSlaSeconds(priority) {
  const slaMap = { low: 7200, normal: 3600, high: 1800, urgent: 900 };
  return slaMap[priority] || 3600;
}

// POST /api/tickets - Create ticket
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, description, priority = 'normal', sla_seconds } = req.body;
    if (!title) {
      return res.status(400).json({ error: { code: 'FIELD_REQUIRED', field: 'title', message: 'Title is required' } });
    }
    const slaSec = sla_seconds || getSlaSeconds(priority);
    const createdAt = new Date().toISOString();
    const slaDueAt = new Date(Date.now() + slaSec * 1000).toISOString();

    const result = await new Promise((resolve, reject) => {
      db.run(`INSERT INTO tickets (title, description, priority, created_by, sla_seconds, sla_due_at, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
             [title, description, priority, req.user.id, slaSec, slaDueAt, createdAt], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, title, description, status: 'open', priority, created_by: req.user.id, sla_seconds: slaSec, sla_due_at: slaDueAt, version: 1 });
      });
    });

    // Audit log
    db.run('INSERT INTO audit_logs (ticket_id, actor_id, action, meta) VALUES (?, ?, ?, ?)',
           [result.id, req.user.id, 'created', JSON.stringify({ title, priority })]);

    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create ticket' } });
  }
});

// GET /api/tickets - List tickets with pagination and search
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { limit = 10, offset = 0, q, status } = req.query;
    let whereClause = '';
    let params = [];

    if (req.user.role === 'user') {
      whereClause += ' AND created_by = ?';
      params.push(req.user.id);
    } else if (req.user.role === 'agent') {
      whereClause += ' AND assigned_to = ?';
      params.push(req.user.id);
    } // admin sees all

    if (status === 'breached') {
      whereClause += ' AND sla_due_at < datetime("now") AND status != "closed"';
    } else if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    if (q) {
      whereClause += ` AND (title LIKE ? OR description LIKE ? OR EXISTS (
        SELECT 1 FROM comments WHERE comments.ticket_id = tickets.id AND comments.text LIKE ?
      ))`;
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const sql = `SELECT * FROM tickets WHERE 1=1 ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const tickets = await new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Check if more
    const countSql = `SELECT COUNT(*) as count FROM tickets WHERE 1=1 ${whereClause}`;
    const countParams = params.slice(0, -2); // remove limit offset
    const countResult = await new Promise((resolve, reject) => {
      db.get(countSql, countParams, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    const nextOffset = parseInt(offset) + tickets.length < countResult.count ? parseInt(offset) + parseInt(limit) : null;

    res.json({ items: tickets, next_offset: nextOffset });
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch tickets' } });
  }
});

// GET /api/tickets/:id - Get ticket details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const ticketId = req.params.id;
    const ticket = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM tickets WHERE id = ?', [ticketId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!ticket) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found' } });
    }

    // Check permissions
    if (req.user.role === 'user' && ticket.created_by !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }
    if (req.user.role === 'agent' && ticket.assigned_to !== req.user.id && ticket.created_by !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    // Get comments
    const comments = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM comments WHERE ticket_id = ? ORDER BY created_at', [ticketId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Get audit logs
    const auditLogs = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM audit_logs WHERE ticket_id = ? ORDER BY created_at', [ticketId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    res.json({ ticket, comments, audit_logs: auditLogs });
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch ticket' } });
  }
});

// PATCH /api/tickets/:id - Update ticket
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const ticketId = req.params.id;
    const { status, priority, assigned_to } = req.body;
    const version = req.headers['if-match'];

    if (!version) {
      return res.status(400).json({ error: { code: 'VERSION_REQUIRED', message: 'If-Match header required' } });
    }

    const ticket = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM tickets WHERE id = ?', [ticketId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!ticket) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found' } });
    }

    if (parseInt(version) !== ticket.version) {
      return res.status(409).json({ error: { code: 'VERSION_MISMATCH', message: 'Ticket was modified' } });
    }

    // Check permissions
    if (req.user.role === 'user' && ticket.created_by !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }
    if (req.user.role === 'agent' && ticket.assigned_to !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    // Update
    const updates = [];
    const params = [];
    if (status) { updates.push('status = ?'); params.push(status); }
    if (priority) { updates.push('priority = ?'); params.push(priority); }
    if (assigned_to !== undefined) { updates.push('assigned_to = ?'); params.push(assigned_to); }
    updates.push('version = version + 1');
    params.push(ticketId);

    await new Promise((resolve, reject) => {
      db.run(`UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`, params, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    // Get updated ticket
    const updatedTicket = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM tickets WHERE id = ?', [ticketId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // Audit log
    db.run('INSERT INTO audit_logs (ticket_id, actor_id, action, meta) VALUES (?, ?, ?, ?)',
           [ticketId, req.user.id, 'updated', JSON.stringify({ status, priority, assigned_to })]);

    res.json(updatedTicket);
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update ticket' } });
  }
});

// POST /api/tickets/:id/comments - Add comment
router.post('/:id/comments', authenticateToken, async (req, res) => {
  try {
    const ticketId = req.params.id;
    const { text, parent_id } = req.body;

    if (!text) {
      return res.status(400).json({ error: { code: 'FIELD_REQUIRED', field: 'text', message: 'Text is required' } });
    }

    const ticket = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM tickets WHERE id = ?', [ticketId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!ticket) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found' } });
    }

    // Check permissions
    if (req.user.role === 'user' && ticket.created_by !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }
    if (req.user.role === 'agent' && ticket.assigned_to !== req.user.id && ticket.created_by !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const result = await new Promise((resolve, reject) => {
      db.run('INSERT INTO comments (ticket_id, parent_id, author_id, text) VALUES (?, ?, ?, ?)',
             [ticketId, parent_id || null, req.user.id, text], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, ticket_id: ticketId, parent_id, author_id: req.user.id, text, created_at: new Date().toISOString() });
      });
    });

    // Audit log
    db.run('INSERT INTO audit_logs (ticket_id, actor_id, action, meta) VALUES (?, ?, ?, ?)',
           [ticketId, req.user.id, 'commented', JSON.stringify({ comment_id: result.id, text: text.substring(0, 50) })]);

    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to add comment' } });
  }
});

module.exports = router;