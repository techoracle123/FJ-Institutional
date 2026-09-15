/**
 * Precomputed strategy verification, produced nightly by scripts/verify.mjs
 * and read from the repo over the same contents API the ledger uses.
 *
 * This is deliberately NOT computed per-request: 10k bootstrap resamples plus
 * 400 placebo replications per instrument is ~11M operations, which exceeded
 * the Worker CPU budget and produced site-wide 503s.
 */
export interface InstrumentVerification {
  n: number;
  expectancy: number;
  ciLow: number;
  ciHigh: number;
  placeboMedian: number;
  placeboP95: number;
  pValue: number;
  verified: boolean;
  verdict: string;
}

export interface VerificationFile {
  generatedAt: string;
  anyVerified: boolean;
  instruments: Record<string, InstrumentVerification>;
}

const REPO = 'techoracle123/FJ-Institutional';
const PATH = 'data/verification.json';

let cache: VerificationFile | null = null;
let cachedAt = 0;

export async function fetchVerification(): Promise<VerificationFile | null> {
  if (cache && Date.now() - cachedAt < 1_800_000) return cache;
  const token = process.env.GITHUB_TOKEN ?? '';
  try {
    const r = token
      ? await fetch(`https://api.github.com/repos/${REPO}/contents/${PATH}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.raw',
            'User-Agent': 'FJInstitutional',
          },
          next: { revalidate: 1800 },
        })
      : await fetch(`https://raw.githubusercontent.com/${REPO}/main/${PATH}`,
          { next: { revalidate: 1800 } });
    if (r.ok) {
      const j = (await r.json()) as VerificationFile;
      if (j?.instruments) { cache = j; cachedAt = Date.now(); return j; }
    }
  } catch {
    /* fall through */
  }
  return cache;
}
