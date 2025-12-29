export interface ReleaseNotifierConfig {
  repo: string;
  checkInterval?: number;
  cacheFilePath?: string;
}

export interface Release {
  tagName: string;
  name: string;
  prerelease: boolean;
  draft: boolean;
  htmlUrl: string;
  publishedAt: string;
}

export interface VersionCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string | null;
  latestRelease: Release | null;
}

export interface GitHubReleaseResponse {
  tag_name: string;
  name: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
}

export interface CacheData {
  releases: GitHubReleaseResponse[];
  lastFetchTime: number;
}
