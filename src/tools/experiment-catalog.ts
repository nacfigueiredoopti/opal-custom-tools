import { tool, ParameterType } from "@optimizely-opal/opal-tools-sdk";

interface ExperimentCatalogParameters {
  status?: string; // Filter by status: "live", "paused", "draft", "archived", "all"
  metric?: string; // Filter by primary metric
  page?: string; // Filter by affected page
  targetingRule?: string; // Filter by targeting rule
  optimizelyApiKey?: string; // Optional API key for live data
}

interface ExperimentSummary {
  id: string;
  name: string;
  status: "running" | "paused" | "draft" | "archived";
  audienceSize: number;
  trafficAllocation: number;
  primaryMetric?: string;
  affectedPages?: string[];
  targetingRules?: string[];
  startDate?: string;
  endDate?: string;
  variations?: {
    id: string;
    name: string;
    allocation: number;
  }[];
}

interface ExperimentCatalogResponse {
  summary: {
    totalExperiments: number;
    byStatus: {
      running: number;
      paused: number;
      draft: number;
      archived: number;
    };
    totalAudienceReach: number;
    averageTrafficAllocation: number;
  };
  experiments: ExperimentSummary[];
  groupedBy: {
    byMetric: Record<string, string[]>; // metric -> experiment IDs
    byPage: Record<string, string[]>; // page -> experiment IDs
    byTargeting: Record<string, string[]>; // targeting rule -> experiment IDs
  };
  potentialConflicts: {
    description: string;
    experimentIds: string[];
    severity: "warning" | "error" | "critical";
  }[];
  recommendations: string[];
}

async function experimentCatalog(
  parameters: ExperimentCatalogParameters
): Promise<ExperimentCatalogResponse> {
  const {
    status = "all",
    metric,
    page,
    targetingRule,
    optimizelyApiKey,
  } = parameters;

  // Validate status filter
  const validStatuses = ["live", "running", "paused", "draft", "archived", "all"];
  if (!validStatuses.includes(status.toLowerCase())) {
    throw new Error(
      `Invalid status filter. Must be one of: ${validStatuses.join(", ")}`
    );
  }

  // Get all experiments (from API or mock data)
  let allExperiments: ExperimentSummary[];

  if (optimizelyApiKey) {
    allExperiments = await fetchExperimentsFromOptimizely(optimizelyApiKey);
  } else {
    allExperiments = getMockExperiments();
  }

  // Apply filters
  let filteredExperiments = allExperiments;

  // Filter by status
  if (status !== "all") {
    const statusMap: Record<string, string> = {
      live: "running",
      running: "running",
    };
    const targetStatus = statusMap[status.toLowerCase()] || status.toLowerCase();
    filteredExperiments = filteredExperiments.filter(
      (exp) => exp.status === targetStatus
    );
  }

  // Filter by metric
  if (metric) {
    filteredExperiments = filteredExperiments.filter(
      (exp) => exp.primaryMetric?.toLowerCase().includes(metric.toLowerCase())
    );
  }

  // Filter by page
  if (page) {
    filteredExperiments = filteredExperiments.filter((exp) =>
      exp.affectedPages?.some((p) => p.toLowerCase().includes(page.toLowerCase()))
    );
  }

  // Filter by targeting rule
  if (targetingRule) {
    filteredExperiments = filteredExperiments.filter((exp) =>
      exp.targetingRules?.some((r) =>
        r.toLowerCase().includes(targetingRule.toLowerCase())
      )
    );
  }

  // Calculate summary statistics
  const summary = calculateSummary(filteredExperiments);

  // Group experiments by various dimensions
  const groupedBy = groupExperiments(filteredExperiments);

  // Detect potential conflicts
  const potentialConflicts = detectPotentialConflicts(filteredExperiments);

  // Generate recommendations
  const recommendations = generateCatalogRecommendations({
    experiments: filteredExperiments,
    potentialConflicts,
    summary,
  });

  return {
    summary,
    experiments: filteredExperiments,
    groupedBy,
    potentialConflicts,
    recommendations,
  };
}

