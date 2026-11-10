# sai-project-tracker

Traffic-light tracker for student issue assignments in the `S-AI-Projects` GitHub org.

- Live: https://s-ai-projects.github.io/sai-project-tracker/
- Input: `data/assignments.csv` (one row per student per task).
- Output: `data/tracker.json` (assignments joined with PR status from GitHub).
- UI: React + Vite + shadcn/ui on GitHub Pages. No server.

## How it runs

- `Fetch data` workflow: daily at 00:00 IST, or manually (Actions > Fetch data > Run workflow). Runs `scripts/fetch-data.mjs` and commits `data/tracker.json` to `main`.
- The app reads `data/tracker.json` straight from `raw.githubusercontent.com` at page load, so a data update needs no rebuild. GitHub caches raw files for up to 5 minutes.
- `Deploy` workflow: rebuilds and publishes the UI on pushes to `main` that touch app code. Data, script and markdown changes do not trigger it.
- The Refresh button opens the `Fetch data` workflow page.

## Status rules

- Green (`merged`): linked PR is merged.
- Yellow (`open`): linked PR is open.
- Red (`none`): no PR, or only closed-unmerged PRs (recorded with state `closed`).
- A PR is linked to an issue by a closing reference in its body (`Resolves S-AI-Projects/<repo>#7`, `Fixes #7`, or the issue URL).
- Fallback: Task ID in the PR title (`R01-T002: ...`), looked up in `assignments.csv` for that repo.
- Several PRs on one issue: merged beats open beats closed.

## Local dev

```sh
npm install
npm run dev                               # UI, reads the published data file
GITHUB_TOKEN=ghp_xxx npm run fetch-data   # optional, rewrites data/tracker.json locally
```

- `ONLY_REPOS=Bash-Oneliner npm run fetch-data` limits the fetch, for testing.

## Updating assignments

1. In the assignment sheet, open the `Task Issues` tab, then File > Download > CSV. Save it as `data/assignments.csv`.
2. Commit and push, then run the `Fetch data` workflow.

## GitHub API limits

- Requests time out after 20s and retry up to 4 times with backoff (1s, 2s, 4s).
- Repos are fetched 5 at a time with a 500ms pause between batches.
- On a rate limit the script waits for the reset if it is under 2 minutes, otherwise it fails and keeps the old `tracker.json`.
- Without `GITHUB_TOKEN` the limit is 60 requests an hour, which is less than one full run.
- Tune the constants at the top of `scripts/fetch-data.mjs`.
