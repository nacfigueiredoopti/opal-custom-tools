import { tool, ParameterType } from "@optimizely-opal/opal-tools-sdk";

interface SRMDetectorParameters {
  projectId: string;
  optimizelyApiToken: string;
  experimentIds?: string; // Comma-separated list of experiment IDs, or "all" for all experiments
}

interface ExperimentHealth {
  experimentId: string;
  experimentName: string;
  status: string;
  healthStatus: "good" | "warning" | "critical" | "unknown";
  hasSRM: boolean;
  variations: Array<{
    id: string;
    name: string;
    visitorCount: number;
    expectedAllocation: number;
    actualAllocation: number;
  }>;
  message: string;
  chiSquaredPValue?: number;
}

interface SRMDetectorResult {
  projectId: string;
  timestamp: string;
  experimentsChecked: number;
  experimentsWithIssues: number;
  experiments: ExperimentHealth[];
  summary: string;
}

/**
 * Chi-squared test for SRM detection
 * Returns p-value (lower p-value indicates higher likelihood of SRM)
 */
function calculateChiSquared(
  observed: number[],
  expected: number[]
): number {
  if (observed.length !== expected.length) {
    throw new Error("Observed and expected arrays must have the same length");
  }

  let chiSquared = 0;
  for (let i = 0; i < observed.length; i++) {
    if (expected[i] === 0) continue;
    chiSquared += Math.pow(observed[i] - expected[i], 2) / expected[i];
  }

  // Simplified p-value calculation for degrees of freedom = observed.length - 1
  // For a more accurate calculation, use a proper chi-squared distribution library
  // p-value < 0.05 typically indicates significant SRM
  const degreesOfFreedom = observed.length - 1;

  // Approximate p-value using chi-squared critical values
  // This is a simplified approximation
  if (degreesOfFreedom === 1) {
    if (chiSquared > 3.841) return 0.05; // Critical value for α=0.05
    if (chiSquared > 6.635) return 0.01; // Critical value for α=0.01
  } else if (degreesOfFreedom === 2) {
    if (chiSquared > 5.991) return 0.05;
    if (chiSquared > 9.210) return 0.01;
  }

  return chiSquared > 3.841 ? 0.01 : 0.1; // Simplified
}

