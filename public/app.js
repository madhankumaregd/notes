/* =============================================
   NOTEFLOW — APP.JS
   Features: Create, Edit, Delete, Search, Tags,
             Themes, Checklists, Formatting Toolbar,
             Font/Size, Tables, Duplicate Note,
             Reading Mode, Auto-Scroll, TTS,
             Per-User Isolated Turso Cloud Storage,
             User Authentication & Profile
   ============================================= */

const DB_KEY = "noteflow_notes";
const MIGRATION_KEY = "noteflow_migrated_to_turso_v2";
const SESSION_KEY = "noteflow_session";
const OLD_USER_ID_KEY = "noteflow_user_id";

// Current session state
let session = null;
try {
  const rawSession = localStorage.getItem(SESSION_KEY);
  console.log('[NoteFlow] Raw session from localStorage:', rawSession ? 'exists (' + rawSession.length + ' chars)' : 'null');
  if (rawSession) {
    session = JSON.parse(rawSession);
    console.log('[NoteFlow] Parsed session:', { userId: session?.userId, username: session?.username, expiresAt: session?.expiresAt });
  }
} catch (e) {
  console.error('[NoteFlow] Failed to parse session from localStorage:', e);
  session = null;
}
if (session && session.expiresAt && Date.now() > session.expiresAt) {
  console.log('[NoteFlow] Session expired, clearing');
  session = null;
  localStorage.removeItem(SESSION_KEY);
}

// Auto-logout if session expires while tab is open
setInterval(() => {
  let curSession = JSON.parse(localStorage.getItem(SESSION_KEY));
  if (curSession && curSession.expiresAt && Date.now() > curSession.expiresAt) {
    handleLogout();
  }
}, 60000);

let currentProfile = null;

let notes = [];
let activeNoteId = null;
let activeTag = "all";
let saveTimeout = null;

/* ---- DOM REFS ---- */
const notesList = document.getElementById("notesList");
const tagsFilter = document.getElementById("tagsFilter");
const searchInput = document.getElementById("searchInput");
const emptyState = document.getElementById("emptyState");
const editorPanel = document.getElementById("editorPanel");
const noteTitleInput = document.getElementById("noteTitleInput");
const tagInput = document.getElementById("tagInput");
const noteContent = document.getElementById("noteContent");
const saveStatus = document.getElementById("saveStatus");
const wordCount = document.getElementById("wordCount");
const deleteNoteBtn = document.getElementById("deleteNoteBtn");
const modalOverlay = document.getElementById("modalOverlay");
const cancelDelete = document.getElementById("cancelDelete");
const confirmDelete = document.getElementById("confirmDelete");
const newNoteBtn = document.getElementById("newNoteBtn");
const newNoteBtnLg = document.getElementById("newNoteBtnLg");
const mobileToggle = document.getElementById("mobileToggle");
const sidebar = document.getElementById("sidebar");
const addChecklistBtn = document.getElementById("addChecklistBtn");

const duplicateNoteBtn = document.getElementById("duplicateNoteBtn");
const readingModeBtn = document.getElementById("readingModeBtn");
const exitReadingBtn = document.getElementById("exitReadingBtn");
const readingBar = document.getElementById("readingBar");
const autoScrollBtn = document.getElementById("autoScrollBtn");
const autoScrollIcon = document.getElementById("autoScrollIcon");
const speakBtn = document.getElementById("speakBtn");
const speakIcon = document.getElementById("speakIcon");

const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const fontFamilySelect = document.getElementById("fontFamilySelect");
const fontSizeSelect = document.getElementById("fontSizeSelect");
const headingSelect = document.getElementById("headingSelect");
const textColorPicker = document.getElementById("textColorPicker");
const textColorIndicator = document.getElementById("textColorIndicator");
const highlightColorPicker = document.getElementById("highlightColorPicker");
const highlightColorIndicator = document.getElementById("highlightColorIndicator");

const insertTableBtn = document.getElementById("insertTableBtn");
const tableModalOverlay = document.getElementById("tableModalOverlay");
const tableGridPicker = document.getElementById("tableGridPicker");
const tableSizeLabel = document.getElementById("tableSizeLabel");
const cancelTable = document.getElementById("cancelTable");
const confirmTable = document.getElementById("confirmTable");

const insertLinkBtn = document.getElementById("insertLinkBtn");
const linkModalOverlay = document.getElementById("linkModalOverlay");
const linkUrlInput = document.getElementById("linkUrlInput");
const linkTextInput = document.getElementById("linkTextInput");
const cancelLink = document.getElementById("cancelLink");
const confirmLink = document.getElementById("confirmLink");

const insertImageBtn = document.getElementById("insertImageBtn");
const imageModalOverlay = document.getElementById("imageModalOverlay");
const imageUrlInput = document.getElementById("imageUrlInput");
const imageAltInput = document.getElementById("imageAltInput");
const cancelImage = document.getElementById("cancelImage");
const confirmImage = document.getElementById("confirmImage");

const blockquoteBtn = document.getElementById("blockquoteBtn");
const codeBlockBtn = document.getElementById("codeBlockBtn");
const printBtn = document.getElementById("printBtn");

const toolbarMenuBtn = document.getElementById("toolbarMenuBtn");
const toolbarExtras = document.getElementById("toolbarExtras");

/* ---- AUTH & PROFILE DOM REFS ---- */
const authOverlay = document.getElementById("authOverlay");
const authTabLogin = document.getElementById("authTabLogin");
const authTabRegister = document.getElementById("authTabRegister");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const loginError = document.getElementById("loginError");
const registerError = document.getElementById("registerError");

const claimOverlay = document.getElementById("claimOverlay");
const claimForm = document.getElementById("claimForm");
const claimError = document.getElementById("claimError");
const switchToLoginBtn = document.getElementById("switchToLoginBtn");

const profileBtn = document.getElementById("profileBtn");
const sidebarAvatar = document.getElementById("sidebarAvatar");
const sidebarDisplayName = document.getElementById("sidebarDisplayName");

const settingsPanel = document.getElementById("settingsPanel");
const settingsCloseBtn = document.getElementById("settingsCloseBtn");
const profileAvatar = document.getElementById("profileAvatar");
const profileUsername = document.getElementById("profileUsername");
const profileThemeBtns = document.querySelectorAll(".profile-theme-btn");
const profileCreatedAt = document.getElementById("profileCreatedAt");
const profileLogoutBtn = document.getElementById("profileLogoutBtn");

const displayNameSettingBtn = document.getElementById("displayNameSettingBtn");
const profileDisplayNameDisplay = document.getElementById("profileDisplayNameDisplay");
const passwordSettingBtn = document.getElementById("passwordSettingBtn");

