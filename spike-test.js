/**
 * SER 330 — Performance Testing Lab
 * SPIKE TEST
 *
 * Purpose: Test how the system responds to a sudden, extreme burst of traffic —
 *          simulating a flash crowd, viral event, or class all submitting at once.
 * Pattern: Low baseline → instant spike → back to baseline → second spike → cool down
 *
 * Run: k6 run spike-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate    = new Rate('error_rate');
const responseTime = new Trend('response_time', true);

// ----------------------------------------------------------------
// Test configuration
// ----------------------------------------------------------------
export const options = {
  stages: [
    { duration: '30s', target: 5   }, // Baseline — low steady traffic
    { duration: '10s', target: 100 }, // SPIKE — instant jump to 100 VUs
    { duration: '1m',  target: 100 }, // Hold spike for 1 minute
    { duration: '10s', target: 5   }, // Drop back to baseline
    { duration: '1m',  target: 5   }, // Recovery period — watch for lingering errors
    { duration: '10s', target: 100 }, // Second spike — does the system recover fully?
    { duration: '1m',  target: 100 }, // Hold second spike
    { duration: '10s', target: 0   }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],  // 95% under 3s even during spike
    http_req_failed:   ['rate<0.10'],   // No more than 10% errors
    error_rate:        ['rate<0.10'],
  },
};

const BASE_URL = 'https://lwrlkjxym6.execute-api.us-east-1.amazonaws.com/prod/echo';
const API_KEY  = '0NSn7DN3iw607cecVNuhj8iTdVzadBIY8eBXvsJU';

const HEADERS = {
  'Content-Type': 'application/json',
  'x-api-key': API_KEY,
};

// ----------------------------------------------------------------
// Default function
// ----------------------------------------------------------------
export default function () {
  const payload = JSON.stringify({
    StudentName:  'Spike Test User',
    StudentEmail: 'spiketest@quinnipiac.edu',
  });

  const res = http.post(BASE_URL, payload, {
    headers: HEADERS,
    timeout: '15s',
  });

  responseTime.add(res.timings.duration);
  errorRate.add(res.status !== 200);

  check(res, {
    'status is 200':          (r) => r.status === 200,
    'response time < 3000ms': (r) => r.timings.duration < 3000,
    'no 429 throttle':        (r) => r.status !== 429,
    'no 502 bad gateway':     (r) => r.status !== 502,
    'student data echoed':    (r) => {
      try { return r.json('echo.student.name') === 'Spike Test User'; }
      catch { return false; }
    },
  });

  sleep(0.5);
}

// ----------------------------------------------------------------
// Summary
// ----------------------------------------------------------------
export function handleSummary(data) {
  const errRate = data.metrics.http_req_failed.values.rate;
  const p95     = data.metrics.http_req_duration.values['p(95)'];
  const passed  = errRate < 0.10 && p95 < 3000;

  return {
    stdout: `
========================================
  SPIKE TEST SUMMARY
========================================
  Total Requests:   ${data.metrics.http_reqs.values.count}
  Failed Requests:  ${(errRate * 100).toFixed(2)}%
  Avg Response:     ${data.metrics.http_req_duration.values.avg.toFixed(0)}ms
  p95 Response:     ${p95.toFixed(0)}ms
  p99 Response:     ${data.metrics.http_req_duration.values['p(99)'].toFixed(0)}ms
  Max Response:     ${data.metrics.http_req_duration.values.max.toFixed(0)}ms
  Throughput:       ${data.metrics.http_reqs.values.rate.toFixed(2)} req/s
  Result:           ${passed ? '✅ PASSED' : '❌ FAILED'}

  KEY QUESTIONS TO ANSWER:
  - Did error rate increase immediately during the spike?
  - Did response time recover during the baseline period between spikes?
  - Was the system slower on the second spike vs the first?
  - Did any requests get throttled (HTTP 429)?
========================================
`,
  };
}
