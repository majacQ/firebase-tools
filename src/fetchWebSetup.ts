import { Client } from "./apiv2";
import { configstore } from "./configstore";
import { firebaseApiOrigin, hostingApiOrigin } from "./api";
import * as getProjectId from "./getProjectId";
import { logger } from "./logger";

export interface WebConfig {
  projectId: string;
  appId?: string;
  databaseURL?: string;
  storageBucket?: string;
  locationId?: string;
  apiKey?: string;
  authDomain?: string;
  messagingSenderId?: string;
}

/**
 * See
 * https://firebase.google.com/docs/reference/hosting/rest/v1beta1/projects.sites#Site
 */
interface Site {
  name: string;
  defaultUrl: string;
  appId?: string;
  labels?: Record<string, string>;
  type: "DEFAULT_SITE" | "USER_SITE" | "SITE_UNSPECIFIED";
}

interface ListSitesResponse {
  sites: Site[];
}

const apiClient = new Client({ urlPrefix: firebaseApiOrigin, auth: true, apiVersion: "v1beta1" });
const hostingApiClient = new Client({
  urlPrefix: hostingApiOrigin,
  auth: true,
  apiVersion: "v1beta1",
});

const CONFIGSTORE_KEY = "webconfig";

function setCachedWebSetup(projectId: string, config: WebConfig): void {
  const allConfigs = configstore.get(CONFIGSTORE_KEY) || {};
  allConfigs[projectId] = config;
  configstore.set(CONFIGSTORE_KEY, allConfigs);
}

/**
 * Get the last known WebConfig from the cache.
 * @param options CLI options.
 * @return web app configuration, or undefined.
 */
export function getCachedWebSetup(options: any): WebConfig | undefined {
  const projectId = getProjectId(options, false);
  const allConfigs = configstore.get(CONFIGSTORE_KEY) || {};
  return allConfigs[projectId];
}

/**
 * TODO: deprecate this function in favor of `getAppConfig()` in `/src/management/apps.ts`
 * @param options CLI options.
 * @return web app configuration.
 */
export async function fetchWebSetup(options: any): Promise<WebConfig> {
  const projectId = getProjectId(options, false);

  // Try to determine the appId from the default Hosting site, if it is linked.
  let hostingAppId: string | undefined = undefined;
  try {
    const sites = await hostingApiClient.get<ListSitesResponse>(`/projects/${projectId}/sites`);
    const defaultSite = sites.body.sites.find((s) => s.type === "DEFAULT_SITE");
    if (defaultSite && defaultSite.appId) {
      hostingAppId = defaultSite.appId;
    }
  } catch (e) {
    logger.debug("Failed to list hosting sites");
    logger.debug(e);
  }

  // Get the web app config for the appId, or use the '-' special value if the appId is not known
  const appId = hostingAppId || "-";
  const res = await apiClient.get<WebConfig>(`/projects/${projectId}/webApps/${appId}/config`);
  const config = res.body;

  if (!config.appId && hostingAppId) {
    config.appId = hostingAppId;
  }

  setCachedWebSetup(config.projectId, config);
  return config;
}
