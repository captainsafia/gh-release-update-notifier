import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { CacheData, GitHubReleaseResponse, Release, ReleaseNotifierConfig, VersionCheckResult } from './types';

export type { CacheData, GitHubReleaseResponse, Release, ReleaseNotifierConfig, VersionCheckResult } from './types';

export class ReleaseNotifier {
  private readonly repo: string;
  private readonly checkInterval: number;
  private readonly cacheFilePath: string | null;
  private readonly token: string | null;
  private cachedReleases: GitHubReleaseResponse[] | null = null;
  private lastFetchTime: number = 0;

  constructor(config: ReleaseNotifierConfig) {
    this.repo = config.repo;
    this.checkInterval = config.checkInterval ?? 3600000; // Default: 1 hour
    this.cacheFilePath = config.cacheFilePath ?? null;
    this.token = config.token ?? null;

    // Load cache from disk if available
    this.loadCacheFromDisk();
  }

  /**
   * Fetches the most recent release from GitHub
   * @param includePrerelease When true, includes prereleases in the search
   * @returns The latest release or null if no releases found
   */
  async getLatestRelease(includePrerelease: boolean = false): Promise<Release | null> {
    try {
      const releases = await this.fetchAllReleases();

      // Filter out drafts and optionally prereleases
      const validReleases = releases.filter(release => {
        if (release.draft) return false;
        if (!includePrerelease && release.prerelease) return false;
        return true;
      });

      if (validReleases.length === 0) {
        return null;
      }

      // Return the first (most recent) valid release
      const latest = validReleases[0];
      return {
        tagName: latest.tag_name,
        name: latest.name,
        prerelease: latest.prerelease,
        draft: latest.draft,
        htmlUrl: latest.html_url,
        publishedAt: latest.published_at,
      };
    }
    catch (error) {
      throw new Error(`Failed to fetch releases: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Fetches the most recent prerelease from GitHub
   * @returns The latest prerelease or null if no prereleases found
   */
  async getLatestPrerelease(): Promise<Release | null> {
    try {
      const releases = await this.fetchAllReleases();

      // Find the first non-draft prerelease
      const prerelease = releases.find(release => release.prerelease && !release.draft);

      if (!prerelease) {
        return null;
      }

      return {
        tagName: prerelease.tag_name,
        name: prerelease.name,
        prerelease: prerelease.prerelease,
        draft: prerelease.draft,
        htmlUrl: prerelease.html_url,
        publishedAt: prerelease.published_at,
      };
    }
    catch (error) {
      throw new Error(`Failed to fetch prereleases: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Checks if the provided version is older than the latest available version
   * Uses the release publish date from GitHub API for comparison
   * @param currentVersion The version/tag to check (e.g., "1.2.3" or "v1.2.3")
   * @param isPrerelease When true, checks against the latest prerelease; otherwise checks against the latest stable release
   * @returns Version check result with update availability information
   */
  async checkVersion(currentVersion: string, isPrerelease: boolean = false): Promise<VersionCheckResult> {
    try {
      const releases = await this.fetchAllReleases();

      if (releases.length === 0) {
        return {
          updateAvailable: false,
          currentVersion,
          latestVersion: null,
          latestRelease: null,
        };
      }

      // Find the current release by tag name
      const normalizedCurrent = this.normalizeVersion(currentVersion);
      const currentRelease = releases.find(r =>
        this.normalizeVersion(r.tag_name) === normalizedCurrent ||
        r.tag_name === currentVersion
      );

      // Get the latest release based on isPrerelease flag
      const latestRelease = isPrerelease
        ? releases.find(r => r.prerelease && !r.draft)
        : releases.find(r => !r.prerelease && !r.draft);

      if (!latestRelease) {
        return {
          updateAvailable: false,
          currentVersion,
          latestVersion: null,
          latestRelease: null,
        };
      }

      const latest: Release = {
        tagName: latestRelease.tag_name,
        name: latestRelease.name,
        prerelease: latestRelease.prerelease,
        draft: latestRelease.draft,
        htmlUrl: latestRelease.html_url,
        publishedAt: latestRelease.published_at,
      };

      // If current release not found in releases, assume update is available
      if (!currentRelease) {
        return {
          updateAvailable: true,
          currentVersion,
          latestVersion: latestRelease.tag_name,
          latestRelease: latest,
        };
      }

      // Compare by publish date
      const updateAvailable = this.isVersionOlder(currentRelease.published_at, latestRelease.published_at);

      return {
        updateAvailable,
        currentVersion,
        latestVersion: latestRelease.tag_name,
        latestRelease: latest,
      };
    }
    catch (error) {
      throw new Error(`Failed to check version: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Fetches all releases from GitHub, sorted by published date (most recent first)
   * Uses cached data if available and within the check interval
   */
  private async fetchAllReleases(): Promise<GitHubReleaseResponse[]> {
    const now = Date.now();
    
    // Return cached data if still valid
    if (
      this.cachedReleases !== null &&
      this.checkInterval > 0 &&
      (now - this.lastFetchTime) < this.checkInterval
    ) {
      return this.cachedReleases;
    }

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(
      `https://api.github.com/repos/${this.repo}/releases`,
      { headers },
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const releases = await response.json() as GitHubReleaseResponse[];

    // Sort releases by published_at in descending order (most recent first)
    releases.sort((a, b) => 
      new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
    );

    // Cache the results in memory and on disk
    this.cachedReleases = releases;
    this.lastFetchTime = now;
    this.saveCacheToDisk();

    return releases;
  }

  /**
   * Clears the cached releases, forcing the next fetch to get fresh data
   * Also removes the cache file from disk if it exists
   */
  clearCache(): void {
    this.cachedReleases = null;
    this.lastFetchTime = 0;
    this.saveCacheToDisk();
  }

  /**
   * Loads the cache from disk if a cache file path is configured
   */
  private loadCacheFromDisk(): void {
    if (!this.cacheFilePath) return;

    try {
      if (existsSync(this.cacheFilePath)) {
        const data = readFileSync(this.cacheFilePath, 'utf-8');
        const cache: CacheData = JSON.parse(data);
        this.cachedReleases = cache.releases;
        this.lastFetchTime = cache.lastFetchTime;
      }
    }
    catch {
      // If we can't read the cache, just start fresh
      this.cachedReleases = null;
      this.lastFetchTime = 0;
    }
  }

  /**
   * Saves the current cache to disk if a cache file path is configured
   */
  private saveCacheToDisk(): void {
    if (!this.cacheFilePath) return;

    try {
      if (this.cachedReleases === null) {
        // If cache is cleared, write empty state
        const cache: CacheData = {
          lastFetchTime: 0,
          releases: [],
        };
        writeFileSync(this.cacheFilePath, JSON.stringify(cache), 'utf-8');
      }
      else {
        const cache: CacheData = {
          lastFetchTime: this.lastFetchTime,
          releases: this.cachedReleases,
        };
        writeFileSync(this.cacheFilePath, JSON.stringify(cache), 'utf-8');
      }
    }
    catch {
      // Silently fail if we can't write to disk
    }
  }

  /**
   * Normalizes a version string by removing 'v' prefix and cleaning whitespace
   */
  private normalizeVersion(version: string): string {
    return version.trim().replace(/^v/i, '');
  }

  /**
   * Compares two release dates and determines if the first is older than the second
   * @param date1 First date to compare (ISO 8601 string)
   * @param date2 Second date to compare (ISO 8601 string)
   * @returns true if date1 is older than date2
   */
  private isVersionOlder(date1: string, date2: string): boolean {
    return new Date(date1).getTime() < new Date(date2).getTime();
  }
}
