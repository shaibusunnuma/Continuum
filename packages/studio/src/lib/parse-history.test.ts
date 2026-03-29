import { describe, expect, it } from 'vitest';
import { parseActivityStepsFromHistory } from './parse-history';

describe('parseActivityStepsFromHistory', () => {
  it('returns activity names from scheduled events', () => {
    const history = {
      events: [
        {
          eventId: '3',
          eventType: 'EVENT_TYPE_ACTIVITY_TASK_SCHEDULED',
          activityTaskScheduledEventAttributes: {
            activityType: { name: 'runModel' },
          },
        },
        {
          eventId: '5',
          eventType: 'EVENT_TYPE_ACTIVITY_TASK_SCHEDULED',
          activityTaskScheduledEventAttributes: {
            activityType: { name: 'runTool' },
          },
        },
      ],
    };
    const steps = parseActivityStepsFromHistory(history);
    expect(steps).toEqual([
      { eventId: '3', activityName: 'runModel' },
      { eventId: '5', activityName: 'runTool' },
    ]);
  });

  it('returns empty for invalid input', () => {
    expect(parseActivityStepsFromHistory(null)).toEqual([]);
    expect(parseActivityStepsFromHistory({})).toEqual([]);
  });
});