const displayNameModalOverlay = document.getElementById("displayNameModalOverlay");
const displayNameCloseBtn = document.getElementById("displayNameCloseBtn");
const editDisplayNameInput = document.getElementById("editDisplayNameInput");
const saveDisplayNameBtn = document.getElementById("saveDisplayNameBtn");

const passwordModalOverlay = document.getElementById("passwordModalOverlay");
const passwordCloseBtn = document.getElementById("passwordCloseBtn");
const currentPasswordInput = document.getElementById("currentPasswordInput");
const newPasswordInput = document.getElementById("newPasswordInput");
const confirmNewPasswordInput = document.getElementById("confirmNewPasswordInput");
const passwordError = document.getElementById("passwordError");
const savePasswordBtn = document.getElementById("savePasswordBtn");
const newPwRules = document.getElementById("newPwRules");

const themeSettingBtn = document.getElementById("themeSettingBtn");
const currentThemeLabel = document.getElementById("currentThemeLabel");
const themePopupOverlay = document.getElementById("themePopupOverlay");
const themePopupCloseBtn = document.getElementById("themePopupCloseBtn");

const colorPickerSection = document.getElementById("colorPickerSection");
const colorPickerCanvas = document.getElementById("colorPickerCanvas");
const colorHueSlider = document.getElementById("colorHueSlider");
const colorHexInput = document.getElementById("colorHexInput");
const colorPreviewSwatch = document.getElementById("colorPreviewSwatch");
const colorHistory = document.getElementById("colorHistory");

/* =============================================
   AUTH & INITIALIZATION LOGIC
   ============================================= */

// Common headers for API requests
function getAuthHeaders() {
  if (!session) return { 'Content-Type': 'application/json' };
  return {
    'Content-Type': 'application/json',
    'x-user-id': session.userId
  };
}

async function initApp() {
  const oldUserId = localStorage.getItem(OLD_USER_ID_KEY);
  console.log('[NoteFlow] initApp called. session:', !!session, 'oldUserId:', oldUserId);

  if (session) {
    console.log('[NoteFlow] Session found, hiding auth overlays');
    // Has active session
    authOverlay.style.display = "none";
    claimOverlay.style.display = "none";
    
    // Immediately apply cached session profile so UI is never blank
    if (!currentProfile && session.username) {
      currentProfile = {
        userId: session.userId,
        username: session.username,
        displayName: session.displayName || session.username,
        theme: session.theme || 'dark',
        customAccent: session.customAccent || null,
        createdAt: null
      };
      updateProfileUI();
      applyTheme(currentProfile.theme, currentProfile.customAccent);
    }
    
    // Then fetch fresh profile from server (updates silently)
    await loadProfile();
    await loadNotes();
    applyTheme(currentProfile?.theme, currentProfile?.customAccent);
  } else if (oldUserId) {
    console.log('[NoteFlow] No session but oldUserId found, showing claim overlay');
    // Old anonymous user exists -> Show Claim Modal
    claimOverlay.style.display = "flex";
  } else {
    console.log('[NoteFlow] No session, no oldUserId, showing login');
    // New user -> Show Login/Register
    authOverlay.style.display = "flex";
  }
}

// Validation helpers
function validatePassword(pw) {
  const rules = {
    len: pw.length >= 6,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    num: /[0-9]/.test(pw)
  };
  return rules;
}

function updatePwRulesUI(rulesObj, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const ids = {
    len: container.querySelector('[id$="RuleLen"]'),
    upper: container.querySelector('[id$="RuleUpper"]'),
    lower: container.querySelector('[id$="RuleLower"]'),
    num: container.querySelector('[id$="RuleNum"]')
  };
  
  if (ids.len) { ids.len.className = rulesObj.len ? "pw-rule valid" : "pw-rule"; ids.len.innerHTML = rulesObj.len ? "✓ Min 6 characters" : "✕ Min 6 characters"; }
  if (ids.upper) { ids.upper.className = rulesObj.upper ? "pw-rule valid" : "pw-rule"; ids.upper.innerHTML = rulesObj.upper ? "✓ One uppercase" : "✕ One uppercase"; }
  if (ids.lower) { ids.lower.className = rulesObj.lower ? "pw-rule valid" : "pw-rule"; ids.lower.innerHTML = rulesObj.lower ? "✓ One lowercase" : "✕ One lowercase"; }
  if (ids.num) { ids.num.className = rulesObj.num ? "pw-rule valid" : "pw-rule"; ids.num.innerHTML = rulesObj.num ? "✓ One number" : "✕ One number"; }
}

// Setup Auth Listeners
authTabLogin.addEventListener("click", () => {
  authTabLogin.classList.add("active");
  authTabRegister.classList.remove("active");
  loginForm.style.display = "flex";
  registerForm.style.display = "none";
});

authTabRegister.addEventListener("click", () => {
  authTabRegister.classList.add("active");
  authTabLogin.classList.remove("active");
  registerForm.style.display = "flex";
  loginForm.style.display = "none";
});

document.querySelectorAll(".auth-toggle-pw").forEach(btn => {
  btn.addEventListener("click", (e) => {
    const input = e.currentTarget.previousElementSibling;
    const icon = e.currentTarget.querySelector("span");
    if (input.type === "password") {
      input.type = "text";
      icon.textContent = "visibility_off";
    } else {
      input.type = "password";
      icon.textContent = "visibility";
    }
  });
});

document.getElementById("regPassword").addEventListener("input", (e) => {
  updatePwRulesUI(validatePassword(e.target.value), "regPwRules");
});

document.getElementById("claimPassword").addEventListener("input", (e) => {
  updatePwRulesUI(validatePassword(e.target.value), "claimPwRules");
});

switchToLoginBtn.addEventListener("click", () => {
  claimOverlay.style.display = "none";
  authOverlay.style.display = "flex";
  authTabLogin.click();
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const btn = document.getElementById("loginSubmit");
  btn.disabled = true;
  btn.textContent = "Logging in...";

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById("loginUsername").value,
        password: document.getElementById("loginPassword").value
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");

    finishLogin(data);
  } catch (err) {
    loginError.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Login";
  }
});

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  registerError.textContent = "";
  const pw = document.getElementById("regPassword").value;
  const confirm = document.getElementById("regConfirmPassword").value;
  
  if (pw !== confirm) {
    return registerError.textContent = "Passwords do not match.";
  }
  const rules = validatePassword(pw);
  if (!rules.len || !rules.upper || !rules.lower || !rules.num) {
    return registerError.textContent = "Password does not meet requirements.";
  }

  const btn = document.getElementById("registerSubmit");
  btn.disabled = true;
  btn.textContent = "Creating Account...";

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: document.getElementById("regDisplayName").value,
        username: document.getElementById("regUsername").value,
        password: pw
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Registration failed");

    finishLogin(data);
  } catch (err) {
    registerError.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Create Account";
  }
});

claimForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  claimError.textContent = "";
  const pw = document.getElementById("claimPassword").value;
  const rules = validatePassword(pw);
  if (!rules.len || !rules.upper || !rules.lower || !rules.num) {
    return claimError.textContent = "Password does not meet requirements.";
  }

  const btn = claimForm.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = "Securing Notes...";

  try {
    const res = await fetch('/api/auth/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        oldUserId: localStorage.getItem(OLD_USER_ID_KEY),
        displayName: document.getElementById("claimDisplayName").value,
        username: document.getElementById("claimUsername").value,
        password: pw
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Claim failed");

    finishLogin(data);
  } catch (err) {
    claimError.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Secure My Notes";
  }
});

function finishLogin(data) {
  session = { 
    userId: data.userId, 
    username: data.username,
    displayName: data.displayName || data.username,
    theme: data.theme || 'dark',
    customAccent: data.customAccent || null,
    expiresAt: Date.now() + (3 * 24 * 60 * 60 * 1000) // 3 days
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  
  // Cleanup old unneeded keys
  localStorage.removeItem(OLD_USER_ID_KEY);
  
  authOverlay.style.display = "none";
  claimOverlay.style.display = "none";
  
  initApp(); // reload profile and notes
}

function handleLogout() {
  session = null;
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(DB_KEY);
  notes = [];
  activeNoteId = null;
  currentProfile = null;
  
  // Hide everything, show login
  settingsPanel.style.display = "none";
  editorPanel.style.display = "none";
  emptyState.style.display = "none";
  authOverlay.style.display = "flex";
  claimOverlay.style.display = "none";
  
  // Reset UI
  notesList.innerHTML = "";
  sidebarDisplayName.textContent = "User";
  sidebarAvatar.textContent = "?";
}

/* =============================================
   PROFILE LOGIC
   ============================================= */

async function loadProfile() {
  try {
    const res = await fetch('/api/profile', { headers: getAuthHeaders() });
    if (res.ok) {
      currentProfile = await res.json();
      updateProfileUI();
      
      // Update session cache with latest server data
      if (session) {
        session.displayName = currentProfile.displayName;
        session.theme = currentProfile.theme;
        session.customAccent = currentProfile.customAccent;
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      }
    } else {
      console.warn('Profile API returned', res.status, '— using cached session data');
    }
  } catch (err) {
    console.error("Failed to load profile", err);
    // Session-cached profile is already applied by initApp, so UI won't be blank
  }
}

function updateProfileUI() {
  if (!currentProfile) return;
  const name = currentProfile.displayName || currentProfile.username;
  sidebarDisplayName.textContent = name;
  sidebarAvatar.textContent = name.charAt(0).toUpperCase();
  
  if (profileDisplayNameDisplay) {
    profileDisplayNameDisplay.textContent = currentProfile.displayName || "";
  }
  
  profileUsername.textContent = "@" + currentProfile.username;
  profileAvatar.textContent = name.charAt(0).toUpperCase();
  
  const d = new Date(currentProfile.createdAt);
  profileCreatedAt.textContent = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  
  selectThemeBtn(currentProfile.theme);
  updateThemeLabel(currentProfile.theme);
  
  if (currentProfile.theme === "custom" && currentProfile.customAccent) {
    updateCustomAccent(currentProfile.customAccent);
  }
}

function updateThemeLabel(theme) {
  if (!currentThemeLabel) return;
  if (theme === 'dark') currentThemeLabel.textContent = "Dark Theme";
  else if (theme === 'light') currentThemeLabel.textContent = "Light Theme";
  else if (theme === 'ocean') currentThemeLabel.textContent = "Ocean Theme";
  else currentThemeLabel.textContent = "Custom Theme";
}

function applyTheme(theme = "dark", customAccent = null) {
  document.body.className = `theme-${theme}`;
  if (theme === "custom" && customAccent) {
    document.body.style.setProperty("--custom-accent", customAccent);
    
    // Calculate a dimmer version for glow/hover
    // A simple hack without a full color library: just drop opacity
    document.body.style.setProperty("--custom-accent-glow", `${customAccent}22`); // Hex + alpha
    
    colorHexInput.value = customAccent;
    colorPreviewSwatch.style.background = customAccent;
  }
  updateThemeLabel(theme);
}

function selectThemeBtn(theme) {
  profileThemeBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.theme === theme);
  });
  colorPickerSection.style.display = theme === "custom" ? "block" : "none";
  if (theme === "custom") {
    setTimeout(initColorPicker, 10);
  }
}

profileThemeBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const theme = btn.dataset.theme;
    selectThemeBtn(theme);
    const accent = (theme === "custom") ? colorHexInput.value : null;
    applyTheme(theme, accent);
  });
});

profileBtn.addEventListener("click", () => {
  emptyState.style.display = "none";
  editorPanel.style.display = "none";
  settingsPanel.style.display = "flex";
  if (window.innerWidth <= 768) sidebar.classList.remove("open");
});

settingsCloseBtn.addEventListener("click", () => {
  settingsPanel.style.display = "none";
  renderEditor();
});

themeSettingBtn.addEventListener("click", () => {
  themePopupOverlay.classList.add("open");
});

themePopupCloseBtn.addEventListener("click", async () => {
  themePopupOverlay.classList.remove("open");
  
  const selectedTheme = document.querySelector(".profile-theme-btn.active")?.dataset.theme || "dark";
  const customAccent = selectedTheme === "custom" ? colorHexInput.value : null;

  try {
    await fetch('/api/profile', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ theme: selectedTheme, customAccent })
    });
  } catch (err) {
    console.error("Failed to save theme", err);
  }
});

[themePopupOverlay].forEach(modal => {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("open");
  });
});

profileLogoutBtn.addEventListener("click", handleLogout);

/* =============================================
   DISPLAY NAME EDIT LOGIC
   ============================================= */
displayNameSettingBtn.addEventListener("click", () => {
  editDisplayNameInput.value = currentProfile?.displayName || "";
  displayNameModalOverlay.classList.add("open");
});

displayNameCloseBtn.addEventListener("click", () => {
  displayNameModalOverlay.classList.remove("open");
});

saveDisplayNameBtn.addEventListener("click", async () => {
  try {
    saveDisplayNameBtn.disabled = true;
    saveDisplayNameBtn.textContent = "Saving...";
    await fetch('/api/profile', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ displayName: editDisplayNameInput.value })
    });
    await loadProfile();
    displayNameModalOverlay.classList.remove("open");
  } catch (err) {
    console.error("Failed to save profile", err);
  } finally {
    saveDisplayNameBtn.disabled = false;
    saveDisplayNameBtn.textContent = "Save";
  }
});

/* =============================================
   PASSWORD EDIT LOGIC
   ============================================= */