async function srmDetector(
  parameters: SRMDetectorParameters
): Promise<SRMDetectorResult> {
  const { projectId, optimizelyApiToken, experimentIds = "all" } = parameters;

  if (!projectId || projectId.trim() === "") {
    throw new Error("projectId is required and cannot be empty");
  }

  if (!optimizelyApiToken || optimizelyApiToken.trim() === "") {
    throw new Error("optimizelyApiToken is required and cannot be empty");
  }

  const headers = {
    Authorization: `Bearer ${optimizelyApiToken}`,
    "Content-Type": "application/json",
  };

  const experimentsToCheck: ExperimentHealth[] = [];
  let experimentsWithIssues = 0;

  try {
    // Step 1: Get list of experiments
    let experimentsToFetch: string[] = [];

    if (experimentIds === "all") {
      // Fetch all experiments for the project
      const projectResponse = await fetch(
        `https://api.optimizely.com/v2/projects/${projectId}/experiments`,
        { headers }
      );

      if (!projectResponse.ok) {
        throw new Error(
          `Failed to fetch experiments for project ${projectId}: ${projectResponse.statusText}`
        );
      }

      const experiments = await projectResponse.json();
      experimentsToFetch = experiments
        .filter((exp: any) => exp.status === "running")
        .map((exp: any) => exp.id);
    } else {
      experimentsToFetch = experimentIds.split(",").map((id) => id.trim());
    }

    // Step 2: Check each experiment for SRM
    for (const experimentId of experimentsToFetch) {
      try {
        // Fetch experiment details
        const expResponse = await fetch(
          `https://api.optimizely.com/v2/experiments/${experimentId}`,
          { headers }
        );

        if (!expResponse.ok) {
          console.warn(
            `Failed to fetch experiment ${experimentId}: ${expResponse.statusText}`
          );
          continue;
        }

        const experiment = await expResponse.json();

        // Fetch experiment results/stats
        const statsResponse = await fetch(
          `https://api.optimizely.com/v2/experiments/${experimentId}/stats`,
          { headers }
        );

        let hasSRM = false;
        let healthStatus: "good" | "warning" | "critical" | "unknown" = "unknown";
        let message = "Unable to determine experiment health";
        let variations: any[] = [];
        let chiSquaredPValue: number | undefined;

        if (statsResponse.ok) {
          const stats = await statsResponse.json();

          // Extract variation visitor counts
          const observedCounts: number[] = [];
          const expectedAllocations: number[] = [];
          variations = [];

          if (experiment.variations && Array.isArray(experiment.variations)) {
            const totalVisitors = stats.visitors?.total || 0;

            for (const variation of experiment.variations) {
              const variationStats = stats.variations?.[variation.id];
              const visitorCount = variationStats?.visitors || 0;
              const expectedAllocation = variation.weight || 50; // Default 50% split

              observedCounts.push(visitorCount);
              expectedAllocations.push(expectedAllocation / 100);

              const actualAllocation = totalVisitors > 0
                ? (visitorCount / totalVisitors) * 100
                : 0;

              variations.push({
                id: variation.id,
                name: variation.name || variation.id,
                visitorCount,
                expectedAllocation,
                actualAllocation: parseFloat(actualAllocation.toFixed(2)),
              });
            }

            // Calculate expected counts based on total visitors
            const expectedCounts = expectedAllocations.map(
              (allocation) => totalVisitors * allocation
            );

            // Perform chi-squared test if we have enough data
            if (totalVisitors >= 1000) {
              chiSquaredPValue = calculateChiSquared(
                observedCounts,
                expectedCounts
              );

              // Check for SRM based on p-value
              if (chiSquaredPValue < 0.01) {
                hasSRM = true;
                healthStatus = "critical";
                message = `Critical traffic imbalance detected (p-value: ${chiSquaredPValue.toFixed(4)}). Sample Ratio Mismatch likely present.`;
                experimentsWithIssues++;
              } else if (chiSquaredPValue < 0.05) {
                hasSRM = true;
                healthStatus = "warning";
                message = `Potential traffic imbalance detected (p-value: ${chiSquaredPValue.toFixed(4)}). Monitor for Sample Ratio Mismatch.`;
                experimentsWithIssues++;
              } else {
                healthStatus = "good";
                message = "Traffic distribution appears balanced.";
              }
            } else {
              healthStatus = "unknown";
              message = `Insufficient data for SRM detection (${totalVisitors} visitors). Need at least 1000 visitors.`;
            }
          }
        } else {
          message = `Unable to fetch stats for experiment (${statsResponse.statusText})`;
        }

        experimentsToCheck.push({
          experimentId: experiment.id,
          experimentName: experiment.name || experiment.id,
          status: experiment.status,
          healthStatus,
          hasSRM,
          variations,
          message,
          chiSquaredPValue,
        });
      } catch (error) {
        console.error(
          `Error checking experiment ${experimentId}:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    // Generate summary
    let summary = `Checked ${experimentsToCheck.length} experiment(s) in project ${projectId}. `;
    if (experimentsWithIssues > 0) {
      summary += `⚠️ Found ${experimentsWithIssues} experiment(s) with traffic imbalance issues (potential SRM).`;
    } else {
      summary += `✅ All experiments appear healthy with balanced traffic distribution.`;
    }

    return {
      projectId,
      timestamp: new Date().toISOString(),
      experimentsChecked: experimentsToCheck.length,
      experimentsWithIssues,
      experiments: experimentsToCheck,
      summary,
    };
  } catch (error) {
    throw new Error(
      `Failed to detect SRM: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

tool({
  name: "srm-detector",
  description:
    "Detects Sample Ratio Mismatch (SRM) issues in Optimizely experiments by analyzing traffic distribution across variations. Uses chi-squared statistical test to identify significant imbalances that may indicate implementation problems. Returns health status for each experiment along with detailed traffic allocation data.",
  parameters: [
    {
      name: "projectId",
      type: ParameterType.String,
      description:
        "The Optimizely project ID to check for SRM issues (e.g., '5268668553101312')",
      required: true,
    },
    {
      name: "optimizelyApiToken",
      type: ParameterType.String,
      description:
        "Optimizely API token with read access to experiments and stats",
      required: true,
    },
    {
      name: "experimentIds",
      type: ParameterType.String,
      description:
        'Comma-separated list of experiment IDs to check (e.g., "12345,67890"), or "all" to check all running experiments in the project. Defaults to "all".',
      required: false,
    },
  ],
})(srmDetector);
