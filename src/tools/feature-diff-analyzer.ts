import { tool, ParameterType } from "@optimizely-opal/opal-tools-sdk";

interface PageSnapshot {
  url: string;
  timestamp: string;
  title: string;
  metaDescription?: string;
  headings: string[];
  links: Array<{ text: string; href: string }>;
  textContent: string;
  htmlHash: string;
  screenshot?: string;
  error?: string;
}

interface CompetitorSnapshot {
  competitor: string;
  baseUrl: string;
  pages: PageSnapshot[];
  scrapedAt: string;
}

interface ChangeDetection {
  hasChanges: boolean;
  changesDetected?: Array<{
    url: string;
    changeType: string;
    description: string;
  }>;
}

interface FeatureChange {
  type: "new_feature" | "removed_feature" | "modified_feature";
  title: string;
  description: string;
  evidence: string[];
  confidence: "high" | "medium" | "low";
  page: string;
}

interface PricingChange {
  type: "price_increase" | "price_decrease" | "new_plan" | "plan_removed" | "plan_modified";
  description: string;
  details: string;
  page: string;
}

interface UIChange {
  type: "major_redesign" | "navigation_change" | "layout_change" | "minor_update";
  description: string;
  affectedPages: string[];
}

interface MessagingChange {
  type: "value_proposition" | "positioning" | "tagline" | "cta";
  description: string;
  oldText?: string;
  newText?: string;
  page: string;
}

interface FeatureDiffAnalyzerParameters {
  scrapeResults: {
    snapshots: CompetitorSnapshot[];
    changes?: ChangeDetection;
  };
  changeThreshold?: "low" | "medium" | "high";
  detectFeatures?: boolean;
  detectPricing?: boolean;
  detectUI?: boolean;
  detectMessaging?: boolean;
}

