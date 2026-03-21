# @ai-runtime/react

React hooks for AI Runtime.

## `useWorkflowStreamState`

Polls workflow **stream state** (Temporal query behind your API): `status`, `partialReply`, `messages`, etc.

### With example-server

Start the example API, then:

```tsx
const { state, error, loading } = useWorkflowStreamState({
  workflowId,
  apiBaseUrl: 'http://localhost:3000',
});
```

Requires `GET /runs/:workflowId/stream-state` on your backend (implemented in `example-server`).

### Custom backend

```tsx
useWorkflowStreamState({
  workflowId,
  queryFn: async (id, signal) => {
    const res = await fetch(`/api/runs/${id}/stream`, { signal });
    return res.json();
  },
});
```

### Peer dependency

- `react` ^18 or ^19
