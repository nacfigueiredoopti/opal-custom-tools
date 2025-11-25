import { tool, ParameterType } from "@optimizely-opal/opal-tools-sdk";

interface FeatureChange {
  type: "new_feature" | "removed_feature" | "modified_feature";
  title: string;
  description: string;
  evidence: string[];
  confidence: "high" | "medium" | "low";
  page: string;
}

interface PricingChange {
  type: string;
  description: string;
  details: string;
  page: string;
}

interface UIChange {
  type: string;
  description: string;
  affectedPages: string[];
}

interface MessagingChange {
  type: string;
  description: string;
  oldText?: string;
  newText?: string;
  page: string;
}

interface CompetitorAnalysis {
  timestamp: string;
  competitor: string;
  changesDetected: boolean;
  totalChanges: number;
  featureChanges: FeatureChange[];
  pricingChanges: PricingChange[];
  uiChanges: UIChange[];
  messagingChanges: MessagingChange[];
  priority: "critical" | "high" | "medium" | "low";
  summary: string;
  recommendations: string[];
}

interface OptimizelyEvent {
  name: string;
  description?: string;
  timestamp?: string;
  properties?: Record<string, any>;
}

interface StrategicInsight {
  category: "competitive_threat" | "opportunity" | "validation" | "learning" | "warning";
  title: string;
  description: string;
  reasoning: string[];
  actionableSteps: string[];
  urgency: "immediate" | "high" | "medium" | "low";
  affectedAreas: string[]; // e.g., ["product", "pricing", "marketing"]
}

interface CompetitiveComparison {
  topic: string;
  competitorActivity: string;
  ourActivity: string;
  gap: "ahead" | "behind" | "at_parity" | "unknown";
  implication: string;
}

interface InsightGeneratorParameters {
  competitorChanges: CompetitorAnalysis[];
  ourExperiments?: OptimizelyEvent[];
  analysisDepth?: "quick" | "standard" | "deep";
  includeRecommendations?: boolean;
  focusAreas?: string[]; // e.g., ["pricing", "features", "ux"]
}

interface InsightGeneratorResult {
  timestamp: string;
  executiveSummary: string;
  strategicInsights: StrategicInsight[];
  competitiveComparisons: CompetitiveComparison[];
  priorityActions: string[];
  marketTrends: string[];
  priority: "critical" | "high" | "medium" | "low";
  fullReport: string;
}

/**
 * Generate strategic insights from competitor changes
 */
function generateStrategicInsights(
  competitorChanges: CompetitorAnalysis[],
  ourExperiments: OptimizelyEvent[] = []
): StrategicInsight[] {
  const insights: StrategicInsight[] = [];

  for (const analysis of competitorChanges) {
    const { competitor, featureChanges, pricingChanges, priority } = analysis;

    // Analyze feature changes
    for (const feature of featureChanges) {
      // Check if we're working on similar features
      const relatedExperiments = ourExperiments.filter((exp) =>
        exp.name.toLowerCase().includes(feature.title.toLowerCase().split(" ")[0])
      );

      if (feature.confidence === "high") {
        if (relatedExperiments.length > 0) {
          // We're already working on this - validation insight
          insights.push({
            category: "validation",
            title: `${competitor} launches similar feature: ${feature.title}`,
            description: `Competitor is launching a feature similar to what we're testing/building`,
            reasoning: [
              `${competitor} announced: ${feature.description}`,
              `We have ${relatedExperiments.length} related experiment(s): ${relatedExperiments.map((e) => e.name).join(", ")}`,
              "This validates our product direction and strategic priorities",
            ],
            actionableSteps: [
              "Accelerate development/testing of our similar feature",
              "Analyze competitor's implementation for UX insights",
              "Consider how to differentiate our approach",
              "Update positioning to highlight our unique advantages",
            ],
            urgency: "high",
            affectedAreas: ["product", "marketing"],
          });
        } else {
          // They're ahead of us - threat/opportunity
          insights.push({
            category: "competitive_threat",
            title: `${competitor} introduces ${feature.title}`,
            description: `Competitor has launched a new feature that we don't currently have`,
            reasoning: [
              `${competitor} announced: ${feature.description}`,
              "We have no related experiments or features in development",
              "This could be a competitive gap that affects our market position",
            ],
            actionableSteps: [
              "Assess customer demand for this capability",
              "Evaluate technical feasibility and effort required",
              "Determine if this should be added to roadmap",
              "Consider interim solutions or workarounds",
              "Update competitive battle cards",
            ],
            urgency: priority === "critical" ? "immediate" : "high",
            affectedAreas: ["product", "roadmap", "sales"],
          });
        }
      }
    }

    // Analyze pricing changes
    for (const pricing of pricingChanges) {
      insights.push({
        category: "warning",
        title: `${competitor} pricing change detected`,
        description: pricing.description,
        reasoning: [
          pricing.details,
          "Pricing changes can impact competitive positioning and win rates",
          "May signal market pressure or strategic repositioning",
        ],
        actionableSteps: [
          "Update competitive pricing analysis",
          "Review our pricing strategy and value positioning",
          "Analyze potential impact on win/loss rates",
          "Update sales team with new competitive pricing info",
          "Consider if adjustments to our pricing are warranted",
        ],
        urgency: "immediate",
        affectedAreas: ["pricing", "sales", "finance"],
      });
    }
  }

  // If no major insights, provide general observation
  if (insights.length === 0) {
    insights.push({
      category: "learning",
      title: "Competitive landscape remains stable",
      description: "No significant changes detected in competitor activities",
      reasoning: [
        "Monitoring shows no major feature launches or strategic shifts",
        "Good opportunity to maintain current strategic direction",
      ],
      actionableSteps: [
        "Continue current product roadmap execution",
        "Look for opportunities to differentiate",
        "Consider being more aggressive with innovation",
      ],
      urgency: "low",
      affectedAreas: ["product", "strategy"],
    });
  }

  return insights;
}

