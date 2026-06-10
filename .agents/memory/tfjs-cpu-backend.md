---
name: TF.js CPU backend in Replit
description: Replit preview has no GPU/WebGL — TF.js must be forced to CPU backend or it throws noisy errors before falling back automatically.
---

Always call `await tf.setBackend("cpu")` before `await tf.ready()` in any component that initializes TF.js.

**Why:** Replit's preview iframe runs in a headless/sandboxed environment with no WebGL. TF.js tries WebGL first, generates three loud console errors (Could not get context for WebGL version 2/1, Initialization of backend webgl failed), then falls back to CPU automatically. Setting the backend explicitly skips the attempt entirely — clean console, same performance.

**How to apply:** In every `useEffect` that calls `tf.ready()`:
```typescript
await tf.setBackend("cpu");
await tf.ready();
```
For promise chains: `tf.setBackend("cpu").then(() => tf.ready()).then(...)`.

Files affected: `artifacts/cosmic-connect/src/pages/analyzer.tsx`, `artifacts/cosmic-connect/src/pages/observatory.tsx`.
