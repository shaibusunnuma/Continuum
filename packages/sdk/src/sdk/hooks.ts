/**
 * Lifecycle hooks allow plugins (e.g. evaluation capture) to subscribe to run completion
 * without being compiled into the core SDK. The workflow calls runLifecycleHooks activity;
 * the activity dispatches to all registered hooks.
 */

export type LifecycleEvent = {
  type: 'run:complete';
  payload: {
    kind: 'workflow' | 'agent';
    name: string;
    workflowId: string;
    runId: string;
    modelId?: string;
    input: unknown;
    output: unknown;
    metadata?: Record<string, unknown>;
  };
};

export type LifecycleHook = (event: LifecycleEvent) => Promise<void>;

const hooks: LifecycleHook[] = [];

/**
 * Registers a hook to be called on lifecycle events (e.g. run:complete).
 * Call at worker startup; plugins (e.g. eval) use this to subscribe.
 */
export function registerHook(hook: LifecycleHook): void {
  hooks.push(hook);
}

/**
 * Removes all registered hooks. Used mainly for tests.
 */
export function clearHooks(): void {
  hooks.length = 0;
}

/**
 * Dispatches an event to all registered hooks. Called by the runLifecycleHooks activity.
 * Hook failures are logged but do not throw (capture must not break the workflow).
 */
export async function dispatchHooks(event: LifecycleEvent): Promise<void> {
  for (const hook of hooks) {
    try {
      await hook(event);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[durion] Lifecycle hook failed:', err);
    }
  }
}
