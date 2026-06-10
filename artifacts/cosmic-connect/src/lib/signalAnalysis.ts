/**
 * Thealins Signal Analysis Library
 * Phase 6: Advanced AI Signal Analyzer
 *
 * Provides:
 *  - Feature extraction (32 features per signal window)
 *  - TF.js neural network builder (32 → 16 → 4, softmax)
 *  - Four independent pattern detectors with evidence text
 */

import * as tf from "@tensorflow/tfjs";

// ─── Constants ────────────────────────────────────────────────────────────────

export const N_SAMPLES = 512;
export const PRIME_LAGS = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29];
export const NON_PRIME_LAGS = [4, 6, 8, 9, 10, 12, 14, 15, 16, 18];
export const N_FFT_BANDS = 8;
export const N_FEATURES = 32; // 6 stats + 2 autocorr ratios + 8 fft + 4 regularity + 6 pattern + 6 misc

/** Known prime frequencies (index positions in a 512-point FFT) */
const PRIME_FREQ_INDICES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];

// ─── Types ────────────────────────────────────────────────────────────────────

export type SignalClass = "natural" | "prime_sequence" | "mathematical" | "artificial_pulse";

export interface DetectorResult {
  score: number;                   // 0–100
  confidence: "low" | "medium" | "high";
  evidence: string[];              // Human-readable evidence lines
  detected: boolean;
}

export interface ClassificationResult {
  classification: SignalClass;
  confidence: number;              // 0–100 for the top class
  probabilities: Record<SignalClass, number>; // 0–1 each
  inferenceMs: number;
  primeDetection: DetectorResult;
  mathDetection: DetectorResult;
  regularityDetection: DetectorResult;
  overallAnomaly: DetectorResult;
  kurtosis: number;
  primeRatio: number;
  peakToRms: number;
  zeroCrossingRate: number;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Box-Muller Gaussian random */
export function gaussRand(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Normalised autocorrelation at lag d (Pearson-normalised, range [-1,1]) */
function autocorr(signal: Float32Array, lag: number): number {
  const n = signal.length;
  let sum = 0, meanSum = 0;
  for (let i = 0; i < n; i++) meanSum += signal[i];
  const mean = meanSum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) varSum += (signal[i] - mean) ** 2;
  if (varSum < 1e-12) return 0;
  for (let i = 0; i < n - lag; i++) {
    sum += (signal[i] - mean) * (signal[i + lag] - mean);
  }
  return sum / varSum;
}

/** Compute statistical moments in one pass */
function computeStats(signal: Float32Array) {
  const n = signal.length;
  let sum = 0, sum2 = 0, sum3 = 0, sum4 = 0, sumSq = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const x = signal[i];
    sum += x;
    sumSq += x * x;
    peak = Math.max(peak, Math.abs(x));
  }
  const mean = sum / n;
  const rms = Math.sqrt(sumSq / n);
  for (let i = 0; i < n; i++) {
    const z = signal[i] - mean;
    sum2 += z * z;
    sum3 += z * z * z;
    sum4 += z * z * z * z;
  }
  const variance = sum2 / n;
  const std = Math.sqrt(variance);
  const skewness = std > 0 ? (sum3 / n) / (std ** 3) : 0;
  const kurtosis = std > 0 ? (sum4 / n) / (variance ** 2) : 3;
  const peakToRms = rms > 0 ? peak / rms : 1;
  return { mean, std, rms, variance, skewness, kurtosis, peakToRms, peak };
}

/** Zero-crossing rate (crossings per sample) */
function zeroCrossingRate(signal: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < signal.length; i++) {
    if ((signal[i] >= 0) !== (signal[i - 1] >= 0)) crossings++;
  }
  return crossings / signal.length;
}

/** Count clear peaks (local maxima above threshold) */
function countPeaks(signal: Float32Array): number {
  const stats = computeStats(signal);
  const threshold = stats.mean + stats.std * 0.8;
  let count = 0;
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > threshold && signal[i] > signal[i - 1] && signal[i] > signal[i + 1]) {
      count++;
    }
  }
  return count;
}

