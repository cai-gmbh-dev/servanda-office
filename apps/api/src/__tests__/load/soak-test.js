/**
 * k6 Soak Test — Sprint 13 (Team 06: QA & Compliance)
 *
 * Sustained 15-minute load test for memory leak detection.
 * Ramps up to 20 VUs, holds, then ramps down while tracking
 * process memory via the /api/v1/metrics/process endpoint.
 *
 * Scenarios:
 *   - Content API: List clauses, get clause versions
 *   - Contract API: List contracts, create contract, update answers
 *   - Export API: Create export job, check status
 *
 * Thresholds:
 *   - http_req_duration p(95) < 500ms
 *   - http_req_failed rate < 0.01
 *   - Custom memory growth counter
 *
 * Run:  k6 run apps/api/src/__tests__/load/soak-test.js
 *
 * Environment variables (optional):
 *   API_BASE_URL  — defaults to http://localhost:3000
 *   ADMIN_USER_ID — defaults to seed admin user
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Gauge } from 'k6/metrics';

// ---------------------------------------------------------------------------
// Custom Metrics
// ---------------------------------------------------------------------------

const memoryHeapUsed = new Gauge('memory_heap_used_mb');
const memoryRss = new Gauge('memory_rss_mb');
const memoryGrowthEvents = new Counter('memory_growth_events');
const failedRequests = new Counter('failed_requests');

const clauseListDuration = new Trend('clause_list_duration', true);
const clauseDetailDuration = new Trend('clause_detail_duration', true);
const contractListDuration = new Trend('contract_list_duration', true);
const contractCreateDuration = new Trend('contract_create_duration', true);
const contractPatchDuration = new Trend('contract_patch_duration', true);
const exportCreateDuration = new Trend('export_create_duration', true);
const exportStatusDuration = new Trend('export_status_duration', true);
const healthDuration = new Trend('health_duration', true);
const memoryCheckDuration = new Trend('memory_check_duration', true);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';
const API = `${BASE_URL}/api/v1`;

// Seed data constants (matching prisma/seed.ts)
const LAWFIRM_TENANT = '00000000-0000-0000-0000-000000000002';
const LAWFIRM_EDITOR = '00000000-0000-0000-0002-000000000002';
const LAWFIRM_ADMIN = __ENV.ADMIN_USER_ID || '00000000-0000-0000-0002-000000000001';
const PUBLISHED_TEMPLATE_VERSION = '00000000-0000-0000-0031-000000000001';
const EXISTING_CONTRACT = '00000000-0000-0000-0040-000000000001';

// Memory tracking state
let initialHeapMb = null;
const MEMORY_GROWTH_THRESHOLD_MB = 50; // alert if heap grows > 50 MB from baseline

// ---------------------------------------------------------------------------
// Scenarios — 15-minute soak
// ---------------------------------------------------------------------------

export const options = {
  scenarios: {
    // Main soak scenario: ramp up → hold → ramp down
    soak: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 20 },   // ramp up to 20 VUs over 2 min
        { duration: '11m', target: 20 },   // hold 20 VUs for 11 min
        { duration: '2m', target: 0 },     // ramp down over 2 min
      ],
      gracefulStop: '30s',
      tags: { scenario: 'soak' },
      exec: 'soakTest',
    },

    // Memory monitor: single VU checking process metrics every 30s
    memoryMonitor: {
      executor: 'constant-arrival-rate',
      rate: 2,          // 2 iterations per minute
      timeUnit: '1m',
      duration: '15m',
      preAllocatedVUs: 1,
      maxVUs: 1,
      tags: { scenario: 'memory_monitor' },
      exec: 'memoryMonitorTest',
    },
  },

  thresholds: {
    // Global request thresholds
    http_req_duration: [
      { threshold: 'p(95)<500', abortOnFail: false },
    ],
    http_req_failed: [
      { threshold: 'rate<0.01', abortOnFail: false },
    ],

    // Per-endpoint thresholds
    clause_list_duration: ['p(95)<500'],
    clause_detail_duration: ['p(95)<500'],
    contract_list_duration: ['p(95)<500'],
    contract_create_duration: ['p(95)<500'],
    contract_patch_duration: ['p(95)<500'],
    export_create_duration: ['p(95)<500'],
    export_status_duration: ['p(95)<500'],
    health_duration: ['p(95)<200'],

    // Memory must not grow excessively
    memory_growth_events: ['count<5'],
  },
};

// ---------------------------------------------------------------------------
// Auth Headers
// ---------------------------------------------------------------------------

function editorHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-tenant-id': LAWFIRM_TENANT,
    'x-user-id': LAWFIRM_EDITOR,
    'x-user-role': 'editor',
  };
}

function adminHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-tenant-id': LAWFIRM_TENANT,
    'x-user-id': LAWFIRM_ADMIN,
    'x-user-role': 'admin',
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
// Scenario: Soak Test (main traffic generator)
// ---------------------------------------------------------------------------

export function soakTest() {
  const roll = Math.random();

  if (roll < 0.10) {
    // 10% — Health check (baseline canary)
    group('Soak — Health', () => {
      const res = http.get(`${API}/health`, {
        tags: { endpoint: 'health' },
      });
      healthDuration.add(res.timings.duration);
      check(res, { 'health: 200': (r) => r.status === 200 });
      trackResponse(res, 'health');
    });
  } else if (roll < 0.25) {
    // 15% — Content API: List clauses (paginated)
    group('Soak — Clause List', () => {
      const page = Math.ceil(Math.random() * 5);
      const res = http.get(`${API}/content/clauses?page=${page}&pageSize=20`, {
        headers: editorHeaders(),
        tags: { endpoint: 'clause_list' },
      });
      clauseListDuration.add(res.timings.duration);
      check(res, {
        'clauses: 200': (r) => r.status === 200,
        'clauses: has data': (r) => {
          try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; }
        },
      });
      trackResponse(res, 'clause-list');
    });
  } else if (roll < 0.35) {
    // 10% — Content API: Get clause with versions (detail view)
    group('Soak — Clause Detail', () => {
      // First get a clause ID from the list
      const listRes = http.get(`${API}/content/clauses?page=1&pageSize=5`, {
        headers: editorHeaders(),
        tags: { endpoint: 'clause_list_for_detail' },
      });

      if (listRes.status === 200) {
        try {
          const clauses = JSON.parse(listRes.body).data;
          if (clauses && clauses.length > 0) {
            const clauseId = clauses[Math.floor(Math.random() * clauses.length)].id;
            const detailRes = http.get(`${API}/content/clauses/${clauseId}`, {
              headers: editorHeaders(),
              tags: { endpoint: 'clause_detail' },
            });
            clauseDetailDuration.add(detailRes.timings.duration);
            check(detailRes, {
              'clause detail: 200': (r) => r.status === 200,
              'clause detail: has versions': (r) => {
                try { return Array.isArray(JSON.parse(r.body).versions); } catch { return false; }
              },
            });
            trackResponse(detailRes, 'clause-detail');
          }
        } catch { /* ignore parse errors */ }
      }
    });
  } else if (roll < 0.50) {
    // 15% — Contract API: List contracts
    group('Soak — Contract List', () => {
      const page = Math.ceil(Math.random() * 3);
      const res = http.get(`${API}/contracts?page=${page}&pageSize=20`, {
        headers: editorHeaders(),
        tags: { endpoint: 'contract_list' },
      });
      contractListDuration.add(res.timings.duration);
      check(res, {
        'contracts: 200': (r) => r.status === 200,
        'contracts: has data': (r) => {
          try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; }
        },
      });
      trackResponse(res, 'contract-list');
    });
  } else if (roll < 0.65) {
    // 15% — Contract API: Create contract
    group('Soak — Create Contract', () => {
      const payload = JSON.stringify({
        title: `Soak-Test-Vertrag ${__VU}-${__ITER}-${Date.now()}`,
        templateVersionId: PUBLISHED_TEMPLATE_VERSION,
      });

      const res = http.post(`${API}/contracts`, payload, {
        headers: editorHeaders(),
        tags: { endpoint: 'contract_create' },
      });
      contractCreateDuration.add(res.timings.duration);
      check(res, {
        'create contract: 201': (r) => r.status === 201,
        'create contract: has id': (r) => {
          try { return !!JSON.parse(r.body).id; } catch { return false; }
        },
      });
      trackResponse(res, 'contract-create');
    });
  } else if (roll < 0.80) {
    // 15% — Contract API: Update answers (auto-save)
    group('Soak — Patch Contract', () => {
      const patchPayload = JSON.stringify({
        answers: {
          kaufpreis: Math.floor(Math.random() * 200000) + 1000,
          gewaehrleistungsfrist: [6, 12, 24, 36][Math.floor(Math.random() * 4)],
          gerichtsort: ['Berlin', 'Hamburg', 'München', 'Frankfurt', 'Köln'][
            Math.floor(Math.random() * 5)
          ],
          haftungsbeschraenkung: Math.random() > 0.5,
        },
      });

      const res = http.patch(`${API}/contracts/${EXISTING_CONTRACT}`, patchPayload, {
        headers: editorHeaders(),
        tags: { endpoint: 'contract_patch' },
      });
      contractPatchDuration.add(res.timings.duration);
      check(res, { 'patch: 200': (r) => r.status === 200 });
      trackResponse(res, 'contract-patch');
    });
  } else if (roll < 0.90) {
    // 10% — Export API: Create export job
    group('Soak — Create Export Job', () => {
      const payload = JSON.stringify({
        contractInstanceId: EXISTING_CONTRACT,
        format: 'docx',
      });

      const res = http.post(`${API}/export-jobs`, payload, {
        headers: editorHeaders(),
        tags: { endpoint: 'export_create' },
      });
      exportCreateDuration.add(res.timings.duration);
      check(res, {
        'export create: 201': (r) => r.status === 201,
        'export create: has id': (r) => {
          try { return !!JSON.parse(r.body).id; } catch { return false; }
        },
      });
      trackResponse(res, 'export-create');

      // If export was created, check its status
      if (res.status === 201) {
        try {
          const job = JSON.parse(res.body);
          const statusRes = http.get(`${API}/export-jobs/${job.id}`, {
            headers: editorHeaders(),
            tags: { endpoint: 'export_status' },
          });
          exportStatusDuration.add(statusRes.timings.duration);
          check(statusRes, {
            'export status: 200': (r) => r.status === 200,
            'export status: has status field': (r) => {
              try { return !!JSON.parse(r.body).status; } catch { return false; }
            },
          });
          trackResponse(statusRes, 'export-status');
        } catch { /* ignore parse errors */ }
      }
    });
  } else {
    // 10% — Catalog browsing
    group('Soak — Catalog', () => {
      const res = http.get(`${API}/content/catalog/templates?page=1&pageSize=20`, {
        headers: editorHeaders(),
        tags: { endpoint: 'catalog' },
      });
      check(res, { 'catalog: 200': (r) => r.status === 200 });
      trackResponse(res, 'catalog');
    });
  }

  // Think time: 0.5 – 2 seconds
  sleep(0.5 + Math.random() * 1.5);
}