passwordSettingBtn.addEventListener("click", () => {
  currentPasswordInput.value = "";
  newPasswordInput.value = "";
  confirmNewPasswordInput.value = "";
  passwordError.textContent = "";
  updatePwRulesUI(validatePassword(""), "passwordModalOverlay");
  passwordModalOverlay.classList.add("open");
});

passwordCloseBtn.addEventListener("click", () => {
  passwordModalOverlay.classList.remove("open");
});

newPasswordInput.addEventListener("input", () => {
  const rules = validatePassword(newPasswordInput.value);
  updatePwRulesUI(rules, "passwordModalOverlay");
});

savePasswordBtn.addEventListener("click", async () => {
  const currentPw = currentPasswordInput.value;
  const newPw = newPasswordInput.value;
  const confirmPw = confirmNewPasswordInput.value;
  
  if (!currentPw || !newPw || !confirmPw) {
    passwordError.textContent = "Please fill in all password fields.";
    return;
  }
  
  if (newPw !== confirmPw) {
    passwordError.textContent = "New passwords do not match.";
    return;
  }
  
  const rules = validatePassword(newPw);
  if (!rules.len || !rules.upper || !rules.lower || !rules.num) {
    passwordError.textContent = "New password does not meet requirements.";
    return;
  }
  
  try {
    savePasswordBtn.disabled = true;
    savePasswordBtn.textContent = "Updating...";
    
    const res = await fetch('/api/auth/password', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        currentPassword: currentPw,
        newPassword: newPw
      })
    });
    
    const data = await res.json();
    if (!res.ok) {
      passwordError.textContent = data.error || "Failed to update password.";
    } else {
      passwordModalOverlay.classList.remove("open");
    }
  } catch (err) {
    passwordError.textContent = "Network error. Please try again.";
  } finally {
    savePasswordBtn.disabled = false;
    savePasswordBtn.textContent = "Update Password";
  }
});



/* =============================================
   COLOR PICKER CANVAS
   ============================================= */

let colorCtx = colorPickerCanvas.getContext("2d");
let isDraggingColor = false;
let recentColors = ["#e8b86d", "#4ade80", "#38bdf8", "#ec4899", "#8b5cf6"];

function drawColorCanvas(hue) {
  const width = colorPickerCanvas.width;
  const height = colorPickerCanvas.height;
  
  colorCtx.clearRect(0, 0, width, height);

  // Base hue
  colorCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
  colorCtx.fillRect(0, 0, width, height);

  // White gradient (left to right)
  let gradWhite = colorCtx.createLinearGradient(0, 0, width, 0);
  gradWhite.addColorStop(0, "rgba(255,255,255,1)");
  gradWhite.addColorStop(1, "rgba(255,255,255,0)");
  colorCtx.fillStyle = gradWhite;
  colorCtx.fillRect(0, 0, width, height);

  // Black gradient (bottom to top)
  let gradBlack = colorCtx.createLinearGradient(0, height, 0, 0);
  gradBlack.addColorStop(0, "rgba(0,0,0,1)");
  gradBlack.addColorStop(1, "rgba(0,0,0,0)");
  colorCtx.fillStyle = gradBlack;
  colorCtx.fillRect(0, 0, width, height);
}

function initColorPicker() {
  drawColorCanvas(colorHueSlider.value);
  renderRecentColors();
}

colorHueSlider.addEventListener("input", (e) => {
  drawColorCanvas(e.target.value);
});

function pickColor(e) {
  const rect = colorPickerCanvas.getBoundingClientRect();
  let x = e.clientX - rect.left;
  let y = e.clientY - rect.top;
  
  x = Math.max(0, Math.min(x, colorPickerCanvas.width - 1));
  y = Math.max(0, Math.min(y, colorPickerCanvas.height - 1));

  const imgData = colorCtx.getImageData(x, y, 1, 1).data;
  const hex = "#" + [imgData[0], imgData[1], imgData[2]].map(x => {
    const h = x.toString(16);
    return h.length === 1 ? "0" + h : h;
  }).join("");
  
  updateCustomAccent(hex);
}

function updateCustomAccent(hex) {
  colorHexInput.value = hex;
  colorPreviewSwatch.style.background = hex;
  if (document.querySelector(".profile-theme-btn.active")?.dataset.theme === "custom") {
    applyTheme("custom", hex);
  }
}

colorPickerCanvas.addEventListener("mousedown", (e) => {
  isDraggingColor = true;
  pickColor(e);
});
window.addEventListener("mouseup", () => {
  if (isDraggingColor) {
    isDraggingColor = false;
    addToRecentColors(colorHexInput.value);
  }
});
colorPickerCanvas.addEventListener("mousemove", (e) => {
  if (isDraggingColor) pickColor(e);
});

colorHexInput.addEventListener("change", (e) => {
  let val = e.target.value;
  if (!val.startsWith("#")) val = "#" + val;
  if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
    updateCustomAccent(val);
    addToRecentColors(val);
  }
});

function addToRecentColors(hex) {
  if (recentColors.includes(hex)) return;
  recentColors.unshift(hex);
  if (recentColors.length > 8) recentColors.pop();
  renderRecentColors();
}

function renderRecentColors() {
  colorHistory.innerHTML = '<span class="color-history-label">Recent:</span>';
  recentColors.forEach(c => {
    const swatch = document.createElement("div");
    swatch.className = "color-history-swatch";
    swatch.style.background = c;
    swatch.title = c;
    swatch.addEventListener("click", () => {
      updateCustomAccent(c);
    });
    colorHistory.appendChild(swatch);
  });
}


/* =============================================
   PER-USER TURSO CLOUD DB STORAGE & MIGRATION
   ============================================= */

async function loadNotes() {
  setSaveStatus("saving");

  // Migration: Bulk sync old local notes if they haven't been pushed
  const hasMigrated = localStorage.getItem(MIGRATION_KEY);
  if (!hasMigrated) {
    try {
      const localRaw = localStorage.getItem(DB_KEY);
      const localNotes = localRaw ? JSON.parse(localRaw) : [];
      
      if (localNotes.length > 0) {
        console.log(`🔒 Migrating ${localNotes.length} local notes securely under User ID: ${session.userId}`);
        await fetch('/api/notes', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(localNotes)
        });
      }
      localStorage.setItem(MIGRATION_KEY, "true");
    } catch (err) {
      console.warn('Migration warning:', err);
    }
  }

  // Fetch notes scoped to current userId
  try {
    const res = await fetch('/api/notes', {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      notes = await res.json();
      localStorage.setItem(DB_KEY, JSON.stringify(notes));
    } else {
      throw new Error('API request failed');
    }
  } catch (err) {
    console.warn('⚠️ Could not connect to Turso Cloud, using offline fallback:', err);
    const raw = localStorage.getItem(DB_KEY);
    notes = raw ? JSON.parse(raw) : [];
  }

  setSaveStatus("saved");
  render();
}