/** Periodicity score: how regular are the peak spacings (0=random, 1=perfectly regular) */
function periodicityScore(signal: Float32Array): number {
  const stats = computeStats(signal);
  const threshold = stats.mean + stats.std;
  const peakPositions: number[] = [];
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > threshold && signal[i] > signal[i - 1] && signal[i] > signal[i + 1]) {
      peakPositions.push(i);
    }
  }
  if (peakPositions.length < 3) return 0;
  const spacings = peakPositions.slice(1).map((p, i) => p - peakPositions[i]);
  const meanSpacing = spacings.reduce((a, b) => a + b, 0) / spacings.length;
  if (meanSpacing === 0) return 0;
  const variance = spacings.reduce((a, s) => a + (s - meanSpacing) ** 2, 0) / spacings.length;
  const cv = Math.sqrt(variance) / meanSpacing; // coefficient of variation
  return Math.max(0, 1 - cv * 2); // 0 = chaotic, 1 = perfectly regular
}

/** Longest consecutive run of same sign */
function longestRun(signal: Float32Array): number {
  let maxRun = 1, currentRun = 1;
  for (let i = 1; i < signal.length; i++) {
    if ((signal[i] >= 0) === (signal[i - 1] >= 0)) {
      currentRun++;
      maxRun = Math.max(maxRun, currentRun);
    } else {
      currentRun = 1;
    }
  }
  return maxRun / signal.length;
}

/**
 * Compute DFT magnitude at original-signal frequency bin k, using every
 * `step`-th sample (decimation) for speed. Valid for k << N/(2*step).
 * For our prime bins (2–47) with N=512, step=4 → valid up to k < 64. ✓
 */
function dftMagAtBin(signal: Float32Array, k: number, step = 4): number {
  const N = signal.length;
  const M = Math.floor(N / step);
  let re = 0, im = 0;
  for (let n = 0; n < M; n++) {
    const angle = (2 * Math.PI * k * n * step) / N;
    re += signal[n * step] * Math.cos(angle);
    im -= signal[n * step] * Math.sin(angle);
  }
  return Math.sqrt(re * re + im * im) / M;
}

/**
 * FFT energy in N_FFT_BANDS equal-width bands, computed via DFT on a 64-point
 * subsample (fast enough for real-time, accurate enough for band energies).
 */
function fftBandEnergies(signal: Float32Array, nBands: number): number[] {
  const M = 64; // subsample size
  const step = Math.floor(signal.length / M);
  const sub = new Float32Array(M);
  for (let i = 0; i < M; i++) sub[i] = signal[i * step];

  // DFT magnitude squared for bins 0..M/2
  const bandSize = Math.floor(M / 2 / nBands);
  const energies: number[] = new Array(nBands).fill(0);

  for (let k = 0; k < M / 2; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < M; n++) {
      const angle = (2 * Math.PI * k * n) / M;
      re += sub[n] * Math.cos(angle);
      im -= sub[n] * Math.sin(angle);
    }
    const mag2 = re * re + im * im;
    const band = Math.min(Math.floor(k / bandSize), nBands - 1);
    energies[band] += mag2;
  }

  // Normalise
  const total = energies.reduce((a, b) => a + b, 0) || 1;
  return energies.map((e) => e / total);
}

/**
 * Compare DFT energy at prime frequency bins vs non-prime bins,
 * all evaluated at the correct original-signal frequencies via dftMagAtBin.
 * Returns { ratio, primeMags, nonPrimeMags } for use by detectPrimeSequence.
 */
function primeFrequencyScore(signal: Float32Array): {
  ratio: number;
  primeMags: number[];
  nonPrimeMags: number[];
} {
  const primeMags    = PRIME_LAGS.map((k) => dftMagAtBin(signal, k));
  const nonPrimeMags = NON_PRIME_LAGS.map((k) => dftMagAtBin(signal, k));
  const primeMean    = primeMags.reduce((a, b) => a + b) / primeMags.length;
  const nonPrimeMean = nonPrimeMags.reduce((a, b) => a + b) / nonPrimeMags.length;
  return { ratio: nonPrimeMean > 0 ? primeMean / nonPrimeMean : 1, primeMags, nonPrimeMags };
}

