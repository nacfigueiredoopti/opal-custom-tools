import { tool, ParameterType } from "@optimizely-opal/opal-tools-sdk";

interface CmsRotateBannersParameters {
  optimizelyClientId?: string;
  optimizelyClientSecret?: string;
  dryRun?: boolean;
}

const BANNER_CONFIG = [
  {
    key: '82dd7452fd6e49ca8de9091bd5b5a355',
    title: 'Week 1: Black Friday Early Access',
    week: 1,
    defaultStart: '2025-12-02T09:00:00Z',
    defaultEnd: '2025-12-09T09:00:00Z'
  },
  {
    key: '813119002c3f427681c557650125bda9',
    title: 'Week 2: Smart Home Week',
    week: 2,
    defaultStart: '2025-12-09T09:00:00Z',
    defaultEnd: '2025-12-16T09:00:00Z'
  },
  {
    key: 'b18bc2399fdf4167a6e6220436873f16',
    title: 'Week 3: Energy Savings Event',
    week: 3,
    defaultStart: '2025-12-16T09:00:00Z',
    defaultEnd: '2025-12-23T09:00:00Z'
  },
  {
    key: 'c4c17a80c2784411bbc09d5b6f12344e',
    title: 'Week 4: Cyber Monday Finale',
    week: 4,
    defaultStart: '2025-12-23T09:00:00Z',
    defaultEnd: '2025-12-30T09:00:00Z'
  }
];

async function authenticate(clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch('https://api.cms.optimizely.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    })
  });

  if (!response.ok) {
    throw new Error(`Authentication failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function getBannerStatus(token: string, bannerKey: string): Promise<any> {
  try {
    const response = await fetch(
      `https://api.cms.optimizely.com/preview3/experimental/content/${bannerKey}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    return null;
  }
}

async function updateBannerStatus(token: string, bannerKey: string, newStatus: string): Promise<any> {
  try {
    const response = await fetch(
      `https://api.cms.optimizely.com/preview3/experimental/content/${bannerKey}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: newStatus
        })
      }
    );

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`Error updating banner ${bannerKey}:`, error);
    return null;
  }
}

function shouldBannerBeActive(banner: any, now: Date): boolean {
  if (!banner.defaultStart || !banner.defaultEnd) return false;

  const start = new Date(banner.defaultStart);
  const end = new Date(banner.defaultEnd);

  return now >= start && now < end;
}

async function cmsRotateBanners(parameters: CmsRotateBannersParameters) {
  const {
    optimizelyClientId = process.env.OPTIMIZELY_CLIENT_ID,
    optimizelyClientSecret = process.env.OPTIMIZELY_CLIENT_SECRET,
    dryRun = false
  } = parameters;

  if (!optimizelyClientId || !optimizelyClientSecret) {
    throw new Error('Optimizely credentials required. Please provide optimizelyClientId and optimizelyClientSecret');
  }

  const now = new Date();
  const token = await authenticate(optimizelyClientId, optimizelyClientSecret);

  const actions: any[] = [];
  let activeBannerFound: string | null = null;

  // Check each banner
  for (const bannerConfig of BANNER_CONFIG) {
    const status = await getBannerStatus(token, bannerConfig.key);
    if (!status) {
      actions.push({
        banner: bannerConfig.title,
        action: 'skip',
        reason: 'Banner not found'
      });
      continue;
    }

    const locale = status.locales?.en;
    if (!locale) {
      actions.push({
        banner: bannerConfig.title,
        action: 'skip',
        reason: 'No locale data'
      });
      continue;
    }

    const shouldBeActive = shouldBannerBeActive(bannerConfig, now);
    const currentlyPublished = locale.status === 'published';

    if (shouldBeActive && !currentlyPublished) {
      // Should be published but isn't
      if (!dryRun) {
        await updateBannerStatus(token, bannerConfig.key, 'published');
      }
      actions.push({
        banner: bannerConfig.title,
        key: bannerConfig.key,
        action: 'published',
        reason: 'Within active date range',
        dryRun
      });
      activeBannerFound = bannerConfig.title;
    } else if (!shouldBeActive && currentlyPublished) {
      // Should not be published but is
      if (!dryRun) {
        await updateBannerStatus(token, bannerConfig.key, 'draft');
      }
      actions.push({
        banner: bannerConfig.title,
        key: bannerConfig.key,
        action: 'unpublished',
        reason: 'Outside active date range',
        dryRun
      });
    } else {
      // Status is correct
      actions.push({
        banner: bannerConfig.title,
        key: bannerConfig.key,
        action: 'no_change',
        currentStatus: locale.status,
        reason: shouldBeActive ? 'Already active' : 'Correctly inactive'
      });
      if (shouldBeActive) {
        activeBannerFound = bannerConfig.title;
      }
    }
  }

  return {
    success: true,
    timestamp: now.toISOString(),
    dryRun,
    activeBanner: activeBannerFound,
    actions,
    summary: {
      published: actions.filter(a => a.action === 'published').length,
      unpublished: actions.filter(a => a.action === 'unpublished').length,
      noChange: actions.filter(a => a.action === 'no_change').length,
      skipped: actions.filter(a => a.action === 'skip').length
    }
  };
}

tool({
  name: 'cms-rotate-banners',
  description: 'Orchestrates automatic banner rotation in Optimizely CMS. Checks which banner should be active based on the current date/time and updates banner publish status accordingly. Designed to run on a schedule (e.g., every Monday at 9am). Supports dry-run mode for testing.',
  parameters: [
    {
      name: 'optimizelyClientId',
      type: ParameterType.String,
      description: 'Optimizely OAuth client ID for CMS API authentication',
      required: false
    },
    {
      name: 'optimizelyClientSecret',
      type: ParameterType.String,
      description: 'Optimizely OAuth client secret for CMS API authentication',
      required: false
    },
    {
      name: 'dryRun',
      type: ParameterType.Boolean,
      description: 'If true, simulates the rotation without making actual changes. Useful for testing. Defaults to false.',
      required: false
    }
  ]
})(cmsRotateBanners);
