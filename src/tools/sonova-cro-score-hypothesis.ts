import { tool, ParameterType } from '@optimizely-opal/opal-tools-sdk';

/**
 * sonova-cro-score-hypothesis
 *
 * Given a proposed hypothesis + context (brand, market, page_type, element_changed),
 * this tool returns an evidence-grounded ICE-style score (Impact, Confidence, Ease)
 * based on the Sonova CRO Memory Airtable history.
 *
 * This is NOT a generic ICE calculator. It uses historical evidence to set each
 * dimension:
 *  - Impact:      derived from observed uplift magnitudes on matching past tests
 *  - Confidence:  derived from sample size, statistical confidence, and consistency
 *                 of direction across matching past tests
 *  - Ease:        derived from element_changed (form tweaks easier than redesigns),
 *                 with a simple rubric
 *
 * Returns the score PLUS the supporting evidence (test IDs, uplifts, learnings)
 * so the agent can explain the score to a human reviewer. The agent's canvas
 * report then tells a grounded story instead of producing a gut-feel number.
 */

interface ScoreHypothesisParams {
  hypothesis: string;
  brand?: string;
  market?: string;
  page_type?: string;
  element_changed?: string;
  max_evidence_rows?: number;
}

interface TestRow {
  test_id: string;
  test_name: string;
  brand: string;
  market: string;
  page_type: string;
  element_changed: string;
  winner: string;
  uplift_pct: number;
  confidence_pct: number;
  sample_size: number;
  learning: string;
  tags: string[];
  hypothesis: string;
  end_date: string;
}

interface EvidenceEntry {
  test_id: string;
  test_name: string;
  brand: string;
  market: string;
  winner: string;
  uplift_pct: number;
  confidence_pct: number;
  learning: string;
  relevance: 'exact_match' | 'same_element_different_market' | 'adjacent';
}

interface ICEScore {
  impact: number;        // 1-10
  confidence: number;    // 1-10
  ease: number;          // 1-10
  composite: number;     // impact * confidence * ease, 1-1000
}

/**
 * Ease rubric — a simple lookup by element type. Lower = harder to implement.
 * The rationale is baked into the response so the agent can cite it.
 */
const EASE_RUBRIC: Record<string, { score: number; rationale: string }> = {
  cta: { score: 9, rationale: 'CTA copy changes are near-zero engineering cost.' },
  copy: { score: 9, rationale: 'Hero/subhead copy changes are near-zero engineering cost.' },
  social_proof: { score: 8, rationale: 'Requires content/design work but no new systems.' },
  form_field: { score: 7, rationale: 'Form field changes touch validation but are well-trodden.' },
  visual: { score: 6, rationale: 'Design + possible asset production effort.' },
  personalization: { score: 5, rationale: 'Requires audience/rule setup in the personalization engine.' },
  form_flow: { score: 4, rationale: 'Restructuring form steps touches validation, analytics, and conversion tracking.' },
  offer: { score: 3, rationale: 'Commercial + legal review typically required for pricing/offer changes.' },
  layout: { score: 3, rationale: 'Page-level layout changes often need dev + QA across breakpoints.' },
};

async function fetchCandidateEvidence(params: ScoreHypothesisParams): Promise<TestRow[]> {
  const pat = process.env.SONOVA_CRO_AIRTABLE_PAT;
  const baseId = process.env.SONOVA_CRO_AIRTABLE_BASE_ID;
  const tableId =
    process.env.SONOVA_CRO_AIRTABLE_TABLE_ID ||
    process.env.SONOVA_CRO_AIRTABLE_TABLE_NAME ||
    'Tests';

  if (!pat || !baseId) {
    throw new Error(
      'Missing env vars. Need SONOVA_CRO_AIRTABLE_PAT, SONOVA_CRO_AIRTABLE_BASE_ID, and SONOVA_CRO_AIRTABLE_TABLE_ID (or _TABLE_NAME).'
    );
  }

  // We query broadly (same element_changed OR same page_type) and classify
  // relevance client-side — Airtable's filterByFormula syntax gets ugly with OR().
  // 100 rows is well above our 20-row seed base, so effectively "fetch all."
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`);
  url.searchParams.set('maxRecords', '100');
  // Newest first — recency breaks ties in Impact calculations
  url.searchParams.append('sort[0][field]', 'end_date');
  url.searchParams.append('sort[0][direction]', 'desc');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${pat}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable request failed: ${res.status} ${res.statusText} — ${body}`);
  }

  const data = (await res.json()) as { records: Array<{ id: string; fields: Partial<TestRow> }> };
  return data.records.map((r) => r.fields as TestRow).filter((r) => !!r.test_id);
}

