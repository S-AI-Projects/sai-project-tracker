import { useCallback, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableCell, TableHead, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Status = 'none' | 'open' | 'merged'
type Issue = {
  n: number
  taskId: string
  title: string
  number: number
  status: Status
  pr: null | { number: number; author: string; state: 'open' | 'merged' | 'closed' }
}
type Student = { id: string; name: string; batch: string; lab: string; repo: string; issues: Issue[] }
type Day = { date: string; count: number }
type Data = { org: string; syncedAt: string; commits?: Day[]; students: Student[] }
type Route = { tab: 'students' | 'repos' | 'activity'; repo: string }

const STATUSES: Status[] = ['merged', 'open', 'none']
const LABEL: Record<Status, string> = { none: 'No PR', open: 'PR raised', merged: 'Merged' }
const BG: Record<Status, string> = { none: 'bg-none', open: 'bg-open', merged: 'bg-merged' }
const PAGE = 50
const LINK = 'underline underline-offset-[3px] hover:text-zinc-600'

const count = (issues: Issue[], s: Status) => issues.filter((i) => i.status === s).length
const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b))
const pct = (n: number, total: number) => (total ? ((n / total) * 100).toFixed(1) : '0.0') + '%'

function parseHash(): Route {
  const [tab, ...rest] = location.hash.replace(/^#\/?/, '').split('/')
  return { tab: tab === 'repos' || tab === 'activity' ? tab : 'students', repo: decodeURIComponent(rest.join('/')) }
}

function Dot({ status, className }: { status: Status; className?: string }) {
  return <span className={cn('size-2.5 shrink-0 rounded-full', BG[status], className)} />
}

type Option = { value: string; label: string }

// Radix Select items cannot have an empty value, so "" (no filter) maps to ALL.
const ALL = '__all'

function Filter({ label, value, onChange, options, className }: { label: string; value: string; onChange: (v: string) => void; options: Option[]; className?: string }) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || ALL} value={o.value || ALL}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Search(props: ComponentProps<'input'>) {
  return (
    <div className="relative">
      <svg
        aria-hidden="true"
        className="absolute top-1/2 left-3 size-[15px] -translate-y-1/2 text-muted-foreground"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <Input type="text" className="pl-9" {...props} />
    </div>
  )
}

const REPO = 'S-AI-Projects/sai-project-tracker'
const DATA_URL = `https://raw.githubusercontent.com/${REPO}/main/data/tracker.json`
const REFRESH_URL = `https://github.com/${REPO}/issues/new?title=${encodeURIComponent('Refresh data')}&body=${encodeURIComponent('Submit this issue to refresh the tracker data. It closes itself. Reload the dashboard after about 2 minutes.')}`
const COOLDOWN_MS = 15 * 60 * 1000 // keep in sync with .github/workflows/fetch-data.yml

