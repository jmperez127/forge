import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Global setup for FORGE E2E tests.
 *
 * With FORGE's zero-config database, this setup is minimal:
 * 1. Builds the runtime binary if needed
 * 2. That's it! The runtime handles everything else.
 *
 * The runtime with FORGE_ENV=test will:
 * - Start embedded PostgreSQL automatically
 * - Apply migrations from the artifact
 * - Use ephemeral storage (auto-cleanup)
 *
 * No external database setup required!
 */
async function globalSetup(): Promise<void> {
  console.log('\n[E2E] Starting global setup...');

  const rootDir = resolve(__dirname, '..');
  const binDir = resolve(rootDir, 'bin');
  const runtimeBinary = resolve(binDir, 'forge-runtime');

  // Build runtime if not exists
  if (!existsSync(runtimeBinary)) {
    console.log('[E2E] Building runtime binary...');
    execSync('go build -o ../bin/forge-runtime ./cmd/forge-runtime', {
      cwd: resolve(rootDir, 'runtime'),
      stdio: 'inherit',
    });
    console.log('[E2E] Runtime binary built successfully');
  } else {
    console.log('[E2E] Runtime binary exists');
  }

  // Verify artifact exists
  const artifactPath = resolve(rootDir, 'projects/helpdesk/.forge-runtime/artifact.json');
  if (!existsSync(artifactPath)) {
    console.log('[E2E] Building helpdesk artifact...');
    execSync('../../../bin/forge build', {
      cwd: resolve(rootDir, 'projects/helpdesk/spec'),
      stdio: 'inherit',
    });
    console.log('[E2E] Artifact built successfully');
  } else {
    console.log('[E2E] Artifact exists');
  }

  console.log('[E2E] Global setup complete');
  console.log('[E2E] The runtime will automatically:');
  console.log('[E2E]   - Start embedded PostgreSQL');
  console.log('[E2E]   - Apply migrations from artifact');
  console.log('[E2E]   - Use ephemeral storage (FORGE_ENV=test)');
  console.log('');
}

export default globalSetup;
