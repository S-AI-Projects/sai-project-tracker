// Builds tracker.json from data/assignments.json + GitHub PRs. Zero deps, Node 22.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ORG = 'S-AI-Projects';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BATCH = 5;            // repos fetched in parallel per batch
const BATCH_PAUSE_MS = 500; // pause between batches
const TIMEOUT_MS = 20000;   // per request
const RETRIES = 4;          // attempts per request
const MAX_WAIT_MS = 120000; // longest rate-limit wait before giving up
const COMMITS_SINCE = '2026-11-03'; // first day on the commits chart (IST), when the org repos were created
const RANK = { merged: 3, open: 2, closed: 1 };

const CLOSING_RE =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(?:#(\d+)|([\w.-]+)\/([\w.-]+)#(\d+)|https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+))/gi;
const TASK_RE = /R\d+-T\d+/i;

export const dataDir = () => process.env.DATA_DIR || join(ROOT, 'data');

/** Issue numbers a PR points at. taskMap: Map<taskId, issueNumber> for this repo. */
export function issuesForPr(pr, repo, taskMap) {
  const nums = new Set();
  const same = (o, r) => o.toLowerCase() === ORG.toLowerCase() && r.toLowerCase() === repo.toLowerCase();
  for (const m of (pr.body || '').matchAll(CLOSING_RE)) {
    if (m[1]) nums.add(+m[1]);
    else if (m[4] && same(m[2], m[3])) nums.add(+m[4]);
    else if (m[7] && same(m[5], m[6])) nums.add(+m[7]);
  }
  if (!nums.size) {
    const t = (pr.title || '').match(TASK_RE);
    const n = t && taskMap.get(t[0].toUpperCase());
    if (n != null) nums.add(n);
  }
  return [...nums];
}

const prState = (pr) => (pr.merged_at ? 'merged' : pr.state === 'open' ? 'open' : 'closed');

/** Map<issueNumber, {number, author, state}> keeping the best PR per issue. */
export function bestPrs(prs, repo, taskMap) {
  const best = new Map();
  for (const pr of prs) {
    const cand = { number: pr.number, author: pr.user?.login ?? null, state: prState(pr) };
    for (const n of issuesForPr(pr, repo, taskMap)) {
      const cur = best.get(n);
      if (!cur || RANK[cand.state] > RANK[cur.state] ||
          (RANK[cand.state] === RANK[cur.state] && cand.number > cur.number)) best.set(n, cand);
    }
  }
  return best;
}

/** data/assignments.csv is the "Task Issues" tab of the assignment sheet, downloaded as CSV. */
export function parseAssignments(text) {
  const table = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); table.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); table.push(row); }
  const head = table.shift().map((h) => h.trim());
  const col = (r, name) => (r[head.indexOf(name)] ?? '').trim();
  return table.filter((r) => /\/issues\/\d+/.test(col(r, 'Issue URL'))).map((r) => ({
    id: col(r, 'Enrollment No'), name: col(r, 'Student Name'), batch: col(r, 'Batch'), lab: col(r, 'Lab Batch'),
    repo: col(r, 'Org Repository').split('/').pop(), n: +col(r, 'Task No'), taskId: col(r, 'Task ID'),
    title: col(r, 'Task'), number: +col(r, 'Issue URL').match(/\/issues\/(\d+)/)[1],
  }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET with a per-request timeout, retries with backoff, and rate-limit waits. */
async function gh(url, headers, payload) {
  for (let attempt = 1; ; attempt++) {
    let res, err;
    try { res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), ...(payload && { method: 'POST', body: JSON.stringify(payload) }) }); } catch (e) { err = e; }
    if (res?.status === 200) return res.json();
    const body = res ? (await res.text().catch(() => '')).slice(0, 200) : String(err?.message || err);
    const limited = res && (res.status === 429 || (res.status === 403 &&
      (res.headers.get('x-ratelimit-remaining') === '0' || res.headers.has('retry-after') || /rate limit/i.test(body))));
    const retryable = !res || limited || res.status >= 500;
    if (!retryable || attempt >= RETRIES) throw new Error(`GitHub ${res?.status ?? 'network'} for ${url}: ${body}`);
    let wait = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s...
    if (limited) {
      const after = +res.headers.get('retry-after') * 1000;
      const reset = +res.headers.get('x-ratelimit-reset') * 1000 - Date.now();
      wait = Math.max(wait, after || 0, reset > 0 ? reset + 1000 : 0);
      if (wait > MAX_WAIT_MS) throw new Error(`GitHub rate limit hit, resets in ${Math.ceil(wait / 60000)} min. Set GITHUB_TOKEN.`);
    }
    console.warn(`[fetch-data] retry ${attempt}/${RETRIES - 1} in ${Math.round(wait / 1000)}s: ${res?.status ?? body}`);
    await sleep(wait);
  }
}