async function saveNoteToCloud(note) {
  try {
    await fetch('/api/notes', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(note)
    });
    localStorage.setItem(DB_KEY, JSON.stringify(notes));
  } catch (err) {
    console.error('Error saving to Turso:', err);
    localStorage.setItem(DB_KEY, JSON.stringify(notes));
  }
}

async function deleteNoteFromCloud(id) {
  try {
    await fetch(`/api/notes/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    localStorage.setItem(DB_KEY, JSON.stringify(notes));
  } catch (err) {
    console.error('Error deleting from Turso:', err);
    localStorage.setItem(DB_KEY, JSON.stringify(notes));
  }
}

/* =============================================
   UTILITIES
   ============================================= */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function parseTags(str) {
  return str
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function stripHtml(html) {
  const temp = document.createElement("div");
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || "";
}

function updateWordCount() {
  const text = noteContent.innerText || "";
  const words = text.trim().split(/\s+/).filter(word => word.length > 0);
  wordCount.textContent = `${words.length} word${words.length === 1 ? '' : 's'}`;
}

function getFilteredNotes() {
  const q = searchInput.value.trim().toLowerCase();
  return notes
    .filter((note) => {
      const matchesTag = activeTag === "all" || note.tags.includes(activeTag);
      const plainText = stripHtml(note.content).toLowerCase();
      const matchesSearch =
        !q ||
        note.title.toLowerCase().includes(q) ||
        plainText.includes(q) ||
        note.tags.some((t) => t.includes(q));
      return matchesTag && matchesSearch;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function getAllTags() {
  const tagSet = new Set();
  notes.forEach((n) => n.tags.forEach((t) => tagSet.add(t)));
  return [...tagSet].sort();
}

/* =============================================
   RENDER
   ============================================= */
function render() {
  renderTagsFilter();
  renderNotesList();
  renderEditor();
}

function renderTagsFilter() {
  const allTags = getAllTags();
  tagsFilter.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.className = "tag-pill" + (activeTag === "all" ? " active" : "");
  allBtn.dataset.tag = "all";
  allBtn.textContent = "All";
  allBtn.addEventListener("click", () => {
    activeTag = "all";
    render();
  });
  tagsFilter.appendChild(allBtn);

  allTags.forEach((tag) => {
    const btn = document.createElement("button");
    btn.className = "tag-pill" + (activeTag === tag ? " active" : "");
    btn.dataset.tag = tag;
    btn.textContent = tag;
    btn.addEventListener("click", () => {
      activeTag = tag;
      render();
    });
    tagsFilter.appendChild(btn);
  });
}

function renderNotesList() {
  const filtered = getFilteredNotes();
  notesList.innerHTML = "";

  if (filtered.length === 0) {
    notesList.innerHTML = `<div class="no-notes-msg">
      ${searchInput.value ? "No notes match your search." : "No notes yet.<br/>Create your first one!"}
    </div>`;
    return;
  }

  filtered.forEach((note) => {
    const card = document.createElement("div");
    card.className = "note-card" + (note.id === activeNoteId ? " active" : "");
    card.dataset.id = note.id;

    const tagsHtml = note.tags
      .map((t) => `<span class="note-tag-badge">${t}</span>`)
      .join("");

    const plainTextPreview = stripHtml(note.content);

    card.innerHTML = `
      <div class="note-card-title">${escapeHtml(note.title) || "Untitled"}</div>
      <div class="note-card-preview">${escapeHtml(plainTextPreview) || "No content yet..."}</div>
      <div class="note-card-meta">
        <span class="note-card-date">${formatDate(note.updatedAt)}</span>
        <div class="note-card-tags">${tagsHtml}</div>
      </div>
    `;

    card.addEventListener("click", () => openNote(note.id));
    notesList.appendChild(card);
  });
}

function renderEditor() {
  const note = notes.find((n) => n.id === activeNoteId);
  settingsPanel.style.display = "none"; // Hide settings if we're explicitly rendering editor
  
  if (!note) {
    emptyState.style.display = "flex";
    editorPanel.style.display = "none";
    
    // Update empty state text based on notes list
    const emptyTitle = emptyState.querySelector('h2');
    const emptyBtn = emptyState.querySelector('.new-note-btn-lg');
    if (notes.length === 0) {
      emptyTitle.textContent = "Create your first note";
      emptyBtn.textContent = "Create your first note";
    } else {
      emptyTitle.textContent = "Select a note or create one";
      emptyBtn.textContent = "Create a new note";
    }
    
    return;
  }
  emptyState.style.display = "none";
  editorPanel.style.display = "flex";
  noteTitleInput.value = note.title;
  tagInput.value = note.tags.join(", ");

  noteContent.innerHTML = note.content;
  updateWordCount();
  setSaveStatus("saved");
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function setSaveStatus(state) {
  if (state === "saving") {
    saveStatus.textContent = "Saving to Cloud...";
    saveStatus.className = "save-status saving";
  } else {
    saveStatus.textContent = "Saved to Cloud";
    saveStatus.className = "save-status saved";
  }
}

/* =============================================
   ACTIONS
   ============================================= */
async function createNote() {
  const note = {
    id: generateId(),
    title: "",
    content: "",
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  notes.unshift(note);
  activeNoteId = note.id;
  render();
  noteTitleInput.focus();

  await saveNoteToCloud(note);

  if (window.innerWidth <= 768) sidebar.classList.remove("open");
}

function openNote(id) {
  activeNoteId = id;
  
  if (document.body.classList.contains("reading-mode")) {
    toggleReadingMode();
  }
  
  render();
  if (window.innerWidth <= 768) sidebar.classList.remove("open");
}

function autoSave() {
  const note = notes.find((n) => n.id === activeNoteId);
  if (!note) return;
  setSaveStatus("saving");
  note.title = noteTitleInput.value;
  note.content = noteContent.innerHTML;
  note.tags = parseTags(tagInput.value);
  note.updatedAt = Date.now();

  updateWordCount();
  
  const card = document.querySelector(`.note-card[data-id="${note.id}"]`);
  if (card) {
      const plainTextPreview = stripHtml(note.content);
      card.querySelector('.note-card-title').textContent = note.title || "Untitled";
      card.querySelector('.note-card-preview').textContent = plainTextPreview || "No content yet...";
      card.querySelector('.note-card-date').textContent = formatDate(note.updatedAt);
      card.querySelector('.note-card-tags').innerHTML = note.tags.map(t => `<span class="note-tag-badge">${escapeHtml(t)}</span>`).join("");
  }
  renderTagsFilter();

  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    await saveNoteToCloud(note);
    setSaveStatus("saved");
  }, 600);
}

async function deleteActiveNote() {
  const targetId = activeNoteId;
  notes = notes.filter((n) => n.id !== targetId);
  activeNoteId = notes.length > 0 ? notes[0].id : null;
  modalOverlay.classList.remove("open");
  render();

  if (targetId) {
    await deleteNoteFromCloud(targetId);
  }
}

/* =============================================
   DUPLICATE NOTE
   ============================================= */
async function duplicateActiveNote() {
  const source = notes.find((n) => n.id === activeNoteId);
  if (!source) return;

  const clone = {
    id: generateId(),
    title: source.title ? `${source.title} (Copy)` : "Untitled (Copy)",
    content: source.content,
    tags: [...source.tags],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  notes.unshift(clone);
  activeNoteId = clone.id;
  render();
  
  await saveNoteToCloud(clone);
  setSaveStatus("saved");
}

duplicateNoteBtn.addEventListener("click", duplicateActiveNote);

/* =============================================
   FORMATTING TOOLBAR
   ============================================= */

function execCmd(command, value) {
  noteContent.focus();
  document.execCommand(command, false, value || null);
  autoSave();
  updateToolbarState();
}

document.querySelectorAll(".toolbar-btn[data-command]").forEach((btn) => {
  btn.addEventListener("mousedown", (e) => e.preventDefault());
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    execCmd(btn.dataset.command);
  });
});

undoBtn.addEventListener("click", () => execCmd("undo"));
redoBtn.addEventListener("click", () => execCmd("redo"));

fontFamilySelect.addEventListener("change", () => {
  execCmd("fontName", fontFamilySelect.value);
});

fontSizeSelect.addEventListener("change", () => {
  execCmd("fontSize", fontSizeSelect.value);
});

headingSelect.addEventListener("change", () => {
  execCmd("formatBlock", headingSelect.value);
  headingSelect.value = "p";
});

textColorPicker.addEventListener("input", (e) => {
  execCmd("foreColor", e.target.value);
  textColorIndicator.style.background = e.target.value;
});

highlightColorPicker.addEventListener("input", (e) => {
  execCmd("hiliteColor", e.target.value);
  highlightColorIndicator.style.background = e.target.value;
});

blockquoteBtn.addEventListener("click", () => {
  execCmd("formatBlock", "BLOCKQUOTE");
});

codeBlockBtn.addEventListener("click", () => {
  const selection = window.getSelection();
  const text = selection.toString();
  const html = `<pre><code>${text || 'Enter code here...'}</code></pre><p><br></p>`;
  execCmd("insertHTML", html);
});

printBtn.addEventListener("click", () => window.print());

function updateToolbarState() {
  const commands = [
    "bold", "italic", "underline", "strikeThrough",
    "subscript", "superscript",
    "justifyLeft", "justifyCenter", "justifyRight", "justifyFull",
    "insertUnorderedList", "insertOrderedList"
  ];
  commands.forEach((cmd) => {
    const btn = document.querySelector(`.toolbar-btn[data-command="${cmd}"]`);
    if (btn) {
      try {
        btn.classList.toggle("active", document.queryCommandState(cmd));
      } catch (e) {}
    }
  });

  const currentFont = document.queryCommandValue("fontName");
  if (currentFont) {
    const clean = currentFont.replace(/['"]/g, "");
    const option = [...fontFamilySelect.options].find(
      (o) => o.value.toLowerCase() === clean.toLowerCase()
    );
    if (option) fontFamilySelect.value = option.value;
  }

  const currentSize = document.queryCommandValue("fontSize");
  if (currentSize && currentSize !== "false") {
    fontSizeSelect.value = currentSize;
  }
}

document.addEventListener("selectionchange", () => {
  if (document.activeElement === noteContent || noteContent.contains(document.activeElement)) {
    updateToolbarState();
  }
});
noteContent.addEventListener("keyup", updateToolbarState);

/* =============================================
   TABLE INSERTION
   ============================================= */
let selectedRows = 0;
let selectedCols = 0;

function buildTableGrid() {
  tableGridPicker.innerHTML = "";
  for (let r = 1; r <= 8; r++) {
    for (let c = 1; c <= 8; c++) {
      const cell = document.createElement("div");
      cell.className = "table-grid-cell";
      cell.dataset.row = r;
      cell.dataset.col = c;
      tableGridPicker.appendChild(cell);
    }
  }
}
buildTableGrid();

tableGridPicker.addEventListener("mouseover", (e) => {
  const cell = e.target.closest(".table-grid-cell");
  if (!cell) return;
  const hoverRow = parseInt(cell.dataset.row);
  const hoverCol = parseInt(cell.dataset.col);
  highlightGridCells(hoverRow, hoverCol);
  tableSizeLabel.textContent = `${hoverRow} × ${hoverCol}`;
});

tableGridPicker.addEventListener("click", (e) => {
  const cell = e.target.closest(".table-grid-cell");
  if (!cell) return;
  selectedRows = parseInt(cell.dataset.row);
  selectedCols = parseInt(cell.dataset.col);
  highlightGridCells(selectedRows, selectedCols, true);
  tableSizeLabel.textContent = `${selectedRows} × ${selectedCols} selected`;
  confirmTable.disabled = false;
});

function highlightGridCells(rows, cols, locked = false) {
  tableGridPicker.querySelectorAll(".table-grid-cell").forEach((cell) => {
    const r = parseInt(cell.dataset.row);
    const c = parseInt(cell.dataset.col);
    cell.classList.remove("selected", "selected-highlight");
    if (r <= rows && c <= cols) {
      cell.classList.add(locked ? "selected-highlight" : "selected");
    }
  });
}

tableGridPicker.addEventListener("mouseleave", () => {
  if (selectedRows > 0) {
    highlightGridCells(selectedRows, selectedCols, true);
    tableSizeLabel.textContent = `${selectedRows} × ${selectedCols} selected`;
  } else {
    tableGridPicker.querySelectorAll(".table-grid-cell").forEach((c) =>
      c.classList.remove("selected", "selected-highlight")
    );
    tableSizeLabel.textContent = "Select size";
  }
});

insertTableBtn.addEventListener("mousedown", (e) => e.preventDefault());
insertTableBtn.addEventListener("click", () => {
  selectedRows = 0;
  selectedCols = 0;
  confirmTable.disabled = true;
  tableSizeLabel.textContent = "Select size";
  tableGridPicker.querySelectorAll(".table-grid-cell").forEach((c) =>
    c.classList.remove("selected", "selected-highlight")
  );
  tableModalOverlay.classList.add("open");
});

cancelTable.addEventListener("click", () => tableModalOverlay.classList.remove("open"));
tableModalOverlay.addEventListener("click", (e) => {
  if (e.target === tableModalOverlay) tableModalOverlay.classList.remove("open");
});

confirmTable.addEventListener("click", () => {
  if (selectedRows < 1 || selectedCols < 1) return;
  let html = '<table><tr>';
  for (let c = 0; c < selectedCols; c++) html += `<th>Header ${c + 1}</th>`;
  html += '</tr>';
  for (let r = 1; r < selectedRows; r++) {
    html += '<tr>';
    for (let c = 0; c < selectedCols; c++) html += '<td>&nbsp;</td>';
    html += '</tr>';
  }
  html += '</table><p><br></p>';
  execCmd("insertHTML", html);
  tableModalOverlay.classList.remove("open");
});

/* =============================================
   LINK & IMAGE INSERTION
   ============================================= */
let savedSelection = null;

function saveSelection() {
    if (window.getSelection) {
        let sel = window.getSelection();
        if (sel.getRangeAt && sel.rangeCount) {
            return sel.getRangeAt(0);
        }
    }
    return null;
}

function restoreSelection(range) {
    if (range) {
        if (window.getSelection) {
            let sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }
}

insertLinkBtn.addEventListener("click", (e) => {
  e.preventDefault();
  savedSelection = saveSelection();
  linkUrlInput.value = "";
  linkTextInput.value = window.getSelection().toString();
  linkModalOverlay.classList.add("open");
  setTimeout(() => linkUrlInput.focus(), 100);
});

cancelLink.addEventListener("click", () => linkModalOverlay.classList.remove("open"));
confirmLink.addEventListener("click", () => {
  const url = linkUrlInput.value.trim();
  const text = linkTextInput.value.trim() || url;
  if (!url) return;
  
  restoreSelection(savedSelection);
  const html = `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  execCmd("insertHTML", html);
  linkModalOverlay.classList.remove("open");
});

insertImageBtn.addEventListener("click", (e) => {
  e.preventDefault();
  savedSelection = saveSelection();
  imageUrlInput.value = "";
  imageAltInput.value = "";
  imageModalOverlay.classList.add("open");
  setTimeout(() => imageUrlInput.focus(), 100);
});

cancelImage.addEventListener("click", () => imageModalOverlay.classList.remove("open"));
confirmImage.addEventListener("click", () => {
  const url = imageUrlInput.value.trim();
  const alt = imageAltInput.value.trim();
  if (!url) return;
  
  restoreSelection(savedSelection);
  const html = `<img src="${url}" alt="${alt}" /><p><br></p>`;
  execCmd("insertHTML", html);
  imageModalOverlay.classList.remove("open");
});

[linkModalOverlay, imageModalOverlay].forEach(modal => {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("open");
  });
});

