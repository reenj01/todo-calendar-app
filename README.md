# Notes & Calendar App

A cross-platform todo + calendar application built with React. Manage your notes, organize them into folders, and schedule tasks on an interactive calendar—all synced across your phone and desktop.

**Live Demo**: [https://todo-calendar-d30dc.web.app](https://todo-calendar-d30dc.web.app)

## Features

✨ **Dual View**
- **Todo tab**: Organize notes by folders with custom colors
- **Calendar tab**: Weekly and monthly calendar views with hourly scheduling

📝 **Note Management**
- Create, edit, and delete notes
- Organize notes into color-coded folders
- Pin important notes to keep them at the top
- Mark notes as done
- Search across all notes
- Full-text support in titles and descriptions

📅 **Scheduling**
- Drag unscheduled notes onto the calendar to set a time
- Create recurring or one-time scheduled events
- View notes by week or month
- Mini calendar navigation

🔄 **Cross-Device Sync**
- Data synced in real-time via Firebase Firestore
- Access the same notes on phone, tablet, and desktop
- Cloud backup of all your data

📱 **Progressive Web App (PWA)**
- Install as a native app on any device
- Works offline (with local storage fallback)
- No app store required

🗑️ **Trash Management**
- Soft-delete notes to trash
- Permanently clear trash when ready

## Tech Stack

- **Frontend**: React 18 (CDN-based, no build step)
- **Backend**: Firebase (Firestore, Auth, Hosting)
- **PWA**: Service Worker, Web App Manifest
- **Styling**: CSS (custom, no framework)

## Quick Start

### Installation

1. **Clone the repo**
   ```bash
   git clone https://github.com/yourusername/claude-todo-app.git
   cd claude-todo-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Firebase** (optional—comes pre-configured)
   - The app includes Firebase credentials for the demo project
   - To use your own Firebase project:
     - Create a new Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
     - Update the `firebaseConfig` in `public/index.html` with your credentials

### Local Development

Since this is a CDN-based React app, you can open `public/index.html` directly in your browser for development.

For live-reloading during development, use a local server:
```bash
npx http-server public
```
Then visit `http://localhost:8080`

### Deployment

Deploy to Firebase Hosting (free):

```bash
firebase deploy
```

Your app will be live at: `https://your-project.web.app`

#### Deploy to other platforms:
- **Netlify**: Drag & drop the `public/` folder
- **GitHub Pages**: Push to `gh-pages` branch
- **Vercel**: Connect your repo and auto-deploy

## Usage

### Access the App

**On Desktop/Web**:
- Open the live URL in your browser
- Click the install icon in the address bar (or menu → Install app)
- App appears in your start menu / desktop

**On Mobile**:
- Visit the same URL on your phone
- Tap menu → "Add to Home Screen"
- App appears on your home screen

### Create a Note
1. Go to the **Todo** tab
2. Click **+ New note**
3. Enter a title, select a folder, and add details
4. Save

### Schedule a Task
1. Go to the **Calendar** tab
2. Find an unscheduled note in the left rail
3. Drag it onto the hourly grid to set time and date
4. Release to schedule

### Organize with Folders
1. Create custom folders (e.g., Work, School, Personal)
2. Assign colors to each folder for quick visual identification
3. Drag notes between folders to organize

### Pin Important Notes
- Click the pin icon on any note to pin it to the top
- Pinned notes always appear first in the list

## Project Structure

```
claude-todo-app/
├── public/
│   ├── index.html          # Main HTML file with Firebase config
│   ├── app.jsx             # Main React component (2270 lines)
│   ├── styles.css          # All styling
│   ├── manifest.json       # PWA manifest for app installation
│   ├── sw.js               # Service worker for offline support
│   ├── icon.svg            # App icon
│   └── 404.html            # Custom 404 page (Firebase Hosting)
├── package.json            # Dependencies (firebase-tools)
├── package-lock.json
├── firebase.json           # Firebase Hosting config
├── firestore.rules         # Firestore security rules
├── firestore.indexes.json  # Firestore index definitions
└── README.md               # This file
```

## Data Model

### Notes
```json
{
  "id": "n-abc123",
  "folderId": "f-work",
  "title": "Meeting with team",
  "body": "Discuss Q2 roadmap",
  "pinned": false,
  "done": false,
  "scheduled": {
    "day": "2026-04-30",
    "startMin": 540,
    "endMin": 600
  }
}
```

### Folders
```json
{
  "id": "f-work",
  "name": "Work",
  "color": "#f87171",
  "expanded": true,
  "pinned": false
}
```

### Trash
Deleted notes are moved to trash with metadata:
```json
{
  "type": "note",
  "id": "n-abc123",
  "note": { /* full note object */ }
}
```

## Features Deep Dive

### Offline Support
- Service worker caches the app shell and assets
- Local storage backs up your notes if offline
- Changes sync to Firebase when reconnected

### Calendar Views
- **Weekly**: See 7 days with hourly grid (36px per hour)
- **Monthly**: Overview of the entire month with mini calendar

### Search
- Real-time search across note titles and bodies
- Filters results as you type

### Responsive Design
- Mobile-first design works on phones, tablets, and desktops
- Touch-friendly on mobile, keyboard-navigable on desktop

## Firebase Setup

### Authentication
- Currently uses anonymous auth (anyone can access the shared project)
- To add login: Modify `app.jsx` to require `auth.currentUser`

### Firestore Rules
The app uses basic Firestore rules (see `firestore.rules`):
- Read/write allowed for demonstration
- For production, restrict to authenticated users only

### Indexes
Custom indexes defined in `firestore.indexes.json` for optimized queries

## Customization

### Change App Title
Edit `public/index.html`:
```html
<title>My Notes & Calendar</title>
```

### Change Colors
Edit `DEFAULT_FOLDER_COLORS` in `public/app.jsx` (line 13)

### Customize App Icon
Replace `public/icon.svg` and update the manifest in `public/manifest.json`

## Troubleshooting

**App won't install on phone**
- Make sure you're accessing via HTTPS (Firebase Hosting uses HTTPS by default)
- Check that `manifest.json` is being loaded (open DevTools → Console)

**Data not syncing**
- Check your Firebase connection in DevTools → Network
- Verify Firebase credentials in `public/index.html`
- Ensure Firestore rules allow read/write access

**Offline mode not working**
- Check that service worker is registered (DevTools → Application → Service Workers)
- Clear browser cache and hard-refresh

## Performance

- App size: ~95KB minified (React + Firebase CDN)
- Service worker handles offline caching
- Firestore queries are optimized with indexes

## Privacy & Security

⚠️ **Important**: This project comes with demo Firebase credentials. For a personal project:
- The credentials are visible in `public/index.html` (this is fine for CDN-based apps)
- Add authentication if you want to restrict access to only yourself
- Review Firestore rules before using in production

## Future Enhancements

- [ ] Rich text editing (bold, italic, links)
- [ ] Photo attachments
- [ ] Voice notes
- [ ] Recurring tasks
- [ ] Notifications
- [ ] Dark mode
- [ ] Export to PDF/ICS
- [ ] Keyboard shortcuts

## License

MIT — Feel free to fork, modify, and use this project however you like.

## Contributing

This is a personal project, but if you find bugs or have suggestions, feel free to open an issue or PR!

---

**Built with ❤️ using React + Firebase**