// ─── Feature Extraction ───────────────────────────────────────────────────────

/**
 * Extract 32 features from a signal window.
 * Returns a Float32Array ready for TF.js input.
 */
export function extractFeatures(signal: Float32Array): Float32Array {
  const stats = computeStats(signal);
  const primeCorrs = PRIME_LAGS.map((lag) => Math.abs(autocorr(signal, lag)));
  const nonPrimeCorrs = NON_PRIME_LAGS.map((lag) => Math.abs(autocorr(signal, lag)));
  const primeMean = primeCorrs.reduce((a, b) => a + b) / primeCorrs.length;
  const nonPrimeMean = nonPrimeCorrs.reduce((a, b) => a + b) / nonPrimeCorrs.length;
  const bands = fftBandEnergies(signal, N_FFT_BANDS);
  const zcr = zeroCrossingRate(signal);
  const periods = periodicityScore(signal);
  const lrun = longestRun(signal);
  const nPeaks = countPeaks(signal) / signal.length;
  const { ratio: primeRatioFFT, primeMags, nonPrimeMags } = primeFrequencyScore(signal);
  const primeRatio = nonPrimeMean > 0 ? primeMean / nonPrimeMean : 1;
  const nonPrimeMagMean = nonPrimeMags.reduce((a, b) => a + b) / nonPrimeMags.length;
  const activePrimeBins = primeMags.filter((m) => m > nonPrimeMagMean * 2).length;

  const features = new Float32Array(N_FEATURES);
  // [0-5] statistical moments
  features[0] = Math.tanh(stats.mean * 10);
  features[1] = Math.tanh(stats.std * 10);
  features[2] = Math.tanh((stats.kurtosis - 3) / 5);
  features[3] = Math.tanh((stats.peakToRms - 1) / 3);
  features[4] = Math.tanh(stats.skewness / 2);
  features[5] = Math.tanh(stats.rms * 10);
  // [6-7] autocorrelation (kept as secondary features)
  features[6] = Math.tanh(primeMean * 10);
  features[7] = Math.tanh(nonPrimeMean * 10);
  // [8-15] FFT bands
  for (let i = 0; i < N_FFT_BANDS; i++) features[8 + i] = bands[i];
  // [16-19] regularity
  features[16] = zcr;
  features[17] = periods;
  features[18] = lrun;
  features[19] = nPeaks * 20;
  // [20-25] corrected FFT-based prime + pattern scores
  features[20] = Math.tanh((primeRatioFFT - 1) * 3);   // FFT prime-bin ratio
  features[21] = activePrimeBins / PRIME_LAGS.length;   // fraction of active prime bins
  features[22] = Math.tanh((primeRatio - 1) * 5);       // autocorr ratio (secondary)
  features[23] = primeMean;
  features[24] = Math.tanh(stats.kurtosis / 5);
  features[25] = periods;
  // [26-31] individual prime autocorrs (first 6) — fine-grained structure
  for (let i = 0; i < 6; i++) features[26 + i] = primeCorrs[i];

  return features;
}

// ─── TF.js Model ─────────────────────────────────────────────────────────────

/**
 * Build and return a fresh TensorFlow.js sequential model.
 * Architecture: 32 → Dense(16, relu) → Dense(8, relu) → Dense(4, softmax)
 * Output classes: [natural, prime_sequence, mathematical, artificial_pulse]
 */
export function buildAnalysisModel(): tf.Sequential {
  const model = tf.sequential({
    layers: [
      tf.layers.dense({
        inputShape: [N_FEATURES],
        units: 16,
        activation: "relu",
        kernelInitializer: "glorotUniform",
        name: "hidden1",
      }),
      tf.layers.dense({
        units: 8,
        activation: "relu",
        kernelInitializer: "glorotUniform",
        name: "hidden2",
      }),
      tf.layers.dense({
        units: 4,
        activation: "softmax",
        kernelInitializer: "glorotUniform",
        name: "output",
      }),
    ],
  });
  return model;
}

