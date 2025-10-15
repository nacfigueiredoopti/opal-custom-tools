import { tool, ParameterType } from "@optimizely-opal/opal-tools-sdk";

interface ExperimentLookupParameters {
  experimentId: string;
  optimizelyApiKey?: string; // Optional: if provided, fetch from Optimizely API
}

interface ExperimentDetails {
  id: string;
  name: string;
  status: "running" | "paused" | "draft" | "archived";
  audienceSize: number;
  trafficAllocation: number;
  primaryMetric?: string;
  affectedPages?: string[];
  targetingRules?: string[];
  variations?: {
    id: string;
    name: string;
    allocation: number;
  }[];
  startDate?: string;
  endDate?: string;
  description?: string;
  metrics?: string[];
}

async function experimentLookup(
  parameters: ExperimentLookupParameters
): Promise<ExperimentDetails> {
  const { experimentId, optimizelyApiKey } = parameters;

  if (!experimentId || experimentId.trim() === "") {
    throw new Error("experimentId is required and cannot be empty");
  }

  // Option 1: If Optimizely API key is provided, fetch from API
  if (optimizelyApiKey) {
    try {
      // Replace with actual Optimizely API endpoint
      const response = await fetch(
        `https://api.optimizely.com/v2/experiments/${experimentId}`,
        {
          headers: {
            Authorization: `Bearer ${optimizelyApiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch experiment from Optimizely API: ${response.statusText}`
        );
      }

      const data = await response.json();

      // Map Optimizely API response to our format
      return {
        id: data.id,
        name: data.name,
        status: data.status || "running",
        audienceSize: data.audience_size || estimateAudienceSize(data),
        trafficAllocation: data.traffic_allocation || 100,
        primaryMetric: data.primary_metric?.name,
        affectedPages: extractAffectedPages(data),
        targetingRules: extractTargetingRules(data),
        variations: data.variations,
        startDate: data.start_date,
        endDate: data.end_date,
        description: data.description,
        metrics: data.metrics?.map((m: any) => m.name),
      };
    } catch (error) {
      throw new Error(
        `Failed to fetch experiment details: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Option 2: Mock/example data for demonstration
  // In production, this would query your database or return an error
  return getMockExperimentData(experimentId);
}

function getMockExperimentData(experimentId: string): ExperimentDetails {
  // Mock data - replace with actual database lookup in production
  const mockExperiments: Record<string, ExperimentDetails> = {
    "exp-checkout-btn-001": {
      id: "exp-checkout-btn-001",
      name: "Checkout Button Color Test",
      status: "running",
      audienceSize: 50000,
      trafficAllocation: 60,
      primaryMetric: "conversion_rate",
      affectedPages: ["checkout"],
      targetingRules: ["US users", "Desktop only"],
      variations: [
        { id: "control", name: "Control (Green)", allocation: 50 },
        { id: "variant-1", name: "Blue Button", allocation: 50 },
      ],
      startDate: "2025-10-01",
      description: "Testing blue vs green checkout button to improve conversion",
      metrics: ["conversion_rate", "revenue_per_user"],
    },
    "exp-checkout-form-002": {
      id: "exp-checkout-form-002",
      name: "Checkout Form Simplification",
      status: "running",
      audienceSize: 50000,
      trafficAllocation: 50,
      primaryMetric: "conversion_rate",
      affectedPages: ["checkout"],
      targetingRules: ["All users"],
      variations: [
        { id: "control", name: "5-field form", allocation: 50 },
        { id: "variant-1", name: "3-field form", allocation: 50 },
      ],
      startDate: "2025-10-05",
      description: "Simplifying checkout form to reduce friction",
      metrics: ["conversion_rate", "form_completion_time"],
    },
    "exp-homepage-hero-003": {
      id: "exp-homepage-hero-003",
      name: "Homepage Hero Banner Test",
      status: "running",
      audienceSize: 100000,
      trafficAllocation: 40,
      primaryMetric: "click_through_rate",
      affectedPages: ["homepage"],
      targetingRules: ["Mobile users only"],
      variations: [
        { id: "control", name: "Original banner", allocation: 50 },
        { id: "variant-1", name: "Bold CTA", allocation: 50 },
      ],
      startDate: "2025-10-10",
      description: "Testing bolder CTA on homepage hero",
      metrics: ["click_through_rate", "bounce_rate"],
    },
    "exp-nav-redesign-004": {
      id: "exp-nav-redesign-004",
      name: "Navigation Menu Redesign",
      status: "running",
      audienceSize: 100000,
      trafficAllocation: 30,
      primaryMetric: "navigation_clicks",
      affectedPages: ["all_pages"],
      targetingRules: ["All users"],
      variations: [
        { id: "control", name: "Horizontal nav", allocation: 50 },
        { id: "variant-1", name: "Hamburger menu", allocation: 50 },
      ],
      startDate: "2025-10-08",
      description: "Testing hamburger menu vs horizontal navigation",
      metrics: ["navigation_clicks", "page_views_per_session"],
    },
  };

  const experiment = mockExperiments[experimentId];

  if (!experiment) {
    throw new Error(
      `Experiment not found: ${experimentId}. Available experiments: ${Object.keys(mockExperiments).join(", ")}`
    );
  }

  return experiment;
}

// Helper functions for API integration
function estimateAudienceSize(data: any): number {
  // Implement logic to estimate audience size from Optimizely data
  // This might involve looking at page views, user segments, etc.
  return data.estimated_audience || 10000;
}

function extractAffectedPages(data: any): string[] {
  // Extract pages from experiment configuration
  // This depends on how Optimizely structures page targeting
  if (data.page_targeting) {
    return data.page_targeting.map((p: any) => p.name || p.url);
  }
  return ["unknown"];
}

function extractTargetingRules(data: any): string[] {
  // Extract targeting/audience rules
  if (data.audiences) {
    return data.audiences.map((a: any) => a.name);
  }
  return [];
}

tool({
  name: "experiment-lookup",
  description:
    "Looks up experiment details by ID. Returns comprehensive information including name, status, audience size, traffic allocation, metrics, affected pages, and targeting rules. Useful for retrieving experiment configuration before analysis.",
  parameters: [
    {
      name: "experimentId",
      type: ParameterType.String,
      description:
        'The unique identifier of the experiment (e.g., "exp-checkout-btn-001", "12345"). This is the experiment ID from your Optimizely project.',
      required: true,
    },
    {
      name: "optimizelyApiKey",
      type: ParameterType.String,
      description:
        "Optional Optimizely API key for fetching live experiment data. If not provided, will use cached/mock data.",
      required: false,
    },
  ],
})(experimentLookup);