/* =============================================
   READING MODE, AUTO-SCROLL, TTS
   ============================================= */
let isReadingMode = false;
let isAutoScrolling = false;
let autoScrollInterval = null;
let isSpeaking = false;
let synth = window.speechSynthesis;
let utterance = null;

function toggleReadingMode() {
  isReadingMode = !isReadingMode;
  document.body.classList.toggle("reading-mode", isReadingMode);
  
  if (isReadingMode) {
    noteContent.contentEditable = "false";
    readingBar.style.display = "flex";
    readingModeBtn.classList.add("active");
  } else {
    noteContent.contentEditable = "true";
    readingBar.style.display = "none";
    readingModeBtn.classList.remove("active");
    stopAutoScroll();
    stopSpeaking();
  }
}

readingModeBtn.addEventListener("click", toggleReadingMode);
exitReadingBtn.addEventListener("click", toggleReadingMode);

function toggleAutoScroll() {
  isAutoScrolling = !isAutoScrolling;
  if (isAutoScrolling) {
    autoScrollBtn.classList.add("active");
    autoScrollIcon.textContent = "pause";
    autoScrollInterval = setInterval(() => {
      noteContent.scrollTop += 1;
      if (noteContent.scrollTop + noteContent.clientHeight >= noteContent.scrollHeight - 1) {
        stopAutoScroll();
      }
    }, 30);
  } else {
    stopAutoScroll();
  }
}

