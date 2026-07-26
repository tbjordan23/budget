# Jordan Budget 2026 — Railway-ready package

This folder turns the claude.ai artifact into a standalone app you can host
yourself: a small Express server, a SQLite-backed storage API (replacing the
claude.ai-only `window.storage`), and the budget app as the static frontend.

## What's in here

- `public/index.html` — the budget app (same one from claude.ai), with a
  `window.storage` shim added at the top of the script that calls the new
  `/api/storage/:key` endpoints instead of the claude.ai artifact API.
- `server.js` — Express server. Serves `public/` and exposes:
  - `GET /api/storage/:key`
  - `PUT /api/storage/:key` (body: `{ "value": "<string>" }`)
  - `DELETE /api/storage/:key`
  - `GET /health`
- `package.json` — dependencies (`express`, `better-sqlite3`).
- `railway.json` — Railway build/deploy config (Nixpacks, `npm start`).

## Do you need to create a new Railway project first?

**No — you've already got one.** Your Railway project is called **Budget**
(project ID `37495c4e-2b20-4360-855c-066948a4f05a`), and your code lives at
**https://github.com/tbjordan23/budget**. The prompt below pushes this
folder's contents to that GitHub repo and connects it to the existing
Railway project, so deploys happen via git push rather than a direct
`railway up` from your machine.

## Important: persistent storage

SQLite writes to a file on disk. Railway's default filesystem is
**ephemeral** — it resets on every redeploy — so without a volume, your
budget data would get wiped each time you ship an update. To avoid that:

1. In the Railway project, add a **Volume** and mount it at `/data`.
2. Set an environment variable `DATA_DIR=/data` on the service.

The server already reads `DATA_DIR` from the environment (falls back to a
local `./data` folder if unset, which is fine for local testing but not for
production). The prompt below asks Claude Code to set this up for you.

## Run it locally first (optional but recommended)

```bash
npm install
npm start
# open http://localhost:3000
```

## The prompt to paste into Claude Code

Open a terminal in this folder and run `claude`, then paste:

```
I have a Node/Express app in this folder (server.js, package.json,
public/index.html) that I want to deploy to Railway via GitHub. Details:

  GitHub repo: https://github.com/tbjordan23/budget
  Railway project name: Budget
  Railway project ID: 37495c4e-2b20-4360-855c-066948a4f05a

Please:

1. Initialize a git repo here if one doesn't already exist.
2. Set the remote origin to https://github.com/tbjordan23/budget (add it
   if missing), commit the current files, and push to the main branch.
   If the repo already has commits/history, pull first and resolve
   accordingly rather than force-pushing over it.
3. Link this folder to the existing "Budget" Railway project (ID
   37495c4e-2b20-4360-855c-066948a4f05a) — do not create a new project.
4. Connect that Railway project's service to the
   github.com/tbjordan23/budget repo (main branch) so future pushes to
   GitHub trigger an automatic redeploy. If it's already connected, just
   confirm that and trigger a deploy from the latest push.
5. Add a persistent volume to the service, mount it at /data, and set the
   environment variable DATA_DIR=/data so the SQLite storage file survives
   redeploys.
6. Confirm the health check at /health passes after deploy.
7. Give me the public URL Railway assigns.
8. Explain the update flow going forward: I make changes locally (or you
   make them for me), we commit and push to
   github.com/tbjordan23/budget, and Railway auto-deploys to the same URL.

If the Railway CLI isn't installed, I'm not logged in, or GitHub auth is
needed (e.g. via `gh auth login`), tell me exactly what command to run.
```

That's it — Claude Code will handle installing dependencies, provisioning
the project, wiring up the volume, and deploying. Once it's live, any time
you want to update the app, you can either:

- Ask Claude Code directly to make the change and redeploy, or
- Bring the updated `public/index.html` back here from a claude.ai chat
  and ask Claude Code to swap it in and redeploy.

Either way, redeploys go to the same Railway URL — it doesn't change. With
GitHub connected, the flow is just: commit, push, Railway redeploys
automatically.

## Reference: the manual CLI equivalent

If you ever want to do this yourself instead of asking Claude Code, the
underlying commands are roughly:

```bash
# push code to GitHub
git init                                  # if not already a repo
git remote add origin https://github.com/tbjordan23/budget
git add .
git commit -m "Initial Railway-ready budget app"
git push -u origin main

# connect Railway to it
npm install -g @railway/cli               # if not already installed
railway login
railway link 37495c4e-2b20-4360-855c-066948a4f05a
# then in the Railway dashboard: Settings > Service > connect the
# tbjordan23/budget GitHub repo (main branch) for auto-deploys

# persistent storage
railway volume add                        # attach a volume, mount at /data
railway variables set DATA_DIR=/data
```

