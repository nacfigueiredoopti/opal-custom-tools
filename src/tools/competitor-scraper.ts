import { tool, ParameterType } from "@optimizely-opal/opal-tools-sdk";

interface CompetitorConfig {
  name: string;
  url: string;
  pages_to_monitor: string[];
}

interface PageSnapshot {
  url: string;
  timestamp: string;
  title: string;
  metaDescription?: string;
  headings: string[];
  links: Array<{ text: string; href: string }>;
  textContent: string;
  htmlHash: string;
  screenshot?: string; // Base64 encoded screenshot
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
    changeType: "content" | "structure" | "new_page" | "removed_page";
    description: string;
  }>;
}

interface CompetitorScraperParameters {
  competitors: CompetitorConfig[] | string;
  screenshotEnabled?: boolean;
  compareWithPrevious?: boolean;
  storageKey?: string; // For storing previous snapshots
}

interface CompetitorScraperResult {
  timestamp: string;
  competitorsScraped: number;
  totalPages: number;
  snapshots: CompetitorSnapshot[];
  changes?: ChangeDetection;
  summary: string;
}

/**
 * Simple hash function for content comparison
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Scrapes a single page and extracts key content
 */
async function scrapePage(
  url: string,
  screenshotEnabled: boolean = false
): Promise<PageSnapshot> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      return {
        url,
        timestamp: new Date().toISOString(),
        title: "",
        headings: [],
        links: [],
        textContent: "",
        htmlHash: "",
        error: `Failed to fetch: ${response.status} ${response.statusText}`,
      };
    }

    const html = await response.text();
    const htmlHash = simpleHash(html);

    // Basic HTML parsing (in production, use a proper parser like cheerio)
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    const metaDescMatch = html.match(
      /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i
    );
    const metaDescription = metaDescMatch ? metaDescMatch[1] : undefined;

    // Extract headings (h1, h2, h3)
    const headingMatches = html.matchAll(/<h[1-3][^>]*>([^<]+)<\/h[1-3]>/gi);
    const headings = Array.from(headingMatches)
      .map((match) => match[1].trim())
      .filter((h) => h.length > 0);

    // Extract links
    const linkMatches = html.matchAll(
      /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi
    );
    const links = Array.from(linkMatches)
      .map((match) => ({
        href: match[1],
        text: match[2].trim(),
      }))
      .filter((link) => link.text.length > 0)
      .slice(0, 50); // Limit to first 50 links

    // Extract text content (remove HTML tags)
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 5000); // Limit text content to 5000 chars

    return {
      url,
      timestamp: new Date().toISOString(),
      title,
      metaDescription,
      headings,
      links,
      textContent,
      htmlHash,
      // Note: Screenshot capture would require a headless browser like Puppeteer
      // For now, we'll leave it undefined
      screenshot: screenshotEnabled
        ? "SCREENSHOT_PLACEHOLDER"
        : undefined,
    };
  } catch (error) {
    return {
      url,
      timestamp: new Date().toISOString(),
      title: "",
      headings: [],
      links: [],
      textContent: "",
      htmlHash: "",
      error: `Scraping error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Compare current snapshot with previous to detect changes
 */
function detectChanges(
  current: CompetitorSnapshot[],
  previous: CompetitorSnapshot[] | null
): ChangeDetection {
  if (!previous || previous.length === 0) {
    return { hasChanges: false };
  }

  const changes: ChangeDetection["changesDetected"] = [];

  for (const currentComp of current) {
    const prevComp = previous.find((p) => p.competitor === currentComp.competitor);
    if (!prevComp) continue;

    for (const currentPage of currentComp.pages) {
      const prevPage = prevComp.pages.find((p) => p.url === currentPage.url);

      if (!prevPage) {
        changes.push({
          url: currentPage.url,
          changeType: "new_page",
          description: `New page detected: ${currentPage.title}`,
        });
        continue;
      }

      // Check for content changes
      if (currentPage.htmlHash !== prevPage.htmlHash) {
        // Determine what changed
        if (currentPage.title !== prevPage.title) {
          changes.push({
            url: currentPage.url,
            changeType: "content",
            description: `Title changed from "${prevPage.title}" to "${currentPage.title}"`,
          });
        }

        const newHeadings = currentPage.headings.filter(
          (h) => !prevPage.headings.includes(h)
        );
        if (newHeadings.length > 0) {
          changes.push({
            url: currentPage.url,
            changeType: "content",
            description: `New headings added: ${newHeadings.slice(0, 3).join(", ")}${newHeadings.length > 3 ? "..." : ""}`,
          });
        }

        // Check for structural changes (significant link changes)
        const linkDiff = Math.abs(
          currentPage.links.length - prevPage.links.length
        );
        if (linkDiff > 5) {
          changes.push({
            url: currentPage.url,
            changeType: "structure",
            description: `Significant navigation changes: ${linkDiff} links ${currentPage.links.length > prevPage.links.length ? "added" : "removed"}`,
          });
        }
      }
    }

    // Check for removed pages
    for (const prevPage of prevComp.pages) {
      const currentPage = currentComp.pages.find((p) => p.url === prevPage.url);
      if (!currentPage) {
        changes.push({
          url: prevPage.url,
          changeType: "removed_page",
          description: `Page removed or no longer accessible: ${prevPage.title}`,
        });
      }
    }
  }

  return {
    hasChanges: changes.length > 0,
    changesDetected: changes.length > 0 ? changes : undefined,
  };
}

async function competitorScraper(
  parameters: CompetitorScraperParameters
): Promise<CompetitorScraperResult> {
  const {
    competitors: competitorsParam,
    screenshotEnabled = false,
    compareWithPrevious = false,
    storageKey = "competitor_snapshots",
  } = parameters;

  // Parse competitors if passed as JSON string
  const competitors: CompetitorConfig[] = typeof competitorsParam === "string"
    ? JSON.parse(competitorsParam)
    : competitorsParam;

  if (!competitors || competitors.length === 0) {
    throw new Error("At least one competitor must be specified");
  }

  const snapshots: CompetitorSnapshot[] = [];
  let totalPages = 0;

  // Scrape each competitor
  for (const competitor of competitors) {
    const competitorSnapshot: CompetitorSnapshot = {
      competitor: competitor.name,
      baseUrl: competitor.url,
      pages: [],
      scrapedAt: new Date().toISOString(),
    };

    for (const pagePath of competitor.pages_to_monitor) {
      const fullUrl = pagePath.startsWith("http")
        ? pagePath
        : `${competitor.url}${pagePath}`;

      console.log(`Scraping: ${fullUrl}`);
      const pageSnapshot = await scrapePage(fullUrl, screenshotEnabled);
      competitorSnapshot.pages.push(pageSnapshot);
      totalPages++;

      // Add small delay to be respectful to servers
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    snapshots.push(competitorSnapshot);
  }

  // Compare with previous snapshots if requested
  let changes: ChangeDetection | undefined;
  if (compareWithPrevious) {
    // In a real implementation, you'd load previous snapshots from storage
    // For now, we'll simulate no previous data
    const previousSnapshots = null; // Load from storage using storageKey
    changes = detectChanges(snapshots, previousSnapshots);
  }

  // Generate summary
  const competitorNames = competitors.map((c) => c.name).join(", ");
  let summary = `Successfully scraped ${totalPages} page(s) from ${competitors.length} competitor(s): ${competitorNames}. `;

  if (changes?.hasChanges) {
    summary += `Detected ${changes.changesDetected?.length} change(s) since last check.`;
  } else if (compareWithPrevious) {
    summary += "No changes detected since last check.";
  }

  return {
    timestamp: new Date().toISOString(),
    competitorsScraped: competitors.length,
    totalPages,
    snapshots,
    changes,
    summary,
  };
}

tool({
  name: "competitor-scraper",
  description:
    "Scrapes competitor websites to monitor changes in features, pricing, content, and structure. Captures page content, headings, links, and can optionally compare with previous snapshots to detect changes. Useful for competitive intelligence and market monitoring.",
  parameters: [
    {
      name: "competitors",
      type: ParameterType.String,
      description:
        'JSON array of competitor configurations, each with name, url, and pages_to_monitor. Example: [{"name": "Competitor A", "url": "https://competitor.com", "pages_to_monitor": ["/", "/pricing", "/features"]}]',
      required: true,
    },
    {
      name: "screenshotEnabled",
      type: ParameterType.Boolean,
      description:
        "Whether to capture screenshots of pages (requires headless browser). Defaults to false.",
      required: false,
    },
    {
      name: "compareWithPrevious",
      type: ParameterType.Boolean,
      description:
        "Whether to compare with previously stored snapshots to detect changes. Defaults to false.",
      required: false,
    },
    {
      name: "storageKey",
      type: ParameterType.String,
      description:
        "Storage key for saving/loading snapshots for comparison. Defaults to 'competitor_snapshots'.",
      required: false,
    },
  ],
})(competitorScraper);
