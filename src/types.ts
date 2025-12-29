export interface ReleaseNotifierConfig {
  repo: string;
  checkInterval?: number;
  cacheFilePath?: string;
}

export interface Release {
  version: string;
  url: string;
  publishedAt: string;
}

export interface VersionCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string | null;
  latestUrl: string | null;
}

export interface GitHubReleaseResponse {
  tag_name: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
}

export interface CacheData {
  releases: GitHubReleaseResponse[];
  timestamp: number;
}
