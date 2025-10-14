import { tool, ParameterType } from "@optimizely-opal/opal-tools-sdk";

interface ExperimentDefinition {
  id: string;
  name: string;
  audienceSize: number; // Number of users in this experiment
  targetingRules?: string[]; // Description of targeting rules (e.g., ["US users", "Mobile only"])
  primaryMetric?: string;
  trafficAllocation: number; // Percentage of eligible users (0-100)
  experimentType?: "A/B" | "multivariate" | "feature-flag" | "personalization";
  affectedPages?: string[]; // Pages or features affected
}

interface ExperimentOverlapParameters {
  experiments: string; // JSON array of experiment definitions
  totalAudienceSize?: number; // Total available audience
  overlapTolerance?: number; // Acceptable overlap percentage (0-100)
}

interface OverlapAnalysis {
  summary: {
    totalExperiments: number;
    totalAudienceUsed: number;
    estimatedOverlap: number;
    overlapPercentage: number;
    riskLevel: "Low" | "Medium" | "High" | "Critical";
    canRunConcurrently: boolean;
  };
  pairwiseAnalysis: {
    experiment1: string;
    experiment2: string;
    estimatedOverlap: number;
    overlapPercentage: number;
    conflictRisk: "Low" | "Medium" | "High";
    reasons: string[];
  }[];
  conflicts: {
    type: "audience" | "metric" | "page" | "targeting";
    severity: "Warning" | "Error" | "Critical";
    description: string;
    affectedExperiments: string[];
  }[];
  recommendations: string[];
  visualRepresentation: {
    experimentName: string;
    audienceSize: number;
    trafficAllocation: number;
    estimatedReach: number;
  }[];
}

