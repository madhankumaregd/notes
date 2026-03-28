/* =============================================
   NOTEFLOW — APP.JS
   Features: Create, Edit, Delete, Search, Tags
   Storage: localStorage (no backend needed)
   ============================================= */

const DB_KEY = 'noteflow_notes';
let notes = [];
let activeNoteId = null;
let activeTag = 'all';
let saveTimeout = null;

/* ---- DOM REFS ---- */
const notesList       = document.getElementById('notesList');
const tagsFilter      = document.getElementById('tagsFilter');
const searchInput     = document.getElementById('searchInput');
const emptyState      = document.getElementById('emptyState');
const editorPanel     = document.getElementById('editorPanel');
const noteTitleInput  = document.getElementById('noteTitleInput');
const tagInput        = document.getElementById('tagInput');
const noteContent     = document.getElementById('noteContent');
const saveStatus      = document.getElementById('saveStatus');
const deleteNoteBtn   = document.getElementById('deleteNoteBtn');
const modalOverlay    = document.getElementById('modalOverlay');
const cancelDelete    = document.getElementById('cancelDelete');
const confirmDelete   = document.getElementById('confirmDelete');
const newNoteBtn      = document.getElementById('newNoteBtn');
const newNoteBtnLg    = document.getElementById('newNoteBtnLg');
const mobileToggle    = document.getElementById('mobileToggle');
const sidebar         = document.getElementById('sidebar');

/* =============================================
   STORAGE
   ============================================= */
function loadNotes() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    notes = raw ? JSON.parse(raw) : [];
  } catch {
    notes = [];
  }
}

function saveNotes() {
  localStorage.setItem(DB_KEY, JSON.stringify(notes));
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
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function parseTags(str) {
  return str.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
}

function getFilteredNotes() {
  const q = searchInput.value.trim().toLowerCase();
  return notes.filter(note => {
    const matchesTag = activeTag === 'all' || note.tags.includes(activeTag);
    const matchesSearch = !q ||
      note.title.toLowerCase().includes(q) ||
      note.content.toLowerCase().includes(q) ||
      note.tags.some(t => t.includes(q));
    return matchesTag && matchesSearch;
  }).sort((a, b) => b.updatedAt - a.updatedAt);
}

function getAllTags() {
  const tagSet = new Set();
  notes.forEach(n => n.tags.forEach(t => tagSet.add(t)));
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
  tagsFilter.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = 'tag-pill' + (activeTag === 'all' ? ' active' : '');
  allBtn.dataset.tag = 'all';
  allBtn.textContent = 'All';
  allBtn.addEventListener('click', () => { activeTag = 'all'; render(); });
  tagsFilter.appendChild(allBtn);

  allTags.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'tag-pill' + (activeTag === tag ? ' active' : '');
    btn.dataset.tag = tag;
    btn.textContent = tag;
    btn.addEventListener('click', () => { activeTag = tag; render(); });
    tagsFilter.appendChild(btn);
  });
}

function renderNotesList() {
  const filtered = getFilteredNotes();
  notesList.innerHTML = '';

  if (filtered.length === 0) {
    notesList.innerHTML = `<div class="no-notes-msg">
      ${searchInput.value ? 'No notes match your search.' : 'No notes yet.<br/>Create your first one!'}
    </div>`;
    return;
  }

  filtered.forEach(note => {
    const card = document.createElement('div');
    card.className = 'note-card' + (note.id === activeNoteId ? ' active' : '');
    card.dataset.id = note.id;

    const tagsHtml = note.tags.map(t =>
      `<span class="note-tag-badge">${t}</span>`
    ).join('');

    card.innerHTML = `
      <div class="note-card-title">${escapeHtml(note.title) || 'Untitled'}</div>
      <div class="note-card-preview">${escapeHtml(note.content) || 'No content yet...'}</div>
      <div class="note-card-meta">
        <span class="note-card-date">${formatDate(note.updatedAt)}</span>
        <div class="note-card-tags">${tagsHtml}</div>
      </div>
    `;

    card.addEventListener('click', () => openNote(note.id));
    notesList.appendChild(card);
  });
}

function renderEditor() {
  const note = notes.find(n => n.id === activeNoteId);
  if (!note) {
    emptyState.style.display = 'flex';
    editorPanel.style.display = 'none';
    return;
  }
  emptyState.style.display = 'none';
  editorPanel.style.display = 'flex';
  noteTitleInput.value = note.title;
  tagInput.value = note.tags.join(', ');
  noteContent.value = note.content;
  setSaveStatus('saved');
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function setSaveStatus(state) {
  if (state === 'saving') {
    saveStatus.textContent = 'Saving...';
    saveStatus.className = 'save-status saving';
  } else {
    saveStatus.textContent = 'Saved';
    saveStatus.className = 'save-status saved';
  }
}

/* =============================================
   ACTIONS
   ============================================= */
function createNote() {
  const note = {
    id: generateId(),
    title: '',
    content: '',
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  notes.unshift(note);
  saveNotes();
  activeNoteId = note.id;
  render();
  noteTitleInput.focus();

  // Close sidebar on mobile after creating note
  if (window.innerWidth <= 768) sidebar.classList.remove('open');
}

function openNote(id) {
  activeNoteId = id;
  render();
  if (window.innerWidth <= 768) sidebar.classList.remove('open');
}

function autoSave() {
  const note = notes.find(n => n.id === activeNoteId);
  if (!note) return;
  setSaveStatus('saving');
  note.title = noteTitleInput.value;
  note.content = noteContent.value;
  note.tags = parseTags(tagInput.value);
  note.updatedAt = Date.now();
  saveNotes();
  renderNotesList();
  renderTagsFilter();
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => setSaveStatus('saved'), 600);
}

function deleteActiveNote() {
  notes = notes.filter(n => n.id !== activeNoteId);
  saveNotes();
  activeNoteId = notes.length > 0 ? notes[0].id : null;
  modalOverlay.classList.remove('open');
  render();
}

/* =============================================
   EVENT LISTENERS
   ============================================= */
newNoteBtn.addEventListener('click', createNote);
newNoteBtnLg.addEventListener('click', createNote);

noteTitleInput.addEventListener('input', autoSave);
noteContent.addEventListener('input', autoSave);
tagInput.addEventListener('input', autoSave);

searchInput.addEventListener('input', () => renderNotesList());

deleteNoteBtn.addEventListener('click', () => modalOverlay.classList.add('open'));
cancelDelete.addEventListener('click', () => modalOverlay.classList.remove('open'));
confirmDelete.addEventListener('click', deleteActiveNote);

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) modalOverlay.classList.remove('open');
});

mobileToggle.addEventListener('click', () => sidebar.classList.toggle('open'));

// Keyboard shortcut: Ctrl/Cmd + N = New note
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    createNote();
  }
  if (e.key === 'Escape') {
    modalOverlay.classList.remove('open');
  }
});

/* =============================================
   INIT
   ============================================= */
loadNotes();
render();
