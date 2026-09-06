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

/* =============================================
   DB STATS TRACKING
   ============================================= */
const serverStartTime = Date.now();

// In-memory daily stats (persisted to db_stats table periodically)
let dailyStats = {}; // { "2026-09-06": { reads: 0, writes: 0 } }

function getTodayKey() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function trackOp(type) {
  const key = getTodayKey();
  if (!dailyStats[key]) dailyStats[key] = { reads: 0, writes: 0 };
  if (type === 'read') dailyStats[key].reads++;
  else dailyStats[key].writes++;
}

// Wrap turso.execute to count reads/writes
const originalExecute = turso ? turso.execute.bind(turso) : null;
if (turso) {
  turso.execute = async function (...args) {
    const sql = typeof args[0] === 'string' ? args[0] : (args[0]?.sql || '');
    const trimmed = sql.trim().toUpperCase();
    if (trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA')) {
      trackOp('read');
    } else if (trimmed.startsWith('INSERT') || trimmed.startsWith('UPDATE') || trimmed.startsWith('DELETE') || trimmed.startsWith('CREATE') || trimmed.startsWith('ALTER') || trimmed.startsWith('DROP')) {
      trackOp('write');
    }
    return originalExecute(...args);
  };
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
        settings TEXT,
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
    
    // Add settings column if table was created previously without it
    try {
      await turso.execute(`ALTER TABLE notes ADD COLUMN settings TEXT`);
    } catch (e) {
      // Column already exists
    }

    // Add deleted_at column for soft delete (trash)
    try {
      await turso.execute(`ALTER TABLE notes ADD COLUMN deleted_at INTEGER`);
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

    // Add created_at column if table was created previously without it
    try {
      await turso.execute(`ALTER TABLE users ADD COLUMN created_at INTEGER`);
    } catch (e) {
      // Column already exists
    }

    // Add status column for deactivation
    try {
      await turso.execute(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'`);
    } catch (e) {
      // Column already exists
    }

    // Add deleted_at column for soft delete (trash)
    try {
      await turso.execute(`ALTER TABLE users ADD COLUMN deleted_at INTEGER`);
    } catch (e) {
      // Column already exists
    }

    // DB Stats table for daily read/write tracking
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS db_stats (
        date TEXT PRIMARY KEY,
        reads INTEGER DEFAULT 0,
        writes INTEGER DEFAULT 0
      );
    `);

    // Admin config table
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS admin_config (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // Set default admin credentials if none exist
    const existing = await turso.execute({
      sql: 'SELECT value FROM admin_config WHERE key = ?',
      args: ['admin_username']
    });
    if (existing.rows.length === 0) {
      const defaultHash = await bcrypt.hash('admin123', 10);
      await turso.execute({
        sql: 'INSERT OR IGNORE INTO admin_config (key, value) VALUES (?, ?)',
        args: ['admin_username', 'admin']
      });
      await turso.execute({
        sql: 'INSERT OR IGNORE INTO admin_config (key, value) VALUES (?, ?)',
        args: ['admin_password_hash', defaultHash]
      });
      console.log('🔑 Default admin credentials created (admin / admin123)');
    }

    console.log('✅ All database tables verified');
  } catch (err) {
    console.error('❌ Error initializing Turso tables:', err);
  }
}
initDb();

// Flush daily stats to DB every 5 minutes
async function flushStatsToDB() {
  if (!turso || !originalExecute) return;
  try {
    for (const [date, counts] of Object.entries(dailyStats)) {
      await originalExecute({
        sql: `INSERT INTO db_stats (date, reads, writes) VALUES (?, ?, ?)
              ON CONFLICT(date) DO UPDATE SET reads = reads + ?, writes = writes + ?`,
        args: [date, counts.reads, counts.writes, counts.reads, counts.writes]
      });
    }
    dailyStats = {};
  } catch (err) {
    console.error('Error flushing stats:', err);
  }
}
setInterval(flushStatsToDB, 5 * 60 * 1000);

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

    // Check if username already taken (exclude soft-deleted)
    const existing = await turso.execute({
      sql: 'SELECT id FROM users WHERE username = ? AND deleted_at IS NULL',
      args: [username.toLowerCase()]
    });
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const userId = 'usr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const hash = await bcrypt.hash(password, 10);

    await turso.execute({
      sql: 'INSERT INTO users (id, username, password_hash, display_name, theme, custom_accent, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [userId, username.toLowerCase(), hash, displayName || username, 'dark', null, Date.now(), 'active']
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
      sql: 'SELECT * FROM users WHERE username = ? AND deleted_at IS NULL',
      args: [username.toLowerCase()]
    });

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];

    // Check if user is deactivated
    if (user.status === 'deactivated') {
      return res.status(403).json({ error: 'Your account has been deactivated. Contact an administrator.' });
    }

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
      sql: 'SELECT id FROM users WHERE username = ? AND deleted_at IS NULL',
      args: [username.toLowerCase()]
    });
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    // Create user account using the OLD userId so notes stay linked
    const hash = await bcrypt.hash(password, 10);

    await turso.execute({
      sql: 'INSERT INTO users (id, username, password_hash, display_name, theme, custom_accent, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [oldUserId, username.toLowerCase(), hash, displayName || username, 'dark', null, Date.now(), 'active']
    });

    // Notes already have userId = oldUserId, so they're automatically linked!
    const noteCount = await turso.execute({
      sql: 'SELECT COUNT(*) as cnt FROM notes WHERE userId = ? AND deleted_at IS NULL',
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

// PUT /api/auth/password - Change password
app.put('/api/auth/password', async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  try {
    const userId = req.headers['x-user-id'];
    const { currentPassword, newPassword } = req.body;
    
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Missing password fields' });
    
    const passwordErr = validatePassword(newPassword);
    if (passwordErr) return res.status(400).json({ error: passwordErr });

    const result = await turso.execute({
      sql: 'SELECT password_hash FROM users WHERE id = ? AND deleted_at IS NULL',
      args: [userId]
    });
    
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    
    const user = result.rows[0];
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Incorrect current password' });
    
    const newHash = await bcrypt.hash(newPassword, 10);
    
    await turso.execute({
      sql: 'UPDATE users SET password_hash = ? WHERE id = ?',
      args: [newHash, userId]
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Failed to change password' });
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
      sql: 'SELECT id, username, display_name, theme, custom_accent, created_at FROM users WHERE id = ? AND deleted_at IS NULL',
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
   (Only shows non-deleted notes)
   ============================================= */

// GET notes for current user ONLY (exclude trashed)
app.get('/api/notes', async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  const userId = getUserId(req, res);
  if (!userId) return;
  try {
    const result = await turso.execute({
      sql: 'SELECT * FROM notes WHERE userId = ? AND deleted_at IS NULL ORDER BY updatedAt DESC',
      args: [userId]
    });
    const notes = result.rows.map(row => ({
      id: row.id,
      title: row.title || '',
      content: row.content || '',
      tags: row.tags ? JSON.parse(row.tags) : [],
      settings: row.settings ? JSON.parse(row.settings) : {},
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
          sql: `INSERT OR REPLACE INTO notes (id, userId, title, content, tags, settings, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            note.id,
            userId,
            note.title || '',
            note.content || '',
            JSON.stringify(note.tags || []),
            JSON.stringify(note.settings || {}),
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
      sql: `INSERT OR REPLACE INTO notes (id, userId, title, content, tags, settings, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        note.id,
        userId,
        note.title || '',
        note.content || '',
        JSON.stringify(note.tags || []),
        JSON.stringify(note.settings || {}),
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
      sql: `UPDATE notes SET title = ?, content = ?, tags = ?, settings = ?, updatedAt = ? WHERE id = ? AND userId = ? AND deleted_at IS NULL`,
      args: [
        note.title || '',
        note.content || '',
        JSON.stringify(note.tags || []),
        JSON.stringify(note.settings || {}),
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

// DELETE note for current user ONLY — soft delete (move to trash)
app.delete('/api/notes/:id', async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  const userId = getUserId(req, res);
  if (!userId) return;
  try {
    const { id } = req.params;
    await turso.execute({
      sql: `UPDATE notes SET deleted_at = ? WHERE id = ? AND userId = ?`,
      args: [Date.now(), id, userId]
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting note:', err);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

/* =============================================
   ADMIN PANEL
   ============================================= */

// Simple token store (in-memory; resets on server restart)
const adminTokens = new Set();

function generateToken() {
  return 'adm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);
}

// Admin auth middleware
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || !adminTokens.has(token)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid admin token' });
  }
  next();
}

// Helper: verify admin password from request body
async function verifyAdminPassword(password) {
  if (!turso || !password) return false;
  const result = await turso.execute({
    sql: 'SELECT value FROM admin_config WHERE key = ?',
    args: ['admin_password_hash']
  });
  if (result.rows.length === 0) return false;
  return bcrypt.compare(password, result.rows[0].value);
}

// POST /api/admin/login
app.post('/api/admin/login', async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const usernameResult = await turso.execute({
      sql: 'SELECT value FROM admin_config WHERE key = ?',
      args: ['admin_username']
    });
    const passwordResult = await turso.execute({
      sql: 'SELECT value FROM admin_config WHERE key = ?',
      args: ['admin_password_hash']
    });

    if (usernameResult.rows.length === 0 || passwordResult.rows.length === 0) {
      return res.status(500).json({ error: 'Admin not configured' });
    }

    const storedUsername = usernameResult.rows[0].value;
    const storedHash = passwordResult.rows[0].value;

    if (username !== storedUsername) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, storedHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken();
    adminTokens.add(token);

    res.json({ success: true, token });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/admin/verify-password — Verify admin password for dangerous actions
app.post('/api/admin/verify-password', requireAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    const valid = await verifyAdminPassword(password);
    res.json({ valid });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// GET /api/admin/stats — Dashboard statistics with date-based filtering
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  try {
    // Flush current in-memory stats first
    await flushStatsToDB();

    const date = req.query.date || getTodayKey(); // "YYYY-MM-DD"
    const from = req.query.from; // optional range start
    const to = req.query.to; // optional range end

    const [usersResult, notesResult, recentResult, sizeResult, avgSizeResult, maxSizeResult, trashedNotesResult, trashedUsersResult] = await Promise.all([
      turso.execute('SELECT COUNT(*) as cnt FROM users WHERE deleted_at IS NULL'),
      turso.execute('SELECT COUNT(*) as cnt FROM notes WHERE deleted_at IS NULL'),
      turso.execute({
        sql: 'SELECT COUNT(*) as cnt FROM notes WHERE updatedAt > ? AND deleted_at IS NULL',
        args: [Date.now() - 86400000]
      }),
      turso.execute('SELECT SUM(LENGTH(content)) as totalSize FROM notes WHERE deleted_at IS NULL'),
      turso.execute('SELECT AVG(LENGTH(content)) as avgSize FROM notes WHERE deleted_at IS NULL'),
      turso.execute('SELECT MAX(LENGTH(content)) as maxSize FROM notes WHERE deleted_at IS NULL'),
      turso.execute('SELECT COUNT(*) as cnt FROM notes WHERE deleted_at IS NOT NULL'),
      turso.execute('SELECT COUNT(*) as cnt FROM users WHERE deleted_at IS NOT NULL'),
    ]);

    // Get daily stats for selected date or range
    let dailyStatsResult;
    if (from && to) {
      dailyStatsResult = await turso.execute({
        sql: 'SELECT date, reads, writes FROM db_stats WHERE date >= ? AND date <= ? ORDER BY date ASC',
        args: [from, to]
      });
    } else {
      dailyStatsResult = await turso.execute({
        sql: 'SELECT date, reads, writes FROM db_stats WHERE date = ?',
        args: [date]
      });
    }

    // Also get the last 7 days for chart data
    const last7Date = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const last7Result = await turso.execute({
      sql: 'SELECT date, reads, writes FROM db_stats WHERE date >= ? ORDER BY date ASC',
      args: [last7Date]
    });

    // Add today's in-memory stats to the results
    const todayKey = getTodayKey();
    const todayInMem = dailyStats[todayKey] || { reads: 0, writes: 0 };

    // Recent notes list (last 10 updated)
    const recentNotesResult = await turso.execute(`
      SELECT n.id, n.title, n.tags, n.updatedAt, n.userId, u.username
      FROM notes n
      LEFT JOIN users u ON n.userId = u.id
      WHERE n.deleted_at IS NULL
      ORDER BY n.updatedAt DESC
      LIMIT 10
    `);

    const recentNotesList = recentNotesResult.rows.map(r => ({
      id: r.id,
      title: r.title || 'Untitled',
      tags: r.tags ? JSON.parse(r.tags) : [],
      updatedAt: Number(r.updatedAt),
      userId: r.userId,
      username: r.username || r.userId,
    }));

    // Compute total reads/writes across all time
    const totalStatsResult = await turso.execute('SELECT SUM(reads) as totalReads, SUM(writes) as totalWrites FROM db_stats');
    const allTimeReads = Number(totalStatsResult.rows[0].totalReads || 0) + todayInMem.reads;
    const allTimeWrites = Number(totalStatsResult.rows[0].totalWrites || 0) + todayInMem.writes;

    res.json({
      totalUsers: Number(usersResult.rows[0].cnt),
      totalNotes: Number(notesResult.rows[0].cnt),
      recentNotes: Number(recentResult.rows[0].cnt),
      dbSizeBytes: Number(sizeResult.rows[0].totalSize || 0),
      avgNoteSize: Math.round(Number(avgSizeResult.rows[0].avgSize || 0)),
      largestNote: Number(maxSizeResult.rows[0].maxSize || 0),
      trashedNotes: Number(trashedNotesResult.rows[0].cnt),
      trashedUsers: Number(trashedUsersResult.rows[0].cnt),
      tableCount: 4,
      totalReads: allTimeReads,
      totalWrites: allTimeWrites,
      todayReads: todayInMem.reads,
      todayWrites: todayInMem.writes,
      uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
      recentNotesList,
      dailyStats: dailyStatsResult.rows.map(r => ({ date: r.date, reads: Number(r.reads), writes: Number(r.writes) })),
      last7Days: last7Result.rows.map(r => ({ date: r.date, reads: Number(r.reads), writes: Number(r.writes) })),
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/admin/stats/history — Get stats for a date range
app.get('/api/admin/stats/history', requireAdmin, async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  try {
    await flushStatsToDB();
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to dates required (YYYY-MM-DD)' });
    }
    const result = await turso.execute({
      sql: 'SELECT date, reads, writes FROM db_stats WHERE date >= ? AND date <= ? ORDER BY date ASC',
      args: [from, to]
    });
    res.json(result.rows.map(r => ({ date: r.date, reads: Number(r.reads), writes: Number(r.writes) })));
  } catch (err) {
    console.error('Stats history error:', err);
    res.status(500).json({ error: 'Failed to fetch stats history' });
  }
});

// GET /api/admin/notes — All non-trashed notes with owner info
app.get('/api/admin/notes', requireAdmin, async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  try {
    const notesResult = await turso.execute(`
      SELECT n.*, u.username, u.display_name
      FROM notes n
      LEFT JOIN users u ON n.userId = u.id
      WHERE n.deleted_at IS NULL
      ORDER BY n.updatedAt DESC
    `);

    const usersResult = await turso.execute('SELECT id, username, display_name FROM users WHERE deleted_at IS NULL ORDER BY username');

    const notes = notesResult.rows.map(r => ({
      id: r.id,
      userId: r.userId,
      username: r.username || r.userId,
      displayName: r.display_name,
      title: r.title || '',
      content: r.content || '',
      tags: r.tags ? JSON.parse(r.tags) : [],
      settings: r.settings ? JSON.parse(r.settings) : {},
      createdAt: Number(r.createdAt),
      updatedAt: Number(r.updatedAt),
    }));

    res.json({ notes, users: usersResult.rows });
  } catch (err) {
    console.error('Admin notes error:', err);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// DELETE /api/admin/notes/all — Soft delete all notes (move to trash, requires password)
app.delete('/api/admin/notes/all', requireAdmin, async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  try {
    const { password } = req.body;
    const valid = await verifyAdminPassword(password);
    if (!valid) return res.status(403).json({ error: 'Incorrect admin password' });

    await turso.execute({
      sql: 'UPDATE notes SET deleted_at = ? WHERE deleted_at IS NULL',
      args: [Date.now()]
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Admin trash all notes error:', err);
    res.status(500).json({ error: 'Failed to trash notes' });
  }
});

// DELETE /api/admin/notes/:id — Soft delete a specific note (move to trash)
app.delete('/api/admin/notes/:id', requireAdmin, async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  try {
    await turso.execute({
      sql: 'UPDATE notes SET deleted_at = ? WHERE id = ?',
      args: [Date.now(), req.params.id]
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Admin trash note error:', err);
    res.status(500).json({ error: 'Failed to trash note' });
  }
});

// GET /api/admin/users — All non-trashed users with note counts
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  try {
    const result = await turso.execute(`
      SELECT u.*, COUNT(n.id) as noteCount
      FROM users u
      LEFT JOIN notes n ON u.id = n.userId AND n.deleted_at IS NULL
      WHERE u.deleted_at IS NULL
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    const users = result.rows.map(r => ({
      id: r.id,
      username: r.username,
      display_name: r.display_name,
      theme: r.theme,
      status: r.status || 'active',
      custom_accent: r.custom_accent,
      created_at: Number(r.created_at),
      noteCount: Number(r.noteCount),
    }));
    res.json(users);
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PUT /api/admin/users/:id/deactivate — Toggle user active/deactivated
app.put('/api/admin/users/:id/deactivate', requireAdmin, async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  try {
    const userId = req.params.id;
    const { status } = req.body; // 'active' or 'deactivated'
    await turso.execute({
      sql: 'UPDATE users SET status = ? WHERE id = ?',
      args: [status || 'deactivated', userId]
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Admin deactivate user error:', err);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// DELETE /api/admin/users/all — Soft delete all users and their notes (move to trash, requires password)
app.delete('/api/admin/users/all', requireAdmin, async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  try {
    const { password } = req.body;
    const valid = await verifyAdminPassword(password);
    if (!valid) return res.status(403).json({ error: 'Incorrect admin password' });

    const now = Date.now();
    await turso.execute({
      sql: 'UPDATE notes SET deleted_at = ? WHERE deleted_at IS NULL',
      args: [now]
    });
    await turso.execute({
      sql: 'UPDATE users SET deleted_at = ? WHERE deleted_at IS NULL',
      args: [now]
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Admin trash all users error:', err);
    res.status(500).json({ error: 'Failed to trash users' });
  }
});

// DELETE /api/admin/users/:id — Soft delete a specific user and their notes (move to trash)
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  try {
    const userId = req.params.id;
    const now = Date.now();
    await turso.execute({
      sql: 'UPDATE notes SET deleted_at = ? WHERE userId = ? AND deleted_at IS NULL',
      args: [now, userId]
    });
    await turso.execute({
      sql: 'UPDATE users SET deleted_at = ? WHERE id = ?',
      args: [now, userId]
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Admin trash user error:', err);
    res.status(500).json({ error: 'Failed to trash user' });
  }
});

/* =============================================
   ADMIN TRASH ROUTES
   ============================================= */

// GET /api/admin/trash — Get all trashed notes and users
app.get('/api/admin/trash', requireAdmin, async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  try {
    const [trashedNotes, trashedUsers] = await Promise.all([
      turso.execute(`
        SELECT n.*, u.username, u.display_name
        FROM notes n
        LEFT JOIN users u ON n.userId = u.id
        WHERE n.deleted_at IS NOT NULL
        ORDER BY n.deleted_at DESC
      `),
      turso.execute(`
        SELECT u.*, COUNT(n.id) as noteCount
        FROM users u
        LEFT JOIN notes n ON u.id = n.userId
        WHERE u.deleted_at IS NOT NULL
        GROUP BY u.id
        ORDER BY u.deleted_at DESC
      `)
    ]);

    res.json({
      notes: trashedNotes.rows.map(r => ({
        id: r.id,
        userId: r.userId,
        username: r.username || r.userId,
        displayName: r.display_name,
        title: r.title || '',
        content: r.content || '',
        tags: r.tags ? JSON.parse(r.tags) : [],
        createdAt: Number(r.createdAt),
        updatedAt: Number(r.updatedAt),
        deletedAt: Number(r.deleted_at),
      })),
      users: trashedUsers.rows.map(r => ({
        id: r.id,
        username: r.username,
        display_name: r.display_name,
        theme: r.theme,
        created_at: Number(r.created_at),
        deleted_at: Number(r.deleted_at),
        noteCount: Number(r.noteCount),
      })),
    });
  } catch (err) {
    console.error('Admin trash fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch trash' });
  }
});

// PUT /api/admin/trash/restore/note/:id — Restore a note from trash
app.put('/api/admin/trash/restore/note/:id', requireAdmin, async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  try {
    await turso.execute({
      sql: 'UPDATE notes SET deleted_at = NULL WHERE id = ?',
      args: [req.params.id]
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore note' });
  }
});

// PUT /api/admin/trash/restore/user/:id — Restore a user and their notes from trash
app.put('/api/admin/trash/restore/user/:id', requireAdmin, async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  try {
    const userId = req.params.id;
    await turso.execute({
      sql: 'UPDATE users SET deleted_at = NULL WHERE id = ?',
      args: [userId]
    });
    await turso.execute({
      sql: 'UPDATE notes SET deleted_at = NULL WHERE userId = ?',
      args: [userId]
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore user' });
  }
});

// DELETE /api/admin/trash/note/:id — Permanently delete a note
app.delete('/api/admin/trash/note/:id', requireAdmin, async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  try {
    await turso.execute({
      sql: 'DELETE FROM notes WHERE id = ? AND deleted_at IS NOT NULL',
      args: [req.params.id]
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to permanently delete note' });
  }
});

// DELETE /api/admin/trash/user/:id — Permanently delete a user and their notes
app.delete('/api/admin/trash/user/:id', requireAdmin, async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  try {
    const userId = req.params.id;
    await turso.execute({
      sql: 'DELETE FROM notes WHERE userId = ?',
      args: [userId]
    });
    await turso.execute({
      sql: 'DELETE FROM users WHERE id = ? AND deleted_at IS NOT NULL',
      args: [userId]
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to permanently delete user' });
  }
});

// DELETE /api/admin/trash/all — Permanently delete ALL trashed items (requires password)
app.delete('/api/admin/trash/all', requireAdmin, async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  try {
    const { password } = req.body;
    const valid = await verifyAdminPassword(password);
    if (!valid) return res.status(403).json({ error: 'Incorrect admin password' });

    // Delete trashed notes whose users are also trashed
    await turso.execute('DELETE FROM notes WHERE deleted_at IS NOT NULL');
    await turso.execute('DELETE FROM users WHERE deleted_at IS NOT NULL');
    res.json({ success: true });
  } catch (err) {
    console.error('Admin permanent delete all error:', err);
    res.status(500).json({ error: 'Failed to permanently delete trash' });
  }
});

/* =============================================
   ADMIN SETTINGS
   ============================================= */

// GET /api/admin/settings
app.get('/api/admin/settings', requireAdmin, async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  try {
    const result = await turso.execute({
      sql: 'SELECT value FROM admin_config WHERE key = ?',
      args: ['admin_username']
    });
    res.json({
      adminUsername: result.rows[0]?.value || 'admin',
      uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
      nodeVersion: process.version,
    });
  } catch (err) {
    console.error('Admin settings error:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/admin/settings — Update admin credentials
app.put('/api/admin/settings', requireAdmin, async (req, res) => {
  if (!turso) return res.status(500).json({ error: 'Database not connected' });
  try {
    const { adminUsername, adminPassword } = req.body;

    if (adminUsername) {
      await turso.execute({
        sql: 'INSERT OR REPLACE INTO admin_config (key, value) VALUES (?, ?)',
        args: ['admin_username', adminUsername]
      });
    }

    if (adminPassword) {
      const hash = await bcrypt.hash(adminPassword, 10);
      await turso.execute({
        sql: 'INSERT OR REPLACE INTO admin_config (key, value) VALUES (?, ?)',
        args: ['admin_password_hash', hash]
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Admin settings update error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Serve admin panel at /note-manager
app.get('/note-manager', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Catch-all route to serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Notes App running on http://localhost:${PORT}`);
  console.log(`🔧 Admin Panel at http://localhost:${PORT}/note-manager`);
});

module.exports = app;
