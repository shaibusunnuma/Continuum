import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronUp, ChevronsUpDown, Columns3 } from "lucide-react";
import { listRuns, type ListRunsParams } from "@/lib/api";
import type { StudioRunPrimitive, StudioRunRow } from "@/lib/types";
import { DateTimePickerField } from "@/components/run-explorer/DateTimePickerField";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const inputClass =
  "h-8 min-w-[8rem] rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground placeholder:text-muted-foreground";

type ColumnSort =
  | "server"
  | "startedAsc"
  | "startedDesc"
  | "durationAsc"
  | "durationDesc"
  | "costAsc"
  | "costDesc"
  | "tokensAsc"
  | "tokensDesc";

type PrimitiveFilter = "all" | StudioRunPrimitive;

type RunColumnId =
  | "workflowId"
  | "workflowType"
  | "status"
  | "started"
  | "duration"
  | "cost"
  | "tokens";

const COLUMN_OPTIONS: { id: RunColumnId; label: string; required?: boolean }[] = [
  { id: "workflowId", label: "Workflow ID", required: true },
  { id: "workflowType", label: "Type" },
  { id: "status", label: "Status" },
  { id: "started", label: "Started" },
  { id: "duration", label: "Duration" },
  { id: "cost", label: "Cost (USD)" },
  { id: "tokens", label: "Tokens" },
];

const DEFAULT_VISIBILITY: Record<RunColumnId, boolean> = {
  workflowId: true,
  workflowType: true,
  status: true,
  started: true,
  duration: true,
  cost: true,
  tokens: true,
};

interface ServerFilterForm {
  executionStatus: string;
  workflowType: string;
  workflowId: string;
  startAfter: string;
  startBefore: string;
}

const EMPTY_SERVER_FILTERS: ServerFilterForm = {
  executionStatus: "",
  workflowType: "",
  workflowId: "",
  startAfter: "",
  startBefore: "",
};

function normalizeRun(r: StudioRunRow): StudioRunRow {
  return {
    ...r,
    primitive: r.primitive ?? null,
    totalTokens: r.totalTokens ?? null,
    costUsd: r.costUsd ?? null,
  };
}

