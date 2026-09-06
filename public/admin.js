/* =============================================
   NOTEFLOW ADMIN PANEL — JavaScript
   Complete client-side logic for admin dashboard
   ============================================= */

const API = "/api/admin";
let adminToken = localStorage.getItem("adminToken") || null;

// DOM Elements
const loginOverlay = document.getElementById("adminLoginOverlay");
const adminLayout = document.getElementById("adminLayout");
const loginForm = document.getElementById("adminLoginForm");
const loginError = document.getElementById("adminLoginError");
const adminUsernameInput = document.getElementById("adminUsername");
const adminPasswordInput = document.getElementById("adminPassword");
const togglePwBtn = document.getElementById("adminTogglePw");

const navButtons = document.querySelectorAll(".admin-nav-item[data-page]");
const pages = document.querySelectorAll(".admin-page");
const pageTitle = document.getElementById("pageTitle");
const globalRefreshBtn = document.getElementById("globalRefreshBtn");
const adminLogoutBtn = document.getElementById("adminLogoutBtn");
const toastContainer = document.getElementById("adminToastContainer");
const trashBadge = document.getElementById("trashBadge");

// Dashboard elements
const statTotalUsers = document.getElementById("statTotalUsers");
const statTotalNotes = document.getElementById("statTotalNotes");
const statDbSize = document.getElementById("statDbSize");
const statRecentActivity = document.getElementById("statRecentActivity");
const dbStatsGrid = document.getElementById("dbStatsGrid");
const recentNotesBody = document.getElementById("recentNotesBody");
const statsDateFrom = document.getElementById("statsDateFrom");
const statsDateTo = document.getElementById("statsDateTo");
const statsDateApply = document.getElementById("statsDateApply");
const statsDateToday = document.getElementById("statsDateToday");
const statsDate7d = document.getElementById("statsDate7d");
const statsDate30d = document.getElementById("statsDate30d");
const statsHistorySection = document.getElementById("statsHistorySection");
const statsHistoryBody = document.getElementById("statsHistoryBody");

// Notes elements
const allNotesBody = document.getElementById("allNotesBody");
const notesSearchInput = document.getElementById("notesSearchInput");
const notesFilterUser = document.getElementById("notesFilterUser");

// Users elements
const allUsersBody = document.getElementById("allUsersBody");
const usersSearchInput = document.getElementById("usersSearchInput");

// Trash elements
const trashedNotesBody = document.getElementById("trashedNotesBody");
const trashedUsersBody = document.getElementById("trashedUsersBody");
const emptyTrashBtn = document.getElementById("emptyTrashBtn");

// Settings elements
const settingsAdminUser = document.getElementById("settingsAdminUser");
const settingsAdminPass = document.getElementById("settingsAdminPass");
const saveAdminCredentialsBtn = document.getElementById("saveAdminCredentialsBtn");
const deleteAllNotesBtn = document.getElementById("deleteAllNotesBtn");
const deleteAllUsersBtn = document.getElementById("deleteAllUsersBtn");
const settingsUptime = document.getElementById("settingsUptime");

// Modals
const noteViewModalOverlay = document.getElementById("noteViewModalOverlay");
const noteViewTitle = document.getElementById("noteViewTitle");
const noteViewMeta = document.getElementById("noteViewMeta");
const noteViewContent = document.getElementById("noteViewContent");
const noteViewClose = document.getElementById("noteViewClose");

const confirmModalOverlay = document.getElementById("confirmModalOverlay");
const confirmTitle = document.getElementById("confirmTitle");
const confirmMessage = document.getElementById("confirmMessage");
const confirmCancel = document.getElementById("confirmCancel");
const confirmOk = document.getElementById("confirmOk");

const passwordConfirmOverlay = document.getElementById("passwordConfirmOverlay");
const passwordConfirmTitle = document.getElementById("passwordConfirmTitle");
const passwordConfirmMessage = document.getElementById("passwordConfirmMessage");
const passwordConfirmInput = document.getElementById("passwordConfirmInput");
const passwordConfirmError = document.getElementById("passwordConfirmError");
const passwordConfirmCancel = document.getElementById("passwordConfirmCancel");
const passwordConfirmOk = document.getElementById("passwordConfirmOk");