function stopAutoScroll() {
  isAutoScrolling = false;
  clearInterval(autoScrollInterval);
  autoScrollBtn.classList.remove("active");
  autoScrollIcon.textContent = "play_arrow";
}

autoScrollBtn.addEventListener("click", toggleAutoScroll);

function toggleSpeak() {
  if (isSpeaking) {
    if (synth.paused) {
      synth.resume();
      speakIcon.textContent = "pause";
      speakBtn.classList.add("active");
    } else {
      synth.pause();
      speakIcon.textContent = "play_arrow";
      speakBtn.classList.remove("active");
    }
  } else {
    const textToRead = noteTitleInput.value + ".\n" + noteContent.innerText;
    if (!textToRead.trim()) return;
    
    utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.onend = () => stopSpeaking();
    
    synth.speak(utterance);
    isSpeaking = true;
    speakIcon.textContent = "pause";
    speakBtn.classList.add("active");
  }
}

function stopSpeaking() {
  synth.cancel();
  isSpeaking = false;
  speakIcon.textContent = "volume_up";
  speakBtn.classList.remove("active");
}

speakBtn.addEventListener("click", toggleSpeak);
window.addEventListener('beforeunload', () => synth.cancel());

/* =============================================
   EVENT LISTENERS
   ============================================= */
newNoteBtn.addEventListener("click", createNote);
newNoteBtnLg.addEventListener("click", createNote);

noteTitleInput.addEventListener("input", autoSave);
tagInput.addEventListener("input", autoSave);
noteContent.addEventListener("input", autoSave); 

document.addEventListener("selectionchange", updateToolbarState);
noteContent.addEventListener("keyup", updateToolbarState);
noteContent.addEventListener("mouseup", updateToolbarState);

if (toolbarMenuBtn) {
  toolbarMenuBtn.addEventListener("click", () => {
    if (toolbarExtras) {
      toolbarExtras.classList.toggle("show");
    }
  });
}

// Ensure clicking outside toolbar hides extras on mobile
document.addEventListener("click", (e) => {
  if (toolbarExtras && toolbarExtras.classList.contains("show")) {
    if (!toolbarMenuBtn.contains(e.target) && !toolbarExtras.contains(e.target)) {
      toolbarExtras.classList.remove("show");
    }
  }
});

noteContent.addEventListener("change", (e) => {
  if (e.target.type === "checkbox") {
    if (e.target.checked) {
      e.target.setAttribute("checked", "checked");
    } else {
      e.target.removeAttribute("checked");
    }
    autoSave();
  }
});

addChecklistBtn.addEventListener("click", () => {
  execCmd("insertHTML", '<div><input type="checkbox" class="note-checkbox"> &nbsp;</div>');
});

searchInput.addEventListener("input", () => renderNotesList());

