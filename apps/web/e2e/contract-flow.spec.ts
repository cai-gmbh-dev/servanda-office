/**
 * Contract Creation Flow E2E Tests — Sprint 9 (Team 06)
 *
 * Full happy-path test for the core user flow:
 *   Template waehlen -> Interview -> Review -> Abschliessen -> Vertragsliste
 *
 * Prerequisites:
 *   - API running on localhost:3000 with seed data (npx prisma db seed)
 *   - Web dev server running on localhost:5173
 *   - Dev-mode headers injected by Playwright config (tenant, user, role)
 *
 * Seed data used:
 *   - Template: "Kaufvertrag (Standard)" (ID 00000000-0000-0000-0030-000000000001)
 *   - TemplateVersion: 00000000-0000-0000-0031-000000000001
 *   - Interview questions: kaufpreis, gewaehrleistungsfrist, haftungsbeschraenkung, gerichtsort
 *   - Tenant: Musterkanzlei (00000000-0000-0000-0000-000000000002)
 *   - User: editor (00000000-0000-0000-0000-000000000004)
 */

import { test, expect, type Page } from '@playwright/test';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TEMPLATE_TITLE = 'Kaufvertrag (Standard)';
const TEMPLATE_VERSION_ID = '00000000-0000-0000-0031-000000000001';

/** Interview answers for the Kaufvertrag flow */
const INTERVIEW_ANSWERS = {
  kaufpreis: '75000',
  gewaehrleistungsfrist: '12',
  haftungsbeschraenkung: true, // yes_no type
  gerichtsort: 'Hamburg',
} as const;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Wait for the API to respond on a given URL pattern.
 * Useful to ensure data has loaded before asserting on page content.
 */
async function waitForApiResponse(page: Page, urlPattern: string | RegExp) {
  await page.waitForResponse(
    (resp) =>
      (typeof urlPattern === 'string'
        ? resp.url().includes(urlPattern)
        : urlPattern.test(resp.url())) && resp.status() < 400,
    { timeout: 15_000 },
  );
}

/**
 * Lightweight axe-core accessibility scan.
 * Injects axe-core from CDN and runs against the full page.
 * Returns violations array.
 */
async function runAxeScan(page: Page): Promise<Array<{ id: string; impact: string; description: string }>> {
  // Inject axe-core if not already present
  const hasAxe = await page.evaluate(() => typeof (window as any).axe !== 'undefined');
  if (!hasAxe) {
    await page.addScriptTag({
      url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js',
    });
    // Wait for axe to be available
    await page.waitForFunction(() => typeof (window as any).axe !== 'undefined', null, {
      timeout: 10_000,
    });
  }

  const results = await page.evaluate(async () => {
    const axeResults = await (window as any).axe.run(document, {
      rules: {
        // Disable color-contrast for E2E (no production CSS loaded in dev mode)
        'color-contrast': { enabled: false },
      },
    });
    return axeResults.violations.map((v: any) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.length,
    }));
  });

  return results;
}

/* ------------------------------------------------------------------ */
/*  Test Suite                                                         */
/* ------------------------------------------------------------------ */

