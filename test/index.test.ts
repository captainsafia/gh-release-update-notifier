import { existsSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReleaseNotifier } from '../src/index';

// Mock GitHub API responses - intentionally NOT in chronological order
// to test that the code properly sorts by published_at
const mockReleases = [
  {
    tag_name: 'v1.5.0',
    name: 'Release 1.5.0',
    prerelease: false,
    draft: false,
    html_url: 'https://github.com/test/repo/releases/tag/v1.5.0',
    published_at: '2024-01-01T00:00:00Z',
  },
  {
    tag_name: 'v2.0.0',
    name: 'Release 2.0.0',
    prerelease: false,
    draft: false,
    html_url: 'https://github.com/test/repo/releases/tag/v2.0.0',
    published_at: '2024-01-03T00:00:00Z',
  },
  {
    tag_name: 'v1.4.0',
    name: 'Draft Release',
    prerelease: false,
    draft: true,
    html_url: 'https://github.com/test/repo/releases/tag/v1.4.0',
    published_at: '2023-12-31T00:00:00Z',
  },
  {
    tag_name: 'v2.0.0-beta.1',
    name: 'Beta Release 2.0.0-beta.1',
    prerelease: true,
    draft: false,
    html_url: 'https://github.com/test/repo/releases/tag/v2.0.0-beta.1',
    published_at: '2024-01-02T00:00:00Z',
  },
];