export default function App() {
  const [data, setData] = useState<Data | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [route, setRoute] = useState(parseHash)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error()
      setData(await res.json())
      setState('ready')
    } catch {
      setState((s) => (s === 'ready' ? s : 'missing'))
    }
  }, [])

  useEffect(() => {
    load()
    const onHash = () => setRoute(parseHash())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [load])

  const go = (tab: Route['tab'], repo = '') => {
    location.hash = `/${tab}${repo ? '/' + encodeURIComponent(repo) : ''}`
  }

  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])
  const nextRefresh = data ? new Date(data.syncedAt).getTime() + COOLDOWN_MS : 0
  const cooling = nextRefresh > now

  const org = data?.org ?? 'S-AI-Projects'

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b px-4 py-3.5 sm:px-8">
        <div className="flex flex-col gap-0.5">
          <div className="font-semibold">S&amp;AI Project Tracker</div>
          <a
            href={`https://github.com/${org}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground hover:underline"
          >
            github.com/{org}
          </a>
        </div>
        <Tabs value={route.tab} onValueChange={(t) => go(t as Route['tab'], t === 'repos' ? route.repo : '')} className="sm:ml-4">
          <TabsList>
            <TabsTrigger value="students">Students</TabsTrigger>
            <TabsTrigger value="repos">Repositories</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="grow" />
        {data && (
          <div className="text-[13px] text-muted-foreground">
            Last synced{' '}
            {new Date(data.syncedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        )}
        <Button
          disabled={cooling}
          onClick={() => window.open(REFRESH_URL, '_blank', 'noopener')}
          title="Opens a GitHub issue. Submit it to refresh the data, then reload this page after about 2 minutes. Limited to once every 15 minutes."
        >
          <svg
            aria-hidden="true"
            className="size-[15px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
          {cooling ? `Refresh at ${new Date(nextRefresh).toLocaleTimeString(undefined, { timeStyle: 'short' })}` : 'Refresh'}
        </Button>
      </header>

      <main className="mx-auto max-w-[1280px] px-4 pt-6 pb-8 sm:px-8">
        {state === 'loading' && <p className="text-sm text-muted-foreground">Loading...</p>}
        {state === 'missing' && <p className="text-sm text-muted-foreground">No data yet. Run the fetch-data workflow on GitHub.</p>}
        {data &&
          (route.tab === 'students' ? (
            <Students data={data} openRepo={(r) => go('repos', r)} />
          ) : route.tab === 'repos' ? (
            <Repos data={data} selected={route.repo} select={(r) => go('repos', r)} />
          ) : (
            <Activity days={data.commits ?? []} />
          ))}
      </main>
    </div>
  )
}

function Stat({ label, status, value, sub }: { label: string; status?: Status; value: number; sub: string }) {
  return (
    <Card className="flex flex-col gap-1.5 px-[18px] py-4">
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        {status && <Dot status={status} />}
        {label}
      </div>
      <div className="text-[26px] leading-tight font-semibold">{value.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </Card>
  )
}

function Students({ data, openRepo }: { data: Data; openRepo: (repo: string) => void }) {
  const [q, setQ] = useState('')
  const [batch, setBatch] = useState('')
  const [lab, setLab] = useState('')
  const [repo, setRepo] = useState('')
  const [sort, setSort] = useState('merged')
  const [page, setPage] = useState(0)
  const { students, org } = data

  const stats = useMemo(() => {
    const all = students.flatMap((s) => s.issues)
    return {
      total: all.length,
      merged: count(all, 'merged'),
      open: count(all, 'open'),
      none: count(all, 'none'),
      zero: students.filter((s) => s.issues.every((i) => !i.pr)).length,
      batches: uniq(students.map((s) => s.batch)),
      labs: uniq(students.map((s) => s.lab)),
      repos: uniq(students.map((s) => s.repo)),
    }
  }, [students])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const byName = (a: Student, b: Student) => a.name.localeCompare(b.name)
    const progress = (s: Student) => count(s.issues, 'merged') * 2 + count(s.issues, 'open')
    return students
      .filter(
        (s) =>
          (!needle || s.name.toLowerCase().includes(needle)) &&
          (!batch || s.batch === batch) &&
          (!lab || s.lab === lab) &&
          (!repo || s.repo === repo),
      )
      .sort((a, b) =>
        sort === 'merged'
          ? count(b.issues, 'merged') - count(a.issues, 'merged') || count(b.issues, 'open') - count(a.issues, 'open') || byName(a, b)
          : sort === 'least'
            ? progress(a) - progress(b) || byName(a, b)
            : byName(a, b),
      )
  }, [students, q, batch, lab, repo, sort])

  useEffect(() => setPage(0), [q, batch, lab, repo, sort])

  const start = page * PAGE
  const shown = rows.slice(start, start + PAGE)
  const filter = (
    label: string,
    all: string,
    value: string,
    set: (v: string) => void,
    options: string[],
  ): ReactNode => (
    <Filter label={label} value={value} onChange={set} options={[{ value: '', label: all }, ...options.map((o) => ({ value: o, label: o }))]} />
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <Stat label="Students" value={students.length} sub={`${stats.repos.length} repositories`} />
        <Stat
          label="Merged"
          status="merged"
          value={stats.merged}
          sub={`${pct(stats.merged, stats.total)} of ${stats.total.toLocaleString()} issues`}
        />
        <Stat label="PR raised" status="open" value={stats.open} sub={`${pct(stats.open, stats.total)} awaiting review`} />
        <Stat label="No PR yet" status="none" value={stats.none} sub={`${pct(stats.none, stats.total)} not started`} />
        <Stat label="Students with 0 PRs" value={stats.zero} sub="Needs follow-up" />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="max-w-[340px] flex-[1_1_260px]">
          <Search
            aria-label="Search students"
            placeholder="Search by name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {filter('Batch', 'All batches', batch, setBatch, stats.batches)}
        {filter('Lab batch', 'All lab batches', lab, setLab, stats.labs)}
        {filter('Repository', 'All repositories', repo, setRepo, stats.repos)}
        <Filter
          label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'name', label: 'Sort: Name' },
            { value: 'merged', label: 'Sort: Most progress' },
            { value: 'least', label: 'Sort: Least progress' },
          ]}
        />
        <div className="grow" />
        <div className="flex items-center gap-3.5 text-xs text-zinc-600">
          {(['none', 'open', 'merged'] as const).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <Dot status={s} className="size-3" />
              {LABEL[s]}
            </span>
          ))}
        </div>
      </div>

      <Table className="min-w-[880px]">
        <thead>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Student</TableHead>
            <TableHead>Batch</TableHead>
            <TableHead>Repository</TableHead>
            <TableHead>Issues 1 to 10</TableHead>
            <TableHead className="text-right">Merged</TableHead>
          </TableRow>
        </thead>
        <tbody>
          {shown.map((s, i) => (
            <TableRow key={s.id} className="first:border-t">
              <TableCell className="text-muted-foreground">{start + i + 1}</TableCell>
              <TableCell>
                <div className="font-medium">{s.name}</div>
              </TableCell>
              <TableCell>
                <div>{s.batch}</div>
                <div className="text-xs text-muted-foreground">{s.lab}</div>
              </TableCell>
              <TableCell>
                <Button variant="link" className="text-[13px]" onClick={() => openRepo(s.repo)}>
                  {s.repo}
                </Button>
              </TableCell>
              <TableCell>
                <div className="flex gap-1.5">
                  {s.issues.map((it) => {
                    const label = `Task ${it.n}: ${LABEL[it.status]}${it.pr ? ` (#${it.pr.number})` : ''} - ${it.title}`
                    return (
                      <a
                        key={it.n}
                        href={`https://github.com/${org}/${s.repo}/${it.pr ? 'pull/' + it.pr.number : 'issues/' + it.number}`}
                        target="_blank"
                        rel="noreferrer"
                        title={label}
                        aria-label={label}
                        className={cn(
                          'flex size-[22px] shrink-0 items-center justify-center rounded-full hover:opacity-80',
                          BG[it.status],
                        )}
                      >
                        {it.status === 'merged' && (
                          <svg
                            aria-hidden="true"
                            className="size-3"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#fff"
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M5 12.5l4.5 4.5L19 7.5" />
                          </svg>
                        )}
                      </a>
                    )
                  })}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="font-semibold">{count(s.issues, 'merged')}</span>
                <span className="text-muted-foreground"> / {s.issues.length}</span>
              </TableCell>
            </TableRow>
          ))}
          {!shown.length && (
            <TableRow className="first:border-t">
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                No students match these filters.
              </TableCell>
            </TableRow>
          )}
        </tbody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted-foreground">
        <div>
          Showing {rows.length ? start + 1 : 0} to {start + shown.length} of {rows.length.toLocaleString()} students
        </div>
        <div className="flex gap-2 text-foreground">
          <Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <Button size="sm" disabled={start + PAGE >= rows.length} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}

