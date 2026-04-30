// Todo + Calendar app (v2) — based on the Figma "ver-2" designs.
// Two tabs (Todo / Calendar) sharing the same notes. Notes that haven't been
// scheduled appear in the Calendar's left rail and can be dragged onto the
// hourly grid; once placed, they hide from the rail.

const { useState, useEffect, useMemo, useRef, useCallback } = React;

// ──────────────────────────────────────────────────────────────────────
// Constants & storage
// ──────────────────────────────────────────────────────────────────────
const STORAGE_KEY = "todo_calendar_v2_state";

const DEFAULT_FOLDER_COLORS = [
  "#b571f8", // school purple (matches figma 181,113,248)
  "#f87171", // work red    (matches figma 248,113,113)
  "#71a0f8", // todo blue   (matches figma 113,160,248)
  "#34d399", // green
  "#fbbf24", // amber
  "#f472b6", // pink
  "#94a3b8", // slate
];

const HOURS = [
  "12 AM","1 AM","2 AM","3 AM","4 AM","5 AM","6 AM","7 AM","8 AM","9 AM","10 AM","11 AM",
  "12 PM","1 PM","2 PM","3 PM","4 PM","5 PM","6 PM","7 PM","8 PM","9 PM","10 PM","11 PM",
];
const HOUR_HEIGHT = 36; // px per hour in the calendar grid

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function createNote({ folderId = null, title = "New note", body = "", scheduled = null } = {}) {
  return {
    id: createId("n"),
    folderId,
    title,
    body,
    pinned: false,
    done: false,
    scheduled,
  };
}

function withHexAlpha(color, alphaHex) {
  if (typeof color !== "string") return color;
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color + alphaHex;
  return color;
}

function previewBody(body) {
  if (!body) return "";
  const flat = String(body).replace(/\s+/g, " ").trim();
  if (flat.length <= 48) return flat;
  return flat.slice(0, 48).replace(/[,;:.\-]+$/, "") + "\u2026";
}

const DAY_NAMES_SHORT = ["Sun","Mon","Tues","Wed","Thurs","Fri","Sat"];
const DAY_NAMES_LONG  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ──────────────────────────────────────────────────────────────────────
// Date helpers
// ──────────────────────────────────────────────────────────────────────
function startOfWeek(d) {
  const x = new Date(d);
  x.setHours(0,0,0,0);
  // Week starts Sunday (Sun ... Sat)
  const day = x.getDay(); // sun=0
  x.setDate(x.getDate() - day);
  return x;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function sameDay(a, b) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function fromDateKey(k) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m-1, d);
}
function fmtMonth(d) { return d.toLocaleString(undefined, { month: "short" }); }
function fmtRangeFromMinutes(s, e) {
  const sH = Math.floor(s/60), sM = s%60;
  const eH = Math.floor(e/60), eM = e%60;
  const sP = sH>=12 ? "PM":"AM"; const eP = eH>=12 ? "PM":"AM";
  const sH12 = ((sH+11)%12)+1; const eH12 = ((eH+11)%12)+1;
  const sStr = sM===0 ? `${sH12}` : `${sH12}:${String(sM).padStart(2,"0")}`;
  const eStr = eM===0 ? `${eH12}` : `${eH12}:${String(eM).padStart(2,"0")}`;
  if (sP === eP) return `${sStr} - ${eStr} ${eP}`;
  return `${sStr} ${sP} - ${eStr} ${eP}`;
}

// ──────────────────────────────────────────────────────────────────────
// Default seed data — mirrors the figma exactly
// ──────────────────────────────────────────────────────────────────────
function seedData() {
  // Anchor "CH 1" relative to today's week so the prototype always shows it
  const today = new Date();
  const weekStart = startOfWeek(today);
  const tuesKey = dateKey(addDays(weekStart, 2)); // Tues = sun+2

  return {
    folders: [
      { id: "f-school",  name: "School", color: "#b571f8", expanded: false, pinned: false },
      { id: "f-work",    name: "Work",   color: "#f87171", expanded: false, pinned: false },
      { id: "f-todo",    name: "To Do",  color: "#71a0f8", expanded: true,  pinned: false },
    ],
    notes: [
      { id: "n-note1",  folderId: null,       title: "Note 1",     body: "", pinned: true,  done: false, scheduled: null },
      { id: "n-write",  folderId: "f-todo",   title: "Write email",body: "email kacy the pdfs doc", pinned: false, done: false, scheduled: null },
      { id: "n-read1",  folderId: "f-school", title: "Reading 1",  body: "", pinned: false, done: false, scheduled: null },
      { id: "n-ch1",    folderId: "f-school", title: "CH 1",       body: "", pinned: false, done: false,
        scheduled: { day: tuesKey, startMin: 9*60, endMin: 11*60+40 } },
    ],
    trash: [], // deleted notes live here until permanently cleared
    activeNoteId: "n-write",
    tab: "todo",
    weekAnchor: dateKey(today),     // any date inside the week we're viewing
    monthAnchor: dateKey(today),    // mini-cal anchor / month view anchor
    selectedDate: dateKey(today),   // specific date highlighted in mini-cal
    calendarMode: "weekly",          // weekly | monthly
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedData();
    const parsed = JSON.parse(raw);
    // Soft validation
    if (!parsed.folders || !parsed.notes) return seedData();
    const rawTrash = Array.isArray(parsed.trash) ? parsed.trash : [];
    const normalizedTrash = rawTrash.map((t) => {
      // v1 trash: stored raw note objects with deletedAt
      if (t && !t.type && t.id && (t.title !== undefined || t.body !== undefined)) {
        return { type: "note", id: t.id, note: t };
      }
      // v2 trash: { type, id, ... }
      if (t && t.type && t.id) return t;
      return null;
    }).filter(Boolean);
    return { ...parsed, trash: normalizedTrash };
  } catch {
    return seedData();
  }
}

// ──────────────────────────────────────────────────────────────────────
// Reusable icons (stroked, mac-app aesthetic — matches figma feel)
// ──────────────────────────────────────────────────────────────────────
const Icon = {
  Calendar: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5"/>
      <path d="M3.5 9.5h17"/>
      <path d="M8 3v4M16 3v4"/>
    </svg>
  ),
  Notepad: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 19.5V6.5a2 2 0 0 1 2-2h9l5 5v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>
      <path d="M14 4.5v5h5"/>
      <path d="M8 13h6M8 16.5h4"/>
    </svg>
  ),
  Search: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="11" cy="11" r="6.5"/>
      <path d="M20 20l-3.6-3.6"/>
    </svg>
  ),
  Mic: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 0 0-7 0v5a3.5 3.5 0 0 0 3.5 3.5z"/>
      <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" d="M5.5 11A6.5 6.5 0 0 0 18.5 11M12 17.5V21M9 21h6"/>
    </svg>
  ),
  Pin: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M9 4h6M10 4v6l-3 3h10l-3-3V4M12 13v7"/>
    </svg>
  ),
  Folder: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M3.5 7.2a1.7 1.7 0 0 1 1.7-1.7h4.6c.45 0 .88.18 1.2.5l1.5 1.5h7.8a1.7 1.7 0 0 1 1.7 1.7v8.6a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7V7.2z"/>
    </svg>
  ),
  FolderOutline: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3.5 7.2a1.7 1.7 0 0 1 1.7-1.7h4.6c.45 0 .88.18 1.2.5l1.5 1.5h7.8a1.7 1.7 0 0 1 1.7 1.7v8.6a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7V7.2z"/>
    </svg>
  ),
  Plus: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" {...p}>
      <path d="M12 5v14M5 12h14"/>
    </svg>
  ),
  Trash: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 12.5a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8L18 7M10 11v6M14 11v6"/>
    </svg>
  ),
  Edit: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"/>
      <path d="M14.5 6l3 3"/>
    </svg>
  ),
  ChevLeft: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M14 6l-6 6 6 6"/>
    </svg>
  ),
  ChevRight: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M10 6l6 6-6 6"/>
    </svg>
  ),
  ChevDown: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M6 10l6 6 6-6"/>
    </svg>
  ),
};