deleteNoteBtn.addEventListener("click", () =>
  modalOverlay.classList.add("open"),
);
cancelDelete.addEventListener("click", () =>
  modalOverlay.classList.remove("open"),
);
confirmDelete.addEventListener("click", deleteActiveNote);

modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) modalOverlay.classList.remove("open");
});

mobileToggle.addEventListener("click", () => sidebar.classList.toggle("open"));

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "n") {
    e.preventDefault();
    createNote();
  }
  if (e.key === "Escape") {
    modalOverlay.classList.remove("open");
    tableModalOverlay.classList.remove("open");
    linkModalOverlay.classList.remove("open");
    imageModalOverlay.classList.remove("open");
  }
});

/* =============================================
   TABLE INTERACTION — Word-like Resize & Select
   ============================================= */

let draggedTable = null;

function setupTableInteraction() {
  if (!noteContent) return;
  
  const tables = noteContent.querySelectorAll("table");
  tables.forEach(table => {
    table.style.position = "relative";
    table.classList.remove("resizing"); // Ensure no stuck resizing state
    
    if (!table.__interactionReady) {
      table.__interactionReady = true;
      
      // Clean up dead handles from HTML
      table.querySelectorAll(".table-move-handle").forEach(el => el.remove());
      
      // Add move handle
      let moveHandle = document.createElement("div");
      moveHandle.className = "table-move-handle";
      moveHandle.innerHTML = "⠿";
      moveHandle.contentEditable = "false";
      moveHandle.draggable = true;
      table.insertBefore(moveHandle, table.firstChild);
      
      // Drag to move table
      moveHandle.addEventListener("dragstart", (e) => {
        draggedTable = table;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/html", table.outerHTML);
        // Important: Use dragging class to disable pointer events on the table itself
        setTimeout(() => { table.classList.add("dragging"); }, 0);
      });
      
      moveHandle.addEventListener("dragend", (e) => {
        table.classList.remove("dragging");
        draggedTable = null;
        autoSave();
      });
      
      // Click handle to select table
      moveHandle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Deselect others
        noteContent.querySelectorAll("table.selected").forEach(t => t.classList.remove("selected"));
        table.classList.toggle("selected");
      });
    }
    
    // Add resize handles to cells
    addResizeHandles(table);
  });
}

function addResizeHandles(table) {
  // Set position:relative on all cells for handles
  const cells = table.querySelectorAll("th, td");
  cells.forEach(cell => {
    cell.style.position = "relative";
    
    // Skip if already has a live handle
    if (cell.__interactionReady) return;
    cell.__interactionReady = true;
    
    // Clean up dead handles from HTML
    cell.querySelectorAll(".table-col-resize-handle").forEach(el => el.remove());
    
    const handle = document.createElement("div");
    handle.className = "table-col-resize-handle";
    handle.contentEditable = "false";
    cell.appendChild(handle);
    
    // Column resize
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const startX = e.clientX;
      const startWidth = cell.offsetWidth;
      table.classList.add("resizing");
      handle.classList.add("active");
      table.contentEditable = "false"; // Prevent weird text selection while dragging
      
      // Freeze table layout to fixed to make resizing accurate
      if (window.getComputedStyle(table).tableLayout !== "fixed") {
        const firstRowCells = table.querySelectorAll("tr:first-child > *");
        firstRowCells.forEach(c => {
            c.style.width = c.offsetWidth + "px";
        });
        table.style.tableLayout = "fixed";
        table.style.width = table.offsetWidth + "px";
      }
      
      // Get the column index
      const colIndex = Array.from(cell.parentElement.children).indexOf(cell);
      
      function onMouseMove(ev) {
        const delta = ev.clientX - startX;
        const newWidth = Math.max(40, startWidth + delta);
        
        // Apply to all cells in this column
        const allRows = table.querySelectorAll("tr");
        allRows.forEach(row => {
          const targetCell = row.children[colIndex];
          if (targetCell && !targetCell.classList.contains("table-move-handle")) {
            targetCell.style.width = newWidth + "px";
            targetCell.style.minWidth = newWidth + "px";
          }
        });
      }
      
      function onMouseUp() {
        table.classList.remove("resizing");
        handle.classList.remove("active");
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        autoSave();
      }
      
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  });
}

// Deselect tables when clicking outside
noteContent.addEventListener("click", (e) => {
  if (!e.target.closest("table") && !e.target.closest(".table-move-handle")) {
    noteContent.querySelectorAll("table.selected").forEach(t => t.classList.remove("selected"));
  }
});

// Delete selected table with Delete/Backspace
document.addEventListener("keydown", (e) => {
  if (e.key === "Delete" || e.key === "Backspace") {
    const selectedTable = noteContent.querySelector("table.selected");
    if (selectedTable && document.activeElement !== noteTitleInput && document.activeElement !== tagInput) {
      // Only delete if the user isn't editing within the table
      const sel = window.getSelection();
      const anchorInTable = sel.anchorNode && selectedTable.contains(sel.anchorNode);
      if (!anchorInTable) {
        e.preventDefault();
        selectedTable.remove();
        autoSave();
      }
    }
  }
});

// MutationObserver to auto-setup interaction on new tables
const tableObserver = new MutationObserver(() => {
  setupTableInteraction();
});

tableObserver.observe(noteContent, { childList: true, subtree: true });

// Handle dropping the table within the editor
noteContent.addEventListener("dragover", (e) => {
  if (draggedTable) {
    e.preventDefault(); // allow drop
    e.dataTransfer.dropEffect = "move";
  }
});

noteContent.addEventListener("drop", (e) => {
  if (draggedTable) {
    e.preventDefault();
    
    // Get drop position
    let range;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(e.clientX, e.clientY);
    } else if (e.rangeParent) {
      range = document.createRange();
      range.setStart(e.rangeParent, e.rangeOffset);
    }
    
    if (range) {
      // Find the closest block element to insert before/after
      let targetNode = range.startContainer;
      while (targetNode && targetNode.parentNode !== noteContent) {
        targetNode = targetNode.parentNode;
      }
      
      // We don't want to insert the table inside itself!
      if (targetNode && !draggedTable.contains(targetNode)) {
        // Move the table
        draggedTable.remove();
        
        if (targetNode.nextSibling) {
            noteContent.insertBefore(draggedTable, targetNode.nextSibling);
        } else {
            noteContent.appendChild(draggedTable);
        }
        
        // Ensure there is space around the table
        if (!draggedTable.nextSibling || draggedTable.nextSibling.tagName !== "DIV") {
            const p = document.createElement("div");
            p.innerHTML = "<br/>";
            noteContent.insertBefore(p, draggedTable.nextSibling);
        }
      }
    }
  }
});

// Initial setup
setupTableInteraction();

/* =============================================
   START
   ============================================= */
initApp();
