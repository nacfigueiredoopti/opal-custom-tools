import { tool, ParameterType } from "@optimizely-opal/opal-tools-sdk";

interface CmsUpdatePageBannerParameters {
  optimizelyClientId?: string;
  optimizelyClientSecret?: string;
  pageKey?: string;
  dryRun?: boolean;
}

const DEFAULT_PAGE_KEY = '913e8eed60ad49bc9467efd7698b6608'; // Use Case 4 - Scheduled Promotions

const BANNER_TEMPLATES = [
  {
    week: 1,
    title: 'Week 1: Black Friday Early Access',
    startDate: '2025-12-02T09:00:00Z',
    endDate: '2025-12-09T09:00:00Z',
    html: `<div class="promotional-banner" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 60px 40px; border-radius: 12px; color: white; text-align: center; margin: 40px 0; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
  <h2 style="font-size: 2.5rem; margin: 0 0 20px 0; font-weight: bold;">🎉 Black Friday Early Access</h2>
  <p style="font-size: 1.3rem; margin: 0 0 25px 0; opacity: 0.95;">Get 40% off all products! Limited time offer.</p>
  <a href="/promotions/black-friday" style="background: white; color: #667eea; padding: 15px 40px; border-radius: 30px; text-decoration: none; font-weight: bold; display: inline-block; transition: transform 0.2s;">Shop Now →</a>
</div>`
  },
  {
    week: 2,
    title: 'Week 2: Smart Home Week',
    startDate: '2025-12-09T09:00:00Z',
    endDate: '2025-12-16T09:00:00Z',
    html: `<div class="promotional-banner" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 60px 40px; border-radius: 12px; color: white; text-align: center; margin: 40px 0; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
  <h2 style="font-size: 2.5rem; margin: 0 0 20px 0; font-weight: bold;">🏡 Smart Home Week</h2>
  <p style="font-size: 1.3rem; margin: 0 0 25px 0; opacity: 0.95;">Save up to 35% on smart home devices and automation.</p>
  <a href="/promotions/smart-home" style="background: white; color: #f5576c; padding: 15px 40px; border-radius: 30px; text-decoration: none; font-weight: bold; display: inline-block; transition: transform 0.2s;">Explore Deals →</a>
</div>`
  },
  {
    week: 3,
    title: 'Week 3: Energy Savings Event',
    startDate: '2025-12-16T09:00:00Z',
    endDate: '2025-12-23T09:00:00Z',
    html: `<div class="promotional-banner" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); padding: 60px 40px; border-radius: 12px; color: white; text-align: center; margin: 40px 0; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
  <h2 style="font-size: 2.5rem; margin: 0 0 20px 0; font-weight: bold;">⚡ Energy Savings Event</h2>
  <p style="font-size: 1.3rem; margin: 0 0 25px 0; opacity: 0.95;">Reduce your bills! Special pricing on energy-efficient solutions.</p>
  <a href="/promotions/energy-savings" style="background: white; color: #00f2fe; padding: 15px 40px; border-radius: 30px; text-decoration: none; font-weight: bold; display: inline-block; transition: transform 0.2s;">Learn More →</a>
</div>`
  },
  {
    week: 4,
    title: 'Week 4: Cyber Monday Finale',
    startDate: '2025-12-23T09:00:00Z',
    endDate: '2025-12-30T09:00:00Z',
    html: `<div class="promotional-banner" style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); padding: 60px 40px; border-radius: 12px; color: white; text-align: center; margin: 40px 0; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
  <h2 style="font-size: 2.5rem; margin: 0 0 20px 0; font-weight: bold;">🎊 Cyber Monday Finale</h2>
  <p style="font-size: 1.3rem; margin: 0 0 25px 0; opacity: 0.95;">Last chance! Up to 50% off sitewide. Don't miss out!</p>
  <a href="/promotions/cyber-monday" style="background: white; color: #fa709a; padding: 15px 40px; border-radius: 30px; text-decoration: none; font-weight: bold; display: inline-block; transition: transform 0.2s;">Shop Final Deals →</a>
</div>`
  }
];

