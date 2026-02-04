import { test, expect } from '@playwright/test'

// Test user credentials
const TEST_USER = {
  email: `test-${Date.now()}@endeavor.app`,
  password: 'testpassword123',
  name: 'Test User',
}

test.describe('Authentication', () => {
  test('should show landing page when not logged in', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Projects are not tasks to complete')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Begin' })).toBeVisible()
  })

  test('should navigate to login page', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Enter' }).click()
    await expect(page).toHaveURL('/login')
    await expect(page.getByRole('tab', { name: 'Sign In' })).toBeVisible()
  })

  test('should register a new user', async ({ page }) => {
    const uniqueEmail = `test-${Date.now()}@endeavor.app`
    await page.goto('/login?tab=register')

    await page.getByPlaceholder('Your name').fill('New User')
    await page.getByPlaceholder('Email').fill(uniqueEmail)
    await page.getByPlaceholder('Password (8+ characters)').fill('password123')
    await page.getByPlaceholder('Confirm password').fill('password123')

    await page.getByRole('button', { name: 'Begin Your Journey' }).click()

    // Should redirect to onboarding or board
    await expect(page).not.toHaveURL('/login', { timeout: 10000 })
  })

  test('should show error for mismatched passwords', async ({ page }) => {
    await page.goto('/login?tab=register')

    await page.getByPlaceholder('Your name').fill('Test User')
    await page.getByPlaceholder('Email').fill('test@example.com')
    await page.getByPlaceholder('Password (8+ characters)').fill('password123')
    await page.getByPlaceholder('Confirm password').fill('different456')

    await page.getByRole('button', { name: 'Begin Your Journey' }).click()

    await expect(page.getByText('Passwords do not match')).toBeVisible()
  })

  test('should show error for short password', async ({ page }) => {
    await page.goto('/login?tab=register')

    await page.getByPlaceholder('Your name').fill('Test User')
    await page.getByPlaceholder('Email').fill('test@example.com')
    await page.getByPlaceholder('Password (8+ characters)').fill('short')
    await page.getByPlaceholder('Confirm password').fill('short')

    await page.getByRole('button', { name: 'Begin Your Journey' }).click()

    await expect(page.getByText('Password must be at least 8 characters')).toBeVisible()
  })

  test('should login with valid credentials', async ({ page }) => {
    // First register
    const uniqueEmail = `login-test-${Date.now()}@endeavor.app`
    await page.goto('/login?tab=register')
    await page.getByPlaceholder('Your name').fill('Login Test')
    await page.getByPlaceholder('Email').fill(uniqueEmail)
    await page.getByPlaceholder('Password (8+ characters)').fill('password123')
    await page.getByPlaceholder('Confirm password').fill('password123')

    // Monitor network to verify registration succeeds
    const responsePromise = page.waitForResponse(resp =>
      resp.url().includes('/auth/register') && resp.status() === 201
    )
    await page.getByRole('button', { name: 'Begin Your Journey' }).click()

    // Wait for successful registration response
    const response = await responsePromise.catch(() => null)
    if (!response) {
      // Check if there's an error on the page
      const error = await page.getByText('Unable to connect').isVisible().catch(() => false)
      if (error) {
        throw new Error('Registration failed: Unable to connect to server')
      }
    }

    await expect(page).not.toHaveURL('/login', { timeout: 10000 })

    // Clear tokens to simulate logout
    await page.evaluate(() => {
      localStorage.removeItem('endeavor_token')
      localStorage.removeItem('endeavor_refresh_token')
    })

    // Go to landing page
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Begin' })).toBeVisible({ timeout: 10000 })

    // Login with the registered credentials
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill(uniqueEmail)
    await page.getByPlaceholder('Password').fill('password123')
    await page.getByRole('button', { name: 'Enter' }).click()

    // Should be logged in (redirected away from /login)
    await expect(page).not.toHaveURL('/login', { timeout: 10000 })
  })

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill('nonexistent@example.com')
    await page.getByPlaceholder('Password').fill('wrongpassword')
    await page.getByRole('button', { name: 'Enter' }).click()

    await expect(page.getByText('Invalid email or password')).toBeVisible()
  })
})

