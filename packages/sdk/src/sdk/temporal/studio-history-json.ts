/**
 * Studio workflow history JSON when `historyToJSON` from `@temporalio/common` throws
 * (e.g. proto3-json-serializer rejecting some Payload metadata such as `json/plain`).
 *
 * Temporal’s `@temporalio/proto` README says application code should normally use
 * `@temporalio/client`, `worker`, `workflow`, and `activity` instead of proto directly.
 * This file is **Durion SDK internal** plumbing for Studio only — not a pattern for
 * end-user workflows. Proto is loaded here only as the same implementation
 * `@temporalio/common` already depends on; we avoid a duplicate direct dependency in
 * package.json and rely on that transitive install.
 */
import type { History } from '@temporalio/common/lib/proto-utils';
import { temporal } from '@temporalio/proto';

/**
 * Serialize each history event with protobufjs `toObject` — avoids proto3-json-serializer
 * choking on `json/plain` and similar encodings in Payload metadata.
 */
export function historyEventsToPlainJson(history: History): { events: Record<string, unknown>[] } {
  const HistoryEvent = temporal.api.history.v1.HistoryEvent;
  const events = history.events ?? [];
  return {
    events: events.map((ev) =>
      HistoryEvent.toObject(ev as unknown as temporal.api.history.v1.HistoryEvent, {
        longs: String,
        enums: String,
        bytes: String,
        defaults: true,
      }) as Record<string, unknown>,
    ),
  };
}