const DEFAULT_BANNER_HTML = `<div class="promotional-banner" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 60px 40px; border-radius: 12px; color: white; text-align: center; margin: 40px 0; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
  <h2 style="font-size: 2.5rem; margin: 0 0 20px 0; font-weight: bold;">🎯 Use Case 4 - Scheduled Promotions</h2>
  <p style="font-size: 1.3rem; margin: 0 0 25px 0; opacity: 0.95;">This page demonstrates scheduled banner rotation with 4 promotional banners that change automatically every Monday at 9am.</p>
</div>`;

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

async function getPageContent(token: string, pageKey: string): Promise<any> {
  const response = await fetch(
    `https://api.cms.optimizely.com/preview3/experimental/content/${pageKey}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get page: ${response.statusText}`);
  }

  return await response.json();
}

async function updatePageContent(token: string, pageKey: string, newBodyHtml: string): Promise<any> {
  const response = await fetch(
    `https://api.cms.optimizely.com/preview3/experimental/content/${pageKey}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        locales: {
          en: {
            properties: {
              Body: newBodyHtml
            }
          }
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to update page: ${response.statusText} - ${errorText}`);
  }

  return await response.json();
}

function getActiveBanner(now: Date) {
  for (const banner of BANNER_TEMPLATES) {
    const start = new Date(banner.startDate);
    const end = new Date(banner.endDate);

    if (now >= start && now < end) {
      return banner;
    }
  }

  return null; // No active banner
}

function replaceBannerInContent(currentBody: string, newBannerHtml: string): string {
  // Try to find and replace existing banner div
  const bannerRegex = /<div class="promotional-banner"[^>]*>[\s\S]*?<\/div>/i;

  if (bannerRegex.test(currentBody)) {
    // Replace existing banner
    return currentBody.replace(bannerRegex, newBannerHtml);
  } else {
    // Prepend banner to content
    return newBannerHtml + '\n\n' + currentBody;
  }
}

async function cmsUpdatePageBanner(parameters: CmsUpdatePageBannerParameters) {
  const {
    optimizelyClientId = process.env.OPTIMIZELY_CLIENT_ID,
    optimizelyClientSecret = process.env.OPTIMIZELY_CLIENT_SECRET,
    pageKey = DEFAULT_PAGE_KEY,
    dryRun = false
  } = parameters;

  if (!optimizelyClientId || !optimizelyClientSecret) {
    throw new Error('Optimizely credentials required. Please provide optimizelyClientId and optimizelyClientSecret');
  }

  const now = new Date();
  const token = await authenticate(optimizelyClientId, optimizelyClientSecret);

  // Get current page content
  const pageData = await getPageContent(token, pageKey);
  const locale = pageData.locales?.en;

  if (!locale) {
    throw new Error('Page locale data not found');
  }

  const currentBody = locale.properties?.Body || '';
  const activeBanner = getActiveBanner(now);

  if (!activeBanner) {
    return {
      success: true,
      timestamp: now.toISOString(),
      message: 'No banner is scheduled to be active at this time',
      currentBanner: null,
      dryRun,
      action: 'no_change'
    };
  }

  // Generate new content with active banner
  const newBody = replaceBannerInContent(currentBody, activeBanner.html);

  let updateResult = null;
  if (!dryRun) {
    updateResult = await updatePageContent(token, pageKey, newBody);
  }

  return {
    success: true,
    timestamp: now.toISOString(),
    dryRun,
    activeBanner: {
      week: activeBanner.week,
      title: activeBanner.title,
      startDate: activeBanner.startDate,
      endDate: activeBanner.endDate
    },
    action: 'updated',
    pageKey,
    pageTitle: locale.displayName,
    message: dryRun
      ? `Would update page with: ${activeBanner.title}`
      : `Successfully updated page with: ${activeBanner.title}`,
    updated: !dryRun
  };
}

tool({
  name: 'cms-update-page-banner',
  description: 'Directly updates the Use Case 4 page content with the correct promotional banner based on the current date. Replaces the banner HTML in the page body without requiring frontend changes. Designed to run on a schedule (e.g., every Monday at 9am).',
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
      name: 'pageKey',
      type: ParameterType.String,
      description: 'The key of the page to update. Defaults to Use Case 4 page.',
      required: false
    },
    {
      name: 'dryRun',
      type: ParameterType.Boolean,
      description: 'If true, simulates the update without making actual changes. Useful for testing. Defaults to false.',
      required: false
    }
  ]
})(cmsUpdatePageBanner);