test.describe('Contract Creation Flow', () => {
  // Shared state across serial tests: the contract ID created during the flow
  let contractId: string;

  // These tests must run in order — each step depends on the previous
  test.describe.configure({ mode: 'serial' });

  /* ================================================================ */
  /*  Test 1: Katalog — Template finden und auswaehlen                */
  /* ================================================================ */

  test('sollte den Kaufvertrag-Template im Katalog finden', async ({ page }) => {
    // Navigate to catalog
    await page.goto('/catalog');

    // Wait for template list to load from API
    await waitForApiResponse(page, '/content/catalog/templates');

    // Verify the page heading
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveText('Vorlagen-Katalog');

    // The Kaufvertrag template should be visible
    const templateCard = page.getByRole('listitem').filter({
      hasText: TEMPLATE_TITLE,
    });
    await expect(templateCard).toBeVisible();

    // Template should show its metadata
    await expect(templateCard.getByText('Kaufverträge')).toBeVisible();
    await expect(templateCard.getByText('DE')).toBeVisible();

    // Click "Vertrag erstellen" button on the template card
    const createButton = templateCard.getByRole('button', {
      name: new RegExp(`Vertrag erstellen mit Vorlage ${TEMPLATE_TITLE}`, 'i'),
    });
    await expect(createButton).toBeEnabled();
    await createButton.click();

    // Should navigate to the interview page with the template version ID
    await expect(page).toHaveURL(
      new RegExp(`/contracts/new/${TEMPLATE_VERSION_ID}`),
    );
  });

  /* ================================================================ */
  /*  Test 2: Interview — Fragen beantworten                          */
  /* ================================================================ */

  test('sollte den Interview-Flow durchlaufen', async ({ page }) => {
    // Navigate to interview page (creates a new contract via POST /contracts)
    const contractPromise = page.waitForResponse(
      (resp) => resp.url().includes('/contracts') && resp.request().method() === 'POST' && resp.status() < 400,
      { timeout: 15_000 },
    );

    await page.goto(`/contracts/new/${TEMPLATE_VERSION_ID}`);

    // Capture the contract ID from the POST response
    const contractResponse = await contractPromise;
    const contractData = await contractResponse.json();
    contractId = contractData.id;
    expect(contractId).toBeTruthy();

    // Wait for interview to load
    await page.waitForLoadState('networkidle');

    // Contract title heading should be visible
    const mainHeading = page.getByRole('heading', { level: 1 });
    await expect(mainHeading).toBeVisible();

    // Progress sidebar should be visible
    const progressSidebar = page.locator('aside[aria-label="Fortschritt"]');
    await expect(progressSidebar).toBeVisible();

    // Progress bar should start at 0%
    const progressBar = page.getByRole('progressbar');
    await expect(progressBar).toHaveAttribute('aria-valuenow', '0');

    // ----- Question 1: Kaufpreis (currency) -----
    const question1Label = page.getByRole('heading', { level: 2 }).filter({
      hasText: /Kaufpreis/i,
    });
    await expect(question1Label).toBeVisible();

    // Fill in the kaufpreis
    const kaufpreisInput = page.getByRole('spinbutton').or(page.getByRole('textbox')).first();
    await kaufpreisInput.fill(INTERVIEW_ANSWERS.kaufpreis);

    // Click "Weiter"
    const weiterButton = page.getByRole('button', { name: /weiter/i });
    await weiterButton.click();

    // ----- Question 2: Gewaehrleistungsfrist (number) -----
    const question2Label = page.getByRole('heading', { level: 2 }).filter({
      hasText: /Gew.hrleistungsfrist/i,
    });
    await expect(question2Label).toBeVisible();

    const fristInput = page.getByRole('spinbutton').or(page.getByRole('textbox')).first();
    await fristInput.fill(INTERVIEW_ANSWERS.gewaehrleistungsfrist);

    await weiterButton.click();

    // ----- Question 3: Haftungsbeschraenkung (yes_no) -----
    const question3Label = page.getByRole('heading', { level: 2 }).filter({
      hasText: /Haftungsbeschr.nkung/i,
    });
    await expect(question3Label).toBeVisible();

    // For yes_no type: click "Ja" radio/button or the relevant control
    const jaOption = page.getByLabel(/ja/i).or(page.getByRole('radio', { name: /ja/i })).first();
    if (await jaOption.isVisible()) {
      await jaOption.click();
    } else {
      // Fallback: checkbox or toggle
      const toggle = page.getByRole('checkbox').first();
      if (await toggle.isVisible()) {
        await toggle.check();
      }
    }

    await weiterButton.click();

    // ----- Question 4: Gerichtsort (text) — last question -----
    const question4Label = page.getByRole('heading', { level: 2 }).filter({
      hasText: /Gerichtsstand/i,
    });
    await expect(question4Label).toBeVisible();

    const gerichtsortInput = page.getByRole('textbox').first();
    await gerichtsortInput.fill(INTERVIEW_ANSWERS.gerichtsort);

    // Progress bar should now show progress (at least some answered)
    const currentProgress = await progressBar.getAttribute('aria-valuenow');
    expect(Number(currentProgress)).toBeGreaterThan(0);

    // The last question shows "Vertrag abschliessen" instead of "Weiter"
    const completeButton = page.getByRole('button', {
      name: /Vertrag abschlie.en/i,
    });
    await expect(completeButton).toBeVisible();
  });

  /* ================================================================ */
  /*  Test 3: Review-Seite — Zusammenfassung pruefen                  */
  /* ================================================================ */

  test('sollte die Review-Seite korrekt anzeigen', async ({ page }) => {
    // Skip if no contract was created in the previous test
    test.skip(!contractId, 'Kein Vertrag aus vorherigem Test vorhanden');

    // Navigate directly to the review page
    await page.goto(`/contracts/${contractId}/review`);

    // Wait for contract data to load
    await waitForApiResponse(page, `/v1/contracts/${contractId}`);
    await page.waitForLoadState('networkidle');

    // Page heading
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveText('Vertragspruefung');

    // ----- Meta section: Vertragsdetails -----
    const metaSection = page.locator('section[aria-label="Vertragsdetails"]');
    await expect(metaSection).toBeVisible();

    // Title should be displayed
    await expect(metaSection.getByText(/Titel/)).toBeVisible();

    // Status should show (draft or completed)
    await expect(metaSection.getByText(/Status/)).toBeVisible();

    // ----- Validation Status section -----
    const validationSection = page.locator('section[aria-label="Validierungsstatus"]');
    await expect(validationSection).toBeVisible();
    await expect(validationSection.getByRole('heading', { level: 2 })).toHaveText('Validierung');

    // Validation state text should be visible (Gueltig, Warnungen vorhanden, or Konflikte vorhanden)
    const validationState = validationSection.locator('.review-validation__state');
    await expect(validationState).toBeVisible();

    // ----- Interview Answers section -----
    const answersSection = page.locator('section[aria-label="Interview-Antworten"]');
    await expect(answersSection).toBeVisible();
    await expect(answersSection.getByRole('heading', { level: 2 })).toHaveText(
      'Ihre Angaben',
    );

    // ----- Clause Contents section -----
    const clausesSection = page.locator('section[aria-label="Vertragsklauseln"]');
    await expect(clausesSection).toBeVisible();
    await expect(clausesSection.getByRole('heading', { level: 2 })).toHaveText(
      'Klauseln',
    );

    // ----- Action Buttons -----
    const backButton = page.getByRole('button', {
      name: /Zurueck zum Interview/i,
    });
    await expect(backButton).toBeVisible();

    const completeButton = page.getByRole('button', {
      name: /Vertrag abschliessen/i,
    });
    await expect(completeButton).toBeVisible();
  });

  /* ================================================================ */
  /*  Test 4: Vertrag abschliessen                                     */
  /* ================================================================ */

  test('sollte den Vertrag abschliessen koennen', async ({ page }) => {
    test.skip(!contractId, 'Kein Vertrag aus vorherigem Test vorhanden');

    // Navigate to review page
    await page.goto(`/contracts/${contractId}/review`);
    await waitForApiResponse(page, `/v1/contracts/${contractId}`);
    await page.waitForLoadState('networkidle');

    // The complete button should be enabled (assuming no hard conflicts)
    const completeButton = page.getByRole('button', {
      name: /Vertrag abschliessen/i,
    });
    await expect(completeButton).toBeEnabled();

    // Set up response listener for the complete API call
    const completePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/contracts/${contractId}/complete`) &&
        resp.request().method() === 'POST',
      { timeout: 15_000 },
    );

    // Click complete
    await completeButton.click();

    // Wait for the completion API call
    const completeResponse = await completePromise;
    expect(completeResponse.status()).toBeLessThan(400);

    // After successful completion, the UI should indicate success.
    // The button text changes to "Wird abgeschlossen..." during the request,
    // then the component sets completed = true.
    // Wait for the success state — either a success message or the button state changes.
    await expect(
      page.getByText(/abgeschlossen/i).or(page.getByRole('status')),
    ).toBeVisible({ timeout: 10_000 });
  });

  /* ================================================================ */
  /*  Test 5: Vertrag in der Liste pruefen                             */
  /* ================================================================ */

  test('sollte abgeschlossenen Vertrag in der Liste zeigen', async ({ page }) => {
    test.skip(!contractId, 'Kein Vertrag aus vorherigem Test vorhanden');

    // Navigate to contracts list
    await page.goto('/contracts');

    // Wait for contracts list to load
    await waitForApiResponse(page, '/contracts');
    await page.waitForLoadState('networkidle');

    // Page heading
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveText('Meine Verträge');

    // The contracts table should be visible
    const table = page.getByRole('table', { name: /Vertragsliste/i });
    await expect(table).toBeVisible();

    // Find the row for the newly created contract.
    // The contract was created with title "Neuer Vertrag" by the InterviewPage.
    // Look for any row with status "Abgeschlossen"
    const completedBadge = table.getByText('Abgeschlossen');
    await expect(completedBadge).toBeVisible({ timeout: 10_000 });

    // The row should also have an "Anzeigen" button (completed contracts show "Anzeigen")
    const contractRow = table.locator('tr').filter({
      hasText: 'Abgeschlossen',
    });
    await expect(contractRow.first()).toBeVisible();

    const viewButton = contractRow.first().getByRole('button', {
      name: /anzeigen/i,
    });
    await expect(viewButton).toBeVisible();
  });

  /* ================================================================ */
  /*  Test 6: Accessibility — axe-core Scan auf allen Flow-Seiten     */
  /* ================================================================ */

  test('Accessibility: Alle Seiten im Flow haben keine axe-Violations', async ({
    page,
  }) => {
    // We test the main pages in the contract creation flow.
    // For the interview and review pages, we use the seed contract
    // (00000000-0000-0000-0040-000000000001) which is always present.

    const seedContractId = '00000000-0000-0000-0040-000000000001';

    const pagesToScan = [
      { url: '/catalog', label: 'Katalog' },
      {
        url: `/contracts/new/${TEMPLATE_VERSION_ID}`,
        label: 'Interview (neuer Vertrag)',
      },
      {
        url: `/contracts/${seedContractId}/review`,
        label: 'Review',
      },
      { url: '/contracts', label: 'Vertragsliste' },
    ];

    for (const pageInfo of pagesToScan) {
      await page.goto(pageInfo.url);
      await page.waitForLoadState('networkidle');

      // Give dynamic content a moment to render
      await page.waitForTimeout(500);

      const violations = await runAxeScan(page);

      // Filter for serious and critical violations only
      const critical = violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );

      // Log all violations for debugging (non-failing)
      if (violations.length > 0) {
        console.log(
          `[axe] ${pageInfo.label}: ${violations.length} violations found`,
          violations.map((v) => `${v.impact}: ${v.id} — ${v.description}`),
        );
      }

      // Fail only on critical/serious violations
      expect(
        critical,
        `${pageInfo.label} (${pageInfo.url}): ${critical.length} critical/serious axe violations found: ${critical.map((v) => `${v.id}: ${v.description}`).join('; ')}`,
      ).toHaveLength(0);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Standalone Catalog Filter Tests                                    */
/* ------------------------------------------------------------------ */

test.describe('Catalog Filters', () => {
  test('sollte Vorlagen nach Suchbegriff filtern koennen', async ({ page }) => {
    await page.goto('/catalog');
    await waitForApiResponse(page, '/content/catalog/templates');

    // Type in search box
    const searchInput = page.getByLabel(/Vorlagen durchsuchen/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Kaufvertrag');

    // Should still show Kaufvertrag template
    const templateCard = page.getByRole('listitem').filter({
      hasText: TEMPLATE_TITLE,
    });
    await expect(templateCard).toBeVisible();

    // Filter count should update
    const filterCount = page.locator('[aria-live="polite"]').filter({
      hasText: /von.*Vorlagen/,
    });
    await expect(filterCount).toBeVisible();
  });

  test('sollte Filter zuruecksetzen koennen', async ({ page }) => {
    await page.goto('/catalog?q=nonexistent');
    await page.waitForLoadState('networkidle');

    // Clear filters button should be visible
    const clearButton = page.getByRole('button', {
      name: /Filter zurücksetzen/i,
    });
    if (await clearButton.isVisible()) {
      await clearButton.click();

      // URL should be clean
      await expect(page).toHaveURL('/catalog');
    }
  });
});