// ─── Pattern Detectors ────────────────────────────────────────────────────────

/**
 * Detector 1: Prime Sequence Detection
 *
 * Uses two independent tests:
 *  A) Spectral energy ratio: mean DFT magnitude at prime bins / non-prime bins
 *     (computed at original-signal frequencies via dftMagAtBin — the old approach
 *     used a subsampled 64-point DFT which aliased all prime bins near DC)
 *  B) Active prime bin count: how many prime bins exceed 2× the non-prime noise floor
 *
 * Final score = A% × B% (multiplicative) — both tests must fire together.
 * This prevents mathematical signals (energy only near bins 3 ≈ π and 2 ≈ e)
 * from being misclassified as prime sequences (energy across 6 distinct prime bins).
 */
export function detectPrimeSequence(signal: Float32Array): DetectorResult {
  const { ratio, primeMags, nonPrimeMags } = primeFrequencyScore(signal);

  const nonPrimeMean = nonPrimeMags.reduce((a, b) => a + b) / nonPrimeMags.length;
  const elevationThreshold = nonPrimeMean * 2.0;
  const activePrimeBins = primeMags.filter((m) => m > elevationThreshold).length;

  // Top 3 prime bins by DFT magnitude
  const ranked = PRIME_LAGS.map((bin, i) => ({ bin, mag: primeMags[i] }))
    .sort((a, b) => b.mag - a.mag)
    .slice(0, 3);

  // A: ratio score — how elevated are prime bins vs non-prime bins on average
  const ratioScore = Math.min(100, Math.max(0, (ratio - 1) * 50));
  // B: count score — how many distinct prime bins are above the noise floor
  //    (a mathematical signal elevates only ~2 bins; a prime sequence elevates 5–6)
  const countScore = Math.min(100, activePrimeBins * 15);
  // Multiplicative: both conditions must hold
  const score = Math.round((ratioScore * countScore) / 100);

  const evidence: string[] = [
    `Prime frequency bin energy: ${(nonPrimeMags.reduce((a,b)=>a+b)/nonPrimeMags.length * ratio).toFixed(3)} mean mag (ratio ${ratio.toFixed(2)}× over non-prime bins)`,
    `Active prime spectral bins (> 2× noise floor): ${activePrimeBins} of ${PRIME_LAGS.length}${activePrimeBins >= 4 ? " — matches prime-harmonic template" : activePrimeBins >= 2 ? " — partial prime structure" : " — none detected"}`,
    `Strongest prime harmonics: bin-${ranked[0].bin} (${ranked[0].mag.toFixed(3)}), bin-${ranked[1].bin} (${ranked[1].mag.toFixed(3)}), bin-${ranked[2].bin} (${ranked[2].mag.toFixed(3)})`,
    `Non-prime reference bins (${NON_PRIME_LAGS.slice(0, 3).join(", ")}): mags ${nonPrimeMags.slice(0, 3).map((m) => m.toFixed(3)).join(", ")} — noise floor estimate`,
    ratio > 2 && activePrimeBins >= 4
      ? "Multiple distinct prime-frequency carriers detected — strong signature of prime-sequence encoding"
      : activePrimeBins >= 2
      ? "Some prime-frequency structure present but below threshold for prime sequence confirmation"
      : "No significant prime harmonic structure — consistent with noise or non-prime signal type",
  ];

  const confidence: DetectorResult["confidence"] =
    score >= 60 ? "high" : score >= 30 ? "medium" : "low";

  return { score, confidence, evidence, detected: score >= 40 };
}

/**
 * Detector 2: Mathematical Constants Detection
 * Checks for signal frequency components related to π, e, and φ (golden ratio).
 */