/**
 * Compare competitor activity with our own
 */
function generateCompetitiveComparisons(
  competitorChanges: CompetitorAnalysis[],
  ourExperiments: OptimizelyEvent[]
): CompetitiveComparison[] {
  const comparisons: CompetitiveComparison[] = [];

  // Group competitor features by category
  const competitorFeatures = competitorChanges.flatMap((c) =>
    c.featureChanges.map((f) => ({
      competitor: c.competitor,
      feature: f,
    }))
  );

  // AI/ML comparison
  const competitorAI = competitorFeatures.filter((cf) =>
    cf.feature.title.toLowerCase().includes("ai")
  );
  const ourAI = ourExperiments.filter((exp) =>
    exp.name.toLowerCase().includes("ai")
  );

  if (competitorAI.length > 0 || ourAI.length > 0) {
    comparisons.push({
      topic: "AI/ML Capabilities",
      competitorActivity:
        competitorAI.length > 0
          ? `${competitorAI.length} AI feature(s) detected from competitors`
          : "No AI features detected",
      ourActivity:
        ourAI.length > 0
          ? `${ourAI.length} AI-related experiment(s) in progress`
          : "No AI experiments detected",
      gap:
        ourAI.length > competitorAI.length
          ? "ahead"
          : ourAI.length < competitorAI.length
            ? "behind"
            : "at_parity",
      implication:
        competitorAI.length > ourAI.length
          ? "Competitors may be ahead on AI innovation"
          : "We appear to be competitive or leading in AI capabilities",
    });
  }

  // Analytics/Dashboard comparison
  const competitorAnalytics = competitorFeatures.filter(
    (cf) =>
      cf.feature.title.toLowerCase().includes("analytics") ||
      cf.feature.title.toLowerCase().includes("dashboard")
  );
  const ourAnalytics = ourExperiments.filter(
    (exp) =>
      exp.name.toLowerCase().includes("analytics") ||
      exp.name.toLowerCase().includes("dashboard")
  );

  if (competitorAnalytics.length > 0 || ourAnalytics.length > 0) {
    comparisons.push({
      topic: "Analytics & Reporting",
      competitorActivity:
        competitorAnalytics.length > 0
          ? `${competitorAnalytics.length} analytics feature(s) from competitors`
          : "No analytics features detected",
      ourActivity:
        ourAnalytics.length > 0
          ? `${ourAnalytics.length} analytics experiment(s) running`
          : "No analytics experiments detected",
      gap:
        ourAnalytics.length >= competitorAnalytics.length ? "at_parity" : "behind",
      implication:
        "Analytics and reporting are table stakes - ensure we remain competitive",
    });
  }

  return comparisons;
}