/**
 * Classify each row's relevance to the hypothesis's context.
 * We don't do semantic matching on the hypothesis text itself — that's the
 * agent's job, and LLM semantic reasoning beats keyword matching here. The
 * tool's job is to give the agent a *curated* candidate set.
 */
function classifyRelevance(
  row: TestRow,
  params: ScoreHypothesisParams
): EvidenceEntry['relevance'] | null {
  const brandMatch = !params.brand || row.brand === params.brand;
  const marketMatch = !params.market || row.market === params.market;
  const pageTypeMatch = !params.page_type || row.page_type === params.page_type;
  const elementMatch = !params.element_changed || row.element_changed === params.element_changed;

  if (brandMatch && marketMatch && pageTypeMatch && elementMatch) return 'exact_match';
  if (elementMatch && pageTypeMatch) return 'same_element_different_market';
  if (pageTypeMatch || elementMatch) return 'adjacent';
  return null;
}

/**
 * Impact score: derived from the absolute median uplift magnitude of exact+near
 * matches. Bigger observed swings on comparable tests = higher expected impact.
 * Scored 1-10 roughly mapped to uplift-%:
 *   <1% -> 2, 1-3% -> 4, 3-7% -> 6, 7-12% -> 8, >12% -> 10
 */
function scoreImpact(evidence: EvidenceEntry[]): { score: number; rationale: string } {
  const nearMatches = evidence.filter((e) => e.relevance !== 'adjacent');
  const pool = nearMatches.length > 0 ? nearMatches : evidence;

  if (pool.length === 0) {
    return {
      score: 4,
      rationale:
        'No directly comparable prior tests. Default to moderate impact (4/10) pending evidence.',
    };
  }

  const magnitudes = pool
    .map((e) => Math.abs(e.uplift_pct))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const median = magnitudes[Math.floor(magnitudes.length / 2)];

  let score: number;
  if (median < 1) score = 2;
  else if (median < 3) score = 4;
  else if (median < 7) score = 6;
  else if (median < 12) score = 8;
  else score = 10;

  return {
    score,
    rationale: `Median observed |uplift| on ${pool.length} comparable past test${pool.length === 1 ? '' : 's'} was ${median.toFixed(1)}%.`,
  };
}

/**
 * Confidence score: weights three factors:
 *  - Count of comparable past tests (more = more confidence in the hypothesis class)
 *  - Statistical confidence on those tests (95%+ readings count more than 60%)
 *  - Direction consistency — if 3 prior tests all agree the element moves the
 *    metric in the same direction, confidence goes up; if they disagree, down.
 */
function scoreConfidence(evidence: EvidenceEntry[]): { score: number; rationale: string } {
  if (evidence.length === 0) {
    return {
      score: 3,
      rationale: 'No prior evidence found. Confidence is low by default.',
    };
  }

  const highConfTests = evidence.filter((e) => (e.confidence_pct ?? 0) >= 90);
  const nearMatches = evidence.filter((e) => e.relevance !== 'adjacent');

  // Direction consistency among winners
  const winnerSigns = evidence
    .filter((e) => e.winner === 'variant_a' || e.winner === 'variant_b')
    .map((e) => Math.sign(e.uplift_pct));
  const signConsistent =
    winnerSigns.length === 0
      ? true
      : winnerSigns.every((s) => s === winnerSigns[0]);

  let score = 3;
  const parts: string[] = [];

  if (nearMatches.length >= 3) {
    score += 3;
    parts.push(`${nearMatches.length} directly comparable prior tests`);
  } else if (nearMatches.length >= 1) {
    score += 2;
    parts.push(`${nearMatches.length} directly comparable prior test${nearMatches.length === 1 ? '' : 's'}`);
  } else {
    parts.push('no directly comparable prior tests (using adjacent evidence only)');
  }

  if (highConfTests.length >= 2) {
    score += 2;
    parts.push(`${highConfTests.length} tests with ≥90% confidence`);
  } else if (highConfTests.length === 1) {
    score += 1;
    parts.push('1 test with ≥90% confidence');
  }

  if (signConsistent && winnerSigns.length >= 2) {
    score += 2;
    parts.push('all winning variants moved the metric in the same direction');
  } else if (!signConsistent) {
    score = Math.max(2, score - 1);
    parts.push('⚠ prior tests disagree on direction — hypothesis is contested');
  }

  score = Math.min(10, Math.max(1, score));

  return {
    score,
    rationale: parts.join('; ') + '.',
  };
}

/**
 * Ease score — simple lookup.
 */