export function detectMathematicalConstants(signal: Float32Array): DetectorResult {
  const M = 64;
  const step = Math.floor(signal.length / M);
  const sub = new Float32Array(M);
  for (let i = 0; i < M; i++) sub[i] = signal[i * step];

  // Compute DFT magnitude spectrum
  const mags: number[] = [];
  for (let k = 1; k < M / 2; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < M; n++) {
      const angle = (2 * Math.PI * k * n) / M;
      re += sub[n] * Math.cos(angle);
      im -= sub[n] * Math.sin(angle);
    }
    mags.push(Math.sqrt(re * re + im * im));
  }

  // Find dominant frequencies (top 5 peaks)
  const peaks = mags
    .map((m, k) => ({ k: k + 1, mag: m }))
    .filter((_, i, a) => {
      if (i === 0 || i === a.length - 1) return true;
      return a[i].mag > a[i - 1].mag && a[i].mag > a[i + 1].mag;
    })
    .sort((a, b) => b.mag - a.mag)
    .slice(0, 5);

  const CONSTANTS = [
    { name: "π", value: Math.PI },
    { name: "e", value: Math.E },
    { name: "φ (golden ratio)", value: (1 + Math.sqrt(5)) / 2 },
    { name: "π²", value: Math.PI ** 2 },
    { name: "√2", value: Math.SQRT2 },
  ];

  // Check frequency ratios against mathematical constants
  const matches: Array<{ a: number; b: number; constant: string; diff: number }> = [];
  for (let i = 0; i < peaks.length - 1; i++) {
    for (let j = i + 1; j < peaks.length; j++) {
      const ratio = peaks[j].k / peaks[i].k;
      for (const c of CONSTANTS) {
        const diff = Math.abs(ratio - c.value) / c.value;
        if (diff < 0.15) {
          matches.push({ a: peaks[i].k, b: peaks[j].k, constant: c.name, diff });
        }
      }
    }
  }

  // Pi-phase coherence score: correlation of signal with pi-frequency sinusoid
  let piCoherence = 0;
  for (let i = 0; i < signal.length; i++) {
    piCoherence += signal[i] * Math.sin((2 * Math.PI * Math.PI * i) / signal.length);
  }
  piCoherence = Math.abs(piCoherence) / signal.length;

  const stats = computeStats(signal);
  const piCoh = stats.std > 0 ? piCoherence / stats.std : 0;

  const matchScore = Math.min(100, matches.length * 25 + (piCoh > 0.3 ? 30 : 0));
  const piScore = Math.min(100, piCoh * 80);
  const score = Math.round((matchScore + piScore) / 2);

  const evidence: string[] = [
    `Pi-frequency coherence: ${piCoh.toFixed(4)}${piCoh > 0.3 ? " — significantly above noise floor" : " — within noise floor"}`,
    matches.length > 0
      ? `Mathematical constant frequency ratios found: ${matches.map((m) => `f${m.b}/f${m.a} ≈ ${m.constant} (err ${(m.diff * 100).toFixed(1)}%)`).join(", ")}`
      : "No clear mathematical constant frequency ratios found in spectrum",
    `Dominant spectral peaks at FFT bins: ${peaks
      .slice(0, 3)
      .map((p) => `k=${p.k} (mag ${p.mag.toFixed(3)})`)
      .join(", ")}`,
    piCoh > 0.3
      ? "Signal shows phase coherence with π-frequency carrier — possible pi encoding"
      : "Signal phase is inconsistent with pi-frequency carrier",
  ];

  const confidence: DetectorResult["confidence"] =
    score >= 60 ? "high" : score >= 25 ? "medium" : "low";

  return { score, confidence, evidence, detected: score >= 30 };
}

/**
 * Detector 3: Signal Regularity Analysis
 * Measures how far the signal deviates from natural Gaussian noise.
 */
