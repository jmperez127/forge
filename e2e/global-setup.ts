import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Global setup for FORGE E2E tests.
 *
 * This runs before all tests and:
 * 1. Builds the runtime binary if needed
 * 2. Sets up the test database
 * 3. Runs migrations
 * 4. Seeds test data
 */
async function globalSetup(): Promise<void> {
  console.log('\n[E2E] Starting global setup...');

  const rootDir = resolve(__dirname, '..');
  const helpdeskDir = resolve(rootDir, 'projects/helpdesk');
  const binDir = resolve(rootDir, 'bin');
  const runtimeBinary = resolve(binDir, 'forge-runtime');

  // Build runtime if not exists
  if (!existsSync(runtimeBinary)) {
    console.log('[E2E] Building runtime binary...');
    execSync('go build -o ../bin/forge-runtime ./cmd/forge-runtime', {
      cwd: resolve(rootDir, 'runtime'),
      stdio: 'inherit',
    });
  }

  // Check for test database
  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgres://forge:forge@localhost:5432/forge_test?sslmode=disable';

  console.log('[E2E] Database URL:', databaseUrl.replace(/:[^:@]+@/, ':***@'));

  // Run migrations
  console.log('[E2E] Running database migrations...');
  try {
    const schemaPath = resolve(helpdeskDir, '.forge-runtime/schema.sql');
    if (existsSync(schemaPath)) {
      // For simplicity, use psql to run the schema
      // In production, you'd use a proper migration tool
      execSync(`psql "${databaseUrl}" -f "${schemaPath}"`, {
        stdio: 'pipe',
        env: { ...process.env, PGPASSWORD: 'forge' },
      });
      console.log('[E2E] Migrations applied successfully');
    } else {
      console.log('[E2E] No schema.sql found, skipping migrations');
    }
  } catch (error) {
    // Migrations might fail if tables already exist, which is fine
    console.log('[E2E] Migration note: tables may already exist');
  }

  // Seed test data
  console.log('[E2E] Seeding test data...');
  try {
    await seedTestData(databaseUrl);
    console.log('[E2E] Test data seeded successfully');
  } catch (error) {
    console.log('[E2E] Seed note:', (error as Error).message);
  }

  console.log('[E2E] Global setup complete\n');
}

async function seedTestData(databaseUrl: string): Promise<void> {
  // Create test users and organization
  const seedSQL = `
    -- Clean existing test data
    DELETE FROM comments WHERE TRUE;
    DELETE FROM tickets WHERE TRUE;
    DELETE FROM organizations WHERE TRUE;
    DELETE FROM users WHERE TRUE;

    -- Create test users
    INSERT INTO users (id, email, name, role, avatar_url)
    VALUES
      ('11111111-1111-1111-1111-111111111111', 'admin@test.com', 'Admin User', 'admin', 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin'),
      ('22222222-2222-2222-2222-222222222222', 'agent@test.com', 'Agent User', 'agent', 'https://api.dicebear.com/7.x/avataaars/svg?seed=agent'),
      ('33333333-3333-3333-3333-333333333333', 'customer@test.com', 'Customer User', 'customer', 'https://api.dicebear.com/7.x/avataaars/svg?seed=customer')
    ON CONFLICT (id) DO NOTHING;

    -- Create test organization
    INSERT INTO organizations (id, name, slug, plan, owner_id, members_id)
    VALUES
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Org', 'test-org', 'pro', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
    ON CONFLICT (id) DO NOTHING;
  `;

  execSync(`psql "${databaseUrl}" -c "${seedSQL.replace(/\n/g, ' ')}"`, {
    stdio: 'pipe',
    env: { ...process.env, PGPASSWORD: 'forge' },
  });
}

export default globalSetup;