function scoreEase(params: ScoreHypothesisParams): { score: number; rationale: string } {
  if (!params.element_changed) {
    return {
      score: 6,
      rationale: 'No element_changed provided; defaulting to medium ease (6/10).',
    };
  }
  const entry = EASE_RUBRIC[params.element_changed];
  if (!entry) {
    return {
      score: 5,
      rationale: `Unknown element_changed "${params.element_changed}"; defaulting to 5/10.`,
    };
  }
  return entry;
}

async function sonovaCroScoreHypothesis(params: ScoreHypothesisParams) {
  if (!params.hypothesis || params.hypothesis.trim().length < 10) {
    throw new Error(
      'hypothesis must be a non-trivial string (10+ chars) describing what you plan to change and what outcome you expect.'
    );
  }

  const maxEvidence = Math.max(1, Math.min(params.max_evidence_rows ?? 8, 20));

  // 1. Fetch a broad candidate set from Airtable
  const candidates = await fetchCandidateEvidence(params);

  // 2. Classify relevance to the hypothesis's context
  const classified: EvidenceEntry[] = [];
  for (const row of candidates) {
    const relevance = classifyRelevance(row, params);
    if (!relevance) continue;
    classified.push({
      test_id: row.test_id,
      test_name: row.test_name,
      brand: row.brand,
      market: row.market,
      winner: row.winner,
      uplift_pct: row.uplift_pct,
      confidence_pct: row.confidence_pct,
      learning: row.learning,
      relevance,
    });
  }

  // 3. Rank: exact_match first, then same_element_different_market, then adjacent
  const relevanceRank: Record<EvidenceEntry['relevance'], number> = {
    exact_match: 0,
    same_element_different_market: 1,
    adjacent: 2,
  };
  classified.sort((a, b) => {
    const rr = relevanceRank[a.relevance] - relevanceRank[b.relevance];
    if (rr !== 0) return rr;
    // Within the same relevance bucket, prefer higher-confidence tests
    return (b.confidence_pct ?? 0) - (a.confidence_pct ?? 0);
  });

  const evidence = classified.slice(0, maxEvidence);

  // 4. Score
  const impact = scoreImpact(evidence);
  const confidence = scoreConfidence(evidence);
  const ease = scoreEase(params);
  const score: ICEScore = {
    impact: impact.score,
    confidence: confidence.score,
    ease: ease.score,
    composite: impact.score * confidence.score * ease.score,
  };

  return {
    source: 'Sonova CRO Memory (Airtable)',
    hypothesis: params.hypothesis,
    context: {
      brand: params.brand || null,
      market: params.market || null,
      page_type: params.page_type || null,
      element_changed: params.element_changed || null,
    },
    score,
    score_rationale: {
      impact: impact.rationale,
      confidence: confidence.rationale,
      ease: ease.rationale,
    },
    evidence_count: evidence.length,
    evidence,
  };
}

tool({
  name: 'sonova-cro-score-hypothesis',
  description:
    "Given a proposed A/B test hypothesis plus context (brand, market, page_type, element_changed), returns an evidence-grounded ICE score (Impact, Confidence, Ease) drawn from Sonova's CRO Memory Airtable history. Also returns the matching past tests that informed the score, so the agent can explain the score to a reviewer.",
  parameters: [
    {
      name: 'hypothesis',
      type: ParameterType.String,
      description:
        'The proposed hypothesis as plain English, e.g. "Changing the Geers hero CTA from \\"Termin vereinbaren\\" to \\"Probehören starten\\" will increase lead rate by 10%+ for the active-senior persona." 10+ chars required.',
      required: true,
    },
    {
      name: 'brand',
      type: ParameterType.String,
      description: 'Target brand: geers | boots | audionova. Used to weight evidence.',
      required: false,
    },
    {
      name: 'market',
      type: ParameterType.String,
      description: 'Target market ISO code: DE | UK | NL | IT | PT | US.',
      required: false,
    },
    {
      name: 'page_type',
      type: ParameterType.String,
      description: 'Target page type: lp | form | email | other.',
      required: false,
    },
    {
      name: 'element_changed',
      type: ParameterType.String,
      description:
        'The element the hypothesis is about: cta | copy | visual | form_flow | form_field | social_proof | personalization | offer | layout. Drives the Ease score.',
      required: false,
    },
    {
      name: 'max_evidence_rows',
      type: ParameterType.Integer,
      description: 'Max supporting past-test rows to return alongside the score (1-20). Default 8.',
      required: false,
    },
  ],
})(sonovaCroScoreHypothesis);

export { sonovaCroScoreHypothesis };