export function detectRegularity(signal: Float32Array): DetectorResult {
  const stats = computeStats(signal);
  const zcr = zeroCrossingRate(signal);
  const periods = periodicityScore(signal);
  const lrun = longestRun(signal);
  const nPeaks = countPeaks(signal);

  // Gaussian noise expected kurtosis = 3.0, ZCR ≈ 0.5
  const kurtosisDeviation = Math.abs(stats.kurtosis - 3.0);
  const zcrDeviation = Math.abs(zcr - 0.5) * 2; // 0 = gaussian ZCR, 1 = maximum deviation

  const kurtosisScore = Math.min(100, kurtosisDeviation * 15);
  const periodicityContrib = periods * 80;
  const peakContrib = Math.min(40, nPeaks * 2);

  const score = Math.round((kurtosisScore + periodicityContrib + peakContrib) / 3);

  const zcrExpected = zcr.toFixed(4);
  const expectedZCR = "≈0.500";

  const evidence: string[] = [
    `Kurtosis: ${stats.kurtosis.toFixed(3)} (Gaussian baseline = 3.000; deviation = ${kurtosisDeviation.toFixed(3)})${kurtosisDeviation > 2 ? " — significantly non-Gaussian" : ""}`,
    `Zero-crossing rate: ${zcrExpected} (expected ${expectedZCR} for Gaussian noise)${Math.abs(zcr - 0.5) > 0.1 ? " — deviant" : " — consistent with noise"}`,
    `Periodicity score: ${(periods * 100).toFixed(1)}%${periods > 0.5 ? " — regular structure detected" : " — no regular structure"}`,
    `Peak count: ${nPeaks} (${(nPeaks / signal.length * 100).toFixed(2)}% of samples)`,
    `Longest same-sign run: ${(lrun * 100).toFixed(1)}% of signal length${lrun > 0.15 ? " — elevated, possible DC component" : ""}`,
    stats.kurtosis < 2.5
      ? "Platykurtic distribution — fewer extreme values than Gaussian (possible truncation or clipping)"
      : stats.kurtosis > 4
      ? "Leptokurtic distribution — more extreme values than Gaussian (impulses or modulation)"
      : "Kurtosis near Gaussian baseline",
  ];

  const confidence: DetectorResult["confidence"] =
    score >= 60 ? "high" : score >= 25 ? "medium" : "low";

  return { score, confidence, evidence, detected: score >= 30 };
}

// ─── Main Classification ──────────────────────────────────────────────────────

/**
 * Run full AI classification on a signal window.
 * Calls the TF.js model + all 4 detectors.
 * Returns a complete ClassificationResult.
 */
