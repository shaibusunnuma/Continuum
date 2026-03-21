/* Default import: some TS tooling still typechecks JSX as classic runtime (needs React in scope). */
import React, { useEffect, useState, type ChangeEvent } from 'react';
import { useGatewayV0StreamState, useGatewayV0TokenStream } from '@ai-runtime/react';
import {
  AI_RUNTIME_USER_INPUT_SIGNAL,
  fetchWorkflowResult,
  sendWorkflowSignal,
  startWorkflow,
} from './exampleServerClient';

/** Aliases avoid `Foo<Bar>` in JSX (parsed as tags). */
type InputChangeEvent = ChangeEvent<HTMLInputElement>;
type TextAreaChangeEvent = ChangeEvent<HTMLTextAreaElement>;

const TASK_QUEUE = 'ai-runtime-hitl';
const API_BASE = '';

const GATEWAY_ACCESS_TOKEN =
  import.meta.env.VITE_AI_RUNTIME_GATEWAY_TOKEN &&
  import.meta.env.VITE_AI_RUNTIME_GATEWAY_TOKEN.length > 0
    ? import.meta.env.VITE_AI_RUNTIME_GATEWAY_TOKEN
    : undefined;

export default function App() {
  const [topic, setTopic] = useState('Launch announcement for our AI platform');
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  /** Avoid polling stream-state before Temporal has the run (prevents 404 flash after "Start draft"). */
  const [streamStatePollReady, setStreamStatePollReady] = useState(false);
  const [signalError, setSignalError] = useState<string | null>(null);
  const [doneResult, setDoneResult] = useState<string | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState('Make it shorter and friendlier.');

  const stream = useGatewayV0TokenStream({
    baseURL: API_BASE,
    accessToken: GATEWAY_ACCESS_TOKEN,
  });

  const { state, error: pollError, loading: pollLoading } = useGatewayV0StreamState({
    workflowId,
    baseURL: API_BASE,
    accessToken: GATEWAY_ACCESS_TOKEN,
    pollIntervalMs: 1200,
    enabled: Boolean(workflowId) && !doneResult && streamStatePollReady,
  });

  const handleStart = () => {
    setDoneResult(null);
    setSignalError(null);
    setStreamStatePollReady(false);
    stream.reset();
    const id = `hitl-ui-${crypto.randomUUID()}`;
    setWorkflowId(id);

    stream.subscribeThenStart(id, async () => {
      try {
        await startWorkflow(API_BASE, {
          workflowType: 'draftEmail',
          input: { topic },
          workflowId: id,
          taskQueue: TASK_QUEUE,
        });
        setStreamStatePollReady(true);
      } catch {
        setWorkflowId(null);
        setStreamStatePollReady(false);
        stream.reset();
      }
    });
  };

  const handleApprove = async () => {
    if (!workflowId) return;
    stream.close();
    setSignalError(null);
    try {
      await sendWorkflowSignal(API_BASE, workflowId, AI_RUNTIME_USER_INPUT_SIGNAL, {
        action: 'approve',
      });
    } catch (e) {
      setSignalError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleReject = () => {
    if (!workflowId) return;
    const id = workflowId;
    setSignalError(null);
    stream.subscribeThenStart(id, async () => {
      await sendWorkflowSignal(API_BASE, id, AI_RUNTIME_USER_INPUT_SIGNAL, {
        action: 'reject',
        feedback: rejectFeedback.trim() || undefined,
      });
    });
  };

  useEffect(() => {
    if (state?.status !== 'completed' || !workflowId || doneResult) return;
    void (async () => {
      try {
        const j = await fetchWorkflowResult<{ finalEmail?: string }>(API_BASE, workflowId);
        const email = j.result?.finalEmail;
        if (email != null) setDoneResult(email);
      } catch {
        /* ignore — poll will retry or user refreshes */
      }
    })();
  }, [state?.status, workflowId, doneResult]);

  const waiting = state?.status === 'waiting_for_input';
  const draftDisplay =
    waiting && state?.partialReply
      ? state.partialReply
      : stream.text || state?.partialReply || '';

  const streamError = stream.error?.message ?? null;
  const displayError = streamError ?? signalError ?? (pollError instanceof Error ? pollError.message : pollError ? String(pollError) : null);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ marginTop: 0 }}>HITL + LLM token streaming</h1>
      <p style={{ color: '#9ab', fontSize: '0.95rem' }}>
        Uses <code>useGatewayV0TokenStream</code> + <code>useGatewayV0StreamState</code> (Gateway API v0) and{' '}
        <code>exampleServerClient.ts</code> for start/signal/result <code>fetch</code>.{' '}
        (similar idea to{' '}
        <a href="https://trigger.dev/docs/realtime/react-hooks/streams" style={{ color: '#8af' }}>
          Trigger.dev stream hooks
        </a>
        , but over your REST + SSE bridge). Requires Temporal, Redis, <code>worker:hitl</code>, <code>api:dev</code> — see{' '}
        <code>README.md</code>.
      </p>

      <label style={{ display: 'block', marginBottom: '0.35rem' }}>Topic</label>
      <input
        value={topic}
        onChange={(e: InputChangeEvent) => setTopic(e.currentTarget.value)}
        disabled={workflowId !== null}
      />

      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="primary"
          onClick={handleStart}
          disabled={stream.isStreaming || workflowId !== null}
        >
          {doneResult
            ? 'Start draft'
            : workflowId
              ? state?.status === 'waiting_for_input'
                ? 'Waiting for review…'
                : stream.isStreaming
                  ? 'Streaming draft…'
                  : 'Run in progress…'
              : 'Start draft'}
        </button>
        {doneResult && (
          <button
            type="button"
            onClick={() => {
              setWorkflowId(null);
              setStreamStatePollReady(false);
              setDoneResult(null);
              setSignalError(null);
              stream.reset();
            }}
          >
            New run
          </button>
        )}
      </div>

      {workflowId && (
        <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#8a9' }}>
          Workflow id: <code>{workflowId}</code>
        </p>
      )}

      <h2 style={{ marginTop: '1.5rem', fontSize: '1.1rem' }}>Live tokens (SSE)</h2>
      <pre className="stream">{draftDisplay || (stream.isStreaming ? '…' : '—')}</pre>
      {stream.isStreaming && <p style={{ color: '#8af' }}>Streaming…</p>}

      <h2 style={{ marginTop: '1.25rem', fontSize: '1.1rem' }}>Stream state (poll)</h2>
      <pre className="stream" style={{ minHeight: '4rem' }}>
        {state ? JSON.stringify(state, null, 2) : workflowId ? 'Loading…' : '—'}
      </pre>
      {pollLoading && !state && <p style={{ color: '#8af' }}>Loading stream state…</p>}

      {waiting && (
        <div style={{ marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem' }}>Review</h2>
          <label style={{ display: 'block', marginBottom: '0.35rem' }}>Reject feedback (optional)</label>
          <textarea
            rows={3}
            value={rejectFeedback}
            onChange={(e: TextAreaChangeEvent) => setRejectFeedback(e.currentTarget.value)}
          />
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="primary" onClick={() => void handleApprove()} disabled={stream.isStreaming}>
              Approve
            </button>
            <button type="button" onClick={handleReject} disabled={stream.isStreaming}>
              Reject &amp; revise
            </button>
          </div>
        </div>
      )}

      {doneResult && (
        <div style={{ marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem' }}>Final email</h2>
          <pre className="stream">{doneResult}</pre>
        </div>
      )}

      {displayError && (
        <p style={{ color: '#f88', marginTop: '1rem' }}>
          {displayError}
        </p>
      )}
    </div>
  );
}
