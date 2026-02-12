/**
 * Visual Regression Tests — Sprint 12 (Team 06)
 *
 * Screenshot-basierte Tests fuer alle Hauptseiten.
 * Verwendet Playwright's built-in screenshot comparison.
 * Threshold: 0.2% pixel difference allowed.
 *
 * Laeuft gegen Dev-Server mit Seed-Daten.
 *
 * Seed-Daten:
 *   - Tenant: Musterkanzlei (00000000-0000-0000-0000-000000000002)
 *   - User: editor (00000000-0000-0000-0000-000000000004)
 *   - Template: Kaufvertrag (Standard) (00000000-0000-0000-0030-000000000001)
 *   - TemplateVersion: 00000000-0000-0000-0031-000000000001
 *   - Contract (seed): 00000000-0000-0000-0040-000000000001
 *
 * Baseline-Updates:
 *   npx playwright test --config playwright.config.visual.ts --update-snapshots
 */

import { test, expect, type Page } from '@playwright/test';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TENANT_ID = '00000000-0000-0000-0000-000000000002';
const USER_ID = '00000000-0000-0000-0000-000000000004';
const USER_ROLE = 'editor';
const TEMPLATE_VERSION_ID = '00000000-0000-0000-0031-000000000001';
const SEED_CONTRACT_ID = '00000000-0000-0000-0040-000000000001';

/** Max pixel difference ratio allowed (0.2% = 0.002) */
const MAX_DIFF_PIXEL_RATIO = 0.002;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Navigate to a page with Dev-Mode headers for tenant context
 * and wait for network idle to ensure all data is loaded.
 */
async function navigateAndWait(page: Page, path: string): Promise<void> {
  await page.setExtraHTTPHeaders({
    'x-tenant-id': TENANT_ID,
    'x-user-id': USER_ID,
    'x-user-role': USER_ROLE,
  });

  await page.goto(path, { waitUntil: 'networkidle' });

  // Additional wait for any animations or lazy-loaded content to settle
  await page.waitForTimeout(500);
}

/**
 * Wait for a specific API response pattern before proceeding.
 */
async function waitForApiResponse(page: Page, urlPattern: string | RegExp): Promise<void> {
  await page.waitForResponse(
    (resp) =>
      (typeof urlPattern === 'string'
        ? resp.url().includes(urlPattern)
        : urlPattern.test(resp.url())) && resp.status() < 400,
    { timeout: 15_000 },
  );
}

/* ------------------------------------------------------------------ */
/*  Visual Regression Test Suite                                       */
/* ------------------------------------------------------------------ */

