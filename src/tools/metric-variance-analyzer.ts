import { tool, ParameterType } from "@optimizely-opal/opal-tools-sdk";

interface MetricVarianceParameters {
  metricValues: string; // JSON array of metric values over time
  metricName?: string;
  expectedMean?: number;
  confidenceLevel?: number;
}

interface VarianceAnalysis {
  metricName: string;
  sampleSize: number;
  statistics: {
    mean: number;
    median: number;
    standardDeviation: number;
    variance: number;
    coefficientOfVariation: number;
    min: number;
    max: number;
    range: number;
    quartiles: {
      q1: number;
      q2: number;
      q3: number;
      iqr: number;
    };
  };
  stability: {
    score: number; // 0-100, higher is better
    rating: "Excellent" | "Good" | "Fair" | "Poor" | "Very Poor";
    isStableForTesting: boolean;
  };
  outliers: {
    count: number;
    percentage: number;
    values: number[];
    indices: number[];
  };
  recommendations: string[];
  minimumSampleSizeForTest: number;
}

async function metricVarianceAnalyzer(
  parameters: MetricVarianceParameters
): Promise<VarianceAnalysis> {
  const {
    metricValues,
    metricName = "Unnamed Metric",
    expectedMean,
    confidenceLevel = 0.95,
  } = parameters;

  // Parse metric values
  let values: number[];
  try {
    values = JSON.parse(metricValues);
    if (!Array.isArray(values)) {
      throw new Error("metricValues must be a JSON array");
    }
    if (values.length === 0) {
      throw new Error("metricValues array cannot be empty");
    }
    if (!values.every((v) => typeof v === "number" && !isNaN(v))) {
      throw new Error("All metric values must be valid numbers");
    }
  } catch (error) {
    throw new Error(
      `Invalid metricValues format: ${error instanceof Error ? error.message : String(error)}. Expected JSON array of numbers, e.g., "[10, 12, 11, 13, 10]"`
    );
  }

  const n = values.length;

  // Calculate basic statistics
  const mean = calculateMean(values);
  const median = calculateMedian(values);
  const variance = calculateVariance(values, mean);
  const standardDeviation = Math.sqrt(variance);
  const coefficientOfVariation = (standardDeviation / mean) * 100;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  // Calculate quartiles
  const quartiles = calculateQuartiles(values);

  // Detect outliers using IQR method
  const outliers = detectOutliers(values, quartiles);

  // Calculate stability score
  const stabilityScore = calculateStabilityScore({
    coefficientOfVariation,
    outlierPercentage: outliers.percentage,
    sampleSize: n,
  });

  const stabilityRating = getStabilityRating(stabilityScore);
  const isStableForTesting = stabilityScore >= 60;

  // Generate recommendations
  const recommendations = generateRecommendations({
    coefficientOfVariation,
    outlierPercentage: outliers.percentage,
    sampleSize: n,
    stabilityScore,
    mean,
    expectedMean,
    standardDeviation,
  });

  // Estimate minimum sample size needed for testing
  // Using rule of thumb: need CV < 30% for reliable testing
  // If CV is high, need larger samples
  const minimumSampleSizeForTest = estimateMinimumSampleSize({
    coefficientOfVariation,
    mean,
    standardDeviation,
  });

  return {
    metricName,
    sampleSize: n,
    statistics: {
      mean: roundTo(mean, 4),
      median: roundTo(median, 4),
      standardDeviation: roundTo(standardDeviation, 4),
      variance: roundTo(variance, 4),
      coefficientOfVariation: roundTo(coefficientOfVariation, 2),
      min: roundTo(min, 4),
      max: roundTo(max, 4),
      range: roundTo(range, 4),
      quartiles: {
        q1: roundTo(quartiles.q1, 4),
        q2: roundTo(quartiles.q2, 4),
        q3: roundTo(quartiles.q3, 4),
        iqr: roundTo(quartiles.iqr, 4),
      },
    },
    stability: {
      score: roundTo(stabilityScore, 1),
      rating: stabilityRating,
      isStableForTesting,
    },
    outliers: {
      count: outliers.count,
      percentage: roundTo(outliers.percentage, 2),
      values: outliers.values.map((v) => roundTo(v, 4)),
      indices: outliers.indices,
    },
    recommendations,
    minimumSampleSizeForTest,
  };
}

