# ✦ Noteflow — Notes App

A beautiful, dark-themed notes web app with Create, Edit, Delete, Search, Tags, Themes, and Checklists. Built with pure HTML + CSS + JS using browser localStorage for persistence. Served via a lightweight Node.js + Express server.

---

## 📁 Project Structure

```
notes-app/
├── server.js          ← Node.js Express server (entry point, port 3000)
├── package.json       ← Dependencies & start script
├── README.md          ← This file
└── public/
    ├── index.html     ← Main HTML (sidebar + editor + modal)
    ├── style.css      ← All styling (theming, responsive, animations)
    └── app.js         ← All app logic (CRUD, search, tags, themes, checklists)
```

---

## 💻 Run Locally

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# 3. Open in browser
http://localhost:3000
```

---

## ✨ Features

- ✅ **Create, edit, delete notes** — auto-saves as you type
- ✅ **Rich text editor** — contenteditable div with HTML support
- ✅ **Checklists** — add interactive checkboxes inside notes
- ✅ **Search** — filter notes by title, content, or tag
- ✅ **Tags** — assign comma-separated tags, filter by tag pills in the sidebar
- ✅ **3 Themes** — Dark, Light, and Ocean (persisted in localStorage)
- ✅ **Keyboard shortcut** — `Ctrl/Cmd + N` to create a new note, `Esc` to dismiss modals
- ✅ **Delete confirmation modal** — with backdrop blur animation
- ✅ **Responsive design** — collapsible sidebar with mobile hamburger toggle
- ✅ **All data stored in browser localStorage** — no database or backend storage needed

---

## 🎨 Design Highlights

| Detail              | Implementation                                      |
|---------------------|-----------------------------------------------------|
| Typography          | Playfair Display (headings) + DM Sans (body) via Google Fonts |
| Theming             | CSS custom properties swapped per `body.theme-*` class |
| Animations          | Logo pulse, modal scale-in, hover transitions       |
| Scrollbar           | Custom thin scrollbar styling (WebKit + Firefox)    |
| Active note accent  | Left-border accent strip on the selected note card  |

---

## 🎛 Tech Stack

| Layer      | Tech                          |
|------------|-------------------------------|
| Frontend   | HTML5, CSS3, Vanilla JS       |
| Editor     | `contenteditable` div (HTML)  |
| Storage    | localStorage (browser)        |
| Server     | Node.js ≥ 16 + Express 4     |
| Fonts      | Google Fonts (Playfair Display + DM Sans) |

---

## ⌨️ Keyboard Shortcuts

| Shortcut          | Action            |
|-------------------|--------------------|
| `Ctrl/Cmd + N`   | Create a new note  |
| `Escape`          | Close delete modal |
