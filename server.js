require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@libsql/client');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Turso Client
const dbUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

let turso = null;
if (dbUrl && authToken) {
  turso = createClient({
    url: dbUrl,
    authToken: authToken,
  });
  console.log('⚡ Connected to Turso Cloud SQLite Database');
} else {
  console.warn('⚠️ Warning: TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not provided in .env');
}

// Auto-initialize DB Table with userId column & index for isolation
async function initDb() {
  if (!turso) return;
  try {
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        userId TEXT,
        title TEXT,
        content TEXT,
        tags TEXT,
        createdAt INTEGER,
        updatedAt INTEGER
      );
    `);
    
    // Add userId column if table was created previously without it
    try {
      await turso.execute(`ALTER TABLE notes ADD COLUMN userId TEXT`);
    } catch (e) {
      // Column already exists
    }

    await turso.execute(`CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(userId);`);
    console.log('✅ Turso "notes" table & user index verified');
  } catch (err) {
    console.error('❌ Error initializing Turso table:', err);
  }
}
initDb();

// Helper to extract userId from headers or query
function getUserId(req, res) {
  const uid = req.headers['x-user-id'] || req.query.userId;
  if (!uid || uid === 'anon_default') {
    res.status(401).json({ error: 'Unauthorized: Missing User ID. Please clear your cache and hard refresh.' });
    return null;
  }
  return uid;
}

/* =============================================
   USER-ISOLATED API ROUTES FOR TURSO CLOUD SQLITE
   ============================================= */

// GET notes for current user ONLY
app.get('/api/notes', async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  const userId = getUserId(req, res);
  if (!userId) return;
  try {
    const result = await turso.execute({
      sql: 'SELECT * FROM notes WHERE userId = ? ORDER BY updatedAt DESC',
      args: [userId]
    });
    const notes = result.rows.map(row => ({
      id: row.id,
      title: row.title || '',
      content: row.content || '',
      tags: row.tags ? JSON.parse(row.tags) : [],
      createdAt: Number(row.createdAt),
      updatedAt: Number(row.updatedAt)
    }));
    res.json(notes);
  } catch (err) {
    console.error('Error fetching user notes:', err);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// POST / Save note or bulk sync for current user ONLY
app.post('/api/notes', async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  const userId = getUserId(req, res);
  if (!userId) return;
  try {
    const payload = req.body;
    
    // Bulk migration array support
    if (Array.isArray(payload)) {
      for (const note of payload) {
        await turso.execute({
          sql: `INSERT OR REPLACE INTO notes (id, userId, title, content, tags, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            note.id,
            userId,
            note.title || '',
            note.content || '',
            JSON.stringify(note.tags || []),
            note.createdAt || Date.now(),
            note.updatedAt || Date.now()
          ]
        });
      }
      return res.json({ success: true, count: payload.length });
    }

    // Single note insert/replace
    const note = payload;
    await turso.execute({
      sql: `INSERT OR REPLACE INTO notes (id, userId, title, content, tags, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        note.id,
        userId,
        note.title || '',
        note.content || '',
        JSON.stringify(note.tags || []),
        note.createdAt || Date.now(),
        note.updatedAt || Date.now()
      ]
    });
    res.json({ success: true, note });
  } catch (err) {
    console.error('Error saving note:', err);
    res.status(500).json({ error: 'Failed to save note' });
  }
});

// PUT / Update note for current user ONLY
app.put('/api/notes/:id', async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  const userId = getUserId(req, res);
  if (!userId) return;
  try {
    const { id } = req.params;
    const note = req.body;
    await turso.execute({
      sql: `UPDATE notes SET title = ?, content = ?, tags = ?, updatedAt = ? WHERE id = ? AND userId = ?`,
      args: [
        note.title || '',
        note.content || '',
        JSON.stringify(note.tags || []),
        note.updatedAt || Date.now(),
        id,
        userId
      ]
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating note:', err);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// DELETE note for current user ONLY
app.delete('/api/notes/:id', async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  const userId = getUserId(req, res);
  if (!userId) return;
  try {
    const { id } = req.params;
    await turso.execute({
      sql: `DELETE FROM notes WHERE id = ? AND userId = ?`,
      args: [id, userId]
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting note:', err);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// Catch-all route to serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Notes App running on http://localhost:${PORT}`);
});

module.exports = app;
