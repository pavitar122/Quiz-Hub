# Civil Engineering Quiz Hub — Next.js Edition

Converted from the original static HTML quiz app to a full-stack **Next.js 14 (App Router)** application with **MongoDB** backend, authentication, cloud progress sync, and an Admin panel. Questions are now stored as **JSON files in the app folder** for fast loading; user data lives in MongoDB.

UI is kept clean, simple and faithful to the original cyanotype/diazo blueprint theme, with registration marks, title block, and card styling.

## Stack
- Next.js 14 + React 18 (App Router, client + server components)
- MongoDB + Mongoose
- JWT (httpOnly cookie) + bcryptjs for auth
- `data/*.json` for questions (no DB for questions — fast fs read)
- CSS preserved from `css/styles.css` → `app/globals.css`

## Folder Structure
```
quiz-app/
├── app/
│   ├── layout.js               Root layout + AuthProvider + Navbar
│   ├── page.js                 Home — app switcher, search, filter, subject grid
│   ├── globals.css             Cyanotype/Diazo theme (from css/styles.css)
│   ├── auth/
│   │   ├── login/page.js
│   │   └── signup/page.js
│   ├── subject/[id]/page.js    Subject overview — full run, random, bookmarks, smart review, subtopics
│   ├── quiz/[id]/page.js       Quiz engine — test & practice modes, bookmarks, explanations, results
│   ├── admin/page.js           Admin panel — CRUD + mass import
│   └── api/
│       ├── auth/signup, login, logout, me
│       ├── questions           GET categories or single category (from JSON)
│       ├── progress            GET/POST cloud progress (bookmarks, missCounts, bestScores, stats)
│       └── admin/subjects, admin/import
├── data/
│   ├── civil-engineering-1/*.json   ← JSON question banks (was .js → converted)
│   ├── civil-engineering-2/*.json
│   └── non-technical/*.json
├── lib/
│   ├── db.js                   Mongoose connect (cached)
│   ├── auth.js                 JWT sign/verify + cookie helpers
│   └── questions.js            loadAllCategories(), getCategoryById(), saveCategory(), deleteCategoryFile()
├── models/
│   ├── User.js                 {name,email,passwordHash,role}
│   └── Progress.js             {userId, bestScores, bookmarks, missCounts, mastery, stats, hiddenCategories}
├── components/Navbar.js
├── context/AuthContext.js
├── css/styles.css              Original stylesheet (kept for reference)
├── js/app.js                   Original app logic (kept for reference)
├── index.html                  Original entry (kept for reference)
├── .env.example
└── .env.local
```

## Setup & Run

### 1. Install
```bash
npm install
```

### 2. Configure env
Copy `.env.example` to `.env.local` and fill:

```
MONGODB_URI=mongodb://localhost:27017/quizhub
# or Atlas: mongodb+srv://<user>:<pass>@cluster.mongodb.net/quizhub?retryWrites=true&w=majority
JWT_SECRET=your_long_random_secret_at_least_32_chars
NEXT_PUBLIC_APP_URL=http://localhost:3000
ADMIN_EMAILS=admin@example.com,another@admin.com
```

- `ADMIN_EMAILS`: comma-separated list. First signup with an email listed here gets `role=admin`. Others get `role=user`.
- To promote an existing user: `db.users.updateOne({email:"you@example.com"},{$set:{role:"admin"}})` in Mongo shell.

### 3. Dev
```bash
npm run dev
# http://localhost:3000
```

### 4. Build / Start
```bash
npm run build
npm start
```

## How Questions Are Stored (Fast JSON)

Questions are **NOT in MongoDB**. They live as JSON files under `data/` inside the project folder, read via `fs` on the server (`lib/questions.js:65`). This is fast, requires no DB query for question delivery, and makes mass edits / imports trivial.

**Groups:**
- `civil1` → `data/civil-engineering-1/`
- `civil2` → `data/civil-engineering-2/`
- `nontechnical` → `data/non-technical/`

Each subject JSON is self-contained. Example file `data/civil-engineering-1/construction-planning-management.json` is read on every `GET /api/questions`.

## JSON Structure for Questions — Use This to Convert / Import

Every subject file **must** follow this exact shape. Use it to convert PDFs or other sources via AI / script before importing. The Admin Mass Import validates this shape and reports errors field-by-field.

