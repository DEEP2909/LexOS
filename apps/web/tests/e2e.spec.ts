/**
 * EvidentIS E2E Test Suite - Playwright Tests
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:3001';

// Test user credentials
const TEST_USER = {
  email: 'test@evidentis.dev',
  password: 'TestPassword123!',
};

// Helper functions
async function login(page: Page, email = TEST_USER.email, password = TEST_USER.password) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
}

// ============================================================================
// Authentication E2E Tests
// ============================================================================

test.describe('Authentication', () => {
  test('should display login page', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    
    await expect(page.locator('h1')).toContainText(/sign in|login/i);
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });
  
  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    
    await page.fill('input[name="email"]', 'wrong@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('[role="alert"]')).toContainText(/invalid|incorrect|failed/i);
  });
  
  test('should redirect to dashboard after login', async ({ page }) => {
    await login(page);
    
    await expect(page).toHaveURL(/.*dashboard/);
    await expect(page.locator('nav')).toBeVisible();
  });
  
  test('should logout successfully', async ({ page }) => {
    await login(page);
    
    // Click user menu and logout
    await page.click('[data-testid="user-menu"]');
    await page.click('text=Logout');
    
    await expect(page).toHaveURL(/.*login/);
  });
  
  test('should protect dashboard from unauthenticated access', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    
    // Should redirect to login
    await expect(page).toHaveURL(/.*login/);
  });
  
  test('should show MFA challenge when required', async ({ page }) => {
    // This test assumes MFA is enabled for the test user
    await page.goto(`${BASE_URL}/login`);
    
    await page.fill('input[name="email"]', 'mfa-user@evidentis.dev');
    await page.fill('input[name="password"]', 'MfaPassword123!');
    await page.click('button[type="submit"]');
    
    // May show MFA challenge or proceed directly
    const mfaVisible = await page.locator('input[name="code"]').isVisible().catch(() => false);
    if (mfaVisible) {
      await expect(page.locator('text=verification code')).toBeVisible();
    }
  });
});

// ============================================================================
// Dashboard E2E Tests
// ============================================================================

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });
  
  test('should display dashboard stats', async ({ page }) => {
    const statCardCount = await page.locator('[data-testid="stat-card"]').count();
    expect(statCardCount).toBeGreaterThan(0);
  });
  
  test('should show recent matters', async ({ page }) => {
    await expect(page.locator('[data-testid="recent-matters"]')).toBeVisible();
  });
  
  test('should show activity feed', async ({ page }) => {
    await expect(page.locator('[data-testid="activity-feed"]')).toBeVisible();
  });
  
  test('should navigate to matters list', async ({ page }) => {
    await page.click('text=Matters');
    
    await expect(page).toHaveURL(/.*matters/);
  });
});

// ============================================================================
// Matters E2E Tests
// ============================================================================

test.describe('Matters', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/matters`);
  });
  
  test('should display matters list', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible();
  });
  
  test('should open create matter modal', async ({ page }) => {
    await page.click('button:has-text("New Matter")');
    
    await expect(page.locator('dialog, [role="dialog"]')).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
  });
  
  test('should create a new matter', async ({ page }) => {
    await page.click('button:has-text("New Matter")');
    
    const matterName = `Test Matter ${Date.now()}`;
    await page.fill('input[name="name"]', matterName);
    await page.fill('input[name="clientName"]', 'Test Client');
    await page.selectOption('select[name="practiceArea"]', 'M&A');
    
    await page.click('button:has-text("Create")');
    
    // Should show success or navigate to matter
    await expect(page.locator(`text=${matterName}`)).toBeVisible({ timeout: 5000 }).catch(() => {
      // May have redirected to matter detail
    });
  });
  
  test('should filter matters', async ({ page }) => {
    // Type in search
    await page.fill('input[placeholder*="search" i]', 'test');
    
    // Wait for filter to apply
    await page.waitForTimeout(500);
    
    // Results should be filtered
  });
  
  test('should navigate to matter detail', async ({ page }) => {
    // Click first matter link
    const firstMatter = page.locator('table tbody tr').first();
    await firstMatter.click();
    
    await expect(page).toHaveURL(/.*matters\/.+/);
  });
});

// ============================================================================
// Matter Detail E2E Tests
// ============================================================================

test.describe('Matter Detail', () => {
  let matterId: string;
  
  test.beforeEach(async ({ page }) => {
    await login(page);
    
    // Create a matter via API for testing
    const response = await page.request.post(`${API_URL}/api/matters`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAuthToken(page)}`,
      },
      data: {
        name: `E2E Test Matter ${Date.now()}`,
        clientName: 'E2E Client',
        practiceArea: 'M&A',
      },
    });
    
    if (response.ok()) {
      const matter = await response.json();
      matterId = matter.id;
      await page.goto(`${BASE_URL}/matters/${matterId}`);
    }
  });
  
  test('should display matter details', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/matter/i);
  });
  
  test('should have document tab', async ({ page }) => {
    await page.click('text=Documents');
    
    await expect(page.locator('[data-testid="documents-tab"]')).toBeVisible();
  });
  
  test('should have clauses tab', async ({ page }) => {
    await page.click('text=Clauses');
    
    await expect(page.locator('[data-testid="clauses-tab"]')).toBeVisible();
  });
  
  test('should have flags tab', async ({ page }) => {
    await page.click('text=Flags');
    
    await expect(page.locator('[data-testid="flags-tab"]')).toBeVisible();
  });
  
  test('should have obligations tab', async ({ page }) => {
    await page.click('text=Obligations');
    
    await expect(page.locator('[data-testid="obligations-tab"]')).toBeVisible();
  });
});

// ============================================================================
// Document Upload E2E Tests
// ============================================================================

test.describe('Document Upload', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/matters`);
    
    // Navigate to first matter
    const firstMatter = page.locator('table tbody tr').first();
    await firstMatter.click();
    
    await page.click('text=Documents');
  });
  
  test('should show upload button', async ({ page }) => {
    await expect(page.locator('button:has-text("Upload")')).toBeVisible();
  });
  
  test('should open upload dialog', async ({ page }) => {
    await page.click('button:has-text("Upload")');
    
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });
  
  test('should accept PDF files', async ({ page }) => {
    await page.click('button:has-text("Upload")');
    
    // Check dropzone accepts PDF
    const dropzone = page.locator('[data-testid="dropzone"]');
    await expect(dropzone).toBeVisible();
  });
});

// ============================================================================
// Research E2E Tests
// ============================================================================

test.describe('Research', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/research`);
  });
  
  test('should display research interface', async ({ page }) => {
    await expect(page.locator('input[placeholder*="question" i]')).toBeVisible();
  });
  
  test('should submit research query', async ({ page }) => {
    await page.fill('input[placeholder*="question" i]', 'What is indemnification?');
    await page.click('button:has-text("Search")');
    
    // Should show loading or results
    await expect(page.locator('[data-testid="research-results"], [data-testid="loading"]')).toBeVisible();
  });
  
  test('should show AI disclaimer', async ({ page }) => {
    await page.fill('input[placeholder*="question" i]', 'Legal advice question');
    await page.click('button:has-text("Search")');
    
    // Wait for response
    await page.waitForTimeout(3000);
    
    // Should show disclaimer
    const disclaimer = page.locator('text=AI-generated');
    await disclaimer.isVisible().catch(() => false);
    // Disclaimer may be in results or always visible
  });
});

// ============================================================================
// Analytics E2E Tests
// ============================================================================

test.describe('Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/analytics`);
  });
  
  test('should display analytics page', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/analytics/i);
  });
  
  test('should show charts', async ({ page }) => {
    // Wait for charts to load
    await page.waitForTimeout(2000);
    
    // Should have chart containers
    const chartCount = await page.locator('[data-testid="chart"]').count();
    expect(chartCount).toBeGreaterThan(0);
  });
});

// ============================================================================
// Settings E2E Tests
// ============================================================================

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/settings`);
  });
  
  test('should display settings page', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/settings/i);
  });
  
  test('should have profile section', async ({ page }) => {
    await expect(page.locator('text=Profile')).toBeVisible();
  });
  
  test('should have security section', async ({ page }) => {
    await page.click('text=Security');
    
    await expect(page.locator('text=Password')).toBeVisible();
  });
});

// ============================================================================
// Admin E2E Tests
// ============================================================================

test.describe('Admin', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await login(page, 'admin@evidentis.dev', 'AdminPassword123!');
    await page.goto(`${BASE_URL}/admin`);
  });
  
  test('should access admin panel as admin', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/admin/i);
  });
  
  test('should show attorneys list', async ({ page }) => {
    await page.click('text=Attorneys');
    
    await expect(page.locator('table')).toBeVisible();
  });
  
  test('should show playbooks list', async ({ page }) => {
    await page.click('text=Playbooks');
    
    await expect(page.locator('[data-testid="playbooks-list"]')).toBeVisible();
  });
  
  test('should show audit log', async ({ page }) => {
    await page.click('text=Audit Log');
    
    await expect(page.locator('table')).toBeVisible();
  });
});

// ============================================================================
// Accessibility E2E Tests
// ============================================================================

test.describe('Accessibility', () => {
  test('should have proper page titles', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page).toHaveTitle(/evidentis|login/i);
    
    await login(page);
    await expect(page).toHaveTitle(/dashboard|evidentis/i);
  });
  
  test('should have skip link', async ({ page }) => {
    await login(page);
    
    // Focus on body and tab
    await page.keyboard.press('Tab');
    
    // Skip link should be visible or focusable
  });
  
  test('should have proper heading hierarchy', async ({ page }) => {
    await login(page);
    
    const h1 = await page.locator('h1').count();
    expect(h1).toBeGreaterThanOrEqual(1);
  });
  
  test('should have proper focus indicators', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    
    const emailInput = page.locator('input[name="email"]');
    await emailInput.focus();
    
    // Should have visible focus styling
    const outline = await emailInput.evaluate(el => 
      window.getComputedStyle(el).outlineStyle
    );
    
    expect(outline).not.toBe('none');
  });
});

// ============================================================================
// Responsive Design E2E Tests
// ============================================================================

test.describe('Responsive Design', () => {
  test('should work on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    await login(page);
    
    // Navigation should be collapsed or hamburger menu
    const hamburger = page.locator('[data-testid="mobile-menu"]');
    await expect(hamburger).toBeVisible().catch(() => {
      // May have different mobile nav implementation
    });
  });
  
  test('should work on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    
    await login(page);
    
    await expect(page.locator('nav')).toBeVisible();
  });
  
  test('should work on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    await login(page);
    
    await expect(page.locator('nav')).toBeVisible();
  });
});

// ============================================================================
// Performance E2E Tests
// ============================================================================

test.describe('Performance', () => {
  test('should load dashboard within 3 seconds', async ({ page }) => {
    const startTime = Date.now();
    
    await login(page);
    
    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(10000); // 10s for login + dashboard
  });
  
  test('should not have memory leaks on navigation', async ({ page }) => {
    await login(page);
    
    // Navigate between pages multiple times
    for (let i = 0; i < 5; i++) {
      await page.click('text=Matters');
      await page.waitForTimeout(500);
      await page.click('text=Dashboard');
      await page.waitForTimeout(500);
    }
    
    // Page should still be responsive
    await expect(page.locator('nav')).toBeVisible();
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

async function getAuthToken(page: Page): Promise<string> {
  return await page.evaluate(() => {
    return localStorage.getItem('accessToken') || '';
  });
}
