import { tool, ParameterType } from "@optimizely-opal/opal-tools-sdk";

interface ExperimentDurationParameters {
  dailyTraffic: number;
  baselineConversionRate: number;
  minimumDetectableEffect: number;
  statisticalPower?: number;
  significanceLevel?: number;
  numberOfVariants?: number;
}

interface DurationEstimate {
  estimatedDays: number;
  estimatedWeeks: number;
  requiredSampleSizePerVariant: number;
  totalRequiredSampleSize: number;
  dailyTrafficPerVariant: number;
  assumptions: {
    statisticalPower: number;
    significanceLevel: number;
    numberOfVariants: number;
    baselineConversionRate: number;
    minimumDetectableEffect: number;
  };
  recommendations: string[];
}

async function experimentDurationEstimator(
  parameters: ExperimentDurationParameters
): Promise<DurationEstimate> {
  const {
    dailyTraffic,
    baselineConversionRate,
    minimumDetectableEffect,
    statisticalPower = 0.8,
    significanceLevel = 0.05,
    numberOfVariants = 2,
  } = parameters;

  // Validation
  if (dailyTraffic <= 0) {
    throw new Error("Daily traffic must be greater than 0");
  }
  if (baselineConversionRate <= 0 || baselineConversionRate >= 1) {
    throw new Error("Baseline conversion rate must be between 0 and 1 (e.g., 0.05 for 5%)");
  }
  if (minimumDetectableEffect <= 0) {
    throw new Error("Minimum detectable effect must be greater than 0 (e.g., 0.1 for 10% relative lift)");
  }
  if (statisticalPower <= 0 || statisticalPower >= 1) {
    throw new Error("Statistical power must be between 0 and 1 (typically 0.8)");
  }
  if (significanceLevel <= 0 || significanceLevel >= 1) {
    throw new Error("Significance level must be between 0 and 1 (typically 0.05)");
  }
  if (numberOfVariants < 2) {
    throw new Error("Number of variants must be at least 2 (control + 1 variant)");
  }

  // Calculate expected variant conversion rate
  const variantConversionRate = baselineConversionRate * (1 + minimumDetectableEffect);

  // Calculate pooled standard error
  const p1 = baselineConversionRate;
  const p2 = variantConversionRate;
  const pooledP = (p1 + p2) / 2;

  // Z-scores for significance level (two-tailed) and power
  const zAlpha = getZScore(1 - significanceLevel / 2);
  const zBeta = getZScore(statisticalPower);

  // Sample size calculation per variant (using normal approximation)
  // n = [(Zα + Zβ)² × (p1(1-p1) + p2(1-p2))] / (p2 - p1)²
  const numerator =
    Math.pow(zAlpha + zBeta, 2) *
    (p1 * (1 - p1) + p2 * (1 - p2));
  const denominator = Math.pow(p2 - p1, 2);
  const sampleSizePerVariant = Math.ceil(numerator / denominator);

  // Total sample size across all variants
  const totalRequiredSampleSize = sampleSizePerVariant * numberOfVariants;

  // Daily traffic per variant
  const dailyTrafficPerVariant = dailyTraffic / numberOfVariants;

  // Estimated duration in days
  const estimatedDays = Math.ceil(sampleSizePerVariant / dailyTrafficPerVariant);
  const estimatedWeeks = Math.ceil(estimatedDays / 7);

  // Generate recommendations
  const recommendations = generateRecommendations({
    estimatedDays,
    dailyTraffic,
    sampleSizePerVariant,
    minimumDetectableEffect,
    numberOfVariants,
    baselineConversionRate,
  });

  return {
    estimatedDays,
    estimatedWeeks,
    requiredSampleSizePerVariant: sampleSizePerVariant,
    totalRequiredSampleSize,
    dailyTrafficPerVariant,
    assumptions: {
      statisticalPower,
      significanceLevel,
      numberOfVariants,
      baselineConversionRate,
      minimumDetectableEffect,
    },
    recommendations,
  };
}