async function fetchPrs(repo) {
  const headers = { 'User-Agent': 'sai-project-tracker', Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const all = [];
  for (let page = 1; ; page++) {
    const items = await gh(`https://api.github.com/repos/${ORG}/${encodeURIComponent(repo)}/pulls?state=all&per_page=100&page=${page}`, headers);
    all.push(...items);
    if (items.length < 100) return all;
  }
}

const COMMITS_QUERY = `query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { number author { login } commits(first: 100) { nodes { commit { oid authoredDate parents { totalCount } } } } }
    }
  }
}`;

/** Non-merge commits in every PR (open, merged or closed) of a repo. Students push to their own forks, so PRs are where their commits show up. */
async function fetchPrCommits(repo) {
  const headers = { 'User-Agent': 'sai-project-tracker', Authorization: `Bearer ${process.env.GITHUB_TOKEN}` };
  const all = [];
  for (let cursor = null; ; ) {
    const res = await gh('https://api.github.com/graphql', headers, { query: COMMITS_QUERY, variables: { owner: ORG, name: repo, cursor } });
    if (res.errors?.length) throw new Error(`GitHub GraphQL for ${repo}: ${res.errors[0].message}`);
    const prs = res.data.repository.pullRequests;
    for (const pr of prs.nodes) for (const { commit } of pr.commits.nodes)
      if (commit.parents.totalCount < 2) all.push({ oid: commit.oid, authoredDate: commit.authoredDate, repo, pr: pr.number, login: pr.author?.login ?? '' });
    if (!prs.pageInfo.hasNextPage) return all;
    cursor = prs.pageInfo.endCursor;
  }
}

const istDay = (t) => new Date(new Date(t).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);

/**
 * Commits per IST day from COMMITS_SINCE to today, by author date, each commit counted once.
 * Returns { days: [dates], total: [counts], repos: {repo: [counts]}, students: {id: [counts]} }; rows that are all zero are left out.
 * studentOf(commit) returns the student id the commit belongs to, or undefined.
 */
export function commitsPerDay(commits, studentOf = () => undefined, now = Date.now()) {
  const days = [];
  for (let d = COMMITS_SINCE, end = istDay(now); d <= end; d = new Date(Date.parse(d) + 86400000).toISOString().slice(0, 10)) days.push(d);
  const index = new Map(days.map((d, i) => [d, i]));
  const out = { days, total: days.map(() => 0), repos: {}, students: {} };
  const bump = (group, key, i) => { (group[key] ??= days.map(() => 0))[i]++; };
  const seen = new Set();
  for (const c of commits) {
    const i = index.get(istDay(c.authoredDate));
    if (seen.has(c.oid) || i == null) continue;
    seen.add(c.oid);
    out.total[i]++;
    bump(out.repos, c.repo, i);
    const id = studentOf(c);
    if (id) bump(out.students, id, i);
  }
  return out;
}

/** Repos go out in small batches with a pause between them, to stay under GitHub's secondary limits. */
async function inBatches(items, size, pauseMs, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    if (i) await sleep(pauseMs);
    out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  }
  return out;
}

export async function fetchData() {
  let rows = parseAssignments(await readFile(join(ROOT, 'data', 'assignments.csv'), 'utf8'));
  const only = process.env.ONLY_REPOS?.split(',').map((s) => s.trim()).filter(Boolean);
  if (only?.length) rows = rows.filter((r) => only.includes(r.repo));

  const repos = [...new Set(rows.map((r) => r.repo))];
  const taskMaps = new Map(repos.map((r) => [r, new Map()]));
  for (const r of rows) if (r.taskId) taskMaps.get(r.repo).set(String(r.taskId).toUpperCase(), r.number);

  const prLists = await inBatches(repos, BATCH, BATCH_PAUSE_MS, fetchPrs); // throws on any failure
  // A commit belongs to the student whose issue its PR is linked to, else to the student that PR author's other PRs are linked to.
  const issueStudent = new Map(rows.map((r) => [`${r.repo}#${r.number}`, r.id]));
  const prStudent = new Map();
  const loginStudent = new Map();
  repos.forEach((repo, i) => {
    for (const pr of prLists[i]) {
      const id = issuesForPr(pr, repo, taskMaps.get(repo)).map((n) => issueStudent.get(`${repo}#${n}`)).find(Boolean);
      if (!id) continue;
      prStudent.set(`${repo}#${pr.number}`, id);
      if (pr.user?.login) loginStudent.set(pr.user.login.toLowerCase(), id);
    }
  });
  const studentOf = (c) => prStudent.get(`${c.repo}#${c.pr}`) ?? loginStudent.get(c.login.toLowerCase());

  let commits = null;
  if (process.env.GITHUB_TOKEN) commits = commitsPerDay((await inBatches(repos, BATCH, BATCH_PAUSE_MS, fetchPrCommits)).flat(), studentOf);
  else console.warn('[fetch-data] no GITHUB_TOKEN, skipping commits per day (GraphQL needs a token)');

  const best = new Map(repos.map((repo, i) => [repo, bestPrs(prLists[i], repo, taskMaps.get(repo))]));

  const students = new Map();
  const summary = { students: 0, issues: 0, merged: 0, open: 0, none: 0 };
  for (const r of rows) {
    let s = students.get(r.id);
    if (!s) students.set(r.id, (s = { id: r.id, name: r.name, batch: r.batch, lab: r.lab, repo: r.repo, issues: [] }));
    const pr = best.get(r.repo).get(r.number) ?? null;
    const status = pr?.state === 'merged' ? 'merged' : pr?.state === 'open' ? 'open' : 'none';
    s.issues.push({ n: r.n, taskId: r.taskId, title: r.title, number: r.number, status, pr });
    summary.issues++;
    summary[status]++;
  }
  const list = [...students.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  for (const s of list) s.issues.sort((a, b) => a.n - b.n);
  summary.students = list.length;

  const syncedAt = new Date().toISOString();
  const dir = dataDir();
  await mkdir(dir, { recursive: true });
  const out = join(dir, 'tracker.json');
  const tmp = `${out}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify({ org: ORG, syncedAt, commits, students: list }));
  await rename(tmp, out);

  console.log(`[fetch-data] ${repos.length} repos -> ${out}`, JSON.stringify(summary));
  return { syncedAt, ...summary };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  fetchData().catch((e) => { console.error(`[fetch-data] failed: ${e.message}`); process.exit(1); });
}
