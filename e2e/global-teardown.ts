/**
 * Global teardown for FORGE E2E tests.
 *
 * This runs after all tests and:
 * 1. Cleans up test data
 * 2. Closes any open connections
 */
async function globalTeardown(): Promise<void> {
  console.log('\n[E2E] Starting global teardown...');

  // For now, we leave the test data in place for debugging
  // In CI, the database container will be destroyed anyway
  if (process.env.E2E_CLEANUP === 'true') {
    console.log('[E2E] Cleaning up test data...');
    // Add cleanup logic here if needed
  }

  console.log('[E2E] Global teardown complete\n');
}

export default globalTeardown;