// Helper function to get Z-score for given probability
function getZScore(probability: number): number {
  // Common Z-scores (approximation using lookup table)
  const zTable: Record<string, number> = {
    "0.90": 1.282,
    "0.95": 1.645,
    "0.975": 1.96,
    "0.99": 2.326,
    "0.995": 2.576,
    "0.80": 0.842,
    "0.85": 1.036,
  };

  const key = probability.toFixed(3);
  if (zTable[key]) {
    return zTable[key];
  }

  // Approximation using inverse normal CDF (Beasley-Springer-Moro algorithm simplified)
  // For values not in lookup table, use linear interpolation
  if (probability > 0.5) {
    const p = probability;
    if (p >= 0.975) return 1.96 + (p - 0.975) * (2.576 - 1.96) / 0.02;
    if (p >= 0.95) return 1.645 + (p - 0.95) * (1.96 - 1.645) / 0.025;
    if (p >= 0.90) return 1.282 + (p - 0.90) * (1.645 - 1.282) / 0.05;
    if (p >= 0.85) return 1.036 + (p - 0.85) * (1.282 - 1.036) / 0.05;
    if (p >= 0.80) return 0.842 + (p - 0.80) * (1.036 - 0.842) / 0.05;
    return 0.842 * (p - 0.5) / 0.3;
  }

  return -getZScore(1 - probability);
}

function generateRecommendations(params: {
  estimatedDays: number;
  dailyTraffic: number;
  sampleSizePerVariant: number;
  minimumDetectableEffect: number;
  numberOfVariants: number;
  baselineConversionRate: number;
}): string[] {
  const recommendations: string[] = [];

  // Duration recommendations
  if (params.estimatedDays > 30) {
    recommendations.push(
      `⚠️ Long duration (${params.estimatedDays} days): Consider increasing traffic allocation, reducing MDE, or using a larger significance level (less stringent).`
    );
  } else if (params.estimatedDays < 7) {
    recommendations.push(
      `⚠️ Short duration (${params.estimatedDays} days): Consider running for at least one full week to account for weekly patterns.`
    );
  } else {
    recommendations.push(
      `✅ Reasonable duration (${params.estimatedDays} days): This should provide reliable results.`
    );
  }

  // MDE recommendations
  if (params.minimumDetectableEffect < 0.05) {
    recommendations.push(
      `⚠️ Very small MDE (${(params.minimumDetectableEffect * 100).toFixed(1)}%): Detecting small effects requires large sample sizes. Consider if this lift is practically significant.`
    );
  }

  // Variant recommendations
  if (params.numberOfVariants > 3) {
    recommendations.push(
      `⚠️ Multiple variants (${params.numberOfVariants}): Each additional variant increases required sample size and duration. Consider sequential testing or multivariate approaches.`
    );
  }

  // Traffic recommendations
  const dailyTrafficPerVariant = params.dailyTraffic / params.numberOfVariants;
  if (dailyTrafficPerVariant < 100) {
    recommendations.push(
      `⚠️ Low daily traffic per variant (${dailyTrafficPerVariant.toFixed(0)}): Low traffic may lead to extended experiment durations and delayed learnings.`
    );
  }

  // Conversion rate recommendations
  if (params.baselineConversionRate < 0.01) {
    recommendations.push(
      `⚠️ Low conversion rate (${(params.baselineConversionRate * 100).toFixed(2)}%): Low conversion rates require larger sample sizes. Consider testing on higher-funnel metrics.`
    );
  }

  // Best practices
  recommendations.push(
    `💡 Best practice: Run experiments for at least one full business cycle (typically 1-2 weeks) to account for day-of-week and time-of-day variations.`
  );

  return recommendations;
}

tool({
  name: "experiment-duration-estimator",
  description:
    "Estimates how long an A/B test experiment needs to run based on traffic, conversion rates, and desired statistical parameters. Helps teams plan experiment timelines and understand sample size requirements.",
  parameters: [
    {
      name: "dailyTraffic",
      type: ParameterType.Number,
      description: "Average daily traffic (total visitors/users per day)",
      required: true,
    },
    {
      name: "baselineConversionRate",
      type: ParameterType.Number,
      description:
        "Baseline conversion rate as decimal (e.g., 0.05 for 5%). This is your current/control conversion rate.",
      required: true,
    },
    {
      name: "minimumDetectableEffect",
      type: ParameterType.Number,
      description:
        "Minimum detectable effect (relative lift) as decimal (e.g., 0.1 for 10% relative improvement). Smaller values require longer experiments.",
      required: true,
    },
    {
      name: "statisticalPower",
      type: ParameterType.Number,
      description:
        "Statistical power (1 - β) as decimal. Defaults to 0.8 (80%). Higher values reduce false negatives but require larger samples.",
      required: false,
    },
    {
      name: "significanceLevel",
      type: ParameterType.Number,
      description:
        "Significance level (α) as decimal. Defaults to 0.05 (5%). Lower values reduce false positives but require larger samples.",
      required: false,
    },
    {
      name: "numberOfVariants",
      type: ParameterType.Number,
      description:
        "Total number of variants including control (e.g., 2 for control + 1 variant, 3 for control + 2 variants). Defaults to 2.",
      required: false,
    },
  ],
})(experimentDurationEstimator);
