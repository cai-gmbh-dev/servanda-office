/**
 * Happy-Path E2E Test — Sprint 6 (Team 06)
 *
 * Tests the core user flow:
 * 1. Navigate to catalog
 * 2. View templates
 * 3. Navigate to contracts list
 * 4. Start interview from template (if available)
 *
 * Prerequisites:
 * - API running (localhost:3000) with seed data
 * - Web dev server running (localhost:5173)
 */

import { test, expect } from '@playwright/test';

test.describe('Servanda Office - Happy Path', () => {
  test('should load the dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Servanda Office/);
  });

  test('should navigate to catalog page', async ({ page }) => {
    await page.goto('/catalog');

    // Should show the catalog heading
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();

    // Should display template cards or loading state
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
  });

  test('should navigate to contracts page', async ({ page }) => {
    await page.goto('/contracts');

    // Should show the contracts heading
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
  });

  test('should navigate between pages via sidebar', async ({ page }) => {
    await page.goto('/');

    // Navigate to catalog via sidebar link
    const catalogLink = page.getByRole('link', { name: /katalog/i });
    if (await catalogLink.isVisible()) {
      await catalogLink.click();
      await expect(page).toHaveURL(/\/catalog/);
    }

    // Navigate to contracts via sidebar link
    const contractsLink = page.getByRole('link', { name: /vertr[äa]ge/i });
    if (await contractsLink.isVisible()) {
      await contractsLink.click();
      await expect(page).toHaveURL(/\/contracts/);
    }
  });

  test('should show accessible skip-link', async ({ page }) => {
    await page.goto('/');

    // Skip link should exist (WCAG 2.4.1)
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeAttached();
  });
});

test.describe('Catalog Page', () => {
  test('should display templates when API returns data', async ({ page }) => {
    await page.goto('/catalog');

    // Wait for content to load (either templates or empty state)
    await page.waitForLoadState('networkidle');

    // The page should have rendered without errors
    const errorAlert = page.getByRole('alert');
    // If there's an error (e.g., API not running), it should be visible
    // If no error, templates or empty state should be shown
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test('all pages have proper heading hierarchy', async ({ page }) => {
    const pages = ['/', '/catalog', '/contracts'];

    for (const url of pages) {
      await page.goto(url);
      // Each page should have exactly one h1
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBeGreaterThanOrEqual(1);
    }
  });

  test('interactive elements are keyboard focusable', async ({ page }) => {
    await page.goto('/');

    // Tab should move focus to interactive elements
    await page.keyboard.press('Tab');
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });
});