// ──────────────────────────────────────────────────────────────────────
// Top toolbar (shared between tabs)
// ──────────────────────────────────────────────────────────────────────
function Toolbar({ tab, setTab, search, setSearch, user, onSignOut }) {
  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <button
          className={"tab-btn " + (tab === "todo" ? "active" : "")}
          onClick={() => setTab("todo")}
          title="Notes"
          aria-label="Notes"
        >
          <Icon.Notepad width="20" height="20"/>
        </button>
        <button
          className={"tab-btn " + (tab === "calendar" ? "active" : "")}
          onClick={() => setTab("calendar")}
          title="Calendar"
          aria-label="Calendar"
        >
          <Icon.Calendar width="20" height="20"/>
        </button>
      </div>

      <div className="toolbar-right">
        {user && (
          <div className="account-chip" title={user.email || "Signed in"}>
            <span className="account-email">{user.email || "Signed in"}</span>
            <button className="signout-btn" type="button" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        )}
        <div className="search-box">
          <Icon.Search width="14" height="14" className="search-icon" />
          <input
            placeholder="Search"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <Icon.Mic width="16" height="16" className="mic-icon" />
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// TODO TAB
// ──────────────────────────────────────────────────────────────────────
function TodoView({ state, setState, search, togglePinActive, onOpenTrash }) {
  const { folders, notes, activeNoteId } = state;
  const activeNote = notes.find(n => n.id === activeNoteId) || null;

  // Drag-and-drop indicator state for the sidebar
  // { draggingId, target: { type: 'before'|'after'|'into-folder', refId, folderId } | null }
  const [dragInfo, setDragInfo] = useState({ draggingId: null, target: null });

  const targetsEqual = (a, b) => {
    if (a === b) return true;
    if (!a || !b) return false;
    return a.type === b.type
      && (a.folderId || null) === (b.folderId || null)
      && (a.refId || null) === (b.refId || null);
  };

  const commitDrop = () => {
    const { draggingId, target } = dragInfo;
    setDragInfo({ draggingId: null, target: null });
    if (!draggingId || !target) return;
    if (target.type === "into-folder") {
      // Drop directly onto a (collapsed) folder header — append at end of that folder
      reorderNote(draggingId, target.folderId, null);
    } else if (target.type === "before") {
      reorderNote(draggingId, target.folderId, target.refId);
    } else if (target.type === "after") {
      // find the note after refId in the same folder
      const folderNotes = notes.filter(n => (n.folderId || null) === target.folderId && !n.pinned);
      const idx = folderNotes.findIndex(n => n.id === target.refId);
      const nextNote = folderNotes[idx + 1];
      reorderNote(draggingId, target.folderId, nextNote ? nextNote.id : null);
    }
  };

  // ── filtering by search
  const filterMatches = (n) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (n.title||"").toLowerCase().includes(q) || (n.body||"").toLowerCase().includes(q);
  };

  const pinnedNotes = notes.filter(n => n.pinned && filterMatches(n));
  const unfiledNotes = notes.filter(n => !n.folderId && !n.pinned && filterMatches(n));
  const notesByFolder = (fid) => notes.filter(n => n.folderId === fid && !n.pinned && filterMatches(n));

  // ── mutators
  const updateNote = (id, patch) => {
    setState(s => ({ ...s, notes: s.notes.map(n => n.id === id ? { ...n, ...patch } : n) }));
  };

  // Move a note to (folderId), inserting before beforeNoteId — or at end of that folder's group if null.
  const reorderNote = (noteId, folderId, beforeNoteId) => {
    setState(s => {
      const moving = s.notes.find(n => n.id === noteId);
      if (!moving) return s;
      const updated = { ...moving, folderId };
      const without = s.notes.filter(n => n.id !== noteId);
      let idx;
      if (beforeNoteId) {
        idx = without.findIndex(n => n.id === beforeNoteId);
        if (idx < 0) idx = without.length;
      } else {
        // Insert at end of the target folder's last note in array
        let lastIdx = -1;
        without.forEach((n, i) => { if (n.folderId === folderId) lastIdx = i; });
        idx = lastIdx + 1;
        if (idx === 0) idx = without.length; // empty folder => append
      }
      const next = [...without.slice(0, idx), updated, ...without.slice(idx)];
      return {
        ...s,
        notes: next,
        folders: folderId ? s.folders.map(f => f.id === folderId ? { ...f, expanded: true } : f) : s.folders,
      };
    });
  };
  const updateFolder = (id, patch) => {
    setState(s => ({ ...s, folders: s.folders.map(f => f.id === id ? { ...f, ...patch } : f) }));
  };
  const toggleNoteDone = (id) => {
    setState(s => ({ ...s, notes: s.notes.map(n => n.id === id ? { ...n, done: !n.done } : n) }));
  };
  const setActive = (id) => setState(s => ({ ...s, activeNoteId: id }));

  const addFolder = () => {
    const id = createId("f");
    const used = folders.map(f => f.color);
    const color = DEFAULT_FOLDER_COLORS.find(c => !used.includes(c)) || DEFAULT_FOLDER_COLORS[0];
    setState(s => ({
      ...s,
      folders: [...s.folders, { id, name: "New Folder", color, expanded: true, pinned: false }],
    }));
  };

  const moveFolderToTrash = (fid) => {
    setState(s => {
      const folder = s.folders.find(f => f.id === fid);
      if (!folder) return s;
      const folderNotes = s.notes.filter(n => n.folderId === fid);
      const remainingFolders = s.folders.filter(f => f.id !== fid);
      const remainingNotes = s.notes.filter(n => n.folderId !== fid);
      const nextActive = folderNotes.some(n => n.id === s.activeNoteId)
        ? (remainingNotes[0]?.id || null)
        : s.activeNoteId;
      const trashItem = {
        type: "folder",
        id: folder.id,
        folder: { ...folder },
        notes: folderNotes.map(n => ({ ...n })),
        deletedAt: Date.now(),
      };
      return {
        ...s,
        folders: remainingFolders,
        notes: remainingNotes,
        activeNoteId: nextActive,
        trash: [...(s.trash || []), trashItem],
      };
    });
  };

  const moveNoteToTrash = (id) => {
    setState(s => {
      const n = s.notes.find(x => x.id === id);
      if (!n) return s;
      const remaining = s.notes.filter(x => x.id !== id);
      const nextActive = s.activeNoteId === id ? (remaining[0]?.id || null) : s.activeNoteId;
      const trashed = { type: "note", id: n.id, note: { ...n, deletedAt: Date.now() } };
      return { ...s, notes: remaining, activeNoteId: nextActive, trash: [...(s.trash || []), trashed] };
    });
  };

  const requestDeleteNote = (id) => {
    moveNoteToTrash(id);
  };

  const requestDeleteFolder = (fid) => {
    moveFolderToTrash(fid);
  };

  const addUnfiledNote = () => {
    const note = createNote();
    setState(s => ({
      ...s,
      notes: [note, ...s.notes],
      activeNoteId: note.id,
    }));
  };

  const addNoteInFolder = (fid) => {
    const note = createNote({ folderId: fid });
    setState(s => ({
      ...s,
      notes: [...s.notes, note],
      activeNoteId: note.id,
      folders: s.folders.map(f => f.id === fid ? { ...f, expanded: true } : f),
    }));
  };

  return (
    <div className="todo-layout">
      {/* sidebar */}
      <aside className="todo-sidebar">
        {/* pinned section */}
        <div className="sidebar-section">
          <div className="sidebar-header">
            <Icon.Pin width="14" height="14"/>
            <span>Pinned</span>
          </div>
          {pinnedNotes.map(n => (
            <NoteRow key={n.id} note={n} active={n.id === activeNoteId}
              onDelete={() => requestDeleteNote(n.id)}
              onClick={() => setActive(n.id)}
              onRename={(t) => updateNote(n.id, { title: t })}
              dragInfo={dragInfo}
              setDragInfo={setDragInfo}
              commitDrop={commitDrop}
              folderId={n.folderId || null}
              pinnedFolderColor={(folders.find(f => f.id === n.folderId)?.color) || null}
            />
          ))}
          {pinnedNotes.length === 0 && <div className="empty-hint">No pinned notes</div>}
        </div>

        <div className="sidebar-divider"/>

        {/* All Notes header with inline + (add note unfiled) */}
        <div className="sidebar-section">
          <div
            className="sidebar-header subtle all-notes-head"
            onDragOver={(e) => {
              e.preventDefault();
              // Treat hovering on header as "drop into All Notes (top of unfiled list)"
              const nextTarget = { type: "before", folderId: null, refId: (unfiledNotes[0] && unfiledNotes[0].id) || null };
              if (!targetsEqual(dragInfo?.target, nextTarget)) {
                setDragInfo(d => ({ ...d, target: nextTarget }));
              }
            }}
            onDragLeave={(e) => {}}
            onDrop={(e) => { e.preventDefault(); commitDrop(); }}
          >
            <span>All Notes</span>
            <button className="head-action" onClick={addUnfiledNote} title="New note">
              <Icon.Plus width="13" height="13"/>
            </button>
          </div>
          {/* New Folder lives directly under ‘All Notes’ */}
          <button className="add-folder-btn-top" onClick={addFolder}>
            <Icon.Plus width="13" height="13"/> New Folder
          </button>
          {unfiledNotes.map(n => (
            <NoteRow key={n.id} note={n} active={n.id === activeNoteId}
              onClick={() => setActive(n.id)}
              onRename={(t) => updateNote(n.id, { title: t })}
              onDelete={() => requestDeleteNote(n.id)}
              dragInfo={dragInfo}
              setDragInfo={setDragInfo}
              commitDrop={commitDrop}
              folderId={null}
            />
          ))}
        </div>

        {/* folders */}
        <div className="sidebar-section">
          {folders.map(f => (
            <FolderRow key={f.id} folder={f}
              notes={notesByFolder(f.id)}
              activeNoteId={activeNoteId}
              onToggleExpand={() => updateFolder(f.id, { expanded: !f.expanded })}
              onRename={(name) => updateFolder(f.id, { name })}
              onColor={(color) => updateFolder(f.id, { color })}
              onDelete={() => requestDeleteFolder(f.id)}
              onAddNote={() => addNoteInFolder(f.id)}
              onSelectNote={setActive}
              onRenameNote={(id, t) => updateNote(id, { title: t })}
              onDeleteNote={(id) => requestDeleteNote(id)}
              dragInfo={dragInfo}
              setDragInfo={setDragInfo}
              commitDrop={commitDrop}
            />
          ))}
        </div>

        <div className="left-rail-footer">
          <button
            className="trash-fab"
            title="Trash"
            aria-label="Trash"
            onClick={onOpenTrash}
          >
            <Icon.Trash width="18" height="18" />
            {state.trash?.length ? <span className="trash-badge">{state.trash.length}</span> : null}
          </button>
        </div>
      </aside>

      {/* divider */}
      <div className="vertical-divider" />

      {/* note editor */}
      <main className="note-editor">
        {activeNote ? (
          <NoteEditor
            note={activeNote}
            folder={folders.find(f => f.id === activeNote.folderId)}
            onChange={(patch) => updateNote(activeNote.id, patch)}
            onTogglePin={togglePinActive}
          />
        ) : (
          <div className="editor-empty">Select a note to edit, or create a new one.</div>
        )}
      </main>
    </div>
  );
}