describe('ReleaseNotifier', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with repo config', () => {
      const notifier = new ReleaseNotifier({ repo: 'test/repo' });
      expect(notifier).toBeInstanceOf(ReleaseNotifier);
    });

    it('should accept checkInterval option', () => {
      const notifier = new ReleaseNotifier({ 
        repo: 'test/repo',
        checkInterval: 60000,
      });
      expect(notifier).toBeInstanceOf(ReleaseNotifier);
    });

    it('should accept cacheFilePath option', () => {
      const notifier = new ReleaseNotifier({ 
        repo: 'test/repo',
        cacheFilePath: '/tmp/test-cache.json',
      });
      expect(notifier).toBeInstanceOf(ReleaseNotifier);
    });
  });

  describe('getLatestRelease', () => {
    it('should fetch and return the latest stable release', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockReleases,
      });

      const notifier = new ReleaseNotifier({ repo: 'test/repo' });
      const release = await notifier.getLatestRelease();

      expect(release).toEqual({
        tagName: 'v2.0.0',
        name: 'Release 2.0.0',
        prerelease: false,
        draft: false,
        htmlUrl: 'https://github.com/test/repo/releases/tag/v2.0.0',
        publishedAt: '2024-01-03T00:00:00Z',
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test/repo/releases',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept': 'application/vnd.github+json',
          }),
        }),
      );
    });

    it('should include prereleases when explicitly requested', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockReleases,
      });

      const notifier = new ReleaseNotifier({ repo: 'test/repo' });
      const release = await notifier.getLatestRelease(true);

      // When including prereleases, v2.0.0 is still the latest by date
      expect(release?.tagName).toBe('v2.0.0');
    });

    it('should filter out draft releases', async () => {
      const releasesWithDraft = [
        {
          tag_name: 'v3.0.0',
          name: 'Draft 3.0.0',
          prerelease: false,
          draft: true,
          html_url: 'https://github.com/test/repo/releases/tag/v3.0.0',
          published_at: '2024-01-04T00:00:00Z',
        },
        ...mockReleases,
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => releasesWithDraft,
      });

      const notifier = new ReleaseNotifier({ repo: 'test/repo' });
      const release = await notifier.getLatestRelease();

      expect(release?.tagName).toBe('v2.0.0');
    });

    it('should return null when no releases found', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      const notifier = new ReleaseNotifier({ repo: 'test/repo' });
      const release = await notifier.getLatestRelease();

      expect(release).toBeNull();
    });

    it('should handle GitHub API errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const notifier = new ReleaseNotifier({ repo: 'test/repo' });
      
      await expect(notifier.getLatestRelease()).rejects.toThrow('GitHub API error: 404 Not Found');
    });

    it('should handle network errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const notifier = new ReleaseNotifier({ repo: 'test/repo' });
      
      await expect(notifier.getLatestRelease()).rejects.toThrow('Failed to fetch releases: Network error');
    });
  });

  describe('getLatestPrerelease', () => {
    it('should fetch and return the latest prerelease', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockReleases,
      });

      const notifier = new ReleaseNotifier({ repo: 'test/repo' });
      const release = await notifier.getLatestPrerelease();

      expect(release).toEqual({
        tagName: 'v2.0.0-beta.1',
        name: 'Beta Release 2.0.0-beta.1',
        prerelease: true,
        draft: false,
        htmlUrl: 'https://github.com/test/repo/releases/tag/v2.0.0-beta.1',
        publishedAt: '2024-01-02T00:00:00Z',
      });
    });

    it('should filter out draft prereleases', async () => {
      const releasesWithDraftPre = [
        {
          tag_name: 'v3.0.0-alpha.1',
          name: 'Draft Alpha',
          prerelease: true,
          draft: true,
          html_url: 'https://github.com/test/repo/releases/tag/v3.0.0-alpha.1',
          published_at: '2024-01-05T00:00:00Z',
        },
        ...mockReleases,
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => releasesWithDraftPre,
      });

      const notifier = new ReleaseNotifier({ repo: 'test/repo' });
      const release = await notifier.getLatestPrerelease();

      expect(release?.tagName).toBe('v2.0.0-beta.1');
    });

    it('should return null when no prereleases found', async () => {
      const stableOnlyReleases = mockReleases.filter(r => !r.prerelease);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => stableOnlyReleases,
      });

      const notifier = new ReleaseNotifier({ repo: 'test/repo' });
      const release = await notifier.getLatestPrerelease();

      expect(release).toBeNull();
    });

    it('should handle GitHub API errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      const notifier = new ReleaseNotifier({ repo: 'test/repo' });
      
      await expect(notifier.getLatestPrerelease()).rejects.toThrow('GitHub API error: 403 Forbidden');
    });
  });

  describe('checkVersion', () => {
    beforeEach(() => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockReleases,
      });
    });

    it('should detect when update is available based on publish date', async () => {
      const notifier = new ReleaseNotifier({ repo: 'test/repo', checkInterval: 0 });
      const result = await notifier.checkVersion('v1.5.0');

      expect(result.updateAvailable).toBe(true);
      expect(result.currentVersion).toBe('v1.5.0');
      expect(result.latestVersion).toBe('v2.0.0');
      expect(result.latestRelease).toBeDefined();
      expect(result.latestRelease?.tagName).toBe('v2.0.0');
    });

    it('should detect when version is up to date', async () => {
      const notifier = new ReleaseNotifier({ repo: 'test/repo', checkInterval: 0 });
      const result = await notifier.checkVersion('v2.0.0');

      expect(result.updateAvailable).toBe(false);
      expect(result.currentVersion).toBe('v2.0.0');
      expect(result.latestVersion).toBe('v2.0.0');
    });

    it('should handle versions with v prefix', async () => {
      const notifier = new ReleaseNotifier({ repo: 'test/repo', checkInterval: 0 });
      const result = await notifier.checkVersion('v1.5.0');

      expect(result.updateAvailable).toBe(true);
      expect(result.currentVersion).toBe('v1.5.0');
    });

    it('should check against prereleases when isPrerelease is true', async () => {
      const notifier = new ReleaseNotifier({ repo: 'test/repo', checkInterval: 0 });
      const result = await notifier.checkVersion('v2.0.0-beta.1', true);

      expect(result.updateAvailable).toBe(false);
      expect(result.latestVersion).toBe('v2.0.0-beta.1');
    });

    it('should detect prerelease update available', async () => {
      const notifier = new ReleaseNotifier({ repo: 'test/repo', checkInterval: 0 });
      const result = await notifier.checkVersion('v1.5.0', true);

      expect(result.updateAvailable).toBe(true);
      expect(result.latestVersion).toBe('v2.0.0-beta.1');
    });

    it('should return no update available when version not found in releases', async () => {
      const notifier = new ReleaseNotifier({ repo: 'test/repo', checkInterval: 0 });
      const result = await notifier.checkVersion('v0.0.1');

      expect(result.updateAvailable).toBe(false);
      expect(result.latestVersion).toBe('v2.0.0');
    });

    it('should handle when no releases exist', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      const notifier = new ReleaseNotifier({ repo: 'test/repo', checkInterval: 0 });
      const result = await notifier.checkVersion('1.0.0');

      expect(result.updateAvailable).toBe(false);
      expect(result.latestVersion).toBeNull();
      expect(result.latestRelease).toBeNull();
    });
  });

  describe('caching', () => {
    it('should use cached data within check interval', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockReleases,
      });

      const notifier = new ReleaseNotifier({ 
        repo: 'test/repo',
        checkInterval: 60000, // 1 minute
      });

      // First call should fetch
      await notifier.getLatestRelease();
      expect(fetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await notifier.getLatestRelease();
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should fetch fresh data when checkInterval is 0', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockReleases,
      });

      const notifier = new ReleaseNotifier({ 
        repo: 'test/repo',
        checkInterval: 0,
      });

      await notifier.getLatestRelease();
      await notifier.getLatestRelease();
      
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should clear cache when clearCache is called', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockReleases,
      });

      const notifier = new ReleaseNotifier({ 
        repo: 'test/repo',
        checkInterval: 60000,
      });

      await notifier.getLatestRelease();
      expect(fetch).toHaveBeenCalledTimes(1);

      notifier.clearCache();

      await notifier.getLatestRelease();
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('disk caching', () => {
    let cacheFilePath: string;

    beforeEach(() => {
      cacheFilePath = join(tmpdir(), `test-cache-${Date.now()}.json`);
    });

    afterEach(() => {
      if (existsSync(cacheFilePath)) {
        rmSync(cacheFilePath);
      }
    });

    it('should save cache to disk', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockReleases,
      });

      const notifier = new ReleaseNotifier({ 
        repo: 'test/repo',
        checkInterval: 60000,
        cacheFilePath,
      });

      await notifier.getLatestRelease();

      expect(existsSync(cacheFilePath)).toBe(true);
      
      const cacheContent = JSON.parse(readFileSync(cacheFilePath, 'utf-8'));
      expect(cacheContent.releases).toHaveLength(4);
      expect(cacheContent.lastFetchTime).toBeGreaterThan(0);
    });

    it('should load cache from disk on construction', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockReleases,
      });

      // First notifier saves cache
      const notifier1 = new ReleaseNotifier({ 
        repo: 'test/repo',
        checkInterval: 60000,
        cacheFilePath,
      });
      await notifier1.getLatestRelease();
      expect(fetch).toHaveBeenCalledTimes(1);

      // Second notifier should load from disk and not fetch
      const notifier2 = new ReleaseNotifier({ 
        repo: 'test/repo',
        checkInterval: 60000,
        cacheFilePath,
      });
      await notifier2.getLatestRelease();
      expect(fetch).toHaveBeenCalledTimes(1); // Still 1, no new fetch
    });

    it('should clear disk cache when clearCache is called', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockReleases,
      });

      const notifier = new ReleaseNotifier({ 
        repo: 'test/repo',
        checkInterval: 60000,
        cacheFilePath,
      });

      await notifier.getLatestRelease();
      expect(existsSync(cacheFilePath)).toBe(true);

      notifier.clearCache();

      const cacheContent = JSON.parse(readFileSync(cacheFilePath, 'utf-8'));
      expect(cacheContent.releases).toHaveLength(0);
      expect(cacheContent.lastFetchTime).toBe(0);
    });
  });
});
