# ✦ Noteflow — Notes App

A beautiful, dark-themed notes web app with Create, Edit, Delete, Search, and Tags. Built with pure HTML + CSS + JS (localStorage). Served via a lightweight Node.js + Express server for deployment.

---

## 📁 File Structure

```
notes-app/
├── server.js          ← Node.js Express server (entry point)
├── package.json       ← Dependencies & start script
├── README.md          ← This file
└── public/
    ├── index.html     ← Main HTML
    ├── style.css      ← All styling
    └── app.js         ← All app logic
```

---

## 🚀 Deploy to Railway

1. Go to [https://railway.app](https://railway.app) and sign in (GitHub login recommended)
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Push your project to a GitHub repository first:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/notes-app.git
   git push -u origin main
   ```
4. Select your repo in Railway
5. Railway auto-detects Node.js and runs `npm start`
6. Click **"Generate Domain"** under Settings → your app is live! ✅

---

## 🚀 Deploy to Render

1. Go to [https://render.com](https://render.com) and sign in
2. Click **"New"** → **"Web Service"**
3. Connect your GitHub repo
4. Set these values:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** `Node`
5. Click **"Create Web Service"** → Render deploys and gives you a URL ✅

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

- ✅ Create, edit, delete notes (auto-saves as you type)
- ✅ Search notes by title, content, or tag
- ✅ Tag notes with custom labels — filter by tag
- ✅ Keyboard shortcut: `Ctrl/Cmd + N` to create a new note
- ✅ Responsive design — works on mobile too
- ✅ All data stored in browser localStorage (no database needed)

---

## 🎨 Tech Stack

| Layer      | Tech                    |
|------------|-------------------------|
| Frontend   | HTML5, CSS3, Vanilla JS |
| Storage    | localStorage (browser)  |
| Server     | Node.js + Express       |
| Fonts      | Google Fonts (Playfair Display + DM Sans) |
