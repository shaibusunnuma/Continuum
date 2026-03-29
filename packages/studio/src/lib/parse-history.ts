import type { ActivityStep } from './types';

/**
 * Extract ActivityTaskScheduled steps from Temporal history JSON (from `historyToJSON`).
 */
export function parseActivityStepsFromHistory(history: unknown): ActivityStep[] {
  if (typeof history !== 'object' || history === null) return [];
  const events = (history as { events?: unknown }).events;
  if (!Array.isArray(events)) return [];

  const steps: ActivityStep[] = [];
  for (const ev of events) {
    if (typeof ev !== 'object' || ev === null) continue;
    const e = ev as Record<string, unknown>;
    const eventType = String(e.eventType ?? '');
    if (!eventType.includes('ACTIVITY_TASK_SCHEDULED')) continue;

    const attrs = e.activityTaskScheduledEventAttributes as Record<string, unknown> | undefined;
    const activityType = attrs?.activityType as Record<string, unknown> | undefined;
    const name = String(activityType?.name ?? 'activity');
    steps.push({
      eventId: String(e.eventId ?? ''),
      activityName: name,
    });
  }
  return steps;
}
