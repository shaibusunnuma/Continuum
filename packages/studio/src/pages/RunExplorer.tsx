import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { listRuns } from '@/lib/api';
import type { StudioRunRow } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function formatDuration(start: string | null, close: string | null, status: string): string {
  if (!start) return '—';
  const startMs = Date.parse(start);
  if (Number.isNaN(startMs)) return '—';
  const endMs =
    close && status !== 'RUNNING'
      ? Date.parse(close)
      : Date.now();
  if (Number.isNaN(endMs)) return '—';
  const sec = Math.max(0, Math.floor((endMs - startMs) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function rowKey(r: StudioRunRow): string {
  return `${r.workflowId}:${r.runId}`;
}

/** Keep the latest first page from the API at the top; preserve extra rows from "Load more". */
function mergePollResult(latest: StudioRunRow[], previous: StudioRunRow[]): StudioRunRow[] {
  const latestKeys = new Set(latest.map(rowKey));
  const tail = previous.filter((r) => !latestKeys.has(rowKey(r)));
  return [...latest, ...tail];
}

function StatusDot({ status }: { status: string }) {
  const running = status === 'RUNNING';
  const failed = status === 'FAILED' || status === 'TERMINATED';
  return (
    <span
      className={
        running
          ? 'size-2 animate-pulse rounded-full bg-primary'
          : failed
            ? 'size-2 rounded-full bg-destructive'
            : 'size-2 rounded-full bg-muted-foreground/60'
      }
    />
  );
}

const POLL_MS = 5000;

export function RunExplorer() {
  const [rows, setRows] = useState<StudioRunRow[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newSinceOpen, setNewSinceOpen] = useState(0);
  const loadedMoreRef = useRef(false);
  const knownKeysRef = useRef<Set<string>>(new Set());

  const load = useCallback(async (token?: string) => {
    if (!token) setLoading(true);
    setError(null);
    try {
      const res = await listRuns({
        limit: 25,
        nextPageToken: token,
      });
      if (token) {
        loadedMoreRef.current = true;
        setRows((prev) => [...prev, ...res.runs]);
      } else {
        loadedMoreRef.current = false;
        setRows(res.runs);
        knownKeysRef.current = new Set(res.runs.map(rowKey));
        setNewSinceOpen(0);
      }
      setNextPageToken(res.nextPageToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const silentPoll = useCallback(async () => {
    try {
      const res = await listRuns({ limit: 25 });
      let added = 0;
      for (const r of res.runs) {
        const k = rowKey(r);
        if (!knownKeysRef.current.has(k)) {
          knownKeysRef.current.add(k);
          added += 1;
        }
      }
      if (added > 0) setNewSinceOpen((n) => n + added);

      setRows((prev) => (loadedMoreRef.current ? mergePollResult(res.runs, prev) : res.runs));
      if (!loadedMoreRef.current) setNextPageToken(res.nextPageToken);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => void silentPoll(), POLL_MS);
    return () => window.clearInterval(id);
  }, [silentPoll]);

  const manualRefresh = () => {
    void load();
  };

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b border-border px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="font-mono text-sm tracking-tight">
            <span className="text-foreground">durion</span>
            <span className="text-muted-foreground"> / studio</span>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-mono text-lg text-foreground">Runs</h1>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground font-mono text-[10px]">
              Auto-refresh {POLL_MS / 1000}s
            </span>
            <Button
              variant="outline"
              size="sm"
              className="relative font-mono text-xs"
              disabled={loading}
              onClick={() => manualRefresh()}
            >
              Refresh
              {newSinceOpen > 0 && (
                <Badge
                  variant="secondary"
                  className="absolute -top-2 -right-2 h-5 min-w-5 rounded-full px-1 font-mono text-[10px]"
                >
                  +{newSinceOpen}
                </Badge>
              )}
            </Button>
          </div>
        </div>
        {error && (
          <p className="text-destructive mb-4 font-mono text-sm" role="alert">
            {error}
          </p>
        )}
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-mono text-xs text-muted-foreground">Workflow ID</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">Type</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">Status</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">Started</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && rows.length === 0
                ? Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={5}>
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : rows.map((r) => (
                    <TableRow key={`${r.workflowId}-${r.runId}`} className="font-mono text-xs">
                      <TableCell className="max-w-[220px] truncate">
                        <Link
                          to={`/runs/${encodeURIComponent(r.workflowId)}`}
                          className="text-primary hover:underline"
                        >
                          {r.workflowId}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="rounded-sm font-mono text-[10px]">
                          {r.workflowType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <StatusDot status={r.status} />
                          <span className="text-muted-foreground">{r.status}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.startTime ? new Date(r.startTime).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDuration(r.startTime, r.closeTime, r.status)}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
        {nextPageToken && (
          <div className="mt-4">
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs"
              disabled={loading}
              onClick={() => void load(nextPageToken)}
            >
              Load more
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