```json
{
  "id": "cpm",
  "title": "Construction Planning & Management",
  "description": "Bar charts, CPM, PERT, cost optimization...",
  "group": "civil1",
  "icon": "📊",
  "subcats": [
    {
      "name": "Introduction to Bar Chart",
      "questions": [
        {
          "num": 1,
          "text": "In a bar chart the vertical axis represents",
          "options": [
            "Time",
            "Types of activities",
            "No. of laborers",
            "Various activities of the project"
          ],
          "correct": 3,
          "expl": "In a Gantt/bar chart, activities are listed on the vertical axis while time is horizontal."
        }
      ]
    }
  ]
}
```

### Field Rules (validated on import)
- `id` (string, required, slug): unique across all subjects. On import, if duplicate, `-2`, `-3` suffix is auto-added. Use lowercase, hyphen/underscore only: `^[a-z0-9-_]+$` recommended. Example: `highway-engineering`, `rcc-complete`, `punjab-gk`.
- `title` (string, required): display name. Example: `"Highway Engineering"`.
- `description` (string, optional): one-line blurb shown on cards.
- `group` (string, optional): one of `civil1`, `civil2`, `nontechnical`. If missing, group is inferred from target folder selected during import, or from folder on disk.
- `icon` (string, optional): single emoji shown on card. Example: `🏗️`. Defaults to `📄` if missing; admin `icon_map` in `lib/questions.js` provides defaults for known ids.
- `subcats` (array, required, non-empty): subtopics.
  - `subcats[].name` (string, required): subtopic name, uppercase shown in UI.
  - `subcats[].questions` (array, required, non-empty):
    - `num` (number, required): stable question number within subject (used for bookmark keys `subIdx-num`). Must be unique within file; auto-assigned if missing (sequential).
    - `text` (string, required): question stem.
    - `options` (array, required, exactly 4 strings): `["A","B","C","D"]`.
    - `correct` (number, required): index `0..3` of correct option.
    - `expl` (string, required): explanation shown after answering. Keep concise.

### Minimal Valid Example (copy-paste for conversion)
```json
{
  "id": "my-new-subject",
  "title": "My New Subject",
  "description": "Objective questions for practice.",
  "group": "civil1",
  "subcats": [
    {
      "name": "Basics",
      "questions": [
        { "num": 1, "text": "What is 2+2?", "options": ["3","4","5","6"], "correct": 1, "expl": "2+2=4." }
      ]
    }
  ]
}
```

### Import Tips
- To convert legacy `window.QUIZ_CATEGORY_X = {...};` files: strip the `window.` wrapper and keep the object literal; or export as plain JSON above.
- You can import a file containing `window.QUIZ_CATEGORY_... = {...}` — the importer strips the wrapper automatically.
- After mass import, the subject appears instantly on Home (no restart). Questions are served from JSON on disk; admin CRUD writes back to the JSON file via `saveCategory()` in `lib/questions.js:100`.

## Auth & Progress (MongoDB)

- **Signup** `POST /api/auth/signup` → creates `User` + empty `Progress`, sets httpOnly `quiz_token` cookie (7d, JWT).
- **Login** `POST /api/auth/login` → verifies bcrypt, sets cookie.
- **Me** `GET /api/auth/me` → reads cookie, returns current user or `null`.
- **Logout** `POST /api/auth/logout` → clears cookie.
- **Progress** `GET /api/progress` → returns cloud progress for logged-in user; `null` if guest (guest can still quiz, but progress not saved).
- **Progress writes** `POST /api/progress` handles:
  - `type: "answer"` — increments `stats`, updates `missCounts` on wrong.
  - `type: "bookmark"` — toggles bookmark.
  - `type: "complete"` — records `bestScores[catId][kind]` and `sessionsCompleted`.
  - `type: "practiceComplete"` — increments sessions.

All progress is per-user, stored in `Progress` collection (one doc per user). UI reads `progress.bestScores`, `progress.bookmarks`, `progress.missCounts`, `progress.stats` to render status chips, filters, and Smart Review queues.

## Admin Panel (`/admin`)

- Guarded: only `role=admin` can access (redirects otherwise). Check `lib/auth.js`.
- **Create Subject**: prompt for title → creates `data/<group>/<slug>.json` with one empty subtopic `General`.
- **Question CRUD** per selected subject:
  - Add: pick subtopic, fill text/4 options/correct/expl → `POST /api/admin/subjects {action:"addQuestion"}`.
  - Edit: loads question into form, Save Edit → `POST {action:"editQuestion"}`.
  - Delete: `DELETE /api/admin/subjects {catId, subIdx, num}`.
  - Delete Subject: `DELETE /api/admin/subjects?id=<id>` removes the JSON file.
