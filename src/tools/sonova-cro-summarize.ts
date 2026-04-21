import { tool, ParameterType } from '@optimizely-opal/opal-tools-sdk';

interface SonovaCroSummarizeParams {
  brand?: string;
  market?: string;
  page_type?: string;
  element_changed?: string;
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
  learning: string;
  tags: string[];
  start_date: string;
}

/**
 * Fetch rows matching the provided filters, then aggregate into patterns.
 * Shares the same Airtable-read helper logic as sonova-cro-lookup but focused on summary output.
 */
async function fetchMatchingTests(params: SonovaCroSummarizeParams): Promise<TestRow[]> {
  const pat = process.env.SONOVA_CRO_AIRTABLE_PAT;
  const baseId = process.env.SONOVA_CRO_AIRTABLE_BASE_ID;
  const tableId = process.env.SONOVA_CRO_AIRTABLE_TABLE_ID;

  if (!pat || !baseId || !tableId) {
    throw new Error(
      'Missing env vars. Need SONOVA_CRO_AIRTABLE_PAT, SONOVA_CRO_AIRTABLE_BASE_ID, SONOVA_CRO_AIRTABLE_TABLE_ID.'
    );
  }

  const conditions: string[] = [];
  if (params.brand) conditions.push(`{brand} = "${params.brand}"`);
  if (params.market) conditions.push(`{market} = "${params.market}"`);
  if (params.page_type) conditions.push(`{page_type} = "${params.page_type}"`);
  if (params.element_changed) conditions.push(`{element_changed} = "${params.element_changed}"`);
  const filter = conditions.length === 0 ? '' : conditions.length === 1 ? conditions[0] : `AND(${conditions.join(', ')})`;

  const url = new URL(`https://api.airtable.com/v0/${baseId}/${tableId}`);
  url.searchParams.set('maxRecords', '100');
  if (filter) url.searchParams.set('filterByFormula', filter);

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${pat}` } });
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const data = await res.json() as { records: Array<{ fields: Record<string, unknown> }> };
  return data.records.map(r => {
    const f = r.fields;
    return {
      test_id: (f.test_id as string) ?? '',
      test_name: (f.test_name as string) ?? '',
      brand: (f.brand as string) ?? '',
      market: (f.market as string) ?? '',
      page_type: (f.page_type as string) ?? '',
      element_changed: (f.element_changed as string) ?? '',
      winner: (f.winner as string) ?? '',
      uplift_pct: typeof f.uplift_pct === 'number' ? f.uplift_pct : 0,
      confidence_pct: typeof f.confidence_pct === 'number' ? f.confidence_pct : 0,
      learning: (f.learning as string) ?? '',
      tags: Array.isArray(f.tags) ? (f.tags as string[]) : [],
      start_date: (f.start_date as string) ?? ''
    };
  });
}

interface ElementStats {
  element: string;
  total: number;
  wins: number;
  losses: number;
  no_effect: number;
  avg_uplift_when_winning: number;
  best_test: { test_id: string; uplift_pct: number; learning: string } | null;
}

/**
 * For each element_changed category, compute win/loss/no-effect counts,
 * avg uplift of winners, and the single best-performing test.
 */
function summarizeByElement(tests: TestRow[]): ElementStats[] {
  const groups = new Map<string, TestRow[]>();
  for (const t of tests) {
    if (!groups.has(t.element_changed)) groups.set(t.element_changed, []);
    groups.get(t.element_changed)!.push(t);
  }

  const result: ElementStats[] = [];
  for (const [element, rows] of groups.entries()) {
    const wins = rows.filter(r => r.winner === 'variant_b' || (r.winner === 'variant_a' && r.uplift_pct > 0));
    const losses = rows.filter(r => r.uplift_pct < 0);
    const noEffect = rows.filter(r => r.winner === 'no_effect');

    const winningUplifts = wins.map(r => Math.abs(r.uplift_pct));
    const avgUplift = winningUplifts.length > 0
      ? Math.round((winningUplifts.reduce((a, b) => a + b, 0) / winningUplifts.length) * 10) / 10
      : 0;

    const best = wins.length > 0
      ? wins.reduce((a, b) => Math.abs(a.uplift_pct) > Math.abs(b.uplift_pct) ? a : b)
      : null;

    result.push({
      element,
      total: rows.length,
      wins: wins.length,
      losses: losses.length,
      no_effect: noEffect.length,
      avg_uplift_when_winning: avgUplift,
      best_test: best ? { test_id: best.test_id, uplift_pct: best.uplift_pct, learning: best.learning } : null
    });
  }

  return result.sort((a, b) => b.total - a.total);
}

/**
 * Count tag frequency across the filtered set. Returns top-N tags by frequency.
 */
function summarizeTags(tests: TestRow[], topN = 10): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const t of tests) {
    for (const tag of t.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

/**
 * Identify cross-market findings — i.e. the same element tested successfully
 * in 2+ markets pointing to the same principle.
 */
function findCrossMarketPatterns(tests: TestRow[]): string[] {
  // Group by element_changed; flag categories where wins occurred in 2+ distinct markets
  const byElement = new Map<string, Set<string>>();
  for (const t of tests) {
    if (t.winner === 'variant_a' || t.winner === 'variant_b') {
      if (!byElement.has(t.element_changed)) byElement.set(t.element_changed, new Set());
      byElement.get(t.element_changed)!.add(t.market);
    }
  }
  const patterns: string[] = [];
  for (const [element, markets] of byElement.entries()) {
    if (markets.size >= 2) {
      patterns.push(`${element}: wins in ${Array.from(markets).sort().join(' + ')}`);
    }
  }
  return patterns;
}

async function sonovaCroSummarize(params: SonovaCroSummarizeParams) {
  try {
    const tests = await fetchMatchingTests(params);
    const byElement = summarizeByElement(tests);
    const topTags = summarizeTags(tests, 10);
    const crossMarket = findCrossMarketPatterns(tests);

    const totalTested = tests.length;
    const totalWins = tests.filter(t => t.winner === 'variant_b' || (t.winner === 'variant_a' && t.uplift_pct > 0)).length;
    const totalLosses = tests.filter(t => t.uplift_pct < 0).length;
    const totalNoEffect = tests.filter(t => t.winner === 'no_effect').length;

    return {
      success: true,
      filters_applied: {
        brand: params.brand ?? null,
        market: params.market ?? null,
        page_type: params.page_type ?? null,
        element_changed: params.element_changed ?? null
      },
      overview: {
        total_tests: totalTested,
        wins: totalWins,
        losses: totalLosses,
        no_effect: totalNoEffect,
        win_rate_pct: totalTested > 0 ? Math.round((totalWins / totalTested) * 100) : 0
      },
      by_element: byElement,
      cross_market_patterns: crossMarket,
      top_tags: topTags,
      sample_test_ids: tests.slice(0, 5).map(t => t.test_id)
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

tool({
  name: 'sonova-cro-summarize',
  description:
    "Aggregate and summarize past Sonova A/B test history. Given optional filters (brand, market, page_type, element_changed), returns patterns: which elements have been tested most, win/loss ratios, avg uplift when winning, cross-market findings, and frequent tags. Use this to identify what categories are well-explored (and therefore lower ICE-confidence for new tests there) versus under-explored (higher opportunity).",
  parameters: [
    {
      name: 'brand',
      type: ParameterType.String,
      description: 'Filter by brand. One of: geers, boots, audionova. Omit to aggregate across all brands.',
      required: false
    },
    {
      name: 'market',
      type: ParameterType.String,
      description: 'Filter by market. One of: DE, UK, NL, IT, PT, US. Omit to aggregate across all markets.',
      required: false
    },
    {
      name: 'page_type',
      type: ParameterType.String,
      description: 'Filter by page type. One of: lp, form, email, other. Omit to include all.',
      required: false
    },
    {
      name: 'element_changed',
      type: ParameterType.String,
      description: 'Focus the summary on a single element category.',
      required: false
    }
  ]
})(sonovaCroSummarize);