async function fetchExperimentsFromOptimizely(
  apiKey: string
): Promise<ExperimentSummary[]> {
  try {
    // Replace with actual Optimizely API endpoint
    const response = await fetch("https://api.optimizely.com/v2/experiments", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Optimizely API error: ${response.statusText}`);
    }

    const data = await response.json();

    // Map Optimizely response to our format
    return data.experiments.map((exp: any) => ({
      id: exp.id,
      name: exp.name,
      status: exp.status,
      audienceSize: exp.audience_size || 10000,
      trafficAllocation: exp.traffic_allocation || 100,
      primaryMetric: exp.primary_metric?.name,
      affectedPages: exp.page_targeting?.map((p: any) => p.name) || [],
      targetingRules: exp.audiences?.map((a: any) => a.name) || [],
      startDate: exp.start_date,
      endDate: exp.end_date,
      variations: exp.variations,
    }));
  } catch (error) {
    throw new Error(
      `Failed to fetch experiments from Optimizely: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function getMockExperiments(): ExperimentSummary[] {
  return [
    {
      id: "exp-checkout-btn-001",
      name: "Checkout Button Color Test",
      status: "running",
      audienceSize: 50000,
      trafficAllocation: 60,
      primaryMetric: "conversion_rate",
      affectedPages: ["checkout"],
      targetingRules: ["US users", "Desktop only"],
      startDate: "2025-10-01",
      variations: [
        { id: "control", name: "Control (Green)", allocation: 50 },
        { id: "variant-1", name: "Blue Button", allocation: 50 },
      ],
    },
    {
      id: "exp-checkout-form-002",
      name: "Checkout Form Simplification",
      status: "running",
      audienceSize: 50000,
      trafficAllocation: 50,
      primaryMetric: "conversion_rate",
      affectedPages: ["checkout"],
      targetingRules: ["All users"],
      startDate: "2025-10-05",
      variations: [
        { id: "control", name: "5-field form", allocation: 50 },
        { id: "variant-1", name: "3-field form", allocation: 50 },
      ],
    },
    {
      id: "exp-homepage-hero-003",
      name: "Homepage Hero Banner Test",
      status: "running",
      audienceSize: 100000,
      trafficAllocation: 40,
      primaryMetric: "click_through_rate",
      affectedPages: ["homepage"],
      targetingRules: ["Mobile users only"],
      startDate: "2025-10-10",
      variations: [
        { id: "control", name: "Original banner", allocation: 50 },
        { id: "variant-1", name: "Bold CTA", allocation: 50 },
      ],
    },
    {
      id: "exp-nav-redesign-004",
      name: "Navigation Menu Redesign",
      status: "running",
      audienceSize: 100000,
      trafficAllocation: 30,
      primaryMetric: "navigation_clicks",
      affectedPages: ["all_pages"],
      targetingRules: ["All users"],
      startDate: "2025-10-08",
      variations: [
        { id: "control", name: "Horizontal nav", allocation: 50 },
        { id: "variant-1", name: "Hamburger menu", allocation: 50 },
      ],
    },
    {
      id: "exp-pricing-table-005",
      name: "Pricing Table Layout",
      status: "paused",
      audienceSize: 80000,
      trafficAllocation: 45,
      primaryMetric: "conversion_rate",
      affectedPages: ["pricing"],
      targetingRules: ["Enterprise segment"],
      startDate: "2025-09-15",
      variations: [
        { id: "control", name: "3-column layout", allocation: 50 },
        { id: "variant-1", name: "4-column layout", allocation: 50 },
      ],
    },
    {
      id: "exp-product-recommendations-006",
      name: "AI Product Recommendations",
      status: "draft",
      audienceSize: 75000,
      trafficAllocation: 35,
      primaryMetric: "add_to_cart_rate",
      affectedPages: ["product"],
      targetingRules: ["Returning customers"],
      variations: [
        { id: "control", name: "Manual recommendations", allocation: 50 },
        { id: "variant-1", name: "AI-powered recommendations", allocation: 50 },
      ],
    },
    {
      id: "exp-search-autocomplete-007",
      name: "Search Autocomplete",
      status: "draft",
      audienceSize: 90000,
      trafficAllocation: 50,
      primaryMetric: "search_engagement",
      affectedPages: ["all_pages"],
      targetingRules: ["All users"],
      variations: [
        { id: "control", name: "Basic autocomplete", allocation: 50 },
        { id: "variant-1", name: "Advanced autocomplete with suggestions", allocation: 50 },
      ],
    },
    {
      id: "exp-footer-redesign-008",
      name: "Footer Navigation Redesign",
      status: "archived",
      audienceSize: 100000,
      trafficAllocation: 100,
      primaryMetric: "footer_clicks",
      affectedPages: ["all_pages"],
      targetingRules: ["All users"],
      startDate: "2025-08-01",
      endDate: "2025-09-01",
      variations: [
        { id: "control", name: "Old footer", allocation: 50 },
        { id: "variant-1", name: "New footer", allocation: 50 },
      ],
    },
  ];
}

function calculateSummary(experiments: ExperimentSummary[]): {
  totalExperiments: number;
  byStatus: { running: number; paused: number; draft: number; archived: number };
  totalAudienceReach: number;
  averageTrafficAllocation: number;
} {
  const byStatus = {
    running: experiments.filter((e) => e.status === "running").length,
    paused: experiments.filter((e) => e.status === "paused").length,
    draft: experiments.filter((e) => e.status === "draft").length,
    archived: experiments.filter((e) => e.status === "archived").length,
  };

  const totalAudienceReach = experiments.reduce((sum, exp) => {
    return sum + (exp.audienceSize * exp.trafficAllocation) / 100;
  }, 0);

  const averageTrafficAllocation =
    experiments.length > 0
      ? experiments.reduce((sum, exp) => sum + exp.trafficAllocation, 0) /
        experiments.length
      : 0;

  return {
    totalExperiments: experiments.length,
    byStatus,
    totalAudienceReach: Math.round(totalAudienceReach),
    averageTrafficAllocation: Math.round(averageTrafficAllocation * 100) / 100,
  };
}

function groupExperiments(experiments: ExperimentSummary[]): {
  byMetric: Record<string, string[]>;
  byPage: Record<string, string[]>;
  byTargeting: Record<string, string[]>;
} {
  const byMetric: Record<string, string[]> = {};
  const byPage: Record<string, string[]> = {};
  const byTargeting: Record<string, string[]> = {};

  experiments.forEach((exp) => {
    // Group by metric
    if (exp.primaryMetric) {
      if (!byMetric[exp.primaryMetric]) {
        byMetric[exp.primaryMetric] = [];
      }
      byMetric[exp.primaryMetric].push(exp.id);
    }

    // Group by page
    exp.affectedPages?.forEach((page) => {
      if (!byPage[page]) {
        byPage[page] = [];
      }
      byPage[page].push(exp.id);
    });

    // Group by targeting
    exp.targetingRules?.forEach((rule) => {
      if (!byTargeting[rule]) {
        byTargeting[rule] = [];
      }
      byTargeting[rule].push(exp.id);
    });
  });

  return { byMetric, byPage, byTargeting };
}

function detectPotentialConflicts(experiments: ExperimentSummary[]): {
  description: string;
  experimentIds: string[];
  severity: "warning" | "error" | "critical";
}[] {
  const conflicts: any[] = [];
  const runningExperiments = experiments.filter((e) => e.status === "running");

  // Check for same metric conflicts
  const metricGroups: Record<string, string[]> = {};
  runningExperiments.forEach((exp) => {
    if (exp.primaryMetric) {
      if (!metricGroups[exp.primaryMetric]) {
        metricGroups[exp.primaryMetric] = [];
      }
      metricGroups[exp.primaryMetric].push(exp.id);
    }
  });

  Object.entries(metricGroups).forEach(([metric, expIds]) => {
    if (expIds.length > 1) {
      conflicts.push({
        description: `Multiple running experiments testing the same metric: ${metric}`,
        experimentIds: expIds,
        severity: "critical",
      });
    }
  });

  // Check for same page conflicts
  const pageGroups: Record<string, string[]> = {};
  runningExperiments.forEach((exp) => {
    exp.affectedPages?.forEach((page) => {
      if (!pageGroups[page]) {
        pageGroups[page] = [];
      }
      pageGroups[page].push(exp.id);
    });
  });

  Object.entries(pageGroups).forEach(([page, expIds]) => {
    if (expIds.length > 1) {
      conflicts.push({
        description: `Multiple running experiments affecting the same page: ${page}`,
        experimentIds: expIds,
        severity: "error",
      });
    }
  });

  // Check for high traffic allocation
  const totalRunningTraffic = runningExperiments.reduce(
    (sum, exp) => sum + exp.trafficAllocation,
    0
  );

  if (totalRunningTraffic > 100) {
    conflicts.push({
      description: `High traffic allocation (${totalRunningTraffic}%) across running experiments may cause significant overlap`,
      experimentIds: runningExperiments.map((e) => e.id),
      severity: "warning",
    });
  }

  return conflicts;
}

function generateCatalogRecommendations(params: {
  experiments: ExperimentSummary[];
  potentialConflicts: any[];
  summary: any;
}): string[] {
  const recommendations: string[] = [];

  // Status-based recommendations
  const { byStatus } = params.summary;

  if (byStatus.running === 0 && byStatus.draft > 0) {
    recommendations.push(
      `💡 You have ${byStatus.draft} draft experiment(s) ready to launch. Consider prioritizing and starting tests.`
    );
  }

  if (byStatus.running > 5) {
    recommendations.push(
      `⚠️ ${byStatus.running} experiments running concurrently. This is a high number - ensure you have capacity to monitor all tests and results won't interfere.`
    );
  }

  if (byStatus.paused > 0) {
    recommendations.push(
      `💡 ${byStatus.paused} paused experiment(s). Review if these should be resumed, archived, or restarted.`
    );
  }

  // Conflict recommendations
  const criticalConflicts = params.potentialConflicts.filter(
    (c) => c.severity === "critical"
  );
  if (criticalConflicts.length > 0) {
    recommendations.push(
      `🚨 ${criticalConflicts.length} critical conflict(s) detected among running experiments. Review immediately and consider pausing conflicting tests.`
    );
  }

  const errorConflicts = params.potentialConflicts.filter(
    (c) => c.severity === "error"
  );
  if (errorConflicts.length > 0) {
    recommendations.push(
      `⚠️ ${errorConflicts.length} page-level conflict(s) detected. Monitor for UI issues and interaction effects.`
    );
  }

  // Capacity recommendations
  const runningExperiments = params.experiments.filter(
    (e) => e.status === "running"
  );
  const avgTrafficAllocation = params.summary.averageTrafficAllocation;

  if (avgTrafficAllocation > 60) {
    recommendations.push(
      `⚠️ Average traffic allocation is ${avgTrafficAllocation}% - consider reducing to minimize overlap and preserve audience capacity.`
    );
  }

  // Best practices
  if (byStatus.archived > 10) {
    recommendations.push(
      `💡 ${byStatus.archived} archived experiments. Consider cleaning up old experiments to keep your catalog manageable.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      `✅ Experimentation program looks healthy. Continue monitoring for conflicts and maintaining best practices.`
    );
  }

  return recommendations;
}

tool({
  name: "experiment-catalog",
  description:
    "Provides a comprehensive overview of all experiments in your organization. Lists experiments by status (running, paused, draft, archived), groups them by metrics/pages/audiences, detects potential conflicts, and provides recommendations for experiment management. Use this to get a bird's-eye view of your experimentation program.",
  parameters: [
    {
      name: "status",
      type: ParameterType.String,
      description:
        'Filter experiments by status. Options: "live" or "running", "paused", "draft", "archived", "all". Defaults to "all".',
      required: false,
    },
    {
      name: "metric",
      type: ParameterType.String,
      description:
        'Filter experiments by primary metric (e.g., "conversion", "engagement"). Partial matches supported.',
      required: false,
    },
    {
      name: "page",
      type: ParameterType.String,
      description:
        'Filter experiments by affected page (e.g., "checkout", "homepage"). Partial matches supported.',
      required: false,
    },
    {
      name: "targetingRule",
      type: ParameterType.String,
      description:
        'Filter experiments by targeting rule (e.g., "Mobile users", "US users"). Partial matches supported.',
      required: false,
    },
    {
      name: "optimizelyApiKey",
      type: ParameterType.String,
      description:
        "Optional Optimizely API key for fetching live experiment data. If not provided, will use cached/mock data.",
      required: false,
    },
  ],
})(experimentCatalog);