test.describe('Endeavor - Philosophy-Driven Project Management', () => {
  // Register and login before each test
  test.beforeEach(async ({ page }) => {
    // Check if already logged in
    await page.goto('/')

    // If we see the landing page, we need to login
    const isLandingPage = await page.getByRole('link', { name: 'Begin' }).isVisible().catch(() => false)

    if (isLandingPage) {
      // Register a new user for this test
      const uniqueEmail = `e2e-${Date.now()}@endeavor.app`
      await page.goto('/login?tab=register')
      await page.getByPlaceholder('Your name').fill('E2E Test User')
      await page.getByPlaceholder('Email').fill(uniqueEmail)
      await page.getByPlaceholder('Password (8+ characters)').fill('password123')
      await page.getByPlaceholder('Confirm password').fill('password123')
      await page.getByRole('button', { name: 'Begin Your Journey' }).click()

      // Wait for redirect (might go to onboarding or board)
      await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 })

      // If onboarding, skip it
      const skipButton = page.getByRole('button', { name: 'Skip' })
      if (await skipButton.isVisible().catch(() => false)) {
        await skipButton.click()
      }
    }

    // Now go to the main board
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test.describe('Board Page', () => {
    test('should display the North Star quote', async ({ page }) => {
      await expect(page.locator('.north-star')).toContainText(
        'I live with integrity, build myself, create meaningful work'
      )
    })

    test('should display three state columns', async ({ page }) => {
      await expect(page.getByText('The Forge')).toBeVisible()
      await expect(page.getByText('The Embodiment')).toBeVisible()
      await expect(page.getByText('The Clearing')).toBeVisible()
    })

    test('should display state questions', async ({ page }) => {
      await expect(page.getByText('Is this worth becoming real?')).toBeVisible()
      await expect(page.getByText('How do I honor this work fully?')).toBeVisible()
      await expect(page.getByText('What stays, what changes, what ends?')).toBeVisible()
    })

    test('should have navigation links', async ({ page }) => {
      await expect(page.getByRole('link', { name: 'Board' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Weekly Review' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'New Project' })).toBeVisible()
    })
  })

  test.describe('Theme Toggle', () => {
    test('should toggle between light and dark mode', async ({ page }) => {
      // Start in light mode (default)
      const html = page.locator('html')

      // Click the theme toggle button (sun/moon icon)
      const themeToggle = page.locator('button').filter({ has: page.locator('svg.lucide-moon, svg.lucide-sun') })
      await themeToggle.click()

      // Should now be in dark mode
      await expect(html).toHaveClass(/dark/)

      // Click again to go back to light mode
      await themeToggle.click()
      await expect(html).not.toHaveClass(/dark/)
    })
  })

  test.describe('Create Project', () => {
    test('should navigate to new project page', async ({ page }) => {
      await page.getByRole('link', { name: 'New Project' }).click()
      await expect(page).toHaveURL('/new')
      await expect(page.getByText('A new possibility enters The Forge')).toBeVisible()
    })

    test('should show philosophy elements on new project form', async ({ page }) => {
      await page.goto('/new')
      await expect(page.getByText('What calls to you?')).toBeVisible()
      await expect(page.getByText('This is not a task. It is a possibility worth exploring.')).toBeVisible()
    })

    test('should create a new project', async ({ page }) => {
      const uniqueName = `Learn Rust ${Date.now()}`
      await page.goto('/new')

      // Fill in the form
      await page.getByPlaceholder('What do you call this?').fill(uniqueName)
      await page.getByPlaceholder('Why does this matter?').fill('Expand my technical skills and understanding of systems programming')
      await page.getByPlaceholder('What does this build in you?').fill('Technical depth, patience, attention to detail')
      await page.getByPlaceholder('What is your current direction?').fill('Start with the Rust book and build small projects')

      // Submit
      await page.getByRole('button', { name: 'Enter The Forge' }).click()

      // Should redirect to board and show the new project
      await expect(page).toHaveURL('/', { timeout: 10000 })
      await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10000 })
    })

    test('should require a name to create project', async ({ page }) => {
      await page.goto('/new')

      // Try to submit without name
      const submitButton = page.getByRole('button', { name: 'Enter The Forge' })
      await expect(submitButton).toBeDisabled()
    })
  })

  test.describe('Project Detail', () => {
    const projectName = `Detail Test ${Date.now()}`

    test.beforeEach(async ({ page }) => {
      // First create a project with unique name
      await page.goto('/new')
      await page.getByPlaceholder('What do you call this?').fill(projectName)
      await page.getByPlaceholder('Why does this matter?').fill('For testing details')
      await page.getByPlaceholder('What does this build in you?').fill('Detail testing skills')
      await page.getByPlaceholder('What is your current direction?').fill('Run the detail tests')
      await page.getByRole('button', { name: 'Enter The Forge' }).click()
      await expect(page).toHaveURL('/')
    })

    test('should navigate to project detail', async ({ page }) => {
      await page.getByText(projectName).first().click()
      await expect(page.getByRole('heading', { name: projectName })).toBeVisible()
      await expect(page.getByText('Currently in The Forge')).toBeVisible()
    })

    test('should show project meaning and develops', async ({ page }) => {
      await page.getByText(projectName).first().click()
      await expect(page.getByText('For testing details')).toBeVisible()
      await expect(page.getByText('Detail testing skills')).toBeVisible()
    })

    test('should update intention', async ({ page }) => {
      await page.getByText(projectName).first().click()

      // Click edit on intention
      await page.getByRole('button', { name: 'Edit' }).click()

      // Update intention
      const intentionTextarea = page.locator('textarea').first()
      await intentionTextarea.fill('New intention: focus on integration tests')

      // Fill reason for change
      await page.getByPlaceholder('Reflect on this shift...').fill('Realized unit tests are covered')

      // Save
      await page.getByRole('button', { name: 'Save' }).click()

      // Verify new intention is shown
      await expect(page.getByText('New intention: focus on integration tests')).toBeVisible()
    })

    test('should archive and restore project', async ({ page }) => {
      await page.getByText(projectName).first().click()

      // Archive
      await page.getByRole('button', { name: 'Archive' }).click()
      await expect(page.getByText('This project is archived')).toBeVisible()

      // Restore
      await page.getByRole('button', { name: 'Restore' }).click()
      await expect(page.getByText('This project is archived')).not.toBeVisible()
    })
  })

  test.describe('State Transitions with Reflection', () => {
    // Note: Drag and drop testing with dnd-kit is complex in Playwright.
    // These tests verify that the UI elements for transitions exist and work.
    // Full drag-and-drop e2e tests would require more complex setup.

    test('should have draggable project cards', async ({ page }) => {
      // Verify project cards have drag handles
      const dragHandle = page.locator('.project-card').first().locator('button').first()
      await expect(dragHandle).toBeVisible()
    })

    test('should have droppable state columns', async ({ page }) => {
      // Verify all three state columns exist
      await expect(page.locator('.state-column-forge')).toBeVisible()
      await expect(page.locator('.state-column-embodiment')).toBeVisible()
      await expect(page.locator('.state-column-clearing')).toBeVisible()
    })
  })

  test.describe('Weekly Review', () => {
    test('should navigate to weekly review page', async ({ page }) => {
      await page.getByRole('link', { name: 'Weekly Review' }).click()
      await expect(page).toHaveURL('/review')
      await expect(page.getByRole('heading', { name: 'Weekly Review' })).toBeVisible()
    })

    test('should display project counts by state', async ({ page }) => {
      await page.goto('/review')

      await expect(page.getByText('In The Forge')).toBeVisible()
      await expect(page.getByText('In Embodiment')).toBeVisible()
      await expect(page.getByText('In The Clearing')).toBeVisible()
    })

    test('should allow selecting energy level', async ({ page }) => {
      await page.goto('/review')

      // Click on High energy
      await page.getByRole('button', { name: 'High' }).click()
      await expect(page.getByRole('button', { name: 'High' })).toHaveClass(/border-primary/)
    })

    test('should create weekly review', async ({ page }) => {
      const uniqueReflection = `Productive week ${Date.now()}`
      await page.goto('/review')

      // Fill reflection (required)
      await page.getByPlaceholder('Take a moment to notice...').fill(uniqueReflection)

      // Fill optional fields
      await page.getByPlaceholder('What are you grateful for?').fill('Finished the prototype')
      await page.getByPlaceholder('What demanded more than expected?').fill('API integration took longer')
      await page.getByPlaceholder('Not tasks. Intentions.').fill('Focus on quality over speed')

      // Select energy level
      await page.getByRole('button', { name: 'High' }).click()

      // Submit
      await page.getByRole('button', { name: 'Complete Review' }).click()

      // Should show in past reviews (wait for data refresh)
      await expect(page.getByText('Past Reviews')).toBeVisible({ timeout: 10000 })
      await expect(page.getByText(uniqueReflection)).toBeVisible({ timeout: 10000 })
    })

    test('should require reflection to submit review', async ({ page }) => {
      await page.goto('/review')

      // Submit button should be disabled without reflection
      await expect(page.getByRole('button', { name: 'Complete Review' })).toBeDisabled()
    })
  })

  test.describe('Responsive Design', () => {
    test('should work on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto('/')

      // Core elements should still be visible
      await expect(page.getByRole('link', { name: 'Endeavor' })).toBeVisible()
      await expect(page.getByText('The Forge')).toBeVisible()
    })
  })

  test.describe('Empty States', () => {
    // Note: These tests check that empty state messages exist in the DOM.
    // They may be visible or hidden depending on whether there are projects.
    test('should show meaningful empty state for Embodiment', async ({ page }) => {
      // Embodiment column is typically empty
      await expect(page.getByText('No active commitments. That is also meaningful.')).toBeVisible()
    })

    test('should show meaningful empty state for Clearing', async ({ page }) => {
      // Clearing column is typically empty
      await expect(page.getByText('Nothing resting here. Perhaps it is time to step back.')).toBeVisible()
    })
  })
})