// State
let allNotes = [];
let allUsers = [];
let currentPage = "dashboard";
let confirmCallback = null;
let passwordConfirmCallback = null;

/* =============================================
   HELPERS
   ============================================= */

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

function formatDate(ts) {
  if (!ts) return "—";
  const d = new Date(Number(ts));
  return d.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(bytes) {
  if (bytes === 0 || !bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function timeAgo(ts) {
  if (!ts) return "—";
  const now = Date.now();
  const diff = now - Number(ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `admin-toast ${type}`;
  const icon = type === "success" ? "check_circle" : "error";
  toast.innerHTML = `<span class="material-symbols-rounded">${icon}</span><span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("fade-out");
    toast.addEventListener("animationend", () => toast.remove());
  }, 3000);
}

async function adminFetch(endpoint, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(adminToken ? { "x-admin-token": adminToken } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(`${API}${endpoint}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem("adminToken");
    adminToken = null;
    showLoginScreen();
    throw new Error("Unauthorized");
  }
  return res;
}

/* =============================================
   LOGIN / AUTH
   ============================================= */

function showLoginScreen() {
  loginOverlay.style.display = "flex";
  adminLayout.style.display = "none";
}

function showAdminPanel() {
  loginOverlay.style.display = "none";
  adminLayout.style.display = "flex";
  // Set today's date as default
  statsDateFrom.value = todayStr();
  statsDateTo.value = todayStr();
  loadPageData();
  loadTrashBadge();
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const username = adminUsernameInput.value.trim();
  const password = adminPasswordInput.value;

  try {
    const res = await fetch(`${API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      loginError.textContent = data.error || "Login failed";
      return;
    }
    adminToken = data.token;
    localStorage.setItem("adminToken", adminToken);
    document.getElementById("adminDisplayName").textContent = username;
    showAdminPanel();
  } catch (err) {
    loginError.textContent = "Connection error";
  }
});

togglePwBtn.addEventListener("click", () => {
  const isPassword = adminPasswordInput.type === "password";
  adminPasswordInput.type = isPassword ? "text" : "password";
  togglePwBtn.querySelector(".material-symbols-rounded").textContent = isPassword ? "visibility_off" : "visibility";
});

adminLogoutBtn.addEventListener("click", () => {
  localStorage.removeItem("adminToken");
  adminToken = null;
  showLoginScreen();
});

/* =============================================
   NAVIGATION
   ============================================= */

const pageTitles = {
  dashboard: "Dashboard",
  notes: "Notes Manager",
  users: "Users Manager",
  trash: "Trash",
  settings: "Settings",
};

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const page = btn.dataset.page;
    switchPage(page);
  });
});

function switchPage(page) {
  currentPage = page;
  navButtons.forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  pages.forEach((p) => p.classList.toggle("active", p.id === `page${page.charAt(0).toUpperCase() + page.slice(1)}`));
  pageTitle.textContent = pageTitles[page] || page;
  loadPageData();
}

/* =============================================
   GLOBAL REFRESH
   ============================================= */

globalRefreshBtn.addEventListener("click", () => {
  globalRefreshBtn.classList.add("spinning");
  loadPageData().finally(() => {
    setTimeout(() => globalRefreshBtn.classList.remove("spinning"), 600);
  });
});

/* =============================================
   TRASH BADGE
   ============================================= */
async function loadTrashBadge() {
  try {
    const res = await adminFetch("/trash");
    const data = await res.json();
    const total = (data.notes?.length || 0) + (data.users?.length || 0);
    if (total > 0) {
      trashBadge.textContent = total;
      trashBadge.style.display = "inline";
    } else {
      trashBadge.style.display = "none";
    }
  } catch (e) {}
}

/* =============================================
   DATA LOADING
   ============================================= */

async function loadPageData() {
  try {
    switch (currentPage) {
      case "dashboard":
        await loadDashboard();
        break;
      case "notes":
        await loadNotes();
        break;
      case "users":
        await loadUsers();
        break;
      case "trash":
        await loadTrash();
        break;
      case "settings":
        await loadSettings();
        break;
    }
  } catch (err) {
    console.error("Error loading page data:", err);
  }
}

/* ---- DASHBOARD ---- */
async function loadDashboard() {
  const from = statsDateFrom.value || todayStr();
  const to = statsDateTo.value || todayStr();

  const res = await adminFetch(`/stats?from=${from}&to=${to}`);
  const data = await res.json();

  statTotalUsers.textContent = data.totalUsers ?? 0;
  statTotalNotes.textContent = data.totalNotes ?? 0;
  statDbSize.textContent = formatBytes(data.dbSizeBytes ?? 0);
  statRecentActivity.textContent = data.recentNotes ?? 0;

  // DB Stats grid
  dbStatsGrid.innerHTML = "";
  const todayReads = data.todayReads ?? 0;
  const todayWrites = data.todayWrites ?? 0;

  const dbStats = [
    { label: "All-Time Reads", value: data.totalReads ?? "N/A" },
    { label: "All-Time Writes", value: data.totalWrites ?? "N/A" },
    { label: "Today Reads", value: todayReads },
    { label: "Today Writes", value: todayWrites },
    { label: "Tables", value: data.tableCount ?? 4 },
    { label: "Avg Note Size", value: formatBytes(data.avgNoteSize ?? 0) },
    { label: "Largest Note", value: formatBytes(data.largestNote ?? 0) },
    { label: "Server Uptime", value: formatUptime(data.uptimeSeconds ?? 0) },
    { label: "Trashed Notes", value: data.trashedNotes ?? 0 },
    { label: "Trashed Users", value: data.trashedUsers ?? 0 },
  ];
  dbStats.forEach((stat) => {
    const el = document.createElement("div");
    el.className = "db-stat-item";
    el.innerHTML = `<span class="label">${stat.label}</span><span class="value">${stat.value}</span>`;
    dbStatsGrid.appendChild(el);
  });

  // Stats history table (daily breakdown for selected range)
  const history = data.dailyStats || [];
  if (history.length > 0) {
    statsHistorySection.style.display = "block";
    statsHistoryBody.innerHTML = history.map(h => `
      <tr>
        <td><strong>${h.date}</strong></td>
        <td>${h.reads}</td>
        <td>${h.writes}</td>
        <td>${h.reads + h.writes}</td>
      </tr>
    `).join("");
  } else {
    statsHistorySection.style.display = "block";
    statsHistoryBody.innerHTML = `<tr><td colspan="4" class="table-empty">No data for selected date range</td></tr>`;
  }

  // Recent notes
  if (data.recentNotesList && data.recentNotesList.length > 0) {
    recentNotesBody.innerHTML = data.recentNotesList
      .map(
        (n) => `
      <tr>
        <td><strong>${escapeHtml(n.title || "Untitled")}</strong></td>
        <td>${escapeHtml(n.username || n.userId || "Unknown")}</td>
        <td>${(n.tags || []).map((t) => `<span class="table-tag">${escapeHtml(t)}</span>`).join(" ") || "—"}</td>
        <td>${timeAgo(n.updatedAt)}</td>
      </tr>`
      )
      .join("");
  } else {
    recentNotesBody.innerHTML = '<tr><td colspan="4" class="table-empty">No recent activity</td></tr>';
  }
}

// Date range controls
statsDateApply.addEventListener("click", loadDashboard);
statsDateToday.addEventListener("click", () => {
  statsDateFrom.value = todayStr();
  statsDateTo.value = todayStr();
  loadDashboard();
});
statsDate7d.addEventListener("click", () => {
  statsDateFrom.value = daysAgoStr(7);
  statsDateTo.value = todayStr();
  loadDashboard();
});
statsDate30d.addEventListener("click", () => {
  statsDateFrom.value = daysAgoStr(30);
  statsDateTo.value = todayStr();
  loadDashboard();
});

/* ---- NOTES ---- */
async function loadNotes() {
  const res = await adminFetch("/notes");
  const data = await res.json();
  allNotes = data.notes || [];
  const users = data.users || [];

  // Populate filter dropdown
  notesFilterUser.innerHTML = '<option value="">All Users</option>';
  users.forEach((u) => {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = `${u.display_name || u.username} (${u.username})`;
    notesFilterUser.appendChild(opt);
  });

  renderNotes();
}

function renderNotes() {
  const search = (notesSearchInput.value || "").toLowerCase();
  const filterUser = notesFilterUser.value;

  let filtered = allNotes;
  if (search) {
    filtered = filtered.filter(
      (n) =>
        (n.title || "").toLowerCase().includes(search) ||
        (n.content || "").toLowerCase().includes(search) ||
        (n.username || "").toLowerCase().includes(search)
    );
  }
  if (filterUser) {
    filtered = filtered.filter((n) => n.userId === filterUser);
  }

  if (filtered.length === 0) {
    allNotesBody.innerHTML = '<tr><td colspan="7" class="table-empty">No notes found</td></tr>';
    return;
  }

  allNotesBody.innerHTML = filtered
    .map(
      (n) => `
    <tr>
      <td><strong>${escapeHtml(n.title || "Untitled")}</strong></td>
      <td>${escapeHtml(n.username || n.userId || "—")}</td>
      <td>${(n.tags || []).map((t) => `<span class="table-tag">${escapeHtml(t)}</span>`).join(" ") || "—"}</td>
      <td>${formatBytes((n.content || "").length)}</td>
      <td>${formatDate(n.createdAt)}</td>
      <td>${timeAgo(n.updatedAt)}</td>
      <td>
        <div class="table-actions">
          <button class="table-action-btn" title="View" onclick="viewNote('${n.id}')">
            <span class="material-symbols-rounded">visibility</span>
          </button>
          <button class="table-action-btn danger" title="Move to Trash" onclick="trashNote('${n.id}')">
            <span class="material-symbols-rounded">delete</span>
          </button>
        </div>
      </td>
    </tr>`
    )
    .join("");
}

notesSearchInput.addEventListener("input", renderNotes);
notesFilterUser.addEventListener("change", renderNotes);

window.viewNote = function (noteId) {
  const note = allNotes.find((n) => n.id === noteId);
  if (!note) return;
  noteViewTitle.textContent = note.title || "Untitled";
  noteViewMeta.innerHTML = `
    <span>Owner: ${escapeHtml(note.username || note.userId || "Unknown")}</span>
    <span>Created: ${formatDate(note.createdAt)}</span>
    <span>Updated: ${formatDate(note.updatedAt)}</span>
    ${(note.tags || []).map((t) => `<span>${escapeHtml(t)}</span>`).join("")}
  `;
  noteViewContent.innerHTML = note.content || "<em>No content</em>";
  noteViewModalOverlay.classList.add("open");
};

noteViewClose.addEventListener("click", () => noteViewModalOverlay.classList.remove("open"));
noteViewModalOverlay.addEventListener("click", (e) => {
  if (e.target === noteViewModalOverlay) noteViewModalOverlay.classList.remove("open");
});

window.trashNote = function (noteId) {
  const note = allNotes.find((n) => n.id === noteId);
  showConfirm(
    "Move to Trash",
    `Move "${escapeHtml(note?.title || "Untitled")}" to trash? You can restore it later from the Trash page.`,
    async () => {
      try {
        const res = await adminFetch(`/notes/${noteId}`, { method: "DELETE" });
        if (res.ok) {
          showToast("Note moved to trash");
          await loadNotes();
          loadTrashBadge();
        } else {
          showToast("Failed to trash note", "error");
        }
      } catch (err) {
        showToast("Error", "error");
      }
    }
  );
};

/* ---- USERS ---- */
async function loadUsers() {
  const res = await adminFetch("/users");
  const data = await res.json();
  allUsers = data || [];
  renderUsers();
}

function renderUsers() {
  const search = (usersSearchInput.value || "").toLowerCase();

  let filtered = allUsers;
  if (search) {
    filtered = filtered.filter(
      (u) =>
        (u.username || "").toLowerCase().includes(search) ||
        (u.display_name || "").toLowerCase().includes(search)
    );
  }

  if (filtered.length === 0) {
    allUsersBody.innerHTML = '<tr><td colspan="7" class="table-empty">No users found</td></tr>';
    return;
  }

  allUsersBody.innerHTML = filtered
    .map(
      (u) => {
        const isActive = (u.status || 'active') === 'active';
        return `
    <tr>
      <td>
        <div class="table-user-cell">
          <div class="table-user-avatar">${(u.display_name || u.username || "?").charAt(0).toUpperCase()}</div>
          <div>
            <strong>${escapeHtml(u.display_name || u.username)}</strong>
          </div>
        </div>
      </td>
      <td>@${escapeHtml(u.username)}</td>
      <td>${u.noteCount ?? 0}</td>
      <td><span class="status-badge ${isActive ? 'active' : 'deactivated'}">${isActive ? 'Active' : 'Deactivated'}</span></td>
      <td>${escapeHtml(u.theme || "dark")}</td>
      <td>${formatDate(u.created_at)}</td>
      <td>
        <div class="table-actions">
          <button class="table-action-btn ${isActive ? 'danger' : 'restore'}" title="${isActive ? 'Deactivate' : 'Activate'}" onclick="toggleUserStatus('${u.id}', '${isActive ? 'deactivated' : 'active'}')">
            <span class="material-symbols-rounded">${isActive ? 'person_off' : 'person'}</span>
          </button>
          <button class="table-action-btn danger" title="Move to Trash" onclick="trashUser('${u.id}')">
            <span class="material-symbols-rounded">delete</span>
          </button>
        </div>
      </td>
    </tr>`;
      }
    )
    .join("");
}

usersSearchInput.addEventListener("input", renderUsers);

window.toggleUserStatus = async function (userId, newStatus) {
  const user = allUsers.find(u => u.id === userId);
  const action = newStatus === 'deactivated' ? 'Deactivate' : 'Activate';
  showConfirm(
    `${action} User`,
    `${action} user "${escapeHtml(user?.display_name || user?.username || "")}"? ${newStatus === 'deactivated' ? 'They will not be able to log in.' : 'They will be able to log in again.'}`,
    async () => {
      try {
        const res = await adminFetch(`/users/${userId}/deactivate`, {
          method: "PUT",
          body: JSON.stringify({ status: newStatus }),
        });
        if (res.ok) {
          showToast(`User ${newStatus === 'deactivated' ? 'deactivated' : 'activated'}`);
          await loadUsers();
        } else {
          showToast("Failed to update user", "error");
        }
      } catch (err) {
        showToast("Error", "error");
      }
    }
  );
};

window.trashUser = function (userId) {
  const user = allUsers.find((u) => u.id === userId);
  showConfirm(
    "Move to Trash",
    `Move user "${escapeHtml(user?.display_name || user?.username || "")}" and all their notes to trash? You can restore from the Trash page.`,
    async () => {
      try {
        const res = await adminFetch(`/users/${userId}`, { method: "DELETE" });
        if (res.ok) {
          showToast("User moved to trash");
          await loadUsers();
          loadTrashBadge();
        } else {
          showToast("Failed to trash user", "error");
        }
      } catch (err) {
        showToast("Error", "error");
      }
    }
  );
};

/* ---- TRASH ---- */
let trashedNotes = [];
let trashedUsers = [];

async function loadTrash() {
  const res = await adminFetch("/trash");
  const data = await res.json();
  trashedNotes = data.notes || [];
  trashedUsers = data.users || [];
  renderTrash();
  loadTrashBadge();
}

function renderTrash() {
  // Trashed Notes
  if (trashedNotes.length === 0) {
    trashedNotesBody.innerHTML = '<tr><td colspan="4" class="table-empty">No trashed notes</td></tr>';
  } else {
    trashedNotesBody.innerHTML = trashedNotes.map(n => `
      <tr>
        <td><strong>${escapeHtml(n.title || "Untitled")}</strong></td>
        <td>${escapeHtml(n.username || n.userId || "—")}</td>
        <td>${timeAgo(n.deletedAt)}</td>
        <td>
          <div class="table-actions">
            <button class="table-action-btn restore" title="Restore" onclick="restoreNote('${n.id}')">
              <span class="material-symbols-rounded">restore_from_trash</span>
            </button>
            <button class="table-action-btn danger" title="Delete Permanently" onclick="permanentDeleteNote('${n.id}')">
              <span class="material-symbols-rounded">delete_forever</span>
            </button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  // Trashed Users
  if (trashedUsers.length === 0) {
    trashedUsersBody.innerHTML = '<tr><td colspan="5" class="table-empty">No trashed users</td></tr>';
  } else {
    trashedUsersBody.innerHTML = trashedUsers.map(u => `
      <tr>
        <td>
          <div class="table-user-cell">
            <div class="table-user-avatar">${(u.display_name || u.username || "?").charAt(0).toUpperCase()}</div>
            <strong>${escapeHtml(u.display_name || u.username)}</strong>
          </div>
        </td>
        <td>@${escapeHtml(u.username)}</td>
        <td>${u.noteCount ?? 0}</td>
        <td>${timeAgo(u.deleted_at)}</td>
        <td>
          <div class="table-actions">
            <button class="table-action-btn restore" title="Restore User & Notes" onclick="restoreUser('${u.id}')">
              <span class="material-symbols-rounded">restore_from_trash</span>
            </button>
            <button class="table-action-btn danger" title="Delete Permanently" onclick="permanentDeleteUser('${u.id}')">
              <span class="material-symbols-rounded">delete_forever</span>
            </button>
          </div>
        </td>
      </tr>
    `).join("");
  }
}

window.restoreNote = async function (noteId) {
  try {
    const res = await adminFetch(`/trash/restore/note/${noteId}`, { method: "PUT" });
    if (res.ok) {
      showToast("Note restored");
      await loadTrash();
    } else {
      showToast("Failed to restore", "error");
    }
  } catch (err) {
    showToast("Error", "error");
  }
};

window.restoreUser = async function (userId) {
  try {
    const res = await adminFetch(`/trash/restore/user/${userId}`, { method: "PUT" });
    if (res.ok) {
      showToast("User and notes restored");
      await loadTrash();
    } else {
      showToast("Failed to restore", "error");
    }
  } catch (err) {
    showToast("Error", "error");
  }
};

window.permanentDeleteNote = function (noteId) {
  const note = trashedNotes.find(n => n.id === noteId);
  showConfirm(
    "Permanent Delete",
    `Permanently delete "${escapeHtml(note?.title || "Untitled")}"? This CANNOT be undone.`,
    async () => {
      try {
        const res = await adminFetch(`/trash/note/${noteId}`, { method: "DELETE" });
        if (res.ok) {
          showToast("Note permanently deleted");
          await loadTrash();
        } else {
          showToast("Failed to delete", "error");
        }
      } catch (err) {
        showToast("Error", "error");
      }
    }
  );
};

window.permanentDeleteUser = function (userId) {
  const user = trashedUsers.find(u => u.id === userId);
  showConfirm(
    "Permanent Delete",
    `Permanently delete user "${escapeHtml(user?.display_name || user?.username || "")}" and ALL their notes? This CANNOT be undone.`,
    async () => {
      try {
        const res = await adminFetch(`/trash/user/${userId}`, { method: "DELETE" });
        if (res.ok) {
          showToast("User permanently deleted");
          await loadTrash();
        } else {
          showToast("Failed to delete", "error");
        }
      } catch (err) {
        showToast("Error", "error");
      }
    }
  );
};

// Empty all trash — requires password
emptyTrashBtn.addEventListener("click", () => {
  showPasswordConfirm(
    "Empty Trash Permanently",
    "This will permanently delete ALL trashed notes and users from the database. This is IRREVERSIBLE.",
    async (password) => {
      try {
        const res = await adminFetch("/trash/all", {
          method: "DELETE",
          body: JSON.stringify({ password }),
        });
        if (res.ok) {
          showToast("Trash emptied permanently");
          await loadTrash();
        } else {
          const data = await res.json();
          showToast(data.error || "Failed", "error");
        }
      } catch (err) {
        showToast("Error", "error");
      }
    }
  );
});

/* ---- SETTINGS ---- */
async function loadSettings() {
  try {
    const res = await adminFetch("/settings");
    const data = await res.json();
    settingsAdminUser.value = data.adminUsername || "";
    settingsUptime.textContent = formatUptime(data.uptimeSeconds || 0);
    document.getElementById("settingsRuntime").textContent = data.nodeVersion || "Node.js";
  } catch (err) {
    console.error("Error loading settings:", err);
  }
}

saveAdminCredentialsBtn.addEventListener("click", async () => {
  const username = settingsAdminUser.value.trim();
  const password = settingsAdminPass.value;
  if (!username) {
    showToast("Username cannot be empty", "error");
    return;
  }
  try {
    const body = { adminUsername: username };
    if (password) body.adminPassword = password;
    const res = await adminFetch("/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    });
    if (res.ok) {
      showToast("Admin credentials saved");
      settingsAdminPass.value = "";
    } else {
      const data = await res.json();
      showToast(data.error || "Failed to save", "error");
    }
  } catch (err) {
    showToast("Error saving credentials", "error");
  }
});

// Danger zone — requires password
deleteAllNotesBtn.addEventListener("click", () => {
  showPasswordConfirm(
    "Trash All Notes",
    "This will move ALL notes from every user to trash. You can restore them from the Trash page.",
    async (password) => {
      try {
        const res = await adminFetch("/notes/all", {
          method: "DELETE",
          body: JSON.stringify({ password }),
        });
        if (res.ok) {
          showToast("All notes moved to trash");
          loadTrashBadge();
        } else {
          const data = await res.json();
          showToast(data.error || "Failed", "error");
        }
      } catch (err) {
        showToast("Error", "error");
      }
    }
  );
});

deleteAllUsersBtn.addEventListener("click", () => {
  showPasswordConfirm(
    "Trash All Users & Notes",
    "This will move ALL user accounts and ALL notes to trash. You can restore them from the Trash page.",
    async (password) => {
      try {
        const res = await adminFetch("/users/all", {
          method: "DELETE",
          body: JSON.stringify({ password }),
        });
        if (res.ok) {
          showToast("All users and notes moved to trash");
          loadTrashBadge();
        } else {
          const data = await res.json();
          showToast(data.error || "Failed", "error");
        }
      } catch (err) {
        showToast("Error", "error");
      }
    }
  );
});

/* =============================================
   CONFIRM MODAL (simple)
   ============================================= */
function showConfirm(title, message, callback) {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmCallback = callback;
  confirmModalOverlay.classList.add("open");
}

confirmCancel.addEventListener("click", () => {
  confirmModalOverlay.classList.remove("open");
  confirmCallback = null;
});

confirmOk.addEventListener("click", async () => {
  confirmModalOverlay.classList.remove("open");
  if (confirmCallback) {
    await confirmCallback();
    confirmCallback = null;
  }
});

confirmModalOverlay.addEventListener("click", (e) => {
  if (e.target === confirmModalOverlay) {
    confirmModalOverlay.classList.remove("open");
    confirmCallback = null;
  }
});

/* =============================================
   PASSWORD CONFIRM MODAL (for dangerous actions)
   ============================================= */
function showPasswordConfirm(title, message, callback) {
  passwordConfirmTitle.textContent = title;
  passwordConfirmMessage.textContent = message;
  passwordConfirmInput.value = "";
  passwordConfirmError.textContent = "";
  passwordConfirmCallback = callback;
  passwordConfirmOverlay.classList.add("open");
  setTimeout(() => passwordConfirmInput.focus(), 100);
}

passwordConfirmCancel.addEventListener("click", () => {
  passwordConfirmOverlay.classList.remove("open");
  passwordConfirmCallback = null;
});

passwordConfirmOk.addEventListener("click", async () => {
  const password = passwordConfirmInput.value;
  if (!password) {
    passwordConfirmError.textContent = "Password is required";
    return;
  }

  // Verify password first
  try {
    const verifyRes = await adminFetch("/verify-password", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.valid) {
      passwordConfirmError.textContent = "Incorrect admin password";
      return;
    }
  } catch (err) {
    passwordConfirmError.textContent = "Verification failed";
    return;
  }

  passwordConfirmOverlay.classList.remove("open");
  if (passwordConfirmCallback) {
    await passwordConfirmCallback(password);
    passwordConfirmCallback = null;
  }
});

passwordConfirmOverlay.addEventListener("click", (e) => {
  if (e.target === passwordConfirmOverlay) {
    passwordConfirmOverlay.classList.remove("open");
    passwordConfirmCallback = null;
  }
});

/* =============================================
   INIT
   ============================================= */
(async function init() {
  if (adminToken) {
    // Validate token
    try {
      const res = await fetch(`${API}/stats`, {
        headers: { "x-admin-token": adminToken },
      });
      if (res.ok) {
        showAdminPanel();
        return;
      }
    } catch (e) {}
    localStorage.removeItem("adminToken");
    adminToken = null;
  }
  showLoginScreen();
})();