// ---------------------------------------------------------------------------
// Scenario: Memory Monitor (dedicated VU polling process metrics)
// ---------------------------------------------------------------------------

export function memoryMonitorTest() {
  group('Memory Monitor', () => {
    const res = http.get(`${API}/metrics/process`, {
      headers: adminHeaders(),
      tags: { endpoint: 'process_metrics' },
    });
    memoryCheckDuration.add(res.timings.duration);

    if (res.status === 200) {
      try {
        const metrics = JSON.parse(res.body);
        const heapUsedMb = metrics.memoryUsage.heapUsed / (1024 * 1024);
        const rssMb = metrics.memoryUsage.rss / (1024 * 1024);

        memoryHeapUsed.add(heapUsedMb);
        memoryRss.add(rssMb);

        // Track initial baseline
        if (initialHeapMb === null) {
          initialHeapMb = heapUsedMb;
          console.log(`[Memory] Baseline heap: ${heapUsedMb.toFixed(2)} MB, RSS: ${rssMb.toFixed(2)} MB`);
        } else {
          const growth = heapUsedMb - initialHeapMb;
          console.log(
            `[Memory] Heap: ${heapUsedMb.toFixed(2)} MB (${growth >= 0 ? '+' : ''}${growth.toFixed(2)} MB), RSS: ${rssMb.toFixed(2)} MB, Uptime: ${metrics.uptime.toFixed(0)}s`,
          );

          // Flag excessive memory growth
          if (growth > MEMORY_GROWTH_THRESHOLD_MB) {
            memoryGrowthEvents.add(1);
            console.warn(
              `[Memory] ALERT: Heap grew by ${growth.toFixed(2)} MB (threshold: ${MEMORY_GROWTH_THRESHOLD_MB} MB)`,
            );
          }
        }
      } catch (err) {
        console.warn(`[Memory] Failed to parse process metrics: ${err}`);
      }
    } else {
      // Endpoint might not be available yet — log but don't fail
      console.warn(`[Memory] /metrics/process returned ${res.status}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Summary Handler
// ---------------------------------------------------------------------------

export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = `src/__tests__/load/results-soak-${timestamp}.json`;

  const summary = [];
  summary.push('');
  summary.push('='.repeat(70));
  summary.push('  SERVANDA OFFICE — SOAK TEST RESULTS (Memory Leak Detection)');
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

  // Memory metrics
  if (metrics.memory_heap_used_mb) {
    const heap = metrics.memory_heap_used_mb.values;
    summary.push('  Memory (Heap Used):');
    summary.push(`    Min:  ${heap.min?.toFixed(2) || 'N/A'} MB`);
    summary.push(`    Max:  ${heap.max?.toFixed(2) || 'N/A'} MB`);
    summary.push(`    Last: ${heap.value?.toFixed(2) || 'N/A'} MB`);
    summary.push('');
  }

  if (metrics.memory_rss_mb) {
    const rss = metrics.memory_rss_mb.values;
    summary.push('  Memory (RSS):');
    summary.push(`    Min:  ${rss.min?.toFixed(2) || 'N/A'} MB`);
    summary.push(`    Max:  ${rss.max?.toFixed(2) || 'N/A'} MB`);
    summary.push(`    Last: ${rss.value?.toFixed(2) || 'N/A'} MB`);
    summary.push('');
  }

  if (metrics.memory_growth_events) {
    summary.push(`  Memory Growth Alerts: ${metrics.memory_growth_events.values.count}`);
    summary.push('');
  }

  // Per-endpoint durations
  const endpointMetrics = [
    ['Health Check', 'health_duration'],
    ['Clause List', 'clause_list_duration'],
    ['Clause Detail', 'clause_detail_duration'],
    ['Contract List', 'contract_list_duration'],
    ['Contract Create', 'contract_create_duration'],
    ['Contract Patch', 'contract_patch_duration'],
    ['Export Create', 'export_create_duration'],
    ['Export Status', 'export_status_duration'],
    ['Memory Check', 'memory_check_duration'],
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