function NoteRow({ note, active, onClick, onRename, onDelete, dragInfo, setDragInfo, commitDrop, folderId, pinnedFolderColor }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(note.title);
  useEffect(() => setVal(note.title), [note.title]);

  const commit = () => { setEditing(false); if (val !== note.title) onRename(val); };

  const displayTitle = note.title.trim() || "Untitled";
  const isUntitled = !note.title.trim();
  const showDropTop = !!dragInfo?.target
    && dragInfo.target.type === "before"
    && dragInfo.target.refId === note.id
    && (dragInfo.target.folderId || null) === (folderId || null);
  const showDropBottom = !!dragInfo?.target
    && dragInfo.target.type === "after"
    && dragInfo.target.refId === note.id
    && (dragInfo.target.folderId || null) === (folderId || null);

  return (
    <div className={"note-row " + (active ? "active " : "")}
         onClick={() => !editing && onClick()}
         onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
         draggable={!editing}
         onDragStart={(e) => {
           e.dataTransfer.setData("text/plain", note.id);
           e.dataTransfer.effectAllowed = "move";
           setDragInfo && setDragInfo({ draggingId: note.id, target: null });
         }}
         onDragEnd={() => {
           setDragInfo && setDragInfo({ draggingId: null, target: null });
         }}
         onDragOver={(e) => {
           if (!setDragInfo) return;
           if (!dragInfo?.draggingId) return;
           if (dragInfo.draggingId === note.id) return;
           e.preventDefault();
           const r = e.currentTarget.getBoundingClientRect();
           const y = e.clientY - r.top;
           const type = y < r.height / 2 ? "before" : "after";
           const nextTarget = { type, folderId: folderId || null, refId: note.id };
           const cur = dragInfo?.target;
           if (cur && cur.type === nextTarget.type && (cur.folderId || null) === (nextTarget.folderId || null) && (cur.refId || null) === (nextTarget.refId || null)) {
             return;
           }
           setDragInfo(d => ({ ...d, target: nextTarget }));
         }}
         onDrop={(e) => { e.preventDefault(); commitDrop && commitDrop(); }}
    >
      {showDropTop && <div className="drop-line top" />}
      {showDropBottom && <div className="drop-line bottom" />}
      {pinnedFolderColor !== undefined && (
        <span className="pinned-folder-icon" style={{ color: pinnedFolderColor || "#94a3b8" }} title="Folder">
          <Icon.FolderOutline width="13" height="13" />
        </span>
      )}
      {editing ? (
        <input
          className="row-edit-input"
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setVal(note.title); setEditing(false); } }}
        />
      ) : (
        <span className={"row-text " + (isUntitled ? "untitled" : "")}>{displayTitle}</span>
      )}
      {onDelete && (
        <button className="row-delete" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete">
          <Icon.Trash width="13" height="13"/>
        </button>
      )}
    </div>
  );
}

