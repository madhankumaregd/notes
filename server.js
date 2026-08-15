require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

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

// Auto-initialize DB Tables
async function initDb() {
  if (!turso) return;
  try {
    // Notes table
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

    // Users table
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        theme TEXT DEFAULT 'dark',
        custom_accent TEXT,
        created_at INTEGER
      );
    `);

    await turso.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);`);

    console.log('✅ Turso "notes" & "users" tables verified');
  } catch (err) {
    console.error('❌ Error initializing Turso tables:', err);
  }
}
initDb();

/* =============================================
   VALIDATION HELPERS
   ============================================= */
function validateUsername(username) {
  if (!username || typeof username !== 'string') return 'Username is required';
  if (username.length < 3) return 'Username must be at least 3 characters';
  if (username.length > 30) return 'Username must be at most 30 characters';
  if (!/^[a-zA-Z0-9_.]+$/.test(username)) return 'Username can only contain letters, numbers, _ and .';
  return null;
}

function validatePassword(password) {
  if (!password || typeof password !== 'string') return 'Password is required';
  if (password.length < 6) return 'Password must be at least 6 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  return null;
}

// Helper to extract userId from headers
function getUserId(req, res) {
  const uid = req.headers['x-user-id'] || req.query.userId;
  if (!uid || uid === 'anon_default') {
    res.status(401).json({ error: 'Unauthorized: Missing User ID.' });
    return null;
  }
  return uid;
}

/* =============================================
   AUTH ROUTES
   ============================================= */

// POST /api/auth/register — Create new account
app.post('/api/auth/register', async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  try {
    const { username, password, displayName } = req.body;

    const usernameErr = validateUsername(username);
    if (usernameErr) return res.status(400).json({ error: usernameErr });

    const passwordErr = validatePassword(password);
    if (passwordErr) return res.status(400).json({ error: passwordErr });

    // Check if username already taken
    const existing = await turso.execute({
      sql: 'SELECT id FROM users WHERE username = ?',
      args: [username.toLowerCase()]
    });
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const userId = 'usr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const hash = await bcrypt.hash(password, 10);

    await turso.execute({
      sql: 'INSERT INTO users (id, username, password_hash, display_name, theme, custom_accent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [userId, username.toLowerCase(), hash, displayName || username, 'dark', null, Date.now()]
    });

    res.json({
      success: true,
      userId,
      username: username.toLowerCase(),
      displayName: displayName || username,
      theme: 'dark',
      customAccent: null
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login — Login with credentials
app.post('/api/auth/login', async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await turso.execute({
      sql: 'SELECT * FROM users WHERE username = ?',
      args: [username.toLowerCase()]
    });

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    res.json({
      success: true,
      userId: user.id,
      username: user.username,
      displayName: user.display_name || user.username,
      theme: user.theme || 'dark',
      customAccent: user.custom_accent || null
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/claim — Existing anonymous user claims their notes
app.post('/api/auth/claim', async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  try {
    const { oldUserId, username, password, displayName } = req.body;

    if (!oldUserId) return res.status(400).json({ error: 'Missing old user ID for migration' });

    const usernameErr = validateUsername(username);
    if (usernameErr) return res.status(400).json({ error: usernameErr });

    const passwordErr = validatePassword(password);
    if (passwordErr) return res.status(400).json({ error: passwordErr });

    // Check if username already taken
    const existing = await turso.execute({
      sql: 'SELECT id FROM users WHERE username = ?',
      args: [username.toLowerCase()]
    });
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    // Create user account using the OLD userId so notes stay linked
    const hash = await bcrypt.hash(password, 10);

    await turso.execute({
      sql: 'INSERT INTO users (id, username, password_hash, display_name, theme, custom_accent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [oldUserId, username.toLowerCase(), hash, displayName || username, 'dark', null, Date.now()]
    });

    // Notes already have userId = oldUserId, so they're automatically linked!
    const noteCount = await turso.execute({
      sql: 'SELECT COUNT(*) as cnt FROM notes WHERE userId = ?',
      args: [oldUserId]
    });

    res.json({
      success: true,
      userId: oldUserId,
      username: username.toLowerCase(),
      displayName: displayName || username,
      theme: 'dark',
      customAccent: null,
      notesMigrated: Number(noteCount.rows[0].cnt)
    });
  } catch (err) {
    console.error('Claim error:', err);
    res.status(500).json({ error: 'Account claim failed' });
  }
});

/* =============================================
   PROFILE ROUTES
   ============================================= */

// GET /api/profile — Get user profile
app.get('/api/profile', async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  const userId = getUserId(req, res);
  if (!userId) return;
  try {
    const result = await turso.execute({
      sql: 'SELECT id, username, display_name, theme, custom_accent, created_at FROM users WHERE id = ?',
      args: [userId]
    });
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = result.rows[0];
    res.json({
      userId: user.id,
      username: user.username,
      displayName: user.display_name,
      theme: user.theme || 'dark',
      customAccent: user.custom_accent || null,
      createdAt: Number(user.created_at)
    });
  } catch (err) {
    console.error('Profile fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /api/profile — Update user profile
app.put('/api/profile', async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  const userId = getUserId(req, res);
  if (!userId) return;
  try {
    const { displayName, theme, customAccent } = req.body;

    await turso.execute({
      sql: 'UPDATE users SET display_name = ?, theme = ?, custom_accent = ? WHERE id = ?',
      args: [displayName || null, theme || 'dark', customAccent || null, userId]
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/* =============================================
   USER-ISOLATED NOTE ROUTES
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