export async function classifySignal(
  signal: Float32Array,
  model: tf.Sequential
): Promise<ClassificationResult> {
  const t0 = performance.now();

  // Feature extraction
  const features = extractFeatures(signal);

  // TF.js neural network forward pass
  const inputTensor = tf.tensor2d([Array.from(features)], [1, N_FEATURES]);
  const outputTensor = model.predict(inputTensor) as tf.Tensor;
  const probsArray = Array.from(await outputTensor.data());
  tf.dispose([inputTensor, outputTensor]);

  const inferenceMs = performance.now() - t0;

  const CLASSES: SignalClass[] = ["natural", "prime_sequence", "mathematical", "artificial_pulse"];
  const probabilities = Object.fromEntries(
    CLASSES.map((c, i) => [c, probsArray[i] ?? 0])
  ) as Record<SignalClass, number>;

  // Override neural net with feature-based detectors for best accuracy
  // (The NN provides a soft ensemble; detectors provide the evidence)
  const primeDetection = detectPrimeSequence(signal);
  const mathDetection = detectMathematicalConstants(signal);
  const regularityDetection = detectRegularity(signal);

  // Compute scalar stats for display
  const stats = computeStats(signal);
  const primeCorrs = PRIME_LAGS.map((lag) => Math.abs(autocorr(signal, lag)));
  const nonPrimeCorrs = NON_PRIME_LAGS.map((lag) => Math.abs(autocorr(signal, lag)));
  const primeMean = primeCorrs.reduce((a, b) => a + b) / primeCorrs.length;
  const nonPrimeMean = nonPrimeCorrs.reduce((a, b) => a + b) / nonPrimeCorrs.length;
  const primeRatio = nonPrimeMean > 0 ? primeMean / nonPrimeMean : 1;
  const zcr = zeroCrossingRate(signal);

  // Determine final classification from detectors + NN probabilities
  // Detector scores 0-100; NN probs 0-1 (treat as independent evidence)
  const detectorVotes: Record<SignalClass, number> = {
    natural: (1 - regularityDetection.score / 100) * 40 + probabilities.natural * 60,
    prime_sequence: (primeDetection.score / 100) * 60 + probabilities.prime_sequence * 40,
    mathematical: (mathDetection.score / 100) * 60 + probabilities.mathematical * 40,
    artificial_pulse:
      regularityDetection.detected && !primeDetection.detected
        ? 50 + probabilities.artificial_pulse * 50
        : probabilities.artificial_pulse * 30,
  };

  const maxClass = (Object.keys(detectorVotes) as SignalClass[]).reduce((a, b) =>
    detectorVotes[a] > detectorVotes[b] ? a : b
  );
  const confidence = Math.round(Math.min(100, detectorVotes[maxClass]));

  const overallScore = Math.round(
    (primeDetection.score + mathDetection.score + regularityDetection.score) / 3
  );
  const overallAnomaly: DetectorResult = {
    score: overallScore,
    confidence: overallScore >= 60 ? "high" : overallScore >= 25 ? "medium" : "low",
    detected: overallScore >= 30,
    evidence: [
      `Combined detector consensus: ${overallScore}/100`,
      `Neural network top class: ${maxClass.replace("_", " ")} (${(Math.max(...Object.values(probabilities)) * 100).toFixed(1)}%)`,
      `TF.js inference completed in ${inferenceMs.toFixed(1)}ms`,
      overallScore >= 60
        ? "Multiple pattern detectors agree — high confidence of artificial signal"
        : overallScore >= 30
        ? "Partial evidence of non-natural structure — moderate confidence"
        : "No consistent pattern across detectors — signal consistent with natural origin",
    ],
  };

  return {
    classification: maxClass,
    confidence,
    probabilities,
    inferenceMs,
    primeDetection,
    mathDetection,
    regularityDetection,
    overallAnomaly,
    kurtosis: stats.kurtosis,
    primeRatio,
    peakToRms: stats.peakToRms,
    zeroCrossingRate: zcr,
  };
}

// ─── Signal Generators ────────────────────────────────────────────────────────

/** Natural radio background noise (Gaussian + slow drift) */
export function generateNaturalNoise(n = N_SAMPLES): Float32Array {
  const sig = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    sig[i] = gaussRand() * 0.14;
    sig[i] += Math.sin(i * 0.06 + 0.3) * 0.012;
    sig[i] += Math.sin(i * 0.13) * 0.007;
  }
  return sig;
}

/** Prime-sequence signal: carrier frequencies at prime harmonics */
export function generatePrimeSequenceSignal(n = N_SAMPLES): Float32Array {
  const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23];
  const sig = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    sig[i] = gaussRand() * 0.04;
    for (let pi = 0; pi < 6; pi++) {
      const p = primes[pi];
      const weight = 0.18 * (1 - pi * 0.1);
      sig[i] += weight * Math.sin((2 * Math.PI * i * p) / n);
    }
  }
  return sig;
}

/** Mathematical signal: frequencies related to π and e */
export function generateMathematicalSignal(n = N_SAMPLES): Float32Array {
  const sig = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    sig[i] = gaussRand() * 0.04;
    sig[i] += 0.22 * Math.sin((2 * Math.PI * Math.PI * i) / n);
    sig[i] += 0.15 * Math.sin((2 * Math.PI * Math.E * i) / n);
    sig[i] += 0.08 * Math.sin((2 * Math.PI * ((1 + Math.sqrt(5)) / 2) * i) / n);
  }
  return sig;
}

/** Artificial regular pulse: evenly spaced pulses (not prime intervals) */
export function generateArtificialPulseSignal(n = N_SAMPLES, period = 32): Float32Array {
  const sig = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    sig[i] = gaussRand() * 0.04;
    if (i % period < 4) sig[i] += 0.35; // regular square pulse
  }
  return sig;
}
