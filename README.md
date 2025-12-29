# gh-release-update-notifier

A lightweight TypeScript library for checking GitHub Releases to notify CLI users of available updates, with built-in caching and disk persistence.

## Installation

```bash
npm install gh-release-update-notifier
```

```bash
pnpm add gh-release-update-notifier
```

```bash
yarn add gh-release-update-notifier
```

## Usage

### Basic Usage

```typescript
import { ReleaseNotifier } from 'gh-release-update-notifier';

const notifier = new ReleaseNotifier({
  repo: 'owner/repo',
});

// Check if an update is available
const result = await notifier.checkVersion('1.0.0');

if (result.updateAvailable) {
  console.log(`Update available: ${result.latestVersion}`);
  console.log(`Download: ${result.latestRelease?.htmlUrl}`);
}
```

### Get Latest Release

```typescript
const notifier = new ReleaseNotifier({ repo: 'owner/repo' });

// Get the latest stable release
const stable = await notifier.getLatestRelease();
console.log(`Latest stable: ${stable?.tagName}`);

// Include prereleases in the search
const latest = await notifier.getLatestRelease(true);
console.log(`Latest (including prereleases): ${latest?.tagName}`);
```

### Get Latest Prerelease

```typescript
const notifier = new ReleaseNotifier({ repo: 'owner/repo' });

const prerelease = await notifier.getLatestPrerelease();
if (prerelease) {
  console.log(`Latest prerelease: ${prerelease.tagName}`);
}
```

### Check Version with Prereleases

```typescript
const notifier = new ReleaseNotifier({ repo: 'owner/repo' });

// Check against the latest prerelease
const result = await notifier.checkVersion('2.0.0-beta.1', true);

if (result.updateAvailable) {
  console.log(`New prerelease available: ${result.latestVersion}`);
}
```

### Caching Configuration

```typescript
const notifier = new ReleaseNotifier({
  repo: 'owner/repo',
  // Check interval in milliseconds (default: 1 hour)
  checkInterval: 3600000,
  // Optional: persist cache to disk
  cacheFilePath: '/path/to/cache.json',
});

// Clear the cache manually
notifier.clearCache();
```

## API Reference

### `ReleaseNotifier`

#### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `repo` | `string` | **required** | GitHub repository in `owner/repo` format |
| `checkInterval` | `number` | `3600000` (1 hour) | Minimum time between API requests (in ms). Set to `0` to disable caching. |
| `cacheFilePath` | `string` | `undefined` | Path to persist cache on disk |

#### Methods

##### `getLatestRelease(includePrerelease?: boolean): Promise<Release | null>`

Fetches the most recent release from GitHub.

- `includePrerelease` - When `true`, includes prereleases in the search (default: `false`)
- Returns the latest release or `null` if no releases found

##### `getLatestPrerelease(): Promise<Release | null>`

Fetches the most recent prerelease from GitHub.

- Returns the latest prerelease or `null` if no prereleases found

##### `checkVersion(currentVersion: string, isPrerelease?: boolean): Promise<VersionCheckResult>`

Checks if the provided version is older than the latest available version.

- `currentVersion` - The version/tag to check (e.g., `"1.2.3"` or `"v1.2.3"`)
- `isPrerelease` - When `true`, checks against the latest prerelease (default: `false`)
- Returns version check result with update availability information

##### `clearCache(): void`

Clears the cached releases, forcing the next fetch to get fresh data. Also removes the cache file from disk if configured.

### Types

#### `Release`

```typescript
interface Release {
  tagName: string;
  name: string;
  prerelease: boolean;
  draft: boolean;
  htmlUrl: string;
  publishedAt: string;
}
```

#### `VersionCheckResult`

```typescript
interface VersionCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string | null;
  latestRelease: Release | null;
}
```

#### `ReleaseNotifierConfig`

```typescript
interface ReleaseNotifierConfig {
  repo: string;
  checkInterval?: number;
  cacheFilePath?: string;
}
```

## CLI Integration Example

```typescript
import { ReleaseNotifier } from 'gh-release-update-notifier';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

const notifier = new ReleaseNotifier({
  repo: 'your-org/your-cli',
  checkInterval: 86400000, // Check once per day
  cacheFilePath: `${process.env.HOME}/.your-cli/update-cache.json`,
});

async function checkForUpdates() {
  try {
    const result = await notifier.checkVersion(pkg.version);
    
    if (result.updateAvailable) {
      console.log(`\n📦 Update available: ${pkg.version} → ${result.latestVersion}`);
      console.log(`   Run: npm install -g your-cli`);
      console.log(`   Or visit: ${result.latestRelease?.htmlUrl}\n`);
    }
  } catch {
    // Silently fail - don't block the CLI for update checks
  }
}

// Run update check in the background
checkForUpdates();
```