function formatDuration(start: string | null, close: string | null, status: string): string {
  if (!start) return "—";
  const startMs = Date.parse(start);
  if (Number.isNaN(startMs)) return "—";
  const endMs =
    close && status !== "RUNNING"
      ? Date.parse(close)
      : Date.now();
  if (Number.isNaN(endMs)) return "—";
  const sec = Math.max(0, Math.floor((endMs - startMs) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function durationMsForSort(r: StudioRunRow): number {
  if (!r.startTime) return -1;
  const startMs = Date.parse(r.startTime);
  if (Number.isNaN(startMs)) return -1;
  const endMs =
    r.closeTime && r.status !== "RUNNING"
      ? Date.parse(r.closeTime)
      : Date.now();
  if (Number.isNaN(endMs)) return -1;
  return Math.max(0, endMs - startMs);
}

function startMsForSort(r: StudioRunRow): number {
  if (!r.startTime) return -1;
  const t = Date.parse(r.startTime);
  return Number.isNaN(t) ? -1 : t;
}

function rowKey(r: StudioRunRow): string {
  return `${r.workflowId}:${r.runId}`;
}

function mergePollResult(latest: StudioRunRow[], previous: StudioRunRow[]): StudioRunRow[] {
  const latestKeys = new Set(latest.map(rowKey));
  const tail = previous.filter((r) => !latestKeys.has(rowKey(r)));
  return [...latest, ...tail];
}

function StatusDot({ status }: { status: string }) {
  const running = status === "RUNNING";
  const failed = status === "FAILED" || status === "TERMINATED";
  return (
    <span
      className={
        running
          ? "size-2 animate-pulse rounded-full bg-primary"
          : failed
            ? "size-2 rounded-full bg-destructive"
            : "size-2 rounded-full bg-muted-foreground/60"
      }
    />
  );
}

function formatUsd(n: number | null): string {
  if (n == null) return "—";
  if (n === 0) return "$0";
  if (n < 0.01) return `<$0.01`;
  return `$${n.toFixed(4)}`;
}

function formatTokens(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

const POLL_MS = 5000;

function appliedToListParams(f: ServerFilterForm): Omit<ListRunsParams, "limit" | "nextPageToken"> {
  const p: Omit<ListRunsParams, "limit" | "nextPageToken"> = {};
  if (f.executionStatus.trim()) p.executionStatus = f.executionStatus.trim();
  if (f.workflowType.trim()) p.workflowType = f.workflowType.trim();
  if (f.workflowId.trim()) p.workflowId = f.workflowId.trim();
  if (f.startAfter.trim()) p.startAfter = f.startAfter.trim();
  if (f.startBefore.trim()) p.startBefore = f.startBefore.trim();
  return p;
}

/** Null / non-finite numbers sort after real values; never returns NaN. */
function compareNullableNumberAsc(
  a: number | null | undefined,
  b: number | null | undefined,
): number {
  const ai = a != null && Number.isFinite(a);
  const bi = b != null && Number.isFinite(b);
  if (!ai && !bi) return 0;
  if (!ai) return 1;
  if (!bi) return -1;
  if (a! < b!) return -1;
  if (a! > b!) return 1;
  return 0;
}

function compareNullableNumberDesc(
  a: number | null | undefined,
  b: number | null | undefined,
): number {
  const ai = a != null && Number.isFinite(a);
  const bi = b != null && Number.isFinite(b);
  if (!ai && !bi) return 0;
  if (!ai) return 1;
  if (!bi) return -1;
  if (a! > b!) return -1;
  if (a! < b!) return 1;
  return 0;
}

function sortTieBreak(a: StudioRunRow, b: StudioRunRow, primary: number): number {
  if (primary !== 0) return primary;
  return rowKey(a).localeCompare(rowKey(b));
}

/**
 * One control per column: off → ascending → descending → off.
 * Avoids two chevrons with different state machines (confusing when combined with other columns).
 */
function ColumnSortCycleButton({
  label,
  sortAsc,
  sortDesc,
  columnSort,
  onColumnSort,
  className,
}: {
  label: string;
  sortAsc: ColumnSort;
  sortDesc: ColumnSort;
  columnSort: ColumnSort;
  onColumnSort: (next: ColumnSort) => void;
  className?: string;
}) {
  const mode =
    columnSort === sortAsc ? "asc" : columnSort === sortDesc ? "desc" : "off";

  const cycle = () => {
    if (mode === "off") onColumnSort(sortAsc);
    else if (mode === "asc") onColumnSort(sortDesc);
    else onColumnSort("server");
  };

  const Icon = mode === "asc" ? ChevronUp : mode === "desc" ? ChevronDown : ChevronsUpDown;
  const title =
    mode === "off"
      ? `${label}: sort ascending`
      : mode === "asc"
        ? `${label}: ascending — next: descending`
        : `${label}: descending — next: clear sort`;

  return (
    <TableHead className={className}>
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">{label}</span>
        <Button
          type="button"
          variant={mode === "off" ? "ghost" : "secondary"}
          size="icon-xs"
          className="size-5 shrink-0 rounded-sm"
          aria-label={title}
          title={title}
          onClick={cycle}
        >
          <Icon className="size-3" />
        </Button>
      </div>
    </TableHead>
  );
}

export function RunExplorer() {
  const [rows, setRows] = useState<StudioRunRow[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newSinceOpen, setNewSinceOpen] = useState(0);
  const loadedMoreRef = useRef(false);
  const knownKeysRef = useRef<Set<string>>(new Set());
  const appliedServerRef = useRef<ServerFilterForm>({ ...EMPTY_SERVER_FILTERS });
  const [draftServer, setDraftServer] = useState<ServerFilterForm>({ ...EMPTY_SERVER_FILTERS });

  const [primitiveFilter, setPrimitiveFilter] = useState<PrimitiveFilter>("all");
  const [minCostUsd, setMinCostUsd] = useState("");
  const [columnSort, setColumnSort] = useState<ColumnSort>("server");
  const [columnVisibility, setColumnVisibility] = useState<Record<RunColumnId, boolean>>({
    ...DEFAULT_VISIBILITY,
  });

  const visibleCount = useMemo(
    () => COLUMN_OPTIONS.filter((c) => columnVisibility[c.id]).length,
    [columnVisibility],
  );

  const load = useCallback(async (token?: string) => {
    if (!token) setLoading(true);
    setError(null);
    try {
      const base = appliedToListParams(appliedServerRef.current);
      const res = await listRuns({
        limit: 25,
        nextPageToken: token,
        ...base,
      });
      const normalized = res.runs.map(normalizeRun);
      if (token) {
        loadedMoreRef.current = true;
        setRows((prev) => [...prev, ...normalized]);
      } else {
        loadedMoreRef.current = false;
        setRows(normalized);
        knownKeysRef.current = new Set(normalized.map(rowKey));
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
      const base = appliedToListParams(appliedServerRef.current);
      const res = await listRuns({ limit: 25, ...base });
      const normalized = res.runs.map(normalizeRun);
      let added = 0;
      for (const r of normalized) {
        const k = rowKey(r);
        if (!knownKeysRef.current.has(k)) {
          knownKeysRef.current.add(k);
          added += 1;
        }
      }
      if (added > 0) setNewSinceOpen((n) => n + added);

      setRows((prev) =>
        loadedMoreRef.current ? mergePollResult(normalized, prev) : normalized,
      );
      if (!loadedMoreRef.current) setNextPageToken(res.nextPageToken);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const v = columnVisibility;
    const hidden =
      (columnSort.startsWith("started") && !v.started) ||
      (columnSort.startsWith("duration") && !v.duration) ||
      (columnSort.startsWith("cost") && !v.cost) ||
      (columnSort.startsWith("tokens") && !v.tokens);
    if (hidden) setColumnSort("server");
  }, [columnVisibility, columnSort]);

  useEffect(() => {
    const id = window.setInterval(() => void silentPoll(), POLL_MS);
    return () => window.clearInterval(id);
  }, [silentPoll]);

  const applyServerFilters = () => {
    appliedServerRef.current = { ...draftServer };
    void load();
  };

  /** Date pickers commit on Apply inside the popover; refresh the list immediately without a second "Apply filters" click. */
  const commitDraftPatchAndReload = (patch: Partial<ServerFilterForm>) => {
    setDraftServer((s) => {
      const next = { ...s, ...patch };
      appliedServerRef.current = next;
      queueMicrotask(() => void load());
      return next;
    });
  };

  const resetServerFilters = () => {
    setDraftServer({ ...EMPTY_SERVER_FILTERS });
    appliedServerRef.current = { ...EMPTY_SERVER_FILTERS };
    void load();
  };

  const displayRows = useMemo(() => {
    let list = rows;
    if (primitiveFilter !== "all") {
      list = list.filter((r) => r.primitive === primitiveFilter);
    }
    const minC = parseFloat(minCostUsd);
    if (Number.isFinite(minC) && minC > 0) {
      list = list.filter((r) => (r.costUsd ?? 0) >= minC);
    }
    if (columnSort === "server") return list;

    const out = [...list];

    out.sort((a, b) => {
      let c = 0;
      switch (columnSort) {
        case "startedAsc":
          c = startMsForSort(a) - startMsForSort(b);
          break;
        case "startedDesc":
          c = startMsForSort(b) - startMsForSort(a);
          break;
        case "durationDesc":
          c = durationMsForSort(b) - durationMsForSort(a);
          break;
        case "durationAsc":
          c = durationMsForSort(a) - durationMsForSort(b);
          break;
        case "costDesc":
          c = compareNullableNumberDesc(a.costUsd, b.costUsd);
          break;
        case "costAsc":
          c = compareNullableNumberAsc(a.costUsd, b.costUsd);
          break;
        case "tokensDesc":
          c = compareNullableNumberDesc(a.totalTokens, b.totalTokens);
          break;
        case "tokensAsc":
          c = compareNullableNumberAsc(a.totalTokens, b.totalTokens);
          break;
        default:
          c = 0;
      }
      return sortTieBreak(a, b, c);
    });
    return out;
  }, [rows, primitiveFilter, minCostUsd, columnSort]);

  const vis = columnVisibility;

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
          <div className="flex flex-wrap items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 font-mono text-xs">
                  <Columns3 className="size-3.5" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="font-mono text-xs">Visible columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {COLUMN_OPTIONS.map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    className="font-mono text-xs"
                    checked={vis[col.id]}
                    disabled={col.required}
                    onCheckedChange={(checked) => {
                      if (col.required) return;
                      setColumnVisibility((prev) => ({ ...prev, [col.id]: Boolean(checked) }));
                    }}
                  >
                    {col.label}
                    {col.required ? " (required)" : ""}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="text-muted-foreground font-mono text-[10px]">
              Auto-refresh {POLL_MS / 1000}s
            </span>
            <Button
              variant="outline"
              size="sm"
              className="relative font-mono text-xs"
              disabled={loading}
              onClick={() => void load()}
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

        <div className="mb-4 space-y-3 rounded-md border border-border bg-muted/20 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 font-mono text-[10px] text-muted-foreground">
              Status
              <select
                className={inputClass}
                value={draftServer.executionStatus}
                onChange={(e) =>
                  setDraftServer((s) => ({ ...s, executionStatus: e.target.value }))
                }
              >
                <option value="">Any</option>
                <option value="RUNNING">RUNNING</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="FAILED">FAILED</option>
                <option value="CANCELED">CANCELED</option>
                <option value="TERMINATED">TERMINATED</option>
                <option value="TIMED_OUT">TIMED_OUT</option>
                <option value="CONTINUED_AS_NEW">CONTINUED_AS_NEW</option>
              </select>
            </label>
            <label className="flex min-w-[7rem] flex-col gap-1 font-mono text-[10px] text-muted-foreground">
              Workflow type
              <input
                className={inputClass}
                placeholder="Type name"
                value={draftServer.workflowType}
                onChange={(e) =>
                  setDraftServer((s) => ({ ...s, workflowType: e.target.value }))
                }
              />
            </label>
            <label className="flex min-w-[7rem] flex-col gap-1 font-mono text-[10px] text-muted-foreground">
              Workflow ID
              <input
                className={inputClass}
                placeholder="Exact id"
                value={draftServer.workflowId}
                onChange={(e) =>
                  setDraftServer((s) => ({ ...s, workflowId: e.target.value }))
                }
              />
            </label>
            <DateTimePickerField
              id="run-filter-start-after"
              label="Start after"
              value={draftServer.startAfter}
              onChange={(iso) => commitDraftPatchAndReload({ startAfter: iso })}
            />
            <DateTimePickerField
              id="run-filter-start-before"
              label="Start before"
              value={draftServer.startBefore}
              onChange={(iso) => commitDraftPatchAndReload({ startBefore: iso })}
            />
            <Button
              type="button"
              variant="default"
              size="sm"
              className="font-mono text-xs"
              disabled={loading}
              onClick={() => applyServerFilters()}
            >
              Apply filters
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="font-mono text-xs"
              disabled={loading}
              onClick={() => resetServerFilters()}
            >
              Reset
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
            <label className="flex flex-col gap-1 font-mono text-[10px] text-muted-foreground">
              Primitive
              <select
                className={inputClass}
                value={primitiveFilter}
                onChange={(e) => setPrimitiveFilter(e.target.value as PrimitiveFilter)}
              >
                <option value="all">Any</option>
                <option value="graph">graph</option>
                <option value="agent">agent</option>
                <option value="workflow">workflow</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 font-mono text-[10px] text-muted-foreground">
              Min cost (USD)
              <input
                className={`${inputClass} w-24`}
                inputMode="decimal"
                placeholder="0"
                value={minCostUsd}
                onChange={(e) => setMinCostUsd(e.target.value)}
              />
            </label>
          </div>
          <p className="font-mono text-[10px] leading-snug text-muted-foreground">
            Start after / before reload the list as soon as you click Apply in the calendar (Temporal
            visibility: StartTime range). Other fields use Apply filters. Primitive and min cost apply to
            loaded runs only (this page and any &quot;Load more&quot; rows), not the whole namespace. Use
            the sort icon next to Started / Duration / Cost / Tokens (cycles ascending → descending →
            server order).
          </p>
        </div>

        {error && (
          <p className="text-destructive mb-4 font-mono text-sm" role="alert">
            {error}
          </p>
        )}
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {vis.workflowId && (
                  <TableHead className="font-mono text-xs text-muted-foreground">Workflow ID</TableHead>
                )}
                {vis.workflowType && (
                  <TableHead className="font-mono text-xs text-muted-foreground">Type</TableHead>
                )}
                {vis.status && (
                  <TableHead className="font-mono text-xs text-muted-foreground">Status</TableHead>
                )}
                {vis.started && (
                  <ColumnSortCycleButton
                    label="Started"
                    sortAsc="startedAsc"
                    sortDesc="startedDesc"
                    columnSort={columnSort}
                    onColumnSort={setColumnSort}
                    className="font-mono text-xs"
                  />
                )}
                {vis.duration && (
                  <ColumnSortCycleButton
                    label="Duration"
                    sortAsc="durationAsc"
                    sortDesc="durationDesc"
                    columnSort={columnSort}
                    onColumnSort={setColumnSort}
                    className="font-mono text-xs"
                  />
                )}
                {vis.cost && (
                  <ColumnSortCycleButton
                    label="Cost (USD)"
                    sortAsc="costAsc"
                    sortDesc="costDesc"
                    columnSort={columnSort}
                    onColumnSort={setColumnSort}
                    className="font-mono text-xs"
                  />
                )}
                {vis.tokens && (
                  <ColumnSortCycleButton
                    label="Tokens"
                    sortAsc="tokensAsc"
                    sortDesc="tokensDesc"
                    columnSort={columnSort}
                    onColumnSort={setColumnSort}
                    className="font-mono text-xs"
                  />
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && rows.length === 0
                ? Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={Math.max(visibleCount, 1)}>
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : displayRows.length === 0
                  ? (
                      <TableRow>
                        <TableCell
                          colSpan={Math.max(visibleCount, 1)}
                          className="text-muted-foreground py-8 text-center font-mono text-xs"
                        >
                          No runs match the current filters.
                        </TableCell>
                      </TableRow>
                    )
                  : (
                      displayRows.map((r) => (
                        <TableRow key={`${r.workflowId}-${r.runId}`} className="font-mono text-xs">
                          {vis.workflowId && (
                            <TableCell className="max-w-[200px] truncate">
                              <Link
                                to={`/runs/${encodeURIComponent(r.workflowId)}`}
                                className="text-primary hover:underline"
                              >
                                {r.workflowId}
                              </Link>
                            </TableCell>
                          )}
                          {vis.workflowType && (
                            <TableCell>
                              <Badge variant="outline" className="rounded-sm font-mono text-[10px]">
                                {r.workflowType}
                              </Badge>
                            </TableCell>
                          )}
                          {vis.status && (
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <StatusDot status={r.status} />
                                <span className="text-muted-foreground">{r.status}</span>
                              </div>
                            </TableCell>
                          )}
                          {vis.started && (
                            <TableCell className="text-muted-foreground whitespace-nowrap">
                              {r.startTime ? new Date(r.startTime).toLocaleString() : "—"}
                            </TableCell>
                          )}
                          {vis.duration && (
                            <TableCell className="text-muted-foreground whitespace-nowrap">
                              {formatDuration(r.startTime, r.closeTime, r.status)}
                            </TableCell>
                          )}
                          {vis.cost && (
                            <TableCell className="text-muted-foreground whitespace-nowrap">
                              {formatUsd(r.costUsd)}
                            </TableCell>
                          )}
                          {vis.tokens && (
                            <TableCell className="text-muted-foreground whitespace-nowrap">
                              {formatTokens(r.totalTokens)}
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
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
