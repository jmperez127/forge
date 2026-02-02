# FORGE E2E Tests

End-to-end tests for the FORGE platform using Playwright.

## Prerequisites

1. **PostgreSQL database** - Tests require a running PostgreSQL instance:
   ```bash
   # Using Docker
   docker run -d --name forge-test-db \
     -e POSTGRES_USER=forge \
     -e POSTGRES_PASSWORD=forge \
     -e POSTGRES_DB=forge_test \
     -p 5432:5432 \
     postgres:16
   ```

2. **Runtime binary** - Build the FORGE runtime:
   ```bash
   cd runtime && go build -o ../bin/forge-runtime ./cmd/forge-runtime
   ```

3. **SDK packages** - Build the TypeScript SDKs:
   ```bash
   npm run build:sdk
   ```

4. **Playwright browsers** - Install browser binaries:
   ```bash
   cd e2e && npx playwright install
   ```

## Running Tests

```bash
# Run all tests
npm run e2e

# Run with UI
npm run e2e:ui

# Run in debug mode
npm run e2e:debug

# Run headed (visible browser)
npm run e2e:headed

# Run specific test file
npx playwright test tests/smoke.spec.ts

# Run specific test
npx playwright test -g "displays empty state"
```

## Test Structure

```
e2e/
├── playwright.config.ts    # Playwright configuration
├── global-setup.ts         # Database and server setup
├── global-teardown.ts      # Cleanup
├── fixtures/
│   ├── auth.ts             # Authentication helpers
│   └── db.ts               # Database helpers
└── tests/
    ├── smoke.spec.ts       # Basic connectivity tests
    └── helpdesk.spec.ts    # Full helpdesk flow tests
```

## Test Categories

### Smoke Tests (`smoke.spec.ts`)
- Frontend loads correctly
- Backend health endpoint responds
- API views are accessible
- Debug endpoints work

### Helpdesk Tests (`helpdesk.spec.ts`)
- **Ticket List**: Empty state, list display, navigation
- **Create Ticket**: Form validation, submission, redirect
- **Ticket Detail**: Information display, comments, status
- **Add Comment**: Posting, internal notes, form clearing
- **Close Ticket**: Status update, UI changes
- **Access Control**: Role-based visibility (skipped pending implementation)
- **Real-time Updates**: WebSocket subscriptions (skipped pending implementation)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgres://forge:forge@localhost:5432/forge_test?sslmode=disable` | Test database URL |
| `CI` | - | Set in CI environments for stricter settings |
| `E2E_CLEANUP` | `false` | Clean test data after run |

## CI Integration

For CI environments, tests run with:
- Single worker (sequential execution)
- 2 retries on failure
- HTML report generation

Example GitHub Actions workflow:

```yaml
- name: Run E2E Tests
  run: |
    npm run build:sdk
    npm run e2e
  env:
    DATABASE_URL: postgres://forge:forge@localhost:5432/forge_test?sslmode=disable
    CI: true
```

## Debugging

1. **Run with trace**:
   ```bash
   npx playwright test --trace on
   ```

2. **View test report**:
   ```bash
   npx playwright show-report
   ```

3. **Debug specific test**:
   ```bash
   npx playwright test -g "test name" --debug
   ```

## Writing Tests

### Authentication
```typescript
import { authenticateAs } from '../fixtures/auth';

test('authenticated user sees tickets', async ({ page }) => {
  await authenticateAs(page, 'customer');
  await page.goto('/');
  // ...
});
```

### Database Setup
```typescript
import { createTicket, cleanTickets } from '../fixtures/db';

test.beforeEach(async () => {
  cleanTickets();
});

test('displays ticket', async ({ page }) => {
  createTicket({ subject: 'Test ticket' });
  await page.goto('/');
  await expect(page.getByText('Test ticket')).toBeVisible();
});
```

### API Testing
```typescript
test('API returns data', async ({ request }) => {
  const response = await request.get('http://localhost:8080/api/views/TicketList');
  expect(response.ok()).toBeTruthy();
});
```