// Helper functions
function calculateMean(values: number[]): number {
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

function calculateMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function calculateVariance(values: number[], mean: number): number {
  const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
  return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
}

function calculateQuartiles(values: number[]): {
  q1: number;
  q2: number;
  q3: number;
  iqr: number;
} {
  const sorted = [...values].sort((a, b) => a - b);
  const q2 = calculateMedian(sorted);

  const lowerHalf = sorted.slice(0, Math.floor(sorted.length / 2));
  const upperHalf =
    sorted.length % 2 === 0
      ? sorted.slice(Math.floor(sorted.length / 2))
      : sorted.slice(Math.floor(sorted.length / 2) + 1);

  const q1 = calculateMedian(lowerHalf);
  const q3 = calculateMedian(upperHalf);
  const iqr = q3 - q1;

  return { q1, q2, q3, iqr };
}

function detectOutliers(
  values: number[],
  quartiles: { q1: number; q3: number; iqr: number }
): {
  count: number;
  percentage: number;
  values: number[];
  indices: number[];
} {
  const lowerBound = quartiles.q1 - 1.5 * quartiles.iqr;
  const upperBound = quartiles.q3 + 1.5 * quartiles.iqr;

  const outlierData: { values: number[]; indices: number[] } = {
    values: [],
    indices: [],
  };

  values.forEach((val, idx) => {
    if (val < lowerBound || val > upperBound) {
      outlierData.values.push(val);
      outlierData.indices.push(idx);
    }
  });

  return {
    count: outlierData.values.length,
    percentage: (outlierData.values.length / values.length) * 100,
    values: outlierData.values,
    indices: outlierData.indices,
  };
}

function calculateStabilityScore(params: {
  coefficientOfVariation: number;
  outlierPercentage: number;
  sampleSize: number;
}): number {
  let score = 100;

  // Penalize high coefficient of variation
  // CV < 10% is excellent, CV > 50% is very poor
  if (params.coefficientOfVariation <= 10) {
    score -= 0; // Excellent
  } else if (params.coefficientOfVariation <= 20) {
    score -= (params.coefficientOfVariation - 10) * 1.5; // Good
  } else if (params.coefficientOfVariation <= 30) {
    score -= 15 + (params.coefficientOfVariation - 20) * 2; // Fair
  } else if (params.coefficientOfVariation <= 50) {
    score -= 35 + (params.coefficientOfVariation - 30) * 1.5; // Poor
  } else {
    score -= 65; // Very poor
  }

  // Penalize high outlier percentage
  score -= params.outlierPercentage * 0.8;

  // Penalize small sample size
  if (params.sampleSize < 30) {
    score -= (30 - params.sampleSize) * 0.5;
  }

  return Math.max(0, Math.min(100, score));
}

function getStabilityRating(
  score: number
): "Excellent" | "Good" | "Fair" | "Poor" | "Very Poor" {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  if (score >= 20) return "Poor";
  return "Very Poor";
}

function generateRecommendations(params: {
  coefficientOfVariation: number;
  outlierPercentage: number;
  sampleSize: number;
  stabilityScore: number;
  mean: number;
  expectedMean?: number;
  standardDeviation: number;
}): string[] {
  const recommendations: string[] = [];

  // Coefficient of Variation recommendations
  if (params.coefficientOfVariation <= 10) {
    recommendations.push(
      `✅ Excellent stability (CV: ${params.coefficientOfVariation.toFixed(2)}%): This metric is highly stable and ideal for A/B testing.`
    );
  } else if (params.coefficientOfVariation <= 20) {
    recommendations.push(
      `✅ Good stability (CV: ${params.coefficientOfVariation.toFixed(2)}%): This metric is sufficiently stable for reliable testing.`
    );
  } else if (params.coefficientOfVariation <= 30) {
    recommendations.push(
      `⚠️ Fair stability (CV: ${params.coefficientOfVariation.toFixed(2)}%): Metric is moderately variable. Consider longer test durations or larger sample sizes.`
    );
  } else if (params.coefficientOfVariation <= 50) {
    recommendations.push(
      `⚠️ Poor stability (CV: ${params.coefficientOfVariation.toFixed(2)}%): High variability detected. You may need 2-3x longer test duration or consider testing on a more stable metric.`
    );
  } else {
    recommendations.push(
      `❌ Very poor stability (CV: ${params.coefficientOfVariation.toFixed(2)}%): Extremely high variability. This metric is not recommended for A/B testing. Consider aggregating data or using a different metric.`
    );
  }

  // Outlier recommendations
  if (params.outlierPercentage > 10) {
    recommendations.push(
      `⚠️ High outlier rate (${params.outlierPercentage.toFixed(1)}%): Investigate data quality issues, external events, or consider outlier filtering.`
    );
  } else if (params.outlierPercentage > 5) {
    recommendations.push(
      `⚠️ Moderate outliers detected (${params.outlierPercentage.toFixed(1)}%): Review outliers to ensure they represent valid data.`
    );
  }

  // Sample size recommendations
  if (params.sampleSize < 30) {
    recommendations.push(
      `⚠️ Small sample size (n=${params.sampleSize}): Collect at least 30 data points for reliable variance estimation. Current analysis may not be conclusive.`
    );
  } else if (params.sampleSize >= 100) {
    recommendations.push(
      `✅ Large sample size (n=${params.sampleSize}): Sample is sufficient for reliable variance analysis.`
    );
  }

  // Expected mean comparison
  if (params.expectedMean !== undefined) {
    const percentDiff =
      ((params.mean - params.expectedMean) / params.expectedMean) * 100;
    if (Math.abs(percentDiff) > 10) {
      recommendations.push(
        `⚠️ Mean differs from expected by ${Math.abs(percentDiff).toFixed(1)}%: Actual mean is ${params.mean.toFixed(2)}, expected ${params.expectedMean}. Investigate potential data issues.`
      );
    }
  }

  // Testing readiness
  if (params.stabilityScore >= 60) {
    recommendations.push(
      `💡 Testing recommendation: Metric is stable enough for A/B testing. Standard sample size calculations should be reliable.`
    );
  } else {
    recommendations.push(
      `💡 Testing recommendation: Due to high variability, increase planned sample size by ${Math.ceil((60 - params.stabilityScore) / 10)}x or use sequential testing methods.`
    );
  }

  return recommendations;
}

function estimateMinimumSampleSize(params: {
  coefficientOfVariation: number;
  mean: number;
  standardDeviation: number;
}): number {
  // Using margin of error approach
  // For CV < 30%, standard sample sizes work
  // For higher CV, need larger samples
  const baseSize = 1000;
  const cvPenalty = Math.max(1, params.coefficientOfVariation / 30);
  return Math.ceil(baseSize * cvPenalty);
}

function roundTo(value: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

tool({
  name: "metric-variance-analyzer",
  description:
    "Analyzes metric variance and stability over time to determine if a metric is suitable for A/B testing. Calculates statistical measures, detects outliers, and provides actionable recommendations for experiment design.",
  parameters: [
    {
      name: "metricValues",
      type: ParameterType.String,
      description:
        'JSON array of metric values collected over time (e.g., daily conversion rates, revenue). Example: "[10.2, 11.5, 10.8, 12.1, 10.5]"',
      required: true,
    },
    {
      name: "metricName",
      type: ParameterType.String,
      description: 'Name of the metric being analyzed (e.g., "Conversion Rate", "Revenue Per User"). Defaults to "Unnamed Metric".',
      required: false,
    },
    {
      name: "expectedMean",
      type: ParameterType.Number,
      description:
        "Optional expected mean value for comparison. If provided, the tool will flag if actual mean differs significantly.",
      required: false,
    },
    {
      name: "confidenceLevel",
      type: ParameterType.Number,
      description:
        "Confidence level for analysis (0-1). Defaults to 0.95 (95% confidence).",
      required: false,
    },
  ],
})(metricVarianceAnalyzer);
