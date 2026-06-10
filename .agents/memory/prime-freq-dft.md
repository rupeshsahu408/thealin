---
name: Prime frequency detection via DFT (not autocorrelation)
description: Autocorrelation at prime lags is fundamentally broken for sinusoidal prime-frequency signals. Must use dftMagAtBin with the correct decimated-DFT phase formula.
---

## The bug
Autocorrelation at prime lags (2, 3, 5, 7...) does NOT distinguish prime-frequency sinusoids from noise. For a signal with components at frequencies k=2, 3, 5, 7 (relative to N=512), the autocorrelation at ALL small lags is near 1.0 — because cos(2π·k·lag/N) ≈ 1 for small lag when k << N. Prime lags are not special.

Also broken: a 64-point subsampled DFT for prime bin detection. Subsampling by 8 aliases prime frequency bins (k=2→0.25, k=3→0.375) to near DC — the function was checking the wrong frequencies entirely.

## The fix: dftMagAtBin
```typescript
function dftMagAtBin(signal: Float32Array, k: number, step = 4): number {
  const N = signal.length;
  const M = Math.floor(N / step);
  let re = 0, im = 0;
  for (let n = 0; n < M; n++) {
    const angle = (2 * Math.PI * k * n * step) / N;  // ← critical: n*step not n
    re += signal[n * step] * Math.cos(angle);
    im -= signal[n * step] * Math.sin(angle);
  }
  return Math.sqrt(re * re + im * im) / M;
}
```
Key: angle uses `k * n * step / N`, NOT `k * n / M`. Valid for k < M/2 = 64 (all prime bins 2–47 qualify with N=512, step=4).

## Prime vs Mathematical signal disambiguation
Mathematical signals (sin at π, e, φ frequencies) also elevate prime bin 3 (≈π, ≈e). Distinguish via:
- **Active prime bin count**: prime signal elevates 6 bins; math signal elevates 1–2 bins
- **Pi coherence**: correlation with sin(2π·π·i/N) — high for math, low for prime
- Use **multiplicative scoring** `ratioScore × countScore / 100` so both tests must fire

## Verified results (5-run average, N=512)
- Natural noise: prime-score 0.2, pi-coh 0.02 → `natural` ✓
- Prime sequence: prime-score 92, pi-coh 0.27 → `prime_sequence` ✓  
- Mathematical: prime-score 21, pi-coh 0.57 → `mathematical` ✓
- Artificial pulse: prime-score 0, pi-coh 0.008 → `artificial_pulse` ✓