- **Mass Import JSON**: choose target group, pick `.json`/`.js`/`.txt` file, click Mass Import → `POST /api/admin/import`. File is parsed, validated (same rules as above), id de-duplicated, then saved as new JSON under the chosen group's folder. Example error: `Q3 in "Basics" needs 4 options`.

## Quiz Engine

- `app/quiz/[id]/page.js` builds queues client-side:
  - `type=full` → all questions in order.
  - `type=random` → shuffle, 30 max.
  - `type=sub&idx=N` → subtopic N.
  - `type=bookmarked` / `type=missed` → rebuilt from cloud `progress` (requires login; else empty).
- Test Mode: linear, score, review missed at end.
- Practice Mode: missed questions re-inserted at random later positions until mastered; tracks `mastered`, `attempts`, `retryCounts`.
- Bookmarks toggle via `/api/progress` bookmark endpoint; auth optional (fails silently if not logged in).
- Result page offers Retry / Back to Subject / Home.

## Errors Fixed from Original App

Checked `js/app.js`, `index.html`, `data/*.js` and `css/styles.css`:

- **Missing category registry entries**: Original `CATEGORY_SOURCE_INFO` listed only 7 ids, but `index.html` loads 21 data files. Fixed by converting all 21 files to JSON and loading them dynamically via `lib/questions.js:65` (`loadAllCategories()` reads all `.json` in data folders) — no manual registry needed; icons/groups mapped centrally.
- **Stale/mismatched varNames & paths**: e.g., `building-construction.js` exported `QUIZ_CATEGORY_BUIC` but `CATEGORY_SOURCE_INFO` expected `QUIZ_CATEGORY_BMCT` at wrong path; `soil-and-foundation.js` `id=geotech2` not `soil-and-foundation`; `rcc.js`, `steel.js`, `fluid_mechanics.js`, etc. missed entirely. Fixed by normalizing all to JSON with correct `id` from file content.
- **Inconsistent id quoting**: Some files used `"id": "building-construction"` (JSON style) vs `id: "cpm"` (JS style). Converter (`vm` sandbox) handles both; new JSON is normalized.
- **RAW_CATEGORIES included 21 categories but CATEGORY_SOURCE_INFO export path broken** for most — "Export Data File" would write wrong `varName`/`path`. Now `saveCategory()` writes JSON directly to disk with correct folder.
- **Hidden subjects / overrides stored only in localStorage** — not portable across devices. Migrated to MongoDB `Progress.hiddenCategories` + server progress (optional guest fallback via localStorage could be re-added if needed).
- **No group validation**: original `validGroupId()` could leave `activeApp` stale after renames. Now groups are fixed in `lib/questions.js` and Home defaults to `civil1`.
- **Potential file-size limit missing for import**: Added 3MB check in original; admin import validates size server-side and shape validation reports exact field errors.
- **Theme persistence**: kept via `localStorage` + `body.dark` toggle in `components/Navbar.js`.
- **Missing `data/` JSON handling**: Created conversion script (was `convert.js`) to generate `.json` alongside legacy `.js`; next build reads only `.json`, old `.js` kept for reference but ignored.

## Legacy Files Kept

- `index.html`, `css/styles.css`, `js/app.js`, `data/*.js` remain in repo for reference / fallback. Next.js ignores them; active app uses `app/` + `data/*.json`.

## Scripts

- `npm run dev` — dev server (requires `MONGODB_URI`)
- `npm run build` — production build (will warn if `MONGODB_URI` not set, but build still succeeds for pages that don't need DB at build time)
- `npm start` — production start

## Deployment Notes

- Set `MONGODB_URI` to Atlas in production env.
- Set `JWT_SECRET` to a long random value (32+ chars) — same across all instances.
- Ensure `data/` folder is writable by the Node process in production (for admin writes). On serverless (Vercel), filesystem is read-only — move admin writes to MongoDB or S3 instead; current implementation assumes a persistent filesystem (VM, Docker, or `next start` on a writable disk).
- For Vercel: either disable admin writes or replace `lib/questions.js` file writes with a DB collection for questions.

