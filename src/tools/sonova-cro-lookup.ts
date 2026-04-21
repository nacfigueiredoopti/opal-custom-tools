import { tool, ParameterType } from '@optimizely-opal/opal-tools-sdk';

interface SonovaCroLookupParams {
  brand?: string;            // 'geers' | 'boots' | 'audionova'
  market?: string;           // 'DE' | 'UK' | 'NL' | 'IT' | 'PT' | 'US'
  page_type?: string;        // 'lp' | 'form' | 'email' | 'other'
  element_changed?: string;  // 'cta' | 'copy' | 'visual' | 'form_flow' | 'form_field' | 'social_proof' | 'personalization' | 'offer' | 'layout'
  tag?: string;              // single tag to filter on (e.g. 'cross-market', 'trust', 'urgency')
  outcome?: string;          // 'wins_only' | 'losses_only' | 'no_effect_only' | 'all'
  limit?: number;            // max rows to return, default 20
}

interface TestRow {
  test_id: string;
  test_name: string;
  brand: string;
  market: string;
  page_type: string;
  page_url_pattern: string;
  hypothesis: string;
  element_changed: string;
  status: string;
  winner: string;
  uplift_pct: number;
  confidence_pct: number;
  metric_primary: string;
  sample_size: number;
  start_date: string;
  end_date: string;
  learning: string;
  tags: string[];
  owner: string;
}

/**
 * Fetch matching rows from the Sonova CRO Memory Airtable base.
 * Uses the Airtable REST API directly (no SDK dependency) to keep the deploy light.
 */
async function fetchFromAirtable(filterByFormula: string, maxRecords = 20): Promise<TestRow[]> {
  const pat = process.env.SONOVA_CRO_AIRTABLE_PAT;
  const baseId = process.env.SONOVA_CRO_AIRTABLE_BASE_ID;
  const tableId = process.env.SONOVA_CRO_AIRTABLE_TABLE_ID;

  if (!pat || !baseId || !tableId) {
    throw new Error(
      'Missing env vars. Need SONOVA_CRO_AIRTABLE_PAT, SONOVA_CRO_AIRTABLE_BASE_ID, SONOVA_CRO_AIRTABLE_TABLE_ID.'
    );
  }

  const url = new URL(`https://api.airtable.com/v0/${baseId}/${tableId}`);
  url.searchParams.set('maxRecords', String(maxRecords));
  if (filterByFormula) url.searchParams.set('filterByFormula', filterByFormula);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${pat}` }
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json() as { records: Array<{ id: string; fields: Record<string, unknown> }> };

  return data.records.map(r => {
    const f = r.fields;
    return {
      test_id: (f.test_id as string) ?? '',
      test_name: (f.test_name as string) ?? '',
      brand: (f.brand as string) ?? '',
      market: (f.market as string) ?? '',
      page_type: (f.page_type as string) ?? '',
      page_url_pattern: (f.page_url_pattern as string) ?? '',
      hypothesis: (f.hypothesis as string) ?? '',
      element_changed: (f.element_changed as string) ?? '',
      status: (f.status as string) ?? '',
      winner: (f.winner as string) ?? '',
      uplift_pct: typeof f.uplift_pct === 'number' ? f.uplift_pct : 0,
      confidence_pct: typeof f.confidence_pct === 'number' ? f.confidence_pct : 0,
      metric_primary: (f.metric_primary as string) ?? '',
      sample_size: typeof f.sample_size === 'number' ? f.sample_size : 0,
      start_date: (f.start_date as string) ?? '',
      end_date: (f.end_date as string) ?? '',
      learning: (f.learning as string) ?? '',
      tags: Array.isArray(f.tags) ? (f.tags as string[]) : [],
      owner: (f.owner as string) ?? ''
    };
  });
}

/**
 * Build an Airtable filterByFormula string from the lookup params.
 * Combines all conditions with AND(). Returns empty string if no filters given.
 */
function buildFilterFormula(params: SonovaCroLookupParams): string {
  const conditions: string[] = [];

  if (params.brand) conditions.push(`{brand} = "${params.brand}"`);
  if (params.market) conditions.push(`{market} = "${params.market}"`);
  if (params.page_type) conditions.push(`{page_type} = "${params.page_type}"`);
  if (params.element_changed) conditions.push(`{element_changed} = "${params.element_changed}"`);
  if (params.tag) conditions.push(`FIND("${params.tag}", ARRAYJOIN({tags})) > 0`);

  if (params.outcome === 'wins_only') {
    conditions.push(`OR({winner} = "variant_a", {winner} = "variant_b", {winner} = "variant_c")`);
  } else if (params.outcome === 'losses_only') {
    // losses are where the control (variant_a) won but uplift was negative, or where variant_b lost clearly
    conditions.push(`{uplift_pct} < 0`);
  } else if (params.outcome === 'no_effect_only') {
    conditions.push(`{winner} = "no_effect"`);
  }

  if (conditions.length === 0) return '';
  if (conditions.length === 1) return conditions[0];
  return `AND(${conditions.join(', ')})`;
}

async function sonovaCroLookup(params: SonovaCroLookupParams) {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const formula = buildFilterFormula(params);

  try {
    const tests = await fetchFromAirtable(formula, limit);
    return {
      success: true,
      filters_applied: {
        brand: params.brand ?? null,
        market: params.market ?? null,
        page_type: params.page_type ?? null,
        element_changed: params.element_changed ?? null,
        tag: params.tag ?? null,
        outcome: params.outcome ?? 'all'
      },
      filter_formula: formula || '(none)',
      count: tests.length,
      tests
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      filters_applied: params
    };
  }
}

tool({
  name: 'sonova-cro-lookup',
  description:
    'Look up past Sonova A/B tests from the CRO Memory Airtable base. Filter by brand, market, page type, element changed, tag, or outcome. Returns matching tests with full hypothesis, learning, uplift, and metadata. Use this to ground new test hypotheses in what has already been tried.',
  parameters: [
    {
      name: 'brand',
      type: ParameterType.String,
      description: 'Filter by brand. One of: geers, boots, audionova. Omit to include all brands.',
      required: false
    },
    {
      name: 'market',
      type: ParameterType.String,
      description: 'Filter by market. One of: DE, UK, NL, IT, PT, US. Omit to include all markets.',
      required: false
    },
    {
      name: 'page_type',
      type: ParameterType.String,
      description: 'Filter by page type. One of: lp, form, email, other. Omit to include all types.',
      required: false
    },
    {
      name: 'element_changed',
      type: ParameterType.String,
      description:
        'Filter by the element that was changed in the test. One of: cta, copy, visual, form_flow, form_field, social_proof, personalization, offer, layout.',
      required: false
    },
    {
      name: 'tag',
      type: ParameterType.String,
      description:
        'Filter to tests carrying this tag (e.g. "cross-market", "trust", "compliance-risk", "urgency"). Only one tag at a time; call multiple times for OR semantics.',
      required: false
    },
    {
      name: 'outcome',
      type: ParameterType.String,
      description:
        'Filter by outcome. One of: wins_only, losses_only, no_effect_only, all (default).',
      required: false
    },
    {
      name: 'limit',
      type: ParameterType.Integer,
      description: 'Maximum number of tests to return (default 20, max 100).',
      required: false
    }
  ]
})(sonovaCroLookup);
