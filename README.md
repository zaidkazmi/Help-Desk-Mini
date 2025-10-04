# HelpDesk Mini

Small Node/Express helpdesk API + static frontend.

Quick start

1. Install dependencies

```bash
npm install
```

2. Start the app

```bash
npm start
# or: node server.js
```

3. Visit

- Frontend: http://localhost:3000/
- Health: http://localhost:3000/api/health


Deploy notes

- Procfile included for platforms like Heroku/Render: `web: node server.js`
- SQLite (`helpdesk.db`) is used by default. Many hosts have ephemeral filesystems. For a persistent production DB, migrate to Postgres or an external managed DB and update `db.js` accordingly.
- Set env vars (e.g. PORT, JWT_SECRET) using your hosting provider dashboard.

Deploying to Render (quick guide)

1. Push your repo to GitHub if it isn't already.

2. Create a new Web Service on Render:
	- Connect your GitHub repo and select the repo.
	- Branch: main (or whichever branch you use)
	- Build Command: `npm install`
	- Start Command: `npm start`
	- Environment: Node 18+ (Render will detect from package.json)

3. Environment variables (in Render Dashboard -> Environment):
	- `PORT` (optional, Render provides a port automatically)
	- `JWT_SECRET` (set to a secure random string)
	- `DB_PATH` (optional) — By default the app creates `./helpdesk.db` in the service's filesystem. Render's filesystem is ephemeral between deploys and may be lost on restarts; for production, use a managed DB. For a demo you can leave `DB_PATH` blank.

4. Deploy and watch the logs. The app should start and print `Server running on port ...` and `Connected to SQLite database at ...` in the logs.

Notes about SQLite on Render

- Render services have ephemeral disks per instance. The SQLite file will be writable while the instance runs but won't be a reliable persistent store across redeploys or if Render moves the instance. For a durable production DB, migrate to Postgres and change `db.js` accordingly.

If you'd like, I can prepare a small migration plan to move from SQLite to Postgres (code changes + Render Postgres addon setup).

Deploying the frontend to Netlify

1. Build & deploy the `public/` folder (static site):
	- Option A (recommended): Connect the GitHub repo to Netlify and set the publish directory to `public`.
	- Option B (manual): Drag & drop the `public/` folder in Netlify's Sites dashboard.

2. Proxy API requests to your backend (Render):
	- Edit `public/_redirects` and replace `BACKEND_URL` with your Render service domain, e.g. `https://your-app.onrender.com`.
	- This makes calls from the frontend to `/api/*` be proxied to your backend and avoids CORS.

3. After deploy, open the Netlify site and the frontend will talk to your backend via the redirect rules.

Notes:
- The backend still needs to be deployed (Render or any host). Netlify will only host static frontend assets.
- If you prefer a single-host setup, you can deploy both frontend and backend on Render or adapt the API into Netlify Functions (requires refactor).