interface FeatureDiffAnalyzerResult {
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

/**
 * Feature-related keywords for detection
 */
const FEATURE_KEYWORDS = [
  "new",
  "introducing",
  "launch",
  "feature",
  "capability",
  "integration",
  "support",
  "beta",
  "preview",
  "now available",
  "coming soon",
  "powered by",
  "ai",
  "automation",
  "analytics",
  "dashboard",
  "api",
  "workflow",
];

/**
 * Pricing-related keywords
 */
const PRICING_KEYWORDS = [
  "price",
  "pricing",
  "plan",
  "tier",
  "subscription",
  "free",
  "trial",
  "enterprise",
  "starter",
  "professional",
  "premium",
  "cost",
  "$/month",
  "per month",
  "per user",
  "discount",
  "save",
];

/**
 * Value proposition keywords
 */
const VALUE_PROP_KEYWORDS = [
  "fastest",
  "easiest",
  "best",
  "leading",
  "#1",
  "trusted by",
  "million",
  "customers",
  "enterprise-grade",
  "industry-leading",
];

/**
 * Analyze text content for feature mentions
 */
function detectFeatureChanges(
  page: PageSnapshot,
  previousContent?: string
): FeatureChange[] {
  const features: FeatureChange[] = [];
  const textLower = page.textContent.toLowerCase();
  const headings = page.headings;

  // Look for feature announcements in headings
  for (const heading of headings) {
    const headingLower = heading.toLowerCase();
    const hasFeatureKeyword = FEATURE_KEYWORDS.some((keyword) =>
      headingLower.includes(keyword)
    );

    if (hasFeatureKeyword) {
      features.push({
        type: "new_feature",
        title: heading,
        description: `Potential new feature announced: "${heading}"`,
        evidence: [
          `Found in heading on ${page.url}`,
          `Text context: ${extractContextAroundHeading(page.textContent, heading)}`,
        ],
        confidence: headingLower.includes("new") || headingLower.includes("introducing")
          ? "high"
          : "medium",
        page: page.url,
      });
    }
  }

  // Detect AI/ML feature mentions
  if (
    (textLower.includes("ai") || textLower.includes("artificial intelligence") || textLower.includes("machine learning")) &&
    !previousContent?.toLowerCase().includes("ai")
  ) {
    features.push({
      type: "new_feature",
      title: "AI/ML Capability",
      description: "New AI or machine learning features mentioned",
      evidence: [
        extractKeyPhrases(page.textContent, ["ai", "artificial intelligence", "machine learning"]),
      ],
      confidence: "medium",
      page: page.url,
    });
  }

  return features;
}

/**
 * Analyze for pricing changes
 */
function detectPricingChanges(page: PageSnapshot): PricingChange[] {
  const changes: PricingChange[] = [];
  const textLower = page.textContent.toLowerCase();

  // Check if this is a pricing page
  const isPricingPage = page.url.toLowerCase().includes("pricing") ||
    page.title.toLowerCase().includes("pricing") ||
    PRICING_KEYWORDS.filter((kw) => textLower.includes(kw)).length > 5;

  if (!isPricingPage) {
    return changes;
  }

  // Look for pricing mentions in headings
  for (const heading of page.headings) {
    const headingLower = heading.toLowerCase();

    // Detect plan names
    if (
      headingLower.includes("plan") ||
      headingLower.includes("tier") ||
      headingLower.includes("starter") ||
      headingLower.includes("professional") ||
      headingLower.includes("enterprise") ||
      headingLower.includes("free")
    ) {
      changes.push({
        type: "new_plan",
        description: `Pricing plan detected: ${heading}`,
        details: extractContextAroundHeading(page.textContent, heading),
        page: page.url,
      });
    }
  }

  return changes;
}

/**
 * Analyze UI/UX changes
 */
function detectUIChanges(snapshots: CompetitorSnapshot[]): UIChange[] {
  const changes: UIChange[] = [];

  for (const snapshot of snapshots) {
    const navigationPages = snapshot.pages.filter(
      (p) => p.url.endsWith("/") || p.url.includes("index")
    );

    for (const page of navigationPages) {
      // Detect significant navigation changes
      const navLinks = page.links.filter(
        (link) =>
          !link.href.includes("#") &&
          !link.href.includes("javascript") &&
          link.text.length > 0
      );

      if (navLinks.length > 10) {
        changes.push({
          type: "navigation_change",
          description: `Large navigation menu detected with ${navLinks.length} links`,
          affectedPages: [page.url],
        });
      }
    }
  }

  return changes;
}

/**
 * Analyze messaging and positioning changes
 */
function detectMessagingChanges(page: PageSnapshot): MessagingChange[] {
  const changes: MessagingChange[] = [];
  const textLower = page.textContent.toLowerCase();

  // Look for value propositions
  for (const keyword of VALUE_PROP_KEYWORDS) {
    if (textLower.includes(keyword)) {
      const context = extractKeyPhrases(page.textContent, [keyword]);
      changes.push({
        type: "value_proposition",
        description: `Strong value proposition language: "${keyword}"`,
        newText: context,
        page: page.url,
      });
    }
  }

  // Check for taglines in headings
  const firstHeading = page.headings[0];
  if (firstHeading && firstHeading.split(" ").length > 3) {
    changes.push({
      type: "tagline",
      description: "Main tagline/headline",
      newText: firstHeading,
      page: page.url,
    });
  }

  return changes;
}

/**
 * Helper: Extract context around a heading
 */
function extractContextAroundHeading(content: string, heading: string): string {
  const index = content.indexOf(heading);
  if (index === -1) return "";

  const start = Math.max(0, index - 50);
  const end = Math.min(content.length, index + heading.length + 200);
  return content.substring(start, end).trim() + "...";
}

/**
 * Helper: Extract key phrases containing keywords
 */
function extractKeyPhrases(content: string, keywords: string[]): string {
  const sentences = content.split(/[.!?]+/);
  const relevant = sentences.filter((sentence) =>
    keywords.some((kw) => sentence.toLowerCase().includes(kw))
  );

  return relevant.slice(0, 2).join(". ").substring(0, 200) + "...";
}

/**
 * Calculate priority based on changes detected
 */
function calculatePriority(
  featureChanges: FeatureChange[],
  pricingChanges: PricingChange[],
  uiChanges: UIChange[],
  messagingChanges: MessagingChange[]
): "critical" | "high" | "medium" | "low" {
  const totalChanges =
    featureChanges.length +
    pricingChanges.length +
    uiChanges.length +
    messagingChanges.length;

  const hasHighConfidenceFeature = featureChanges.some(
    (f) => f.confidence === "high"
  );
  const hasPricingChange = pricingChanges.length > 0;
  const hasMajorUIChange = uiChanges.some((u) => u.type === "major_redesign");

  if (hasHighConfidenceFeature || hasPricingChange) return "critical";
  if (hasMajorUIChange || totalChanges > 5) return "high";
  if (totalChanges > 2) return "medium";
  return "low";
}

/**
 * Generate actionable recommendations
 */
function generateRecommendations(
  featureChanges: FeatureChange[],
  pricingChanges: PricingChange[]
): string[] {
  const recommendations: string[] = [];

  if (featureChanges.length > 0) {
    recommendations.push(
      "Review competitor's new features and assess if we should add similar capabilities to our roadmap"
    );

    const aiFeatures = featureChanges.filter((f) =>
      f.title.toLowerCase().includes("ai")
    );
    if (aiFeatures.length > 0) {
      recommendations.push(
        "Competitor is emphasizing AI features - consider our AI/ML strategy and positioning"
      );
    }
  }

  if (pricingChanges.length > 0) {
    recommendations.push(
      "Analyze pricing changes impact on our competitive positioning and price points"
    );
    recommendations.push(
      "Update competitive pricing matrix and value comparison materials"
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("Continue monitoring for future changes");
  }

  return recommendations;
}

async function featureDiffAnalyzer(
  parameters: FeatureDiffAnalyzerParameters
): Promise<FeatureDiffAnalyzerResult[]> {
  const {
    scrapeResults,
    changeThreshold = "medium",
    detectFeatures = true,
    detectPricing = true,
    detectUI = true,
    detectMessaging = true,
  } = parameters;

  if (!scrapeResults || !scrapeResults.snapshots) {
    throw new Error("scrapeResults with snapshots is required");
  }

  const results: FeatureDiffAnalyzerResult[] = [];

  // Analyze each competitor
  for (const snapshot of scrapeResults.snapshots) {
    const featureChanges: FeatureChange[] = [];
    const pricingChanges: PricingChange[] = [];
    const messagingChanges: MessagingChange[] = [];

    // Analyze each page
    for (const page of snapshot.pages) {
      if (page.error) continue;

      if (detectFeatures) {
        featureChanges.push(...detectFeatureChanges(page));
      }

      if (detectPricing) {
        pricingChanges.push(...detectPricingChanges(page));
      }

      if (detectMessaging) {
        messagingChanges.push(...detectMessagingChanges(page));
      }
    }

    // Analyze UI changes across all pages
    const uiChanges: UIChange[] = detectUI ? detectUIChanges([snapshot]) : [];

    const totalChanges =
      featureChanges.length +
      pricingChanges.length +
      uiChanges.length +
      messagingChanges.length;

    const changesDetected = totalChanges > 0;
    const priority = calculatePriority(
      featureChanges,
      pricingChanges,
      uiChanges,
      messagingChanges
    );

    // Generate summary
    let summary = `Analyzed ${snapshot.pages.length} page(s) for ${snapshot.competitor}. `;
    if (changesDetected) {
      summary += `Found ${totalChanges} potential change(s): `;
      const parts = [];
      if (featureChanges.length > 0)
        parts.push(`${featureChanges.length} feature(s)`);
      if (pricingChanges.length > 0)
        parts.push(`${pricingChanges.length} pricing update(s)`);
      if (uiChanges.length > 0) parts.push(`${uiChanges.length} UI change(s)`);
      if (messagingChanges.length > 0)
        parts.push(`${messagingChanges.length} messaging update(s)`);
      summary += parts.join(", ") + ".";
    } else {
      summary += "No significant changes detected.";
    }

    results.push({
      timestamp: new Date().toISOString(),
      competitor: snapshot.competitor,
      changesDetected,
      totalChanges,
      featureChanges,
      pricingChanges,
      uiChanges,
      messagingChanges,
      priority,
      summary,
      recommendations: generateRecommendations(featureChanges, pricingChanges),
    });
  }

  return results;
}

tool({
  name: "feature-diff-analyzer",
  description:
    "Analyzes competitor website snapshots to identify and categorize changes including new features, pricing updates, UI/UX changes, and messaging shifts. Uses keyword detection and content analysis to provide prioritized competitive intelligence insights.",
  parameters: [
    {
      name: "scrapeResults",
      type: ParameterType.String,
      description:
        "JSON results from the competitor-scraper tool containing snapshots of competitor websites",
      required: true,
    },
    {
      name: "changeThreshold",
      type: ParameterType.String,
      description:
        "Sensitivity threshold for change detection: 'low' (detect minor changes), 'medium' (balanced), or 'high' (only major changes). Defaults to 'medium'.",
      required: false,
    },
    {
      name: "detectFeatures",
      type: ParameterType.Boolean,
      description:
        "Whether to detect new features and product capabilities. Defaults to true.",
      required: false,
    },
    {
      name: "detectPricing",
      type: ParameterType.Boolean,
      description:
        "Whether to detect pricing and plan changes. Defaults to true.",
      required: false,
    },
    {
      name: "detectUI",
      type: ParameterType.Boolean,
      description: "Whether to detect UI/UX changes. Defaults to true.",
      required: false,
    },
    {
      name: "detectMessaging",
      type: ParameterType.Boolean,
      description:
        "Whether to detect messaging and positioning changes. Defaults to true.",
      required: false,
    },
  ],
})(featureDiffAnalyzer);