/**
 * Identify market trends from competitor activities
 */
function identifyMarketTrends(
  competitorChanges: CompetitorAnalysis[]
): string[] {
  const trends: string[] = [];
  const allFeatures = competitorChanges.flatMap((c) => c.featureChanges);

  // Check for AI trend
  const aiFeatures = allFeatures.filter((f) =>
    f.title.toLowerCase().includes("ai")
  );
  if (aiFeatures.length >= 2) {
    trends.push(
      `📈 AI Integration Trend: Multiple competitors (${aiFeatures.length}) are adding AI capabilities, indicating market demand for AI-powered features`
    );
  }

  // Check for automation trend
  const automationFeatures = allFeatures.filter((f) =>
    f.title.toLowerCase().includes("automation")
  );
  if (automationFeatures.length >= 2) {
    trends.push(
      `📈 Automation Focus: ${automationFeatures.length} competitors emphasizing automation features`
    );
  }

  // Check for integration trend
  const integrationFeatures = allFeatures.filter((f) =>
    f.title.toLowerCase().includes("integration")
  );
  if (integrationFeatures.length >= 2) {
    trends.push(
      `📈 Ecosystem Expansion: Multiple competitors launching integrations, suggesting market preference for connected workflows`
    );
  }

  // Pricing trends
  const pricingChanges = competitorChanges.flatMap((c) => c.pricingChanges);
  if (pricingChanges.length >= 2) {
    trends.push(
      `💰 Pricing Activity: ${pricingChanges.length} competitors adjusting pricing - may indicate market pressure or repositioning`
    );
  }

  if (trends.length === 0) {
    trends.push("No significant market trends detected in this monitoring cycle");
  }

  return trends;
}

/**
 * Generate executive summary
 */
function generateExecutiveSummary(
  competitorChanges: CompetitorAnalysis[],
  insights: StrategicInsight[]
): string {
  const totalCompetitors = competitorChanges.length;
  const totalChanges = competitorChanges.reduce(
    (sum, c) => sum + c.totalChanges,
    0
  );
  const criticalInsights = insights.filter((i) => i.urgency === "immediate");
  const highUrgency = insights.filter((i) => i.urgency === "high");

  let summary = `Monitored ${totalCompetitors} competitor(s) and detected ${totalChanges} total change(s). `;

  if (criticalInsights.length > 0) {
    summary += `🚨 ${criticalInsights.length} critical insight(s) requiring immediate attention. `;
  }

  if (highUrgency.length > 0) {
    summary += `⚠️ ${highUrgency.length} high-priority insight(s) identified. `;
  }

  const competitorsWithChanges = competitorChanges.filter(
    (c) => c.changesDetected
  );
  if (competitorsWithChanges.length > 0) {
    summary += `Active competitors: ${competitorsWithChanges.map((c) => c.competitor).join(", ")}.`;
  } else {
    summary += "No significant competitive activity detected.";
  }

  return summary;
}

/**
 * Generate full report in markdown format
 */
function generateFullReport(
  executiveSummary: string,
  insights: StrategicInsight[],
  comparisons: CompetitiveComparison[],
  trends: string[],
  priorityActions: string[]
): string {
  let report = `# 🎯 Competitive Intelligence Report\n\n`;
  report += `**Generated:** ${new Date().toLocaleString()}\n\n`;
  report += `## Executive Summary\n\n${executiveSummary}\n\n`;

  report += `## 🎬 Priority Actions\n\n`;
  priorityActions.forEach((action, i) => {
    report += `${i + 1}. ${action}\n`;
  });

  report += `\n## 💡 Strategic Insights\n\n`;
  insights.forEach((insight) => {
    const urgencyEmoji =
      insight.urgency === "immediate"
        ? "🚨"
        : insight.urgency === "high"
          ? "⚠️"
          : "ℹ️";
    report += `### ${urgencyEmoji} ${insight.title}\n\n`;
    report += `**Category:** ${insight.category} | **Urgency:** ${insight.urgency}\n\n`;
    report += `${insight.description}\n\n`;
    report += `**Analysis:**\n`;
    insight.reasoning.forEach((r) => {
      report += `- ${r}\n`;
    });
    report += `\n**Recommended Actions:**\n`;
    insight.actionableSteps.forEach((step) => {
      report += `- [ ] ${step}\n`;
    });
    report += `\n`;
  });

  if (comparisons.length > 0) {
    report += `## 🔄 Competitive Positioning\n\n`;
    comparisons.forEach((comp) => {
      const gapEmoji =
        comp.gap === "ahead" ? "🟢" : comp.gap === "behind" ? "🔴" : "🟡";
      report += `### ${gapEmoji} ${comp.topic}\n\n`;
      report += `- **Competitor Activity:** ${comp.competitorActivity}\n`;
      report += `- **Our Activity:** ${comp.ourActivity}\n`;
      report += `- **Gap Analysis:** ${comp.gap}\n`;
      report += `- **Implication:** ${comp.implication}\n\n`;
    });
  }

  if (trends.length > 0) {
    report += `## 📊 Market Trends\n\n`;
    trends.forEach((trend) => {
      report += `${trend}\n\n`;
    });
  }

  return report;
}

