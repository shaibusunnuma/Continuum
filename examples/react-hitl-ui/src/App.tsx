/* Default import: some TS tooling still typechecks JSX as classic runtime (needs React in scope). */
import React, { useEffect, useState, type ChangeEvent } from 'react';
import { useRunStream, useSendSignal } from '@durion/react';
import {
  DURION_USER_INPUT_SIGNAL,
  fetchWorkflowResult,
  startWorkflow,
} from './exampleServerClient';

/** Aliases avoid `Foo<Bar>` in JSX (parsed as tags). */
type InputChangeEvent = ChangeEvent<HTMLInputElement>;
type TextAreaChangeEvent = ChangeEvent<HTMLTextAreaElement>;

const API_BASE = '';

const GATEWAY_ACCESS_TOKEN =
  import.meta.env.VITE_DURION_GATEWAY_TOKEN &&
  import.meta.env.VITE_DURION_GATEWAY_TOKEN.length > 0
    ? import.meta.env.VITE_DURION_GATEWAY_TOKEN
    : undefined;

export default function App() {
  const [topic, setTopic] = useState('Launch announcement for our AI platform');
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [doneResult, setDoneResult] = useState<string | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState('Make it shorter and friendlier.');

  const { text, status, run, error: streamError, isStreaming, reset } = useRunStream(
    doneResult ? null : workflowId, // Stop streaming once we have the done result
    {
      baseURL: API_BASE,
      accessToken: GATEWAY_ACCESS_TOKEN,
      pollIntervalMs: 1200,
    }
  );

  const { send, isSending, error: signalError } = useSendSignal({
    baseURL: API_BASE,
    accessToken: GATEWAY_ACCESS_TOKEN,
  });

  const handleStart = async () => {
    setDoneResult(null);
    reset();
    
    // Generate an ID up front so we can subscribe and start concurrently
    const id = `hitl-ui-${crypto.randomUUID()}`;
    setWorkflowId(id);

    try {
      await startWorkflow(API_BASE, {
        workflowType: 'draftEmail',
        input: { topic },
        workflowId: id,
      });
    } catch {
      setWorkflowId(null);
      reset();
    }
  };

  const handleApprove = async () => {
    if (!workflowId) return;
    await send(workflowId, { action: 'approve' }, DURION_USER_INPUT_SIGNAL);
  };

  const handleReject = async () => {
    if (!workflowId) return;
    await send(workflowId, {
      action: 'reject',
      feedback: rejectFeedback.trim() || undefined,
    }, DURION_USER_INPUT_SIGNAL);
  };

  useEffect(() => {
    if (status !== 'completed' || !workflowId || doneResult) return;
    void (async () => {
      try {
        const j = await fetchWorkflowResult<{ finalEmail?: string }>(API_BASE, workflowId);
        const email = j.result?.finalEmail;
        if (email != null) setDoneResult(email);
      } catch {
        /* ignore — user refreshes */
      }
    })();
  }, [status, workflowId, doneResult]);

  const waiting = status === 'waiting_for_input';

  // Prefer stream text, falback to run partialReply
  const draftDisplay = text || run?.partialReply || '';

  const displayError = (streamError?.message ?? null) || (signalError?.message ?? null);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ marginTop: 0 }}>HITL + LLM token streaming</h1>
      <p style={{ color: '#9ab', fontSize: '0.95rem' }}>
        Uses <code>useRunStream</code> and <code>useSendSignal</code> against Gateway API v0 (REST + SSE).
        Requires Temporal, Redis, <code>{'cd examples && npm run worker:hitl'}</code>,{' '}
        <code>npm run api:dev</code> — see <code>README.md</code>.
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
          onClick={() => void handleStart()}
          disabled={isStreaming || workflowId !== null}
        >
          {doneResult
            ? 'Start draft'
            : workflowId
              ? status === 'waiting_for_input'
                ? 'Waiting for review…'
                : isStreaming
                  ? 'Streaming draft…'
                  : 'Run in progress…'
              : 'Start draft'}
        </button>
        {doneResult && (
          <button
            type="button"
            onClick={() => {
              setWorkflowId(null);
              setDoneResult(null);
              reset();
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

      <h2 style={{ marginTop: '1.5rem', fontSize: '1.1rem' }}>Live tokens (SSE + Polling)</h2>
      <pre className="stream">{draftDisplay || (isStreaming ? '…' : '—')}</pre>
      {isStreaming && <p style={{ color: '#8af' }}>Streaming…</p>}

      <h2 style={{ marginTop: '1.25rem', fontSize: '1.1rem' }}>Stream state (metadata)</h2>
      <pre className="stream" style={{ minHeight: '4rem' }}>
        {run ? JSON.stringify(run, null, 2) : workflowId ? 'Loading…' : '—'}
      </pre>

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
            <button type="button" className="primary" onClick={() => void handleApprove()} disabled={isStreaming || isSending}>
              Approve
            </button>
            <button type="button" onClick={() => void handleReject()} disabled={isStreaming || isSending}>
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