function FolderRow({ folder, notes, activeNoteId, onToggleExpand, onRename, onColor, onDelete, onAddNote, onSelectNote, onRenameNote, onDeleteNote, dragInfo, setDragInfo, commitDrop }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(folder.name);
  const [showColorPick, setShowColorPick] = useState(false);
  useEffect(() => setVal(folder.name), [folder.name]);

  const commit = () => { setEditing(false); if (val.trim() && val !== folder.name) onRename(val.trim()); else setVal(folder.name); };

  return (
    <div className="folder-block">
      <div
        className="folder-row"
        onDragOver={(e) => {
          if (!setDragInfo) return;
          if (!dragInfo?.draggingId) return;
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          const y = e.clientY - r.top;
          if (!notes.length) {
            const nextTarget = { type: "into-folder", folderId: folder.id, refId: null };
            const cur = dragInfo?.target;
            if (!cur || cur.type !== nextTarget.type || (cur.folderId || null) !== (nextTarget.folderId || null) || (cur.refId || null) !== (nextTarget.refId || null)) {
              setDragInfo(d => ({ ...d, target: nextTarget }));
            }
            return;
          }
          if (y < r.height / 2) {
            const nextTarget = { type: "before", folderId: folder.id, refId: notes[0].id };
            const cur = dragInfo?.target;
            if (!cur || cur.type !== nextTarget.type || (cur.folderId || null) !== (nextTarget.folderId || null) || (cur.refId || null) !== (nextTarget.refId || null)) {
              setDragInfo(d => ({ ...d, target: nextTarget }));
            }
          } else {
            const nextTarget = { type: "after", folderId: folder.id, refId: notes[notes.length - 1].id };
            const cur = dragInfo?.target;
            if (!cur || cur.type !== nextTarget.type || (cur.folderId || null) !== (nextTarget.folderId || null) || (cur.refId || null) !== (nextTarget.refId || null)) {
              setDragInfo(d => ({ ...d, target: nextTarget }));
            }
          }
        }}
        onDrop={(e) => { e.preventDefault(); commitDrop && commitDrop(); }}
      >
        <button className="chev" onClick={onToggleExpand} aria-label="expand">
          <Icon.ChevDown width="13" height="13" style={{ transform: folder.expanded ? "" : "rotate(-90deg)", transition: "transform .15s" }}/>
        </button>
        <button className="folder-color-swatch"
                style={{ color: folder.color }}
                onClick={(e) => { e.stopPropagation(); setShowColorPick(s => !s); }}
                title="Change color"
        >
          <Icon.Folder width="16" height="16"/>
        </button>
        {editing ? (
          <input
            className="row-edit-input"
            autoFocus
            value={val}
            onChange={e => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setVal(folder.name); setEditing(false); } }}
          />
        ) : (
          <span className="folder-name" onDoubleClick={() => setEditing(true)}>{folder.name}</span>
        )}
        <button className="folder-action" onClick={onAddNote} title="Add note"><Icon.Plus width="13" height="13"/></button>
        <button className="folder-action" onClick={onDelete} title="Delete folder"><Icon.Trash width="13" height="13"/></button>
      </div>

      {showColorPick && (
        <div className="color-picker" onMouseLeave={() => setShowColorPick(false)}>
          {DEFAULT_FOLDER_COLORS.map(c => (
            <button key={c} className={"color-dot " + (c===folder.color?"sel":"")}
                    style={{ background: c }}
                    onClick={() => { onColor(c); setShowColorPick(false); }}
            />
          ))}
        </div>
      )}

      {folder.expanded && (
        <div className="folder-notes">
          {notes.map(n => (
            <NoteRow key={n.id} note={n} active={n.id === activeNoteId}
              onClick={() => onSelectNote(n.id)}
              onRename={(t) => onRenameNote(n.id, t)}
              onDelete={() => onDeleteNote(n.id)}
              dragInfo={dragInfo}
              setDragInfo={setDragInfo}
              commitDrop={commitDrop}
              folderId={folder.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteEditor({ note, folder, onChange, onTogglePin }) {
  const scheduledLabel = useMemo(() => {
    if (!note?.scheduled) return null;
    const s = note.scheduled;
    const start = fromDateKey(s.day);
    const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    if (s.allDay) {
      const endExclusive = s.endDay ? fromDateKey(s.endDay) : addDays(start, 1);
      const endInclusive = addDays(endExclusive, -1);
      if (sameDay(start, endInclusive)) return `Scheduled · ${fmt(start)}`;
      return `Scheduled · ${fmt(start)} – ${fmt(endInclusive)}`;
    }
    return `Scheduled · ${fmt(start)} · ${fmtRangeFromMinutes(s.startMin, s.endMin)}`;
  }, [note?.scheduled]);

  return (
    <div className="editor-inner">
      <div className="editor-meta">
        {folder ? (
          <span className="meta-pill" style={{ borderColor: folder.color, color: folder.color }}>
            <Icon.Folder width="11" height="11"/> {folder.name}
          </span>
        ) : <span className="meta-pill dim">All Notes</span>}
        {scheduledLabel && (
          <span className="meta-pill dim">{scheduledLabel}</span>
        )}
        <button
          className={"editor-pin " + (note.pinned ? "active" : "")}
          onClick={onTogglePin}
          title={note.pinned ? "Unpin" : "Pin"}
        >
          <Icon.Pin width="15" height="15"/>
        </button>
      </div>
      <input
        className="editor-title"
        placeholder="Untitled"
        value={note.title}
        onChange={e => onChange({ title: e.target.value })}
      />
      <textarea
        className="editor-body"
        placeholder="Start writing…"
        value={note.body}
        onChange={e => onChange({ body: e.target.value })}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// CALENDAR TAB
// ──────────────────────────────────────────────────────────────────────
function CalendarView({ state, setState, search, onOpenTrash }) {
  const { folders, notes, weekAnchor, monthAnchor, selectedDate, calendarMode } = state;

  const weekStart = useMemo(() => startOfWeek(fromDateKey(weekAnchor)), [weekAnchor]);
  const monthAnchorDate = useMemo(() => fromDateKey(monthAnchor), [monthAnchor]);
  const selectedDateObj = useMemo(() => fromDateKey(selectedDate || weekAnchor), [selectedDate, weekAnchor]);

  const matchesSearch = (n) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (n.title||"").toLowerCase().includes(q) || (n.body||"").toLowerCase().includes(q);
  };

  const setMode = (m) => setState(s => ({ ...s, calendarMode: m }));
  const goToday = () => {
    const today = new Date();
    setState(s => ({ ...s, weekAnchor: dateKey(today), monthAnchor: dateKey(today), selectedDate: dateKey(today) }));
  };
  const shiftWeek = (delta) => {
    setState(s => {
      const newWeekAnchor = addDays(fromDateKey(s.weekAnchor), 7 * delta);
      return { ...s, weekAnchor: dateKey(newWeekAnchor), monthAnchor: dateKey(newWeekAnchor), selectedDate: dateKey(startOfWeek(newWeekAnchor)) };
    });
  };
  const shiftMonth = (delta) => {
    setState(s => ({ ...s, monthAnchor: dateKey(addMonths(fromDateKey(s.monthAnchor), delta)) }));
  };

  const setNoteSchedule = (id, sched) => {
    setState(s => ({ ...s, notes: s.notes.map(n => n.id === id ? { ...n, scheduled: sched, done: sched ? false : n.done } : n) }));
  };

  const requestDeleteRailNote = (noteId) => {
    setState(s => {
      const found = s.notes.find(x => x.id === noteId);
      if (!found) return s;
      const remaining = s.notes.filter(x => x.id !== noteId);
      const nextActive = s.activeNoteId === noteId ? (remaining[0]?.id || null) : s.activeNoteId;
      const trashed = { type: "note", id: found.id, note: { ...found, deletedAt: Date.now() } };
      return { ...s, notes: remaining, activeNoteId: nextActive, trash: [...(s.trash || []), trashed] };
    });
  };

  const requestUnschedule = (note) => {
    // Immediate: send back to rail (no confirm)
    setNoteSchedule(note.id, null);
  };

  const openNoteForEdit = (note) => {
    setState(s => ({ ...s, tab: "todo", activeNoteId: note.id }));
  };

  const createNoteAt = (day, startMin, anchorRect) => {
    const endMin = Math.min(24*60, startMin + 60);
    const newNote = createNote({
      title: "",
      scheduled: { day: dateKey(day), startMin, endMin },
    });
    setState(s => ({
      ...s,
      notes: [...s.notes, newNote],
    }));
    setQuickCreate({ noteId: newNote.id, anchorRect });
  };

  const [quickCreate, setQuickCreate] = useState(null); // { noteId, anchorRect } | null

  const cancelQuickCreate = () => {
    if (!quickCreate) return;
    setState(s => {
      const n = s.notes.find(n => n.id === quickCreate.noteId);
      // discard if user never typed anything
      if (n && !n.title && !n.body) {
        return { ...s, notes: s.notes.filter(x => x.id !== quickCreate.noteId) };
      }
      return s;
    });
    setQuickCreate(null);
  };

  const commitQuickCreate = (patch) => {
    if (!quickCreate) return;
    setState(s => ({ ...s, notes: s.notes.map(n => n.id === quickCreate.noteId ? { ...n, ...patch, title: (patch.title ?? n.title) || "New note" } : n) }));
    setQuickCreate(null);
  };

  const updateQuickCreateDraft = (noteId, patch) => {
    if (!noteId) return;
    setState(s => ({ ...s, notes: s.notes.map(n => n.id === noteId ? { ...n, ...patch } : n) }));
  };

  // ── unassigned notes (rail). Pinned + folder-grouped, only those not scheduled.
  const unscheduledNotes = notes.filter(n => !n.scheduled && matchesSearch(n));

  return (
    <div className="cal-layout">
      {/* CALENDAR TOOLBAR ROW (under main toolbar) */}
      <div className="cal-toprow">
        <div className="weekly-toggle">
          <button className={calendarMode==="weekly" ? "on" : ""} onClick={() => setMode("weekly")}>Weekly</button>
          <button className={calendarMode==="monthly" ? "on" : ""} onClick={() => setMode("monthly")}>Monthly</button>
        </div>
        <button className="today-pill" onClick={goToday}>TODAY</button>
        <div className="cal-nav">
          <button onClick={() => calendarMode==="weekly" ? shiftWeek(-1) : shiftMonth(-1)}><Icon.ChevLeft width="16" height="16"/></button>
          <span className="cal-range">
            {calendarMode==="weekly"
              ? `${fmtMonth(weekStart)} ${weekStart.getDate()} – ${fmtMonth(addDays(weekStart,6))} ${addDays(weekStart,6).getDate()}`
              : `${monthAnchorDate.toLocaleString(undefined,{month:"long"})} ${monthAnchorDate.getFullYear()}`}
          </span>
          <button onClick={() => calendarMode==="weekly" ? shiftWeek(1) : shiftMonth(1)}><Icon.ChevRight width="16" height="16"/></button>
        </div>
      </div>

      <div className="cal-body">
        {/* LEFT RAIL */}
        <aside className="cal-rail">
          <MiniMonth
            anchor={monthAnchorDate}
            selected={selectedDateObj}
            onPick={(d) => setState(s => ({ ...s, weekAnchor: dateKey(d), monthAnchor: dateKey(d), selectedDate: dateKey(d) }))}
            onShift={(d) => setState(s => ({ ...s, monthAnchor: dateKey(addMonths(monthAnchorDate, d)) }))}
          />

          <div className="rail-section">
            <FolderRailList folders={folders} notes={unscheduledNotes}
              onDeleteNote={requestDeleteRailNote}
              onDoneCheckCalendarSide={(id) => {
              // checking unscheduled note in calendar = mark done & remove? Per spec, dropping schedules; checking just marks done.
              setState(s => ({ ...s, notes: s.notes.map(n => n.id === id ? { ...n, done: !n.done } : n) }));
            }}/>
          </div>

          <div className="left-rail-footer">
            <button
              className="trash-fab"
              title="Trash"
              aria-label="Trash"
              onClick={onOpenTrash}
            >
              <Icon.Trash width="18" height="18" />
              {state.trash?.length ? <span className="trash-badge">{state.trash.length}</span> : null}
            </button>
          </div>
        </aside>

        {/* MAIN AREA */}
        <main className="cal-main">
          {calendarMode === "weekly"
            ? <WeekGrid weekStart={weekStart} folders={folders} notes={notes} onSchedule={setNoteSchedule} onRequestUnschedule={requestUnschedule} onEditNote={openNoteForEdit} onCreateAt={createNoteAt}/>
            : <MonthGrid monthAnchor={monthAnchorDate} folders={folders} notes={notes} onSchedule={setNoteSchedule} onPickDay={(d) => setState(s => ({ ...s, weekAnchor: dateKey(d), monthAnchor: dateKey(d), selectedDate: dateKey(d), calendarMode: "weekly" }))}/>
          }
        </main>
      </div>
      {quickCreate && (
        <QuickCreatePopover
          note={notes.find(n => n.id === quickCreate.noteId)}
          folders={folders}
          anchorRect={quickCreate.anchorRect}
          onCancel={cancelQuickCreate}
          onSave={commitQuickCreate}
          onDraftChange={(patch) => updateQuickCreateDraft(quickCreate.noteId, patch)}
        />
      )}
    </div>
  );
}

function QuickCreatePopover({ note, folders, anchorRect, onCancel, onSave, onDraftChange }) {
  const [title, setTitle] = useState(note?.title || "");
  const [body, setBody] = useState(note?.body || "");
  const [folderId, setFolderId] = useState(note?.folderId || null);
  const titleRef = useRef(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => {
    setTitle(note?.title || "");
    setBody(note?.body || "");
    setFolderId(note?.folderId || null);
  }, [note?.id]);

  // position to the right of the time slot if there's room, else to the left.
  const POPUP_W = 280;
  const PAD = 8;
  const vw = window.innerWidth;
  let left = anchorRect.left + anchorRect.width + PAD;
  if (left + POPUP_W > vw - 12) left = Math.max(12, anchorRect.left - POPUP_W - PAD);
  let top = Math.max(12, Math.min(window.innerHeight - 220, anchorRect.top));

  const handleKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSave({ title, body, folderId }); }
  };

  return (
    <>
      <div className="quick-popover-backdrop" onMouseDown={onCancel}/>
      <div className="quick-popover" style={{ left, top, width: POPUP_W }} onMouseDown={(e) => e.stopPropagation()} onKeyDown={handleKey}>
        <input
          ref={titleRef}
          className="quick-popover-title"
          placeholder="New event"
          value={title}
          onChange={(e) => {
            const v = e.target.value;
            setTitle(v);
            onDraftChange && onDraftChange({ title: v });
          }}
        />
        <textarea
          className="quick-popover-body"
          placeholder="Add a note (optional)"
          rows={3}
          value={body}
          onChange={(e) => {
            const v = e.target.value;
            setBody(v);
            onDraftChange && onDraftChange({ body: v });
          }}
        />
        <div className="quick-popover-folder-row">
          <span className="quick-popover-label">Folder</span>
          <div className="quick-popover-folders">
            <button type="button"
                    className={"qf-chip " + (folderId === null ? "active" : "")}
                    onClick={() => { setFolderId(null); onDraftChange && onDraftChange({ folderId: null }); }}>
              <span className="qf-dot" style={{ background: "#94a3b8" }}/> None
            </button>
            {folders.map(f => (
              <button key={f.id} type="button"
                      className={"qf-chip " + (folderId === f.id ? "active" : "")}
                      onClick={() => { setFolderId(f.id); onDraftChange && onDraftChange({ folderId: f.id }); }}>
                <span className="qf-dot" style={{ background: f.color }}/> {f.name}
              </button>
            ))}
          </div>
        </div>
        <div className="quick-popover-actions">
          <button type="button" className="qp-btn qp-btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="qp-btn qp-btn-primary" onClick={() => onSave({ title, body, folderId })}>Create</button>
        </div>
      </div>
    </>
  );
}
function FolderRailList({ folders, notes, onDoneCheckCalendarSide, onDeleteNote }) {
  const grouped = folders.map(f => ({ folder: f, items: notes.filter(n => n.folderId === f.id) }));
  const orphan = notes.filter(n => !n.folderId);

  const startDrag = (e, noteId) => {
    e.dataTransfer.setData("text/plain", noteId);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="rail-folders">
      {orphan.length > 0 && (
        <div className="rail-folder-block">
          <div className="rail-folder-head dim">All Notes</div>
          {orphan.map(n => {
            const display = (n.title||"").trim() || "Untitled";
            const isUntitled = !(n.title||"").trim();
            return (
            <div key={n.id} className="rail-note"
                 draggable onDragStart={(e) => startDrag(e, n.id)}>
              <span className={"rail-note-text " + (isUntitled ? "untitled" : "")}>{display}</span>
              <button
                type="button"
                className="rail-note-del"
                title="Delete"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onDeleteNote && onDeleteNote(n.id); }}
              >
                ×
              </button>
            </div>
          );})}
        </div>
      )}
      {grouped.map(({folder, items}) => (
        <div className="rail-folder-block" key={folder.id}>
          <div className="rail-folder-head" style={{ color: folder.color }}>
            <span className="rail-folder-dot" style={{ background: folder.color }}/> {folder.name}
          </div>
          {items.length === 0 && <div className="rail-empty">—</div>}
          {items.map(n => {
            const display = (n.title||"").trim() || "Untitled";
            const isUntitled = !(n.title||"").trim();
            return (
            <div key={n.id} className="rail-note"
                 draggable onDragStart={(e) => startDrag(e, n.id)}>
              <span className={"rail-note-text " + (isUntitled ? "untitled" : "")}>{display}</span>
              <button
                type="button"
                className="rail-note-del"
                title="Delete"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onDeleteNote && onDeleteNote(n.id); }}
              >
                ×
              </button>
            </div>
          );})}
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Mini month picker (sidebar)
// ──────────────────────────────────────────────────────────────────────
function MiniMonth({ anchor, selected, onPick, onShift }) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const startPad = first.getDay(); // sun-first
  const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth()+1, 0).getDate();
  const cells = [];
  for (let i=0;i<startPad;i++) {
    const d = addDays(first, -(startPad-i));
    cells.push({ date: d, dim: true });
  }
  for (let i=0;i<daysInMonth;i++) {
    cells.push({ date: new Date(anchor.getFullYear(), anchor.getMonth(), i+1), dim: false });
  }
  while (cells.length < 42) {
    cells.push({ date: addDays(cells[cells.length-1].date, 1), dim: true });
  }
  const today = new Date();
  return (
    <div className="mini-month">
      <div className="mini-month-head">
        <button onClick={() => onShift(-1)}><Icon.ChevLeft width="12" height="12"/></button>
        <span>{anchor.toLocaleString(undefined,{month:"short"})} {anchor.getFullYear()}</span>
        <button onClick={() => onShift(1)}><Icon.ChevRight width="12" height="12"/></button>
      </div>
      <div className="mini-month-grid">
        {["S","M","T","W","T","F","S"].map((d,i) => <div key={i} className="mini-dow">{d}</div>)}
        {cells.map((c, i) => {
          const isToday = sameDay(c.date, today);
          const isSel = sameDay(c.date, selected);
          return (
            <button key={i}
                    className={"mini-cell " + (c.dim?"dim ":"") + (isToday?"today ":"") + (isSel?"sel ":"")}
                    onClick={() => onPick(c.date)}>
              {c.date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Week grid w/ drag-and-drop, drag-to-move and drag-to-resize
// ──────────────────────────────────────────────────────────────────────
function WeekGrid({ weekStart, folders, notes, onSchedule, onRequestUnschedule, onEditNote, onCreateAt }) {
  const days = Array.from({length: 7}, (_, i) => addDays(weekStart, i));
  const today = new Date();
  const gridRef = useRef(null);
  const scrollRef = useRef(null);

  // Default the timetable scroll to the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [weekStart]);

  const handleDrop = (e, day) => {
    e.preventDefault();
    const noteId = e.dataTransfer.getData("text/plain");
    if (!noteId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const startMin = Math.max(0, Math.min(24*60-30, Math.round(y / HOUR_HEIGHT * 60 / 15) * 15));
    onSchedule(noteId, { day: dateKey(day), startMin, endMin: Math.min(24*60, startMin + 60), allDay: false });
  };

  const handleAllDayDrop = (e, day) => {
    e.preventDefault();
    const noteId = e.dataTransfer.getData("text/plain");
    if (!noteId) return;
    const start = dateKey(day);
    const end = dateKey(addDays(day, 1));
    onSchedule(noteId, { day: start, endDay: end, allDay: true });
  };

  // Compute overlap layout for events on each day
  const eventsByDayKey = useMemo(() => {
    const map = {};
    days.forEach(d => { map[dateKey(d)] = []; });
    notes.forEach(n => {
      if (n.scheduled && !n.scheduled.allDay && map[n.scheduled.day]) map[n.scheduled.day].push(n);
    });
    // For each day, compute lane layout: greedy first-fit
    const layout = {}; // noteId -> { lane, lanes }
    Object.keys(map).forEach(dk => {
      const list = map[dk].slice().sort((a,b) => a.scheduled.startMin - b.scheduled.startMin);
      // group into clusters of overlapping events, then assign lanes within each cluster
      let cluster = [];
      let clusterEnd = -Infinity;
      const flushCluster = () => {
        if (!cluster.length) return;
        const lanes = [];
        cluster.forEach(ev => {
          let assigned = -1;
          for (let i = 0; i < lanes.length; i++) {
            if (lanes[i] <= ev.scheduled.startMin) { assigned = i; break; }
          }
          if (assigned === -1) { assigned = lanes.length; lanes.push(0); }
          lanes[assigned] = ev.scheduled.endMin;
          layout[ev.id] = { lane: assigned, _cluster: cluster };
        });
        const total = lanes.length;
        cluster.forEach(ev => { layout[ev.id].lanes = total; });
        cluster = [];
        clusterEnd = -Infinity;
      };
      list.forEach(ev => {
        if (ev.scheduled.startMin >= clusterEnd) flushCluster();
        cluster.push(ev);
        clusterEnd = Math.max(clusterEnd, ev.scheduled.endMin);
      });
      flushCluster();
    });
    return { byDay: map, layout };
  }, [notes, weekStart]);

  const allDayEvents = useMemo(() => {
    const inWeek = new Set(days.map(d => dateKey(d)));
    return notes
      .filter(n => n.scheduled && n.scheduled.allDay && inWeek.has(n.scheduled.day))
      .slice()
      .sort((a, b) => (a.scheduled.day || "").localeCompare(b.scheduled.day || "") || (a.title || "").localeCompare(b.title || ""));
  }, [notes, weekStart]);

  const allDayPlacement = useMemo(() => {
    const idx = {};
    days.forEach((d, i) => { idx[dateKey(d)] = i; });
    const rows = [];
    const items = allDayEvents.map(n => {
      const start = idx[n.scheduled.day];
      const rawEnd = n.scheduled.endDay ? idx[n.scheduled.endDay] : (start + 1);
      const end = Math.max(start + 1, Math.min(7, rawEnd ?? (start + 1)));
      return { note: n, start, end };
    }).filter(x => x.start != null && x.start >= 0 && x.start < 7)
      .sort((a, b) => a.start - b.start || b.end - a.end);

    items.forEach(it => {
      let r = 0;
      for (; r < rows.length; r++) {
        const last = rows[r][rows[r].length - 1];
        if (!last || last.end <= it.start) break;
      }
      if (!rows[r]) rows[r] = [];
      rows[r].push(it);
    });
    return rows;
  }, [allDayEvents, weekStart]);

  return (
    <div className="week-grid-wrap">
      {/* day headers */}
      <div className="week-headers">
        <div className="week-corner"/>
        {days.map((d, i) => {
          const isToday = sameDay(d, today);
          return (
            <div key={i} className={"week-day-head " + (isToday?"today":"")}>
              <span className={"dow " + (isToday?"today":"")}>{DAY_NAMES_SHORT[d.getDay()]}</span>
              <span className={"date " + (isToday?"today":"")}>{fmtMonth(d)} {d.getDate()}</span>
            </div>
          );
        })}
      </div>

      {/* all-day row (no time) */}
      <div
        className="allday-row"
        style={{ height: Math.max(52, 12 + Math.max(1, allDayPlacement.length) * 28) }}
      >
        <div className="allday-corner">All-day</div>
        {days.map((d, i) => {
          return (
            <div
              key={i}
              className={"allday-cell " + (sameDay(d, today) ? "today" : "")}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleAllDayDrop(e, d)}
            >
            </div>
          );
        })}
        <AllDayLayer
          days={days}
          placedRows={allDayPlacement}
          folders={folders}
          onSchedule={onSchedule}
          onUnschedule={(n) => (onRequestUnschedule ? onRequestUnschedule(n) : onSchedule(n.id, null))}
          onEditNote={onEditNote}
        />
      </div>

      <div className="week-scroll" ref={scrollRef}>
        <div className="week-grid" ref={gridRef}>
          {/* hour gutter */}
          <div className="hour-col">
            {HOURS.map((h, i) => (
              <div key={i} className="hour-cell"><span className="hour-label">{h}</span></div>
            ))}
          </div>

          {/* 7 day columns (background only) */}
          {days.map((d, idx) => (
            <DayColumn key={idx}
                       day={d}
                       isToday={sameDay(d, today)}
                       onDrop={(e) => handleDrop(e, d)}
                       onDragOver={(e) => { e.preventDefault(); }}
                       onCreateAt={onCreateAt}
            />
          ))}

          {/* Events layer – absolutely positioned over the whole grid so cross-day drag is continuous */}
          <EventsLayer
            days={days}
            notes={notes}
            folders={folders}
            layout={eventsByDayKey.layout}
            onSchedule={onSchedule}
            onRequestUnschedule={onRequestUnschedule}
            onEditNote={onEditNote}
          />
        </div>
      </div>
    </div>
  );
}

function EventsLayer({ days, notes, folders, layout, onSchedule, onRequestUnschedule, onEditNote }) {
  const dayIdxByKey = useMemo(() => {
    const m = {};
    days.forEach((d, i) => { m[dateKey(d)] = i; });
    return m;
  }, [days]);
  const events = notes.filter(n => n.scheduled && !n.scheduled.allDay && dayIdxByKey[n.scheduled.day] != null);
  return (
    <div className="events-layer">
      {events.map(ev => (
        <EventBlock key={ev.id}
                    note={ev}
                    folder={folders.find(f => f.id === ev.folderId)}
                    dayIdx={dayIdxByKey[ev.scheduled.day]}
                    laneInfo={layout[ev.id] || { lane: 0, lanes: 1 }}
                    onSchedule={onSchedule}
                    onUnschedule={() => onSchedule(ev.id, null)}
                    onRequestDelete={() => onRequestUnschedule && onRequestUnschedule(ev)}
                    onDoubleClick={onEditNote}
                    weekDays={days}
        />
      ))}
    </div>
  );
}

function AllDayLayer({ days, placedRows, folders, onSchedule, onUnschedule, onEditNote }) {
  const colPctW = 100 / 7;
  return (
    <div className="allday-layer" style={{ height: Math.max(1, placedRows.length) * 28 }}>
      {placedRows.map((row, rowIdx) => (
        row.map(({ note, start, end }) => {
          const f = folders.find(ff => ff.id === note.folderId);
          const color = f?.color || "#94a3b8";
          const leftPct = start * colPctW;
          const widthPct = (end - start) * colPctW;
          return (
            <AllDayBlock
              key={note.id}
              note={note}
              color={color}
              leftPct={leftPct}
              widthPct={widthPct}
              topPx={6 + rowIdx * 28}
              days={days}
              onSchedule={onSchedule}
              onUnschedule={() => onUnschedule && onUnschedule(note)}
              onEditNote={() => onEditNote && onEditNote(note)}
            />
          );
        })
      ))}
    </div>
  );
}

function AllDayBlock({ note, color, leftPct, widthPct, topPx, days, onSchedule, onUnschedule, onEditNote }) {
  const [drag, setDrag] = useState(null); // { mode: 'pending-move'|'move'|'resize-left'|'resize-right', ... }
  const blockRef = useRef(null);
  const [editingFlash, setEditingFlash] = useState(false);

  const allDayCellWidth = () => {
    const cell = document.querySelector(".allday-row .allday-cell");
    const r = cell?.getBoundingClientRect();
    return r?.width || null;
  };

  const hitDayIdx = (x) => {
    const cells = document.querySelectorAll(".allday-row .allday-cell");
    for (let i = 0; i < cells.length; i++) {
      const r = cells[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right) return i;
    }
    return null;
  };

  const hitTimedSlot = (x, y) => {
    const cols = document.querySelectorAll(".week-grid .day-col");
    for (let i = 0; i < cols.length; i++) {
      const r = cols[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return { idx: i, rect: r };
      }
    }
    return null;
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      setDrag(d => d ? ({ ...d, curX: e.clientX, curY: e.clientY }) : d);
      if (drag.mode === "pending-move") {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (Math.hypot(dx, dy) >= 4) {
          setDrag(d => d ? ({ ...d, mode: "move" }) : d);
        } else {
          return;
        }
      }
      const idx = hitDayIdx(e.clientX);
      const startIdx = days.findIndex(d => dateKey(d) === note.scheduled.day);
      const curEndIdx = note.scheduled.endDay ? days.findIndex(d => dateKey(d) === note.scheduled.endDay) : (startIdx + 1);
      const s = startIdx;
      const ee = Math.max(s + 1, curEndIdx > -1 ? curEndIdx : s + 1);
      const duration = Math.max(1, ee - s);

      if (drag.mode === "resize-right") {
        if (idx == null) return;
        const newEndIdx = Math.max(s + 1, Math.min(7, idx + 1));
        const endDay = (newEndIdx >= 7) ? dateKey(addDays(days[0], 7)) : dateKey(days[newEndIdx]);
        onSchedule(note.id, { day: note.scheduled.day, endDay, allDay: true });
      } else if (drag.mode === "resize-left") {
        if (idx == null) return;
        const newStartIdx = Math.max(0, Math.min(idx, ee - 1));
        const newStartDay = dateKey(days[newStartIdx]);
        onSchedule(note.id, { day: newStartDay, endDay: note.scheduled.endDay || dateKey(addDays(fromDateKey(note.scheduled.day), 1)), allDay: true });
      } else if (drag.mode === "move") {
        // move within all-day row by horizontal delta (keep same duration)
        const w = allDayCellWidth();
        if (!w || !drag.startX || drag.origStartIdx == null || drag.duration == null) return;
        const deltaCols = Math.round((e.clientX - drag.startX) / w);
        const newStartIdx = Math.max(0, Math.min(7 - drag.duration, drag.origStartIdx + deltaCols));
        const newEndIdx = newStartIdx + drag.duration;
        const newStartDay = dateKey(days[newStartIdx]);
        const newEndDay = (newEndIdx >= 7) ? dateKey(addDays(days[0], 7)) : dateKey(days[newEndIdx]);
        if (newStartDay !== note.scheduled.day || newEndDay !== note.scheduled.endDay) {
          onSchedule(note.id, { day: newStartDay, endDay: newEndDay, allDay: true });
        }
      }
    };
    const onUp = (e) => {
      if (drag.mode === "move") {
        // drop into timed grid => assign a time
        const hit = hitTimedSlot(e.clientX, e.clientY);
        if (hit) {
          const y = e.clientY - hit.rect.top;
          const startMin = Math.max(0, Math.min(24*60-30, Math.round(y / HOUR_HEIGHT * 60 / 15) * 15));
          const d = days[hit.idx];
          if (d) onSchedule(note.id, { day: dateKey(d), startMin, endMin: Math.min(24*60, startMin + 60), allDay: false });
        }
      }
      setDrag(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, days, note, onSchedule]);

  const beginMove = (e) => {
    if (e.target.closest(".allday-unschedule")) return;
    if (e.target.closest(".allday-handle")) return;
    e.stopPropagation();
    const r = blockRef.current?.getBoundingClientRect();
    const startIdx = days.findIndex(d => dateKey(d) === note.scheduled.day);
    const curEndIdx = note.scheduled.endDay ? days.findIndex(d => dateKey(d) === note.scheduled.endDay) : (startIdx + 1);
    const duration = Math.max(1, (curEndIdx > -1 ? curEndIdx : startIdx + 1) - startIdx);
    setDrag({
      mode: "pending-move",
      startX: e.clientX,
      startY: e.clientY,
      origStartIdx: startIdx,
      curX: e.clientX,
      curY: e.clientY,
      offsetX: r ? (e.clientX - r.left) : 10,
      offsetY: r ? (e.clientY - r.top) : 10,
      widthPx: r ? r.width : null,
      duration,
    });
  };

  return (
    <div
      ref={blockRef}
      className={"allday-block" + (drag ? " dragging" : "")}
      style={drag?.mode === "move" ? {
        position: "fixed",
        top: Math.max(6, (drag.curY ?? 0) - (drag.offsetY ?? 10)),
        left: Math.max(66, (drag.curX ?? 0) - (drag.offsetX ?? 10)),
        width: (drag.widthPx ? `${drag.widthPx}px` : `calc(${widthPct}% - 6px)`),
        background: withHexAlpha(color, "CC"),
        borderColor: color,
        color: "var(--text)",
        zIndex: 2500,
        pointerEvents: "none",
      } : {
        top: topPx,
        left: `${leftPct}%`,
        width: `calc(${widthPct}% - 6px)`,
        background: withHexAlpha(color, "CC"),
        borderColor: color,
        color: "var(--text)",
      }}
      onMouseDown={beginMove}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditingFlash(true);
        setTimeout(() => {
          onEditNote && onEditNote();
          setEditingFlash(false);
        }, 320);
      }}
      title="All-day · drag edges to span days"
    >
      <div className="allday-handle left" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setDrag({ mode: "resize-left" }); }} />
      <div className="allday-block-title">{(note.title || "").trim() || "Untitled"}</div>
      <button
        type="button"
        className="allday-unschedule"
        title="Send back to rail"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={(e) => { e.stopPropagation(); onUnschedule && onUnschedule(); }}
      >
        ×
      </button>
      <div className="allday-handle right" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setDrag({ mode: "resize-right" }); }} />
      {editingFlash && (
        <div className="allday-edit-overlay">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          <span>Editing…</span>
        </div>
      )}
    </div>
  );
}

function DayColumn({ day, isToday, onDrop, onDragOver, onCreateAt }) {
  const handleDoubleClick = (e) => {
    if (e.target.closest(".event-block")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const startMin = Math.max(0, Math.min(24*60-60, Math.round(y / HOUR_HEIGHT * 60 / 30) * 30));
    const anchorRect = { left: rect.left, top: rect.top + (startMin / 60) * HOUR_HEIGHT, width: rect.width };
    onCreateAt && onCreateAt(day, startMin, anchorRect);
  };
  return (
    <div className={"day-col " + (isToday ? "today" : "")} onDrop={onDrop} onDragOver={onDragOver} onDoubleClick={handleDoubleClick}>
      {HOURS.map((_, i) => <div key={i} className="day-hour-cell"/>)}
      {isToday && <NowLine />}
    </div>
  );
}

function NowLine() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 30 * 1000); // every 30s
    return () => clearInterval(id);
  }, []);
  const minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const top = (minutes / 60) * HOUR_HEIGHT;
  return (
    <div className="now-line" style={{ top }}>
      <div className="now-line-dot"/>
      <div className="now-line-bar"/>
    </div>
  );
}

function EventBlock({ note, folder, dayIdx, laneInfo, onSchedule, onUnschedule, onRequestDelete, onDoubleClick, weekDays }) {
  const { day, startMin, endMin } = note.scheduled;
  const top = (startMin / 60) * HOUR_HEIGHT;
  const height = Math.max(20, ((endMin - startMin) / 60) * HOUR_HEIGHT);
  const color = folder?.color || "#94a3b8";

  // Position across the 7 day columns. Each column = (100% / 7) of events-layer width.
  const lanes = (laneInfo && laneInfo.lanes) || 1;
  const lane = (laneInfo && laneInfo.lane) || 0;
  const colPctW = 100 / 7;
  const leftPct = dayIdx * colPctW + (lane / lanes) * colPctW;
  const widthPct = colPctW / lanes;

  const [drag, setDrag] = useState(null); // { mode, startY, origStart, origEnd, origDay }
  const [hover, setHover] = useState(false);
  const [editingFlash, setEditingFlash] = useState(false);
  const blockRef = useRef(null);
  const lastPtrRef = useRef({ x: 0, y: 0 });

  const hitAllDay = (x, y) => {
    if (!weekDays || !weekDays.length) return null;
    const cells = document.querySelectorAll(".allday-row .allday-cell");
    for (let i = 0; i < cells.length; i++) {
      const r = cells[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        const d = weekDays[i];
        return d ? dateKey(d) : null;
      }
    }
    return null;
  };

  const beginDrag = (mode, e) => {
    if (mode !== "move") e.preventDefault();
    e.stopPropagation();
    const r = blockRef.current?.getBoundingClientRect();
    const offsetX = r ? (e.clientX - r.left) : 10;
    const offsetY = r ? (e.clientY - r.top) : 10;
    setDrag({
      mode: mode === "move" ? "pending-move" : mode,
      startY: e.clientY,
      startX: e.clientX,
      curX: e.clientX,
      curY: e.clientY,
      offsetX,
      offsetY,
      widthPx: r ? r.width : null,
      origStart: startMin,
      origEnd: endMin,
      origDay: day,
    });
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      lastPtrRef.current = { x: e.clientX, y: e.clientY };
      setDrag(d => d ? ({ ...d, curX: e.clientX, curY: e.clientY }) : d);
      // Only start dragging after a tiny movement threshold so double-click works anywhere.
      if (drag.mode === "pending-move") {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (Math.hypot(dx, dy) >= 4) {
          setDrag(d => d ? ({ ...d, mode: "move" }) : d);
        } else {
          return;
        }
      }
      const dy = e.clientY - drag.startY;
      const dMin = Math.round(dy / HOUR_HEIGHT * 60 / 15) * 15;
      let s = drag.origStart, ee = drag.origEnd;
      let newDay = drag.origDay;
      if (drag.mode === "move") {
        s = drag.origStart + dMin;
        ee = drag.origEnd + dMin;
        if (s < 0) { ee -= s; s = 0; }
        if (ee > 24*60) { s -= (ee-24*60); ee = 24*60; }
        // hit-test for column under cursor (continuous across the whole grid)
        if (weekDays && weekDays.length) {
          const cols = document.querySelectorAll(".week-grid .day-col");
          const first = cols[0]?.getBoundingClientRect();
          if (first && first.width > 0) {
            const idx = Math.floor((e.clientX - first.left) / first.width);
            const clamped = Math.max(0, Math.min(weekDays.length - 1, idx));
            const d = weekDays[clamped];
            if (d) newDay = dateKey(d);
          }
        }
      } else if (drag.mode === "resize-top") {
        s = Math.min(ee - 15, drag.origStart + dMin);
        if (s < 0) s = 0;
      } else if (drag.mode === "resize-bottom") {
        ee = Math.max(s + 15, drag.origEnd + dMin);
        if (ee > 24*60) ee = 24*60;
      }
      onSchedule(note.id, { day: newDay, startMin: s, endMin: ee, allDay: false });
    };
    const onUp = () => {
      if (drag.mode === "move") {
        const { x, y } = lastPtrRef.current;
        const allDayKey = hitAllDay(x, y);
        if (allDayKey) {
          onSchedule(note.id, { day: allDayKey, allDay: true });
        }
      }
      setDrag(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, note.id, onSchedule, weekDays]);

  return (
    <div ref={blockRef}
         className={"event-block" + (drag ? " dragging" : "")}
         style={drag?.mode === "move" ? {
           position: "fixed",
           top: Math.max(6, (drag.curY ?? drag.startY) - (drag.offsetY ?? 10)),
           left: Math.max(66, (drag.curX ?? drag.startX) - (drag.offsetX ?? 10)),
           width: (drag.widthPx ? `${drag.widthPx}px` : `calc(${widthPct}% - 4px)`),
           height,
          background: withHexAlpha(color, "CC"),
           borderLeft: `3px solid ${color}`,
           zIndex: 2000,
           pointerEvents: "none",
         } : {
           top, height,
           left: `${leftPct}%`,
           width: `calc(${widthPct}% - 4px)`,
          background: withHexAlpha(color, "CC"),
           borderLeft: `3px solid ${color}`,
         }}
         onMouseEnter={() => setHover(true)}
         onMouseLeave={() => setHover(false)}
         onMouseDown={(e) => beginDrag("move", e)}
         onDoubleClick={(e) => {
           e.stopPropagation();
           setEditingFlash(true);
           setTimeout(() => {
             onDoubleClick && onDoubleClick(note);
             setEditingFlash(false);
           }, 320);
         }}
         title="Drag to move · drag edges to resize · double-click to edit"
    >
      <div className="event-resize top" onMouseDown={(e) => beginDrag("resize-top", e)}/>
      <div className="event-title">{note.title || <span className="event-untitled">Untitled</span>}</div>
      <div className="event-time">{fmtRangeFromMinutes(startMin, endMin)}</div>
      {note.body && height >= 60 && (
        <div className="event-preview">{previewBody(note.body)}</div>
      )}
      {hover && (
        <button
          className="event-unschedule"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); onRequestDelete ? onRequestDelete() : onUnschedule(); }}
          title="Send back to rail"
        >
          ×
        </button>
      )}
      <div className="event-resize bottom" onMouseDown={(e) => beginDrag("resize-bottom", e)}/>
      {editingFlash && (
        <div className="event-edit-overlay">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          <span>Editing…</span>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Month grid (each cell shows scheduled events as colored chips)
// ──────────────────────────────────────────────────────────────────────
function MonthGrid({ monthAnchor, folders, notes, onSchedule, onPickDay }) {
  const first = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth()+1, 0).getDate();
  const cells = [];
  for (let i=0;i<startPad;i++) cells.push({ date: addDays(first, -(startPad-i)), dim: true });
  for (let i=0;i<daysInMonth;i++) cells.push({ date: new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), i+1), dim: false });
  while (cells.length % 7 !== 0 || cells.length < 35) cells.push({ date: addDays(cells[cells.length-1].date, 1), dim: true });

  const today = new Date();
  const handleDrop = (e, date) => {
    e.preventDefault();
    const noteId = e.dataTransfer.getData("text/plain");
    if (!noteId) return;
    onSchedule(noteId, { day: dateKey(date), startMin: 9*60, endMin: 10*60 });
  };

  return (
    <div className="month-grid">
      <div className="month-headers">
        {DAY_NAMES_LONG.map((d, i) => (
          <div key={i} className="month-dow">{d}</div>
        ))}
      </div>
      <div className="month-cells">
        {cells.map((c, i) => {
          const isToday = sameDay(c.date, today);
          const dayNotes = notes.filter(n => n.scheduled && n.scheduled.day === dateKey(c.date));
          return (
            <div key={i} className={"month-cell " + (c.dim?"dim ":"") + (isToday?"today ":"")}
                 onDrop={(e) => handleDrop(e, c.date)}
                 onDragOver={(e) => e.preventDefault()}
                 onClick={() => onPickDay(c.date)}
            >
              <div className={"month-cell-num " + (isToday?"today":"")}>{c.date.getDate()}</div>
              <div className="month-cell-events">
                {dayNotes.slice(0, 3).map(n => {
                  const f = folders.find(ff => ff.id === n.folderId);
                  return (
                    <div key={n.id} className="month-chip"
                         style={{ background: (f?.color || "#94a3b8") + "30", color: f?.color || "#475569" }}>
                      {n.title}
                    </div>
                  );
                })}
                {dayNotes.length > 3 && <div className="month-chip-more">+{dayNotes.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Root app
// ──────────────────────────────────────────────────────────────────────
function LoginView({ auth, authReady }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = authReady && auth && email.trim() && password.length >= 6 && !busy;

  const formatAuthError = (err) => {
    const code = err?.code || "";
    if (code === "auth/email-already-in-use") return "That email already has an account. Sign in instead.";
    if (code === "auth/invalid-email") return "Enter a valid email address.";
    if (code === "auth/invalid-login-credentials" || code === "auth/wrong-password" || code === "auth/user-not-found") {
      return "The email or password did not match an account.";
    }
    if (code === "auth/weak-password") return "Use a password with at least 6 characters.";
    if (code === "auth/popup-closed-by-user") return "Google sign-in was closed before it finished.";
    if (code === "auth/operation-not-allowed") return "Enable this sign-in method in Firebase Authentication first.";
    return err?.message || "Sign-in failed. Try again.";
  };

  const submitEmailPassword = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const cleanEmail = email.trim();
      if (mode === "create") {
        await auth.createUserWithEmailAndPassword(cleanEmail, password);
      } else {
        await auth.signInWithEmailAndPassword(cleanEmail, password);
      }
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    if (!auth || busy) return;
    setBusy(true);
    setError("");
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-view">
      <div className="auth-panel">
        <div className="auth-kicker">Notes & Calendar</div>
        <h1 className="auth-title">{mode === "create" ? "Create your account" : "Sign in"}</h1>
        {!auth && (
          <div className="auth-error">Firebase Auth did not load. Check the Firebase scripts in index.html.</div>
        )}
        <form className="auth-form" onSubmit={submitEmailPassword}>
          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!authReady || busy}
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={mode === "create" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!authReady || busy}
            />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button className="auth-primary" type="submit" disabled={!canSubmit}>
            {busy ? "Working..." : mode === "create" ? "Create account" : "Sign in"}
          </button>
        </form>
        <button className="auth-google" type="button" onClick={signInWithGoogle} disabled={!authReady || busy}>
          Continue with Google
        </button>
        <button
          className="auth-switch"
          type="button"
          onClick={() => {
            setMode(mode === "create" ? "signin" : "create");
            setError("");
          }}
          disabled={busy}
        >
          {mode === "create" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </div>
    </div>
  );
}

function TrashModal({ open, items, onClose, onDeleteSelected, onRestoreSelected }) {
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());

  useEffect(() => {
    if (!open) return;
    setSelectedKeys(new Set());
  }, [open]);

  if (!open) return null;

  const trashItems = Array.isArray(items) ? items : [];
  const keyOf = (t) => `${t.type}:${t.id}`;
  const selectedCount = selectedKeys.size;
  const allCount = trashItems.length;
  const hasItems = allCount > 0;

  const toggleSelected = (k) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const selectAll = () => {
    if (!trashItems.length) return;
    setSelectedKeys(prev => {
      if (prev.size === trashItems.length) return new Set();
      return new Set(trashItems.map(keyOf));
    });
  };

  const restoreSelected = () => {
    const keys = Array.from(selectedKeys);
    if (!keys.length) return;
    onRestoreSelected && onRestoreSelected(keys);
    setSelectedKeys(new Set());
  };

  const deleteSelected = () => {
    const keys = Array.from(selectedKeys);
    if (!keys.length) return;
    onDeleteSelected && onDeleteSelected(keys);
    setSelectedKeys(new Set());
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal trash-modal" onClick={(e) => e.stopPropagation()}>
        <div className="trash-head">
          <div className="modal-title">Trash</div>
          {hasItems && (
            <div className="trash-head-actions">
              <button className="btn-secondary btn-small" onClick={restoreSelected} disabled={selectedCount === 0}>
                Restore
              </button>
              <button className="btn-danger btn-small" onClick={deleteSelected} disabled={selectedCount === 0}>
                Delete
              </button>
            </div>
          )}
        </div>
        <div className="trash-list">
          {trashItems.length === 0 ? (
            <div className="trash-empty">Trash is empty</div>
          ) : (
            trashItems.slice().reverse().map((t) => {
              const k = keyOf(t);
              const isOn = selectedKeys.has(k);
              if (t.type === "folder") {
                const f = t.folder;
                const sub = Array.isArray(t.notes) ? t.notes : [];
                return (
                  <div className="trash-row" key={k}>
                    <div className="trash-row-main">
                      <div className="trash-title">
                        <span className="trash-folder-icon" style={{ color: f?.color || "#94a3b8" }}>
                          <Icon.Folder width="14" height="14" />
                        </span>
                        {(f?.name || "").trim() || "Untitled folder"}
                      </div>
                      <div className="trash-meta">
                        {t.deletedAt ? new Date(t.deletedAt).toLocaleString() : ""}
                        {sub.length ? ` · ${sub.length} note${sub.length === 1 ? "" : "s"}` : ""}
                      </div>
                      {sub.length > 0 && (
                        <div className="trash-sublist">
                          {sub.slice(0, 6).map(n => (
                            <div key={n.id} className="trash-subitem">
                              {(n.title || "").trim() || "Untitled"}
                            </div>
                          ))}
                          {sub.length > 6 && <div className="trash-submore">+{sub.length - 6} more</div>}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className={"trash-select " + (isOn ? "on" : "")}
                      aria-label={isOn ? "Deselect" : "Select"}
                      title={isOn ? "Deselect" : "Select"}
                      onClick={() => toggleSelected(k)}
                    >
                      {isOn ? "✓" : ""}
                    </button>
                  </div>
                );
              }

              const n = t.note;
              return (
                <div className="trash-row" key={k}>
                <div className="trash-row-main">
                  <div className="trash-title">{(n?.title || "").trim() || "Untitled"}</div>
                  <div className="trash-meta">{n?.deletedAt ? new Date(n.deletedAt).toLocaleString() : ""}</div>
                </div>
                <button
                  type="button"
                  className={"trash-select " + (isOn ? "on" : "")}
                  aria-label={isOn ? "Deselect" : "Select"}
                  title={isOn ? "Deselect" : "Select"}
                  onClick={() => toggleSelected(k)}
                >
                  {isOn ? "✓" : ""}
                </button>
              </div>
              );
            })
          )}
        </div>
        <div className="modal-actions">
          {hasItems && (
            <button className="btn-secondary trash-selectall" onClick={selectAll}>
              Select all
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [state, _setState] = useState(loadState);
  const [search, setSearch] = useState("");
  const [trashOpen, setTrashOpen] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const firebaseServices = window.firebaseServices || {};
  const auth = firebaseServices.auth || null;
  const db = firebaseServices.db || null;

  // Refs for Firestore sync
  const applyingRemoteRef = useRef(false);
  const remoteUnsubRef = useRef(null);
  const saveTimerRef = useRef(null);

  // Simple undo history for app-level actions (create/move/delete/schedule/etc)
  // Stored in refs so it doesn't cause rerender on every change.
  const undoPastRef = useRef([]);   // array of previous states
  const undoFutureRef = useRef([]); // array of undone states (for potential redo later)
  const MAX_UNDO = 50;

  const applyState = useCallback((updater, opts = {}) => {
    const { skipHistory = false } = opts;
    _setState(prev => {
      const next = (typeof updater === "function") ? updater(prev) : updater;
      if (next === prev) return prev;
      if (!skipHistory) {
        undoPastRef.current.push(prev);
        if (undoPastRef.current.length > MAX_UNDO) undoPastRef.current.shift();
        undoFutureRef.current = [];
      }
      return next;
    });
  }, []);

  const undoOnce = useCallback(() => {
    const past = undoPastRef.current;
    if (!past.length) return;
    _setState(cur => {
      const prev = past.pop();
      undoFutureRef.current.push(cur);
      return prev;
    });
  }, []);

  const createUnfiledNoteAndOpen = useCallback(() => {
    const note = createNote();
    applyState(s => ({
      ...s,
      tab: "todo",
      notes: [note, ...s.notes],
      activeNoteId: note.id,
    }));
  }, [applyState]);

  const deleteActiveNoteImmediate = useCallback(() => {
    applyState(s => {
      if (!s.activeNoteId) return s;
      const found = s.notes.find(n => n.id === s.activeNoteId);
      if (!found) return s;
      const remaining = s.notes.filter(n => n.id !== s.activeNoteId);
      const nextActive = remaining[0]?.id || null;
      const trashed = { type: "note", id: found.id, note: { ...found, deletedAt: Date.now() } };
      return { ...s, notes: remaining, activeNoteId: nextActive, trash: [...(s.trash || []), trashed] };
    });
  }, [applyState]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }, [state]);

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return;
    }
    return auth.onAuthStateChanged((user) => {
      setAuthUser(user);
      setAuthReady(true);
      undoPastRef.current = [];
      undoFutureRef.current = [];
    });
  }, [auth]);

  // Subscribe to the user's Firestore document and mirror changes locally.
  useEffect(() => {
    if (remoteUnsubRef.current) { remoteUnsubRef.current(); remoteUnsubRef.current = null; }
    if (!db || !authUser) return;
    const docRef = db.collection("users").doc(authUser.uid).collection("app").doc("state");
    let didBootstrap = false;
    remoteUnsubRef.current = docRef.onSnapshot((snap) => {
      if (!snap.exists) {
        if (!didBootstrap) {
          didBootstrap = true;
          docRef.set({ data: JSON.stringify(state), updatedAt: Date.now() }).catch((e) => console.error("Firestore initial push failed:", e));
        }
        return;
      }
      didBootstrap = true;
      try {
        const remote = JSON.parse(snap.data().data || "{}");
        if (remote && remote.folders && remote.notes) {
          applyingRemoteRef.current = true;
          _setState(remote);
        }
      } catch (e) { console.error("Firestore parse failed:", e); }
    }, (err) => console.error("Firestore subscribe failed:", err));
    return () => {
      if (remoteUnsubRef.current) { remoteUnsubRef.current(); remoteUnsubRef.current = null; }
    };
  }, [db, authUser]);

  // Debounced push of local state up to Firestore.
  useEffect(() => {
    if (applyingRemoteRef.current) { applyingRemoteRef.current = false; return; }
    if (!db || !authUser) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const docRef = db.collection("users").doc(authUser.uid).collection("app").doc("state");
      docRef.set({ data: JSON.stringify(state), updatedAt: Date.now() }).catch((e) => console.error("Firestore save failed:", e));
    }, 600);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state, db, authUser]);

  const setTab = (tab) => applyState(s => ({ ...s, tab }));

  const togglePinActive = () => {
    if (!state.activeNoteId) return;
    applyState(s => ({ ...s, notes: s.notes.map(n => n.id === s.activeNoteId ? { ...n, pinned: !n.pinned } : n) }));
  };

  const signOut = async () => {
    if (!auth) return;
    await auth.signOut();
  };

  useEffect(() => {
    const isEditableTarget = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      return false;
    };

    const onKeyDown = (e) => {
      if (trashOpen) return;
      const key = String(e.key || "").toLowerCase();
      const isCmdA = (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && key === "a";
      const isCmdX = (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && key === "x";
      const isCmdZ = (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && key === "z";
      if (!(isCmdA || isCmdX || isCmdZ)) return;
      if (isEditableTarget(e.target)) return; // preserve normal text-field shortcuts
      e.preventDefault();
      if (isCmdA) createUnfiledNoteAndOpen();
      if (isCmdX) deleteActiveNoteImmediate();
      if (isCmdZ) undoOnce();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createUnfiledNoteAndOpen, deleteActiveNoteImmediate, undoOnce, trashOpen]);

  if (!authReady) {
    return <div className="auth-loading">Loading...</div>;
  }

  if (!authUser) {
    return <LoginView auth={auth} authReady={authReady} />;
  }

  return (
    <div className="app-root">
      <Toolbar tab={state.tab} setTab={setTab}
        search={search} setSearch={setSearch}
        user={authUser} onSignOut={signOut}
      />
      {state.tab === "todo"
        ? <TodoView state={state} setState={applyState} search={search} togglePinActive={togglePinActive} onOpenTrash={() => setTrashOpen(true)}/>
        : <CalendarView state={state} setState={applyState} search={search} onOpenTrash={() => setTrashOpen(true)}/>}
      <TrashModal
        open={trashOpen}
        items={state.trash || []}
        onClose={() => setTrashOpen(false)}
        onDeleteSelected={(keys) => {
          applyState(s => {
            const trash = s.trash || [];
            const keyOf = (t) => `${t.type}:${t.id}`;
            const remainingTrash = trash.filter(t => !keys.includes(keyOf(t)));
            if (remainingTrash.length === trash.length) return s;
            return { ...s, trash: remainingTrash };
          });
        }}
        onRestoreSelected={(keys) => {
          applyState(s => {
            const trash = s.trash || [];
            const keyOf = (t) => `${t.type}:${t.id}`;
            const picked = trash.filter(t => keys.includes(keyOf(t)));
            if (!picked.length) return s;

            const existingNoteIds = new Set(s.notes.map(n => n.id));
            const existingFolderIds = new Set(s.folders.map(f => f.id));

            const notesToRestore = [];
            const foldersToRestore = [];

            picked.forEach(t => {
              if (t.type === "note") {
                const n = t.note;
                if (n && !existingNoteIds.has(n.id)) {
                  const { deletedAt, ...rest } = n;
                  notesToRestore.push(rest);
                }
              } else if (t.type === "folder") {
                const f = t.folder;
                if (f && !existingFolderIds.has(f.id)) {
                  foldersToRestore.push(f);
                }
                (t.notes || []).forEach(n => {
                  if (n && !existingNoteIds.has(n.id)) notesToRestore.push(n);
                });
              }
            });

            const remainingTrash = trash.filter(t => !keys.includes(keyOf(t)));
            return {
              ...s,
              folders: [...foldersToRestore, ...s.folders],
              notes: [...notesToRestore, ...s.notes],
              trash: remainingTrash,
            };
          });
        }}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