async function insightGenerator(
  parameters: InsightGeneratorParameters
): Promise<InsightGeneratorResult> {
  const {
    competitorChanges,
    ourExperiments = [],
    analysisDepth = "standard",
    includeRecommendations = true,
  } = parameters;

  if (!competitorChanges || competitorChanges.length === 0) {
    throw new Error("competitorChanges array is required and cannot be empty");
  }

  // Generate strategic insights
  const strategicInsights = generateStrategicInsights(
    competitorChanges,
    ourExperiments
  );

  // Generate competitive comparisons
  const competitiveComparisons = generateCompetitiveComparisons(
    competitorChanges,
    ourExperiments
  );

  // Identify market trends
  const marketTrends = identifyMarketTrends(competitorChanges);

  // Extract priority actions from insights
  const priorityActions = strategicInsights
    .filter((i) => i.urgency === "immediate" || i.urgency === "high")
    .flatMap((i) => i.actionableSteps.slice(0, 2))
    .slice(0, 5);

  // Generate executive summary
  const executiveSummary = generateExecutiveSummary(
    competitorChanges,
    strategicInsights
  );

  // Determine overall priority
  const hasCritical = strategicInsights.some((i) => i.urgency === "immediate");
  const hasHigh = strategicInsights.some((i) => i.urgency === "high");
  const priority = hasCritical
    ? "critical"
    : hasHigh
      ? "high"
      : strategicInsights.length > 2
        ? "medium"
        : "low";

  // Generate full report
  const fullReport = generateFullReport(
    executiveSummary,
    strategicInsights,
    competitiveComparisons,
    marketTrends,
    priorityActions
  );

  return {
    timestamp: new Date().toISOString(),
    executiveSummary,
    strategicInsights,
    competitiveComparisons,
    priorityActions,
    marketTrends,
    priority,
    fullReport,
  };
}

tool({
  name: "insight-generator",
  description:
    "Generates strategic competitive intelligence insights by analyzing competitor changes in context of your Optimizely experiments and product activities. Identifies threats, opportunities, market trends, and provides actionable recommendations for product, pricing, and go-to-market strategies.",
  parameters: [
    {
      name: "competitorChanges",
      type: ParameterType.String,
      description:
        "JSON array of competitor analysis results from feature-diff-analyzer tool",
      required: true,
    },
    {
      name: "ourExperiments",
      type: ParameterType.String,
      description:
        "JSON array of Optimizely events/experiments from oa_find_events representing our product activities",
      required: false,
    },
    {
      name: "analysisDepth",
      type: ParameterType.String,
      description:
        "Depth of analysis: 'quick' (high-level), 'standard' (balanced), or 'deep' (comprehensive). Defaults to 'standard'.",
      required: false,
    },
    {
      name: "includeRecommendations",
      type: ParameterType.Boolean,
      description:
        "Whether to include actionable recommendations. Defaults to true.",
      required: false,
    },
    {
      name: "focusAreas",
      type: ParameterType.String,
      description:
        "JSON array of focus areas to emphasize in analysis (e.g., ['pricing', 'features', 'ux']). If not specified, all areas are analyzed equally.",
      required: false,
    },
  ],
})(insightGenerator);
