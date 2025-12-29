export interface ReleaseNotifierConfig {
  repo: string;
  checkInterval?: number;
  cacheFilePath?: string;
  token?: string;
}

export interface Release {
  tagName: string;
  name: string | null;
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
  name: string | null;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
}

export interface CacheData {
  releases: GitHubReleaseResponse[];
  lastFetchTime: number;
}