async function experimentOverlapChecker(
  parameters: ExperimentOverlapParameters
): Promise<OverlapAnalysis> {
  const {
    experiments: experimentsJson,
    totalAudienceSize,
    overlapTolerance = 20,
  } = parameters;

  // Parse experiments
  let experiments: ExperimentDefinition[];
  try {
    experiments = JSON.parse(experimentsJson);
    if (!Array.isArray(experiments)) {
      throw new Error("experiments must be a JSON array");
    }
    if (experiments.length === 0) {
      throw new Error("experiments array cannot be empty");
    }

    // Validate each experiment
    experiments.forEach((exp, idx) => {
      if (!exp.id || !exp.name) {
        throw new Error(`Experiment at index ${idx} must have 'id' and 'name' fields`);
      }
      if (typeof exp.audienceSize !== "number" || exp.audienceSize <= 0) {
        throw new Error(`Experiment '${exp.name}' must have a valid audienceSize > 0`);
      }
      if (typeof exp.trafficAllocation !== "number" || exp.trafficAllocation < 0 || exp.trafficAllocation > 100) {
        throw new Error(`Experiment '${exp.name}' must have trafficAllocation between 0 and 100`);
      }
    });
  } catch (error) {
    throw new Error(
      `Invalid experiments format: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Validate overlap tolerance
  if (overlapTolerance < 0 || overlapTolerance > 100) {
    throw new Error("overlapTolerance must be between 0 and 100");
  }

  // Calculate visual representation
  const visualRepresentation = experiments.map((exp) => ({
    experimentName: exp.name,
    audienceSize: exp.audienceSize,
    trafficAllocation: exp.trafficAllocation,
    estimatedReach: Math.round((exp.audienceSize * exp.trafficAllocation) / 100),
  }));

  // Calculate total audience used
  const totalAudienceUsed = experiments.reduce(
    (sum, exp) => sum + (exp.audienceSize * exp.trafficAllocation) / 100,
    0
  );

  // Estimate overlap (simplified model - assumes random distribution)
  const estimatedOverlap = calculateOverlap(experiments, totalAudienceSize);
  const overlapPercentage = totalAudienceSize
    ? (estimatedOverlap / totalAudienceSize) * 100
    : (estimatedOverlap / Math.max(...experiments.map((e) => e.audienceSize))) * 100;

  // Calculate pairwise analysis
  const pairwiseAnalysis = calculatePairwiseOverlap(experiments);

  // Detect conflicts
  const conflicts = detectConflicts(experiments, overlapTolerance);

  // Assess risk level
  const riskLevel = assessRiskLevel({
    overlapPercentage,
    conflicts,
    pairwiseAnalysis,
    overlapTolerance,
  });

  const canRunConcurrently =
    riskLevel === "Low" || (riskLevel === "Medium" && conflicts.every((c) => c.severity !== "Critical"));

  // Generate recommendations
  const recommendations = generateRecommendations({
    experiments,
    overlapPercentage,
    conflicts,
    riskLevel,
    pairwiseAnalysis,
    totalAudienceSize,
    overlapTolerance,
  });

  return {
    summary: {
      totalExperiments: experiments.length,
      totalAudienceUsed: Math.round(totalAudienceUsed),
      estimatedOverlap: Math.round(estimatedOverlap),
      overlapPercentage: roundTo(overlapPercentage, 2),
      riskLevel,
      canRunConcurrently,
    },
    pairwiseAnalysis,
    conflicts,
    recommendations,
    visualRepresentation,
  };
}

function calculateOverlap(
  experiments: ExperimentDefinition[],
  totalAudienceSize?: number
): number {
  if (experiments.length === 1) return 0;

  // Simple overlap estimation using probabilistic model
  // More sophisticated would require actual targeting rule evaluation
  const reaches = experiments.map(
    (exp) => (exp.audienceSize * exp.trafficAllocation) / 100
  );

  const totalReach = reaches.reduce((sum, reach) => sum + reach, 0);
  const maxAudience = totalAudienceSize || Math.max(...experiments.map((e) => e.audienceSize));

  // Estimate overlap using inclusion-exclusion principle approximation
  if (totalReach <= maxAudience) {
    return 0; // No significant overlap if total reach fits in audience
  }

  return totalReach - maxAudience;
}

function calculatePairwiseOverlap(
  experiments: ExperimentDefinition[]
): {
  experiment1: string;
  experiment2: string;
  estimatedOverlap: number;
  overlapPercentage: number;
  conflictRisk: "Low" | "Medium" | "High";
  reasons: string[];
}[] {
  const pairwise: any[] = [];

  for (let i = 0; i < experiments.length; i++) {
    for (let j = i + 1; j < experiments.length; j++) {
      const exp1 = experiments[i];
      const exp2 = experiments[j];

      const reach1 = (exp1.audienceSize * exp1.trafficAllocation) / 100;
      const reach2 = (exp2.audienceSize * exp2.trafficAllocation) / 100;

      // Estimate overlap between two experiments
      const minAudience = Math.min(exp1.audienceSize, exp2.audienceSize);
      const estimatedOverlap = Math.min(reach1, reach2);
      const overlapPercentage = (estimatedOverlap / minAudience) * 100;

      // Assess conflict reasons
      const reasons: string[] = [];
      let conflictRisk: "Low" | "Medium" | "High" = "Low";

      // Check targeting overlap
      const targetingOverlap = checkTargetingOverlap(exp1, exp2);
      if (targetingOverlap) {
        reasons.push(`Similar targeting rules: ${targetingOverlap}`);
        conflictRisk = "Medium";
      }

      // Check metric conflicts
      if (exp1.primaryMetric && exp2.primaryMetric) {
        if (exp1.primaryMetric === exp2.primaryMetric) {
          reasons.push(`Same primary metric: ${exp1.primaryMetric}`);
          conflictRisk = "High";
        }
      }

      // Check page conflicts
      if (exp1.affectedPages && exp2.affectedPages) {
        const pageOverlap = exp1.affectedPages.filter((page) =>
          exp2.affectedPages?.includes(page)
        );
        if (pageOverlap.length > 0) {
          reasons.push(`Overlapping pages: ${pageOverlap.join(", ")}`);
          conflictRisk = conflictRisk === "High" ? "High" : "Medium";
        }
      }

      // Check high traffic allocation overlap
      if (overlapPercentage > 50) {
        reasons.push(`High audience overlap: ${overlapPercentage.toFixed(1)}%`);
        conflictRisk = "High";
      } else if (overlapPercentage > 20) {
        reasons.push(`Moderate audience overlap: ${overlapPercentage.toFixed(1)}%`);
        if (conflictRisk === "Low") conflictRisk = "Medium";
      }

      if (reasons.length === 0) {
        reasons.push("No significant conflicts detected");
      }

      pairwise.push({
        experiment1: exp1.name,
        experiment2: exp2.name,
        estimatedOverlap: Math.round(estimatedOverlap),
        overlapPercentage: roundTo(overlapPercentage, 2),
        conflictRisk,
        reasons,
      });
    }
  }

  return pairwise;
}

function checkTargetingOverlap(
  exp1: ExperimentDefinition,
  exp2: ExperimentDefinition
): string | null {
  if (!exp1.targetingRules || !exp2.targetingRules) return null;

  const overlap = exp1.targetingRules.filter((rule) =>
    exp2.targetingRules?.includes(rule)
  );

  return overlap.length > 0 ? overlap.join(", ") : null;
}

function detectConflicts(
  experiments: ExperimentDefinition[],
  overlapTolerance: number
): {
  type: "audience" | "metric" | "page" | "targeting";
  severity: "Warning" | "Error" | "Critical";
  description: string;
  affectedExperiments: string[];
}[] {
  const conflicts: any[] = [];

  // Check for metric conflicts
  const metricGroups = new Map<string, string[]>();
  experiments.forEach((exp) => {
    if (exp.primaryMetric) {
      if (!metricGroups.has(exp.primaryMetric)) {
        metricGroups.set(exp.primaryMetric, []);
      }
      metricGroups.get(exp.primaryMetric)!.push(exp.name);
    }
  });

  metricGroups.forEach((expNames, metric) => {
    if (expNames.length > 1) {
      conflicts.push({
        type: "metric",
        severity: "Critical",
        description: `Multiple experiments testing the same primary metric: ${metric}. This may lead to conflicting changes and unreliable results.`,
        affectedExperiments: expNames,
      });
    }
  });

  // Check for page conflicts
  const pageGroups = new Map<string, string[]>();
  experiments.forEach((exp) => {
    exp.affectedPages?.forEach((page) => {
      if (!pageGroups.has(page)) {
        pageGroups.set(page, []);
      }
      pageGroups.get(page)!.push(exp.name);
    });
  });

  pageGroups.forEach((expNames, page) => {
    if (expNames.length > 1) {
      conflicts.push({
        type: "page",
        severity: "Error",
        description: `Multiple experiments affecting the same page: ${page}. May cause interaction effects or UI conflicts.`,
        affectedExperiments: expNames,
      });
    }
  });

  // Check for audience exhaustion
  const totalTraffic = experiments.reduce(
    (sum, exp) => sum + exp.trafficAllocation,
    0
  );
  if (totalTraffic > 100) {
    conflicts.push({
      type: "audience",
      severity: "Warning",
      description: `Total traffic allocation (${totalTraffic}%) exceeds 100%. Experiments will have overlapping audiences.`,
      affectedExperiments: experiments.map((e) => e.name),
    });
  }

  // Check for targeting conflicts
  const targetingGroups = new Map<string, string[]>();
  experiments.forEach((exp) => {
    const targetingKey = exp.targetingRules?.sort().join("|") || "default";
    if (!targetingGroups.has(targetingKey)) {
      targetingGroups.set(targetingKey, []);
    }
    targetingGroups.get(targetingKey)!.push(exp.name);
  });

  targetingGroups.forEach((expNames, targeting) => {
    if (expNames.length > 1 && targeting !== "default") {
      conflicts.push({
        type: "targeting",
        severity: "Warning",
        description: `Multiple experiments with identical targeting rules. This increases audience overlap.`,
        affectedExperiments: expNames,
      });
    }
  });

  return conflicts;
}

function assessRiskLevel(params: {
  overlapPercentage: number;
  conflicts: any[];
  pairwiseAnalysis: any[];
  overlapTolerance: number;
}): "Low" | "Medium" | "High" | "Critical" {
  const hasCriticalConflicts = params.conflicts.some(
    (c) => c.severity === "Critical"
  );
  if (hasCriticalConflicts) return "Critical";

  const hasHighConflictPairs = params.pairwiseAnalysis.some(
    (p) => p.conflictRisk === "High"
  );
  if (hasHighConflictPairs) return "High";

  const hasErrorConflicts = params.conflicts.some((c) => c.severity === "Error");
  if (hasErrorConflicts) return "High";

  if (params.overlapPercentage > params.overlapTolerance * 2) return "High";
  if (params.overlapPercentage > params.overlapTolerance) return "Medium";

  const hasMediumConflictPairs = params.pairwiseAnalysis.some(
    (p) => p.conflictRisk === "Medium"
  );
  if (hasMediumConflictPairs) return "Medium";

  return "Low";
}

function generateRecommendations(params: {
  experiments: ExperimentDefinition[];
  overlapPercentage: number;
  conflicts: any[];
  riskLevel: "Low" | "Medium" | "High" | "Critical";
  pairwiseAnalysis: any[];
  totalAudienceSize?: number;
  overlapTolerance: number;
}): string[] {
  const recommendations: string[] = [];

  // Overall assessment
  if (params.riskLevel === "Low") {
    recommendations.push(
      `✅ Low risk: These experiments can run concurrently with minimal interaction effects.`
    );
  } else if (params.riskLevel === "Medium") {
    recommendations.push(
      `⚠️ Medium risk: Experiments can run concurrently but monitor closely for interaction effects. Consider sequential testing if possible.`
    );
  } else if (params.riskLevel === "High") {
    recommendations.push(
      `⚠️ High risk: Significant overlap detected. Strongly recommend running experiments sequentially or reducing audience overlap.`
    );
  } else {
    recommendations.push(
      `❌ Critical risk: Do not run these experiments concurrently. Results will be unreliable due to conflicts.`
    );
  }

  // Conflict-specific recommendations
  const criticalConflicts = params.conflicts.filter((c) => c.severity === "Critical");
  if (criticalConflicts.length > 0) {
    recommendations.push(
      `🚨 Critical conflicts detected: ${criticalConflicts.map((c) => c.affectedExperiments.join(" & ")).join(", ")}. These experiments MUST run sequentially.`
    );
  }

  const metricConflicts = params.conflicts.filter((c) => c.type === "metric");
  if (metricConflicts.length > 0) {
    recommendations.push(
      `💡 Metric conflict: Consider using guardrail metrics or run experiments on different user segments to isolate effects.`
    );
  }

  const pageConflicts = params.conflicts.filter((c) => c.type === "page");
  if (pageConflicts.length > 0) {
    recommendations.push(
      `💡 Page conflict: Ensure UI changes don't interfere. Consider mutual exclusion or layer prioritization.`
    );
  }

  // Overlap recommendations
  if (params.overlapPercentage > params.overlapTolerance) {
    recommendations.push(
      `💡 Reduce overlap: Consider using mutually exclusive audiences, reducing traffic allocation, or implementing experiment layers/namespaces.`
    );
  }

  // Audience exhaustion
  if (params.totalAudienceSize) {
    const utilizationPercentage =
      (params.experiments.reduce(
        (sum, exp) => sum + (exp.audienceSize * exp.trafficAllocation) / 100,
        0
      ) /
        params.totalAudienceSize) *
      100;
    if (utilizationPercentage > 80) {
      recommendations.push(
        `⚠️ High audience utilization (${utilizationPercentage.toFixed(1)}%): Limited room for additional experiments. Consider prioritization.`
      );
    }
  }

  // Best practices
  recommendations.push(
    `💡 Best practice: Document experiment interactions and monitor for Sample Ratio Mismatch (SRM) issues during experiment runtime.`
  );

  if (params.experiments.length > 3) {
    recommendations.push(
      `💡 Best practice: With ${params.experiments.length} concurrent experiments, consider implementing an experimentation calendar and formal conflict review process.`
    );
  }

  return recommendations;
}

function roundTo(value: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

tool({
  name: "experiment-overlap-checker",
  description:
    "Analyzes potential conflicts and audience overlap when running multiple experiments simultaneously. Detects metric conflicts, page conflicts, targeting overlaps, and provides risk assessment with recommendations for concurrent experiment management.",
  parameters: [
    {
      name: "experiments",
      type: ParameterType.String,
      description:
        'JSON array of experiment definitions. Each experiment must include: id, name, audienceSize, trafficAllocation (0-100). Optional fields: targetingRules (array), primaryMetric, experimentType, affectedPages (array). Example: \'[{"id":"exp1","name":"Checkout Button","audienceSize":10000,"trafficAllocation":50,"primaryMetric":"conversion","affectedPages":["checkout"]}]\'',
      required: true,
    },
    {
      name: "totalAudienceSize",
      type: ParameterType.Number,
      description:
        "Total available audience size across all experiments. Used for calculating utilization percentage.",
      required: false,
    },
    {
      name: "overlapTolerance",
      type: ParameterType.Number,
      description:
        "Acceptable overlap percentage (0-100). Defaults to 20%. Overlaps above this threshold will trigger warnings.",
      required: false,
    },
  ],
})(experimentOverlapChecker);
