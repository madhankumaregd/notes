/* =============================================
   NOTEFLOW — APP.JS
   Features: Create, Edit, Delete, Search, Tags,
             Themes, Checklists, Formatting Toolbar,
             Font/Size, Tables, Duplicate Note,
             Reading Mode, Auto-Scroll, TTS,
             Per-User Isolated Turso Cloud Storage
   Storage: Private Turso Cloud SQLite per User Device (x-user-id)
   ============================================= */

const DB_KEY = "noteflow_notes";
const MIGRATION_KEY = "noteflow_migrated_to_turso_v2";
const THEME_KEY = "noteflow_theme";
const USER_ID_KEY = "noteflow_user_id";

// Get or generate a unique persistent User ID for privacy/isolation
function getUserId() {
  let uid = localStorage.getItem(USER_ID_KEY);
  if (!uid) {
    uid = 'usr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(USER_ID_KEY, uid);
  }
  return uid;
}

const userId = getUserId();
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
const themeSelect = document.getElementById("themeSelect");
const addChecklistBtn = document.getElementById("addChecklistBtn");

/* Phase 1 & 2 DOM Refs */
const duplicateNoteBtn = document.getElementById("duplicateNoteBtn");
const readingModeBtn = document.getElementById("readingModeBtn");
const exitReadingBtn = document.getElementById("exitReadingBtn");
const readingBar = document.getElementById("readingBar");
const autoScrollBtn = document.getElementById("autoScrollBtn");
const autoScrollIcon = document.getElementById("autoScrollIcon");
const speakBtn = document.getElementById("speakBtn");
const speakIcon = document.getElementById("speakIcon");

/* Toolbar DOM Refs */
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const fontFamilySelect = document.getElementById("fontFamilySelect");
const fontSizeSelect = document.getElementById("fontSizeSelect");
const headingSelect = document.getElementById("headingSelect");
const textColorPicker = document.getElementById("textColorPicker");
const textColorIndicator = document.getElementById("textColorIndicator");
const highlightColorPicker = document.getElementById("highlightColorPicker");
const highlightColorIndicator = document.getElementById("highlightColorIndicator");

/* Modals & Inserts */
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

/* =============================================
   THEME LOGIC
   ============================================= */
function loadTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
  document.body.className = `theme-${savedTheme}`;
  themeSelect.value = savedTheme;
}

themeSelect.addEventListener("change", (e) => {
  const newTheme = e.target.value;
  document.body.className = `theme-${newTheme}`;
  localStorage.setItem(THEME_KEY, newTheme);
});

/* =============================================
   PER-USER TURSO CLOUD DB STORAGE & MIGRATION
   ============================================= */

// Common headers for user-isolated API requests
function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-user-id': userId
  };
}

// Load notes for THIS USER ONLY from Turso Cloud
async function loadNotes() {
  setSaveStatus("saving");

  // Step 1: Migration check for existing local notes for this user
  const hasMigrated = localStorage.getItem(MIGRATION_KEY);
  if (!hasMigrated) {
    try {
      const localRaw = localStorage.getItem(DB_KEY);
      const localNotes = localRaw ? JSON.parse(localRaw) : [];
      
      if (localNotes.length > 0) {
        console.log(`🔒 Migrating ${localNotes.length} local notes securely under User ID: ${userId}`);
        await fetch('/api/notes', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(localNotes)
        });
        console.log('✅ Notes successfully migrated under private user storage!');
      }
      localStorage.setItem(MIGRATION_KEY, "true");
    } catch (err) {
      console.warn('Migration warning:', err);
    }
  }

  // Step 2: Fetch notes scoped to current userId
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

// Save single note to user's Turso Cloud account
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

// Delete note from user's Turso Cloud account
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
  if (!note) {
    emptyState.style.display = "flex";
    editorPanel.style.display = "none";
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
   INIT
   ============================================= */
loadTheme();
loadNotes();
