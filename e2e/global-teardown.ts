/**
 * Global teardown for FORGE E2E tests.
 *
 * With FORGE's zero-config database (FORGE_ENV=test), cleanup is automatic:
 * - Embedded PostgreSQL uses ephemeral storage
 * - Data directory is removed when the runtime stops
 *
 * No manual cleanup required!
 */
async function globalTeardown(): Promise<void> {
  console.log('\n[E2E] Global teardown...');
  console.log('[E2E] Ephemeral database will auto-cleanup when runtime stops');
  console.log('[E2E] Done\n');
}

export default globalTeardown;