test.describe('Visual Regression — Hauptseiten', () => {
  // Increase timeout for screenshot comparison (network + rendering)
  test.setTimeout(30_000);

  /* ================================================================ */
  /*  Test 1: Dashboard — Leerer Zustand (keine Vertraege)            */
  /* ================================================================ */

  test('Dashboard — Leerer Zustand', async ({ page }) => {
    await navigateAndWait(page, '/');

    // Wait for the dashboard heading to be visible
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();

    // Ensure main content area is rendered
    const main = page.getByRole('main');
    await expect(main).toBeVisible();

    await expect(page).toHaveScreenshot('dashboard-empty.png', {
      maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
      fullPage: true,
    });
  });

  /* ================================================================ */
  /*  Test 2: Catalog — Template-Grid mit Seed-Templates              */
  /* ================================================================ */

  test('Catalog — Template-Grid mit Seed-Templates', async ({ page }) => {
    await navigateAndWait(page, '/catalog');

    // Wait for template data to load from API
    await waitForApiResponse(page, '/content/catalog/templates');

    // Wait for template cards to be rendered
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveText('Vorlagen-Katalog');

    // At least one template card should be visible
    const templateCard = page.getByRole('listitem').first();
    await expect(templateCard).toBeVisible();

    await expect(page).toHaveScreenshot('catalog-grid.png', {
      maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
      fullPage: true,
    });
  });

  /* ================================================================ */
  /*  Test 3: Catalog mit Filter — Suchfeld aktiv, Filter gesetzt     */
  /* ================================================================ */

  test('Catalog mit Filter — Suchfeld aktiv', async ({ page }) => {
    await navigateAndWait(page, '/catalog');

    // Wait for template data to load
    await waitForApiResponse(page, '/content/catalog/templates');

    // Type a search query into the filter input
    const searchInput = page.getByLabel(/Vorlagen durchsuchen/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Kaufvertrag');

    // Wait for filter to apply (debounce + re-render)
    await page.waitForTimeout(500);

    // Filter count indicator should be visible
    const filterCount = page.locator('[aria-live="polite"]').filter({
      hasText: /von.*Vorlagen/,
    });
    await expect(filterCount).toBeVisible();

    await expect(page).toHaveScreenshot('catalog-filtered.png', {
      maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
      fullPage: true,
    });
  });

  /* ================================================================ */
  /*  Test 4: Contracts-Liste — Tabelle mit Seed-Contract             */
  /* ================================================================ */

  test('Contracts-Liste — Tabelle mit Seed-Contract', async ({ page }) => {
    await navigateAndWait(page, '/contracts');

    // Wait for contracts data to load
    await waitForApiResponse(page, '/contracts');

    // Page heading
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveText('Meine Verträge');

    // Table should be visible with data
    const table = page.getByRole('table', { name: /Vertragsliste/i });
    await expect(table).toBeVisible();

    await expect(page).toHaveScreenshot('contracts-list.png', {
      maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
      fullPage: true,
    });
  });

  /* ================================================================ */
  /*  Test 5: Interview-Page — Erste Frage, Progress-Sidebar sichtbar */
  /* ================================================================ */

  test('Interview-Page — Erste Frage mit Progress-Sidebar', async ({ page }) => {
    // Navigate to interview page for a new contract using the seed template
    const contractPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/contracts') &&
        resp.request().method() === 'POST' &&
        resp.status() < 400,
      { timeout: 15_000 },
    );

    await navigateAndWait(page, `/contracts/new/${TEMPLATE_VERSION_ID}`);

    // Wait for contract creation response
    await contractPromise;

    // Wait for interview to load fully
    await page.waitForLoadState('networkidle');

    // The first question heading should be visible
    const questionHeading = page.getByRole('heading', { level: 2 });
    await expect(questionHeading).toBeVisible();

    // Progress sidebar should be visible
    const progressSidebar = page.locator('aside[aria-label="Fortschritt"]');
    await expect(progressSidebar).toBeVisible();

    // Progress bar should exist
    const progressBar = page.getByRole('progressbar');
    await expect(progressBar).toBeVisible();

    await expect(page).toHaveScreenshot('interview-first-question.png', {
      maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
      fullPage: true,
    });
  });

  /* ================================================================ */
  /*  Test 6: Interview mit Antworten — Mehrere Fragen beantwortet    */
  /* ================================================================ */

  test('Interview mit Antworten — LivePreview aktualisiert', async ({ page }) => {
    // Navigate to interview page
    const contractPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/contracts') &&
        resp.request().method() === 'POST' &&
        resp.status() < 400,
      { timeout: 15_000 },
    );

    await navigateAndWait(page, `/contracts/new/${TEMPLATE_VERSION_ID}`);

    await contractPromise;
    await page.waitForLoadState('networkidle');

    // --- Answer Question 1: Kaufpreis ---
    const kaufpreisInput = page.getByRole('spinbutton').or(page.getByRole('textbox')).first();
    await kaufpreisInput.fill('75000');

    const weiterButton = page.getByRole('button', { name: /weiter/i });
    await weiterButton.click();

    // --- Answer Question 2: Gewaehrleistungsfrist ---
    const question2Label = page.getByRole('heading', { level: 2 }).filter({
      hasText: /Gew.hrleistungsfrist/i,
    });
    await expect(question2Label).toBeVisible();

    const fristInput = page.getByRole('spinbutton').or(page.getByRole('textbox')).first();
    await fristInput.fill('12');

    await weiterButton.click();

    // --- Answer Question 3: Haftungsbeschraenkung (yes_no) ---
    const question3Label = page.getByRole('heading', { level: 2 }).filter({
      hasText: /Haftungsbeschr.nkung/i,
    });
    await expect(question3Label).toBeVisible();

    const jaOption = page.getByLabel(/ja/i).or(page.getByRole('radio', { name: /ja/i })).first();
    if (await jaOption.isVisible()) {
      await jaOption.click();
    } else {
      const toggle = page.getByRole('checkbox').first();
      if (await toggle.isVisible()) {
        await toggle.check();
      }
    }

    // Wait for LivePreview to update with answered data
    await page.waitForTimeout(1000);

    // Progress bar should show progress
    const progressBar = page.getByRole('progressbar');
    const currentProgress = await progressBar.getAttribute('aria-valuenow');
    expect(Number(currentProgress)).toBeGreaterThan(0);

    await expect(page).toHaveScreenshot('interview-with-answers.png', {
      maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
      fullPage: true,
    });
  });

  /* ================================================================ */
  /*  Test 7: Review-Page — Vollstaendiger Vertrag mit allen Klauseln */
  /* ================================================================ */

  test('Review-Page — Vollstaendiger Vertrag', async ({ page }) => {
    // Navigate to review page of the seed contract
    await navigateAndWait(page, `/contracts/${SEED_CONTRACT_ID}/review`);

    // Wait for contract data to load
    await waitForApiResponse(page, `/v1/contracts/${SEED_CONTRACT_ID}`);
    await page.waitForLoadState('networkidle');

    // Page heading should be "Vertragspruefung"
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveText('Vertragspruefung');

    // Meta section should be visible
    const metaSection = page.locator('section[aria-label="Vertragsdetails"]');
    await expect(metaSection).toBeVisible();

    // Clauses section should be visible
    const clausesSection = page.locator('section[aria-label="Vertragsklauseln"]');
    await expect(clausesSection).toBeVisible();

    // Answers section should be visible
    const answersSection = page.locator('section[aria-label="Interview-Antworten"]');
    await expect(answersSection).toBeVisible();

    await expect(page).toHaveScreenshot('review-full-contract.png', {
      maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
      fullPage: true,
    });
  });

  /* ================================================================ */
  /*  Test 8: Review Validation — Validierungsstatus (gruen/gelb/rot) */
  /* ================================================================ */

  test('Review Validation — Validierungsstatus angezeigt', async ({ page }) => {
    // Navigate to review page of the seed contract
    await navigateAndWait(page, `/contracts/${SEED_CONTRACT_ID}/review`);

    // Wait for contract data to load
    await waitForApiResponse(page, `/v1/contracts/${SEED_CONTRACT_ID}`);
    await page.waitForLoadState('networkidle');

    // Validation section should be visible
    const validationSection = page.locator('section[aria-label="Validierungsstatus"]');
    await expect(validationSection).toBeVisible();

    // Validation heading
    await expect(
      validationSection.getByRole('heading', { level: 2 }),
    ).toHaveText('Validierung');

    // Validation state indicator (green/yellow/red) should be visible
    const validationState = validationSection.locator('.review-validation__state');
    await expect(validationState).toBeVisible();

    // Scroll to the validation section to capture it prominently
    await validationSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    await expect(page).toHaveScreenshot('review-validation-status.png', {
      maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
      fullPage: true,
    });
  });
});
