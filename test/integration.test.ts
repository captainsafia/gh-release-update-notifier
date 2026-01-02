import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ReleaseNotifier } from '../src/index';
import type { Release } from '../src/types';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

describe('Integration Tests (captainsafia/burrow)', () => {
  let notifier: ReleaseNotifier;
  let cacheFilePath: string;

  // Fetched release data for comparison tests
  let latestStableRelease: Release | null = null;
  let latestPrerelease: Release | null = null;

  beforeAll(async () => {
    // Fetch real release data once for all tests
    const setupNotifier = new ReleaseNotifier({
      repo: 'captainsafia/burrow',
      checkInterval: 0,
      token: GITHUB_TOKEN,
    });
    latestStableRelease = await setupNotifier.getLatestRelease();
    latestPrerelease = await setupNotifier.getLatestPrerelease();
  });

  beforeEach(() => {
    cacheFilePath = join(tmpdir(), `integration-test-cache-${Date.now()}.json`);
    notifier = new ReleaseNotifier({
      repo: 'captainsafia/burrow',
      checkInterval: 0, // Disable caching for fresh data in tests
      token: GITHUB_TOKEN,
    });
  });

  afterEach(() => {
    if (existsSync(cacheFilePath)) {
      rmSync(cacheFilePath);
    }
  });

  describe('getLatestRelease', () => {
    it('should fetch the latest stable release from GitHub', async () => {
      const release = await notifier.getLatestRelease();

      expect(release).not.toBeNull();
      expect(release?.tagName).toBeDefined();
      expect(release?.name).toBeDefined();
      expect(release?.htmlUrl).toContain('github.com/captainsafia/burrow');
      expect(release?.publishedAt).toBeDefined();
      expect(release?.prerelease).toBe(false);
      expect(release?.draft).toBe(false);
    });

    it('should include prereleases when requested', async () => {
      const release = await notifier.getLatestRelease(true);

      expect(release).not.toBeNull();
      expect(release?.tagName).toBeDefined();
      expect(release?.htmlUrl).toContain('github.com/captainsafia/burrow');
    });
  });

  describe('getLatestPrerelease', () => {
    it('should fetch the latest prerelease from GitHub', async () => {
      const release = await notifier.getLatestPrerelease();

      // May be null if no prereleases exist
      if (release !== null) {
        expect(release.tagName).toBeDefined();
        expect(release.prerelease).toBe(true);
        expect(release.htmlUrl).toContain('github.com/captainsafia/burrow');
      }
    });
  });

  describe('checkVersion', () => {
    it('should detect no update when using the latest stable version', async () => {
      if (!latestStableRelease) {
        console.log('Skipping test: no stable releases found');
        return;
      }

      const result = await notifier.checkVersion(latestStableRelease.tagName);

      expect(result.currentVersion).toBe(latestStableRelease.tagName);
      expect(result.updateAvailable).toBe(false);
      expect(result.latestVersion).toBe(latestStableRelease.tagName);
    });

    it('should detect update available for older version tag', async () => {
      if (!latestStableRelease) {
        console.log('Skipping test: no stable releases found');
        return;
      }

      // Use an actual older stable version that exists in the repo
      // v1.1.0 is an older stable release compared to latest
      const result = await notifier.checkVersion('v1.1.0');

      expect(result.currentVersion).toBe('v1.1.0');
      expect(result.updateAvailable).toBe(true);
      expect(result.latestVersion).toBe(latestStableRelease.tagName);
      expect(result.latestRelease).not.toBeNull();
    });

    it('should check against prereleases when isPrerelease is true', async () => {
      if (!latestPrerelease) {
        console.log('Skipping test: no prereleases found');
        return;
      }

      const result = await notifier.checkVersion(latestPrerelease.tagName, true);

      expect(result.currentVersion).toBe(latestPrerelease.tagName);
      expect(result.updateAvailable).toBe(false);
      expect(result.latestVersion).toBe(latestPrerelease.tagName);
      expect(result.latestRelease?.prerelease).toBe(true);
    });

    it('should detect prerelease update when using older prerelease', async () => {
      if (!latestPrerelease) {
        console.log('Skipping test: no prereleases found');
        return;
      }

      // Use an actual older prerelease version that exists in the repo
      // v1.0.0-preview.83c5906 is an older prerelease compared to latest
      const result = await notifier.checkVersion('v1.0.0-preview.83c5906', true);

      expect(result.currentVersion).toBe('v1.0.0-preview.83c5906');
      expect(result.updateAvailable).toBe(true);
      expect(result.latestVersion).toBe(latestPrerelease.tagName);
    });

    it('should return consistent results for the same version', async () => {
      if (!latestStableRelease) {
        console.log('Skipping test: no stable releases found');
        return;
      }

      const result1 = await notifier.checkVersion(latestStableRelease.tagName);
      const result2 = await notifier.checkVersion(latestStableRelease.tagName);

      expect(result1.updateAvailable).toBe(result2.updateAvailable);
      expect(result1.latestVersion).toBe(result2.latestVersion);
    });
  });

  describe('caching with disk persistence', () => {
    it('should persist cache to disk and reload on new instance', async () => {
      const notifierWithCache = new ReleaseNotifier({
        repo: 'captainsafia/burrow',
        checkInterval: 3600000, // 1 hour
        cacheFilePath,
        token: GITHUB_TOKEN,
      });

      // First fetch - should hit the API
      const release1 = await notifierWithCache.getLatestRelease();
      expect(release1).not.toBeNull();
      expect(existsSync(cacheFilePath)).toBe(true);

      // Create new instance - should load from disk cache
      const notifierWithCache2 = new ReleaseNotifier({
        repo: 'captainsafia/burrow',
        checkInterval: 3600000,
        cacheFilePath,
        token: GITHUB_TOKEN,
      });

      const release2 = await notifierWithCache2.getLatestRelease();
      expect(release2).not.toBeNull();
      expect(release2?.tagName).toBe(release1?.tagName);
    });

    it('should clear cache and fetch fresh data', async () => {
      const notifierWithCache = new ReleaseNotifier({
        repo: 'captainsafia/burrow',
        checkInterval: 3600000,
        cacheFilePath,
        token: GITHUB_TOKEN,
      });

      await notifierWithCache.getLatestRelease();
      notifierWithCache.clearCache();

      // After clearing, next fetch should get fresh data
      const release = await notifierWithCache.getLatestRelease();
      expect(release).not.toBeNull();
    });
  });

  describe('error handling', () => {
    it('should throw error for non-existent repository', async () => {
      const badNotifier = new ReleaseNotifier({
        repo: 'captainsafia/this-repo-does-not-exist-12345',
        checkInterval: 0,
        token: GITHUB_TOKEN,
      });

      await expect(badNotifier.getLatestRelease()).rejects.toThrow('GitHub API error');
    });
  });
});