function Repos({ data, selected, select }: { data: Data; selected: string; select: (repo: string) => void }) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [student, setStudent] = useState('')

  const repos = useMemo(() => {
    const map = new Map<string, { student: Student; issue: Issue }[]>()
    for (const s of data.students) {
      const list = map.get(s.repo) ?? []
      for (const issue of s.issues) list.push({ student: s, issue })
      map.set(s.repo, list)
    }
    return [...map]
      .map(([name, items]) => {
        const issues = items.map((x) => x.issue)
        return {
          name,
          items: items.sort((a, b) => a.issue.number - b.issue.number),
          merged: count(issues, 'merged'),
          open: count(issues, 'open'),
          none: count(issues, 'none'),
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [data])

  const repo = repos.find((r) => r.name === selected) ?? repos[0]
  useEffect(() => {
    setStatus('')
    setStudent('')
  }, [repo?.name])

  if (!repo) return <p className="text-sm text-muted-foreground">No repositories in the data.</p>

  const listed = repos.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()))
  const members = [...new Map(repo.items.map((x) => [x.student.id, x.student])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  const items = repo.items.filter(
    (x) => (!status || x.issue.status === status) && (!student || x.student.id === student),
  )
  const base = `https://github.com/${data.org}/${repo.name}`
  const chip = { merged: 'merged', open: 'PR raised', none: 'no PR' }

  return (
    <div className="flex flex-wrap items-start gap-6">
      <Card className="max-w-full min-w-0 flex-[1_1_280px] overflow-hidden">
        <div className="border-b p-3">
          <Search
            aria-label="Search repositories"
            placeholder={`Search ${repos.length} repositories`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="max-h-[320px] overflow-y-auto md:max-h-[calc(100vh-230px)]">
          {listed.map((r) => {
            const total = r.items.length
            return (
              <button
                key={r.name}
                type="button"
                aria-current={r.name === repo.name ? 'true' : undefined}
                onClick={() => select(r.name)}
                className={cn(
                  'flex w-full flex-col gap-[7px] border-t border-muted px-3.5 py-[11px] text-left first:border-t-0 hover:bg-muted/60',
                  r.name === repo.name && 'bg-muted hover:bg-muted',
                )}
              >
                <div className="flex justify-between gap-2 text-[13px]">
                  <span className="truncate font-medium">{r.name}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {r.merged} / {total}
                  </span>
                </div>
                <div className="flex h-1.5 overflow-hidden rounded-full bg-none">
                  <span className="bg-merged" style={{ width: pct(r.merged, total) }} />
                  <span className="bg-open" style={{ width: pct(r.open, total) }} />
                </div>
              </button>
            )
          })}
          {!listed.length && <div className="p-3.5 text-[13px] text-muted-foreground">No repositories match.</div>}
        </div>
      </Card>

      <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-[22px] font-semibold break-words">{repo.name}</h1>
            <a href={base} target="_blank" rel="noreferrer" className="text-[13px] text-zinc-600 underline">
              {data.org}/{repo.name}
            </a>
          </div>
          <div className="grow" />
          <div className="flex flex-wrap gap-2 text-[13px]">
            {STATUSES.map((s) => (
              <span key={s} className="flex items-center gap-1.5 rounded-md border px-2.5 py-[5px]">
                <Dot status={s} />
                {repo[s]} {chip[s]}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Filter
            label="Status"
            className="text-[13px]"
            value={status}
            onChange={setStatus}
            options={[{ value: '', label: 'All statuses' }, ...(['none', 'open', 'merged'] as const).map((x) => ({ value: x, label: LABEL[x] }))]}
          />
          <Filter
            label="Student"
            className="text-[13px]"
            value={student}
            onChange={setStudent}
            options={[{ value: '', label: `All ${members.length} students` }, ...members.map((m) => ({ value: m.id, label: m.name }))]}
          />
        </div>

        <Table className="min-w-[760px] text-[13px]">
          <thead>
            <TableRow>
              <TableHead>Issue</TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Assigned to</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pull request</TableHead>
            </TableRow>
          </thead>
          <tbody>
            {items.map(({ student: s, issue: it }) => (
              <TableRow key={`${s.id}-${it.number}`} className="first:border-t">
                <TableCell className="whitespace-nowrap">
                  <a href={`${base}/issues/${it.number}`} target="_blank" rel="noreferrer" className={LINK}>
                    #{it.number}
                  </a>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{it.title}</div>
                  <div className="text-xs text-muted-foreground">{it.taskId}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap">{s.name}</TableCell>
                <TableCell>
                  <Badge>
                    <Dot status={it.status} />
                    {LABEL[it.status]}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {it.pr ? (
                    <>
                      <a href={`${base}/pull/${it.pr.number}`} target="_blank" rel="noreferrer" className={LINK}>
                        #{it.pr.number}
                      </a>
                      <span className="text-muted-foreground">
                        {' '}
                        by {it.pr.author}
                        {it.pr.state === 'closed' && ' (closed)'}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">None</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!items.length && (
              <TableRow className="first:border-t">
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No issues match these filters.
                </TableCell>
              </TableRow>
            )}
          </tbody>
        </Table>
        <div className="text-[13px] text-muted-foreground">
          Showing {items.length} of {repo.items.length} issues
        </div>
      </section>
    </div>
  )
}

const fmtDay = (date: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(date + 'T00:00:00').toLocaleDateString(undefined, opts)

function Activity({ days }: { days: Day[] }) {
  const [hover, setHover] = useState<Day | null>(null)
  const total = days.reduce((n, d) => n + d.count, 0)
  // Round the axis top up to a "nice" number so the gridlines read cleanly.
  const peak = Math.max(1, ...days.map((d) => d.count))
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find((s) => peak / s <= 4) ?? 10000
  const top = Math.ceil(peak / step) * step
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step).reverse()
  const labelEvery = Math.ceil(days.length / 10)
  const shown = hover ?? days[days.length - 1]

  if (!days.length) return <p className="text-sm text-muted-foreground">No commit data yet. It appears after the next refresh.</p>

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Commits per day</h2>
          <p className="text-[13px] text-muted-foreground">
            Commits in pull requests across all repositories, by author date (IST). Merge commits excluded.
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums">{total.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">commits since {fmtDay(days[0].date, { day: 'numeric', month: 'short' })}</div>
        </div>
      </div>

      <div className="mt-3 h-5 text-[13px]" aria-live="polite">
        <span className="font-medium">{fmtDay(shown.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        <span className="text-muted-foreground">
          : {shown.count.toLocaleString()} {shown.count === 1 ? 'commit' : 'commits'}
        </span>
      </div>

      <div className="mt-2 flex gap-2">
        <div className="flex h-64 flex-col justify-between text-right text-xs text-muted-foreground tabular-nums">
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0">
              {t}
            </span>
          ))}
        </div>
        <div className="min-w-0 grow overflow-x-auto">
          <div style={{ minWidth: days.length * 14 }}>
            <div className="relative h-64 border-b">
              {ticks.slice(0, -1).map((t) => (
                <div key={t} className="absolute inset-x-0 border-t border-muted" style={{ bottom: `${(t / top) * 100}%` }} />
              ))}
              <div className="absolute inset-0 flex items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
                {days.map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    aria-label={`${fmtDay(d.date, { day: 'numeric', month: 'short' })}: ${d.count} commits`}
                    onMouseEnter={() => setHover(d)}
                    onFocus={() => setHover(d)}
                    onBlur={() => setHover(null)}
                    className="group flex h-full min-w-0 flex-1 items-end justify-center outline-none"
                  >
                    <span
                      className="w-full max-w-10 rounded-t-[4px] bg-chart group-hover:bg-chart-hover group-focus-visible:bg-chart-hover"
                      style={{ height: `${(d.count / top) * 100}%`, minHeight: d.count ? 2 : 0 }}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-1.5 flex gap-[2px] text-xs text-muted-foreground">
              {days.map((d, i) => (
                <span key={d.date} className="min-w-0 flex-1 text-center whitespace-nowrap">
                  {i % labelEvery === 0 ? fmtDay(d.date, { day: 'numeric', month: 'short' }) : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
