/**
 * k6 Load Test — Sprint 11 (Team 06: QA & Compliance)
 *
 * Validates API performance under smoke, load, and stress conditions.
 * Performance targets from a11y-performance-baseline-v1.md:
 *   - P50 < 50 ms  (simple endpoints)
 *   - P95 < 200 ms
 *   - P99 < 500 ms
 *   - Error rate < 1 %
 *
 * Endpoints tested:
 *   GET  /api/v1/health                  — Health check (baseline)
 *   GET  /api/v1/content/clauses         — Paginated clause list
 *   GET  /api/v1/content/catalog/templates — Published catalog
 *   GET  /api/v1/contracts               — Contract list
 *   POST /api/v1/contracts               — Create contract instance
 *   PATCH /api/v1/contracts/:id          — Auto-save answers
 *   POST /api/v1/contracts/:id/validate  — Rule validation
 *
 * Run:  k6 run src/__tests__/load/api-load-test.js
 *   or: npm run test:load  (from apps/api)
 *
 * Environment variables (optional):
 *   API_BASE_URL  — defaults to http://localhost:3000
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------

const contractCreateDuration = new Trend('contract_create_duration', true);
const contractPatchDuration = new Trend('contract_patch_duration', true);
const contractValidateDuration = new Trend('contract_validate_duration', true);
const healthCheckDuration = new Trend('health_check_duration', true);
const clauseListDuration = new Trend('clause_list_duration', true);
const catalogDuration = new Trend('catalog_duration', true);
const contractListDuration = new Trend('contract_list_duration', true);
const failedRequests = new Counter('failed_requests');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';
const API = `${BASE_URL}/api/v1`;

// Seed data constants (matching prisma/seed.ts)
const LAWFIRM_TENANT = '00000000-0000-0000-0000-000000000002';
const LAWFIRM_EDITOR = '00000000-0000-0000-0002-000000000002';
const PUBLISHED_TEMPLATE_VERSION = '00000000-0000-0000-0031-000000000001';
const EXISTING_CONTRACT = '00000000-0000-0000-0040-000000000001';

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export const options = {
  scenarios: {
    // Scenario 1: Smoke — 1 VU, 30 s — basic functionality check
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      gracefulStop: '5s',
      tags: { scenario: 'smoke' },
      exec: 'smokeTest',
    },

    // Scenario 2: Load — 20 VUs, 2 min — normal traffic simulation
    load: {
      executor: 'constant-vus',
      vus: 20,
      duration: '2m',
      gracefulStop: '10s',
      startTime: '35s', // start after smoke finishes
      tags: { scenario: 'load' },
      exec: 'loadTest',
    },

    // Scenario 3: Stress — ramp-up 1 min → hold 2 min → ramp-down 1 min
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 50 },   // ramp up
        { duration: '2m', target: 50 },   // hold
        { duration: '1m', target: 0 },    // ramp down
      ],
      gracefulStop: '10s',
      startTime: '3m', // start after load finishes
      tags: { scenario: 'stress' },
      exec: 'stressTest',
    },
  },

  // Global thresholds (a11y-performance-baseline-v1.md)
  thresholds: {
    http_req_duration: [
      { threshold: 'p(95)<200', abortOnFail: false },
      { threshold: 'p(99)<500', abortOnFail: false },
    ],
    http_req_failed: [
      { threshold: 'rate<0.01', abortOnFail: false },
    ],
    // Per-endpoint thresholds
    health_check_duration: ['p(95)<100'],
    clause_list_duration: ['p(95)<200', 'p(99)<500'],
    catalog_duration: ['p(95)<200', 'p(99)<500'],
    contract_list_duration: ['p(95)<200', 'p(99)<500'],
    contract_create_duration: ['p(95)<300', 'p(99)<800'],
    contract_patch_duration: ['p(95)<200', 'p(99)<500'],
    contract_validate_duration: ['p(95)<200', 'p(99)<500'],
  },
};

// ---------------------------------------------------------------------------
// Auth headers (dev-mode header-based auth)
// ---------------------------------------------------------------------------

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-tenant-id': LAWFIRM_TENANT,
    'x-user-id': LAWFIRM_EDITOR,
    'x-user-role': 'editor',
  };
}

// ---------------------------------------------------------------------------
// Helper: track failures
// ---------------------------------------------------------------------------

function trackResponse(res, name) {
  if (res.status >= 400) {
    failedRequests.add(1);
    console.warn(
      `[${name}] status=${res.status} body=${res.body ? res.body.substring(0, 200) : '(empty)'}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Scenario: Smoke (1 VU, 30 s)
// ---------------------------------------------------------------------------

export function smokeTest() {
  group('Smoke — Health', () => {
    const res = http.get(`${API}/health`);
    healthCheckDuration.add(res.timings.duration);
    check(res, {
      'health: status 200': (r) => r.status === 200,
      'health: body has status': (r) => {
        try { return JSON.parse(r.body).status === 'ok'; } catch { return false; }
      },
    });
    trackResponse(res, 'health');
  });

  group('Smoke — Clause List', () => {
    const res = http.get(`${API}/content/clauses?page=1&pageSize=10`, {
      headers: authHeaders(),
    });
    clauseListDuration.add(res.timings.duration);
    check(res, {
      'clauses: status 200': (r) => r.status === 200,
      'clauses: has data array': (r) => {
        try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; }
      },
    });
    trackResponse(res, 'clauses');
  });

  group('Smoke — Catalog Templates', () => {
    const res = http.get(`${API}/content/catalog/templates?page=1&pageSize=10`, {
      headers: authHeaders(),
    });
    catalogDuration.add(res.timings.duration);
    check(res, {
      'catalog: status 200': (r) => r.status === 200,
      'catalog: has data array': (r) => {
        try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; }
      },
    });
    trackResponse(res, 'catalog');
  });

  group('Smoke — Contract List', () => {
    const res = http.get(`${API}/contracts?page=1&pageSize=10`, {
      headers: authHeaders(),
    });
    contractListDuration.add(res.timings.duration);
    check(res, {
      'contracts: status 200': (r) => r.status === 200,
      'contracts: has data array': (r) => {
        try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; }
      },
    });
    trackResponse(res, 'contracts');
  });

  group('Smoke — Create Contract', () => {
    const payload = JSON.stringify({
      title: `Load-Test-Vertrag Smoke ${Date.now()}`,
      templateVersionId: PUBLISHED_TEMPLATE_VERSION,
    });

    const res = http.post(`${API}/contracts`, payload, {
      headers: authHeaders(),
    });
    contractCreateDuration.add(res.timings.duration);
    check(res, {
      'create contract: status 201': (r) => r.status === 201,
      'create contract: has id': (r) => {
        try { return !!JSON.parse(r.body).id; } catch { return false; }
      },
    });
    trackResponse(res, 'create-contract');

    // If creation succeeded, test PATCH and validate on the new contract
    if (res.status === 201) {
      const contract = JSON.parse(res.body);

      // Auto-save answers
      const patchPayload = JSON.stringify({
        answers: { kaufpreis: 25000, gewaehrleistungsfrist: 12 },
      });
      const patchRes = http.patch(`${API}/contracts/${contract.id}`, patchPayload, {
        headers: authHeaders(),
      });
      contractPatchDuration.add(patchRes.timings.duration);
      check(patchRes, {
        'patch contract: status 200': (r) => r.status === 200,
      });
      trackResponse(patchRes, 'patch-contract');

      // Validate rules
      const validateRes = http.post(
        `${API}/contracts/${contract.id}/validate`,
        null,
        { headers: authHeaders() },
      );
      contractValidateDuration.add(validateRes.timings.duration);
      check(validateRes, {
        'validate: status 200': (r) => r.status === 200,
        'validate: has validationState': (r) => {
          try { return !!JSON.parse(r.body).validationState; } catch { return false; }
        },
      });
      trackResponse(validateRes, 'validate-contract');
    }
  });

  sleep(1);
}

// ---------------------------------------------------------------------------
// Scenario: Load (20 VUs, 2 min)
// ---------------------------------------------------------------------------

export function loadTest() {
  // Mix of read-heavy and occasional write operations
  const roll = Math.random();

  if (roll < 0.25) {
    // 25 % — Health check
    group('Load — Health', () => {
      const res = http.get(`${API}/health`);
      healthCheckDuration.add(res.timings.duration);
      check(res, { 'health: 200': (r) => r.status === 200 });
      trackResponse(res, 'health');
    });
  } else if (roll < 0.45) {
    // 20 % — Clause list (paginated)
    group('Load — Clause List', () => {
      const page = Math.ceil(Math.random() * 3);
      const res = http.get(`${API}/content/clauses?page=${page}&pageSize=10`, {
        headers: authHeaders(),
      });
      clauseListDuration.add(res.timings.duration);
      check(res, { 'clauses: 200': (r) => r.status === 200 });
      trackResponse(res, 'clauses');
    });
  } else if (roll < 0.65) {
    // 20 % — Catalog templates
    group('Load — Catalog Templates', () => {
      const res = http.get(`${API}/content/catalog/templates?page=1&pageSize=10`, {
        headers: authHeaders(),
      });
      catalogDuration.add(res.timings.duration);
      check(res, { 'catalog: 200': (r) => r.status === 200 });
      trackResponse(res, 'catalog');
    });
  } else if (roll < 0.80) {
    // 15 % — Contract list
    group('Load — Contract List', () => {
      const res = http.get(`${API}/contracts?page=1&pageSize=10`, {
        headers: authHeaders(),
      });
      contractListDuration.add(res.timings.duration);
      check(res, { 'contracts: 200': (r) => r.status === 200 });
      trackResponse(res, 'contracts');
    });
  } else if (roll < 0.90) {
    // 10 % — Create + Patch + Validate (write flow)
    group('Load — Write Flow', () => {
      const payload = JSON.stringify({
        title: `Load-Test-Vertrag ${__VU}-${__ITER}-${Date.now()}`,
        templateVersionId: PUBLISHED_TEMPLATE_VERSION,
      });

      const createRes = http.post(`${API}/contracts`, payload, {
        headers: authHeaders(),
      });
      contractCreateDuration.add(createRes.timings.duration);
      check(createRes, { 'create: 201': (r) => r.status === 201 });
      trackResponse(createRes, 'create-contract');

      if (createRes.status === 201) {
        const contract = JSON.parse(createRes.body);

        // Auto-save
        const patchPayload = JSON.stringify({
          answers: {
            kaufpreis: Math.floor(Math.random() * 100000) + 1000,
            gewaehrleistungsfrist: [12, 24, 36][Math.floor(Math.random() * 3)],
            gerichtsort: ['Berlin', 'Hamburg', 'München', 'Frankfurt'][Math.floor(Math.random() * 4)],
          },
        });
        const patchRes = http.patch(`${API}/contracts/${contract.id}`, patchPayload, {
          headers: authHeaders(),
        });
        contractPatchDuration.add(patchRes.timings.duration);
        check(patchRes, { 'patch: 200': (r) => r.status === 200 });
        trackResponse(patchRes, 'patch-contract');
      }
    });
  } else {
    // 10 % — Validate existing contract
    group('Load — Validate', () => {
      const validateRes = http.post(
        `${API}/contracts/${EXISTING_CONTRACT}/validate`,
        null,
        { headers: authHeaders() },
      );
      contractValidateDuration.add(validateRes.timings.duration);
      check(validateRes, { 'validate: 200': (r) => r.status === 200 });
      trackResponse(validateRes, 'validate-contract');
    });
  }

  sleep(0.5 + Math.random() * 1.5); // 0.5–2 s think time
}

// ---------------------------------------------------------------------------
// Scenario: Stress (ramp 0→50→50→0 over 4 min)
// ---------------------------------------------------------------------------

export function stressTest() {
  // Under stress we focus on the most common user operations
  const roll = Math.random();

  if (roll < 0.15) {
    // 15 % — Health (canary)
    const res = http.get(`${API}/health`);
    healthCheckDuration.add(res.timings.duration);
    check(res, { 'stress health: 200': (r) => r.status === 200 });
    trackResponse(res, 'health');
  } else if (roll < 0.35) {
    // 20 % — Clause list
    const page = Math.ceil(Math.random() * 5);
    const res = http.get(`${API}/content/clauses?page=${page}&pageSize=20`, {
      headers: authHeaders(),
    });
    clauseListDuration.add(res.timings.duration);
    check(res, { 'stress clauses: 200': (r) => r.status === 200 });
    trackResponse(res, 'clauses');
  } else if (roll < 0.55) {
    // 20 % — Catalog
    const res = http.get(`${API}/content/catalog/templates?page=1&pageSize=20`, {
      headers: authHeaders(),
    });
    catalogDuration.add(res.timings.duration);
    check(res, { 'stress catalog: 200': (r) => r.status === 200 });
    trackResponse(res, 'catalog');
  } else if (roll < 0.70) {
    // 15 % — Contract list
    const res = http.get(`${API}/contracts?page=1&pageSize=20`, {
      headers: authHeaders(),
    });
    contractListDuration.add(res.timings.duration);
    check(res, { 'stress contracts: 200': (r) => r.status === 200 });
    trackResponse(res, 'contracts');
  } else if (roll < 0.85) {
    // 15 % — Full write flow (create + patch + validate)
    const payload = JSON.stringify({
      title: `Stress-Vertrag ${__VU}-${__ITER}-${Date.now()}`,
      templateVersionId: PUBLISHED_TEMPLATE_VERSION,
    });

    const createRes = http.post(`${API}/contracts`, payload, {
      headers: authHeaders(),
    });
    contractCreateDuration.add(createRes.timings.duration);
    check(createRes, { 'stress create: 201': (r) => r.status === 201 });
    trackResponse(createRes, 'create-contract');

    if (createRes.status === 201) {
      const contract = JSON.parse(createRes.body);

      const patchPayload = JSON.stringify({
        answers: {
          kaufpreis: Math.floor(Math.random() * 200000) + 500,
          gewaehrleistungsfrist: [6, 12, 24, 36][Math.floor(Math.random() * 4)],
          haftungsbeschraenkung: Math.random() > 0.5,
          gerichtsort: ['Berlin', 'Hamburg', 'München', 'Frankfurt', 'Köln'][
            Math.floor(Math.random() * 5)
          ],
        },
      });

      const patchRes = http.patch(`${API}/contracts/${contract.id}`, patchPayload, {
        headers: authHeaders(),
      });
      contractPatchDuration.add(patchRes.timings.duration);
      check(patchRes, { 'stress patch: 200': (r) => r.status === 200 });
      trackResponse(patchRes, 'patch-contract');

      const validateRes = http.post(
        `${API}/contracts/${contract.id}/validate`,
        null,
        { headers: authHeaders() },
      );
      contractValidateDuration.add(validateRes.timings.duration);
      check(validateRes, { 'stress validate: 200': (r) => r.status === 200 });
      trackResponse(validateRes, 'validate-contract');
    }
  } else {
    // 15 % — Validate existing contract (read-heavy validation)
    const validateRes = http.post(
      `${API}/contracts/${EXISTING_CONTRACT}/validate`,
      null,
      { headers: authHeaders() },
    );
    contractValidateDuration.add(validateRes.timings.duration);
    check(validateRes, { 'stress validate existing: 200': (r) => r.status === 200 });
    trackResponse(validateRes, 'validate-contract');
  }

  sleep(0.3 + Math.random() * 1.0); // 0.3–1.3 s think time (faster under stress)
}

// ---------------------------------------------------------------------------
// Summary handler — JSON output for CI integration
// ---------------------------------------------------------------------------

export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = `src/__tests__/load/results-${timestamp}.json`;

  // Build a human-readable summary for console
  const summary = [];
  summary.push('');
  summary.push('='.repeat(70));
  summary.push('  SERVANDA OFFICE — API LOAD TEST RESULTS');
  summary.push('='.repeat(70));
  summary.push('');

  const metrics = data.metrics;

  // HTTP Request Duration
  if (metrics.http_req_duration) {
    const d = metrics.http_req_duration.values;
    summary.push('  HTTP Request Duration:');
    summary.push(`    P50:  ${d.med?.toFixed(2) || 'N/A'} ms`);
    summary.push(`    P90:  ${d['p(90)']?.toFixed(2) || 'N/A'} ms`);
    summary.push(`    P95:  ${d['p(95)']?.toFixed(2) || 'N/A'} ms`);
    summary.push(`    P99:  ${d['p(99)']?.toFixed(2) || 'N/A'} ms`);
    summary.push(`    Max:  ${d.max?.toFixed(2) || 'N/A'} ms`);
    summary.push('');
  }

  // Error rate
  if (metrics.http_req_failed) {
    const rate = metrics.http_req_failed.values.rate;
    summary.push(`  Error Rate: ${(rate * 100).toFixed(2)} %`);
    summary.push('');
  }

  // Per-endpoint durations
  const endpointMetrics = [
    ['Health Check', 'health_check_duration'],
    ['Clause List', 'clause_list_duration'],
    ['Catalog Templates', 'catalog_duration'],
    ['Contract List', 'contract_list_duration'],
    ['Contract Create', 'contract_create_duration'],
    ['Contract Patch', 'contract_patch_duration'],
    ['Contract Validate', 'contract_validate_duration'],
  ];

  summary.push('  Per-Endpoint P95 / P99:');
  for (const [label, key] of endpointMetrics) {
    if (metrics[key]) {
      const v = metrics[key].values;
      summary.push(
        `    ${label.padEnd(22)} P95: ${v['p(95)']?.toFixed(2) || 'N/A'} ms  |  P99: ${v['p(99)']?.toFixed(2) || 'N/A'} ms`,
      );
    }
  }
  summary.push('');

  // Thresholds
  if (data.thresholds) {
    summary.push('  Threshold Results:');
    for (const [name, result] of Object.entries(data.thresholds)) {
      const ok = result.ok ? 'PASS' : 'FAIL';
      summary.push(`    [${ok}] ${name}`);
    }
    summary.push('');
  }

  summary.push('='.repeat(70));
  summary.push('');

  return {
    stdout: summary.join('\n'),
    [jsonPath]: JSON.stringify(data, null, 2),
  };
}
