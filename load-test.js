/**
 * SER 330 — Performance Testing Lab
 * LOAD TEST
 *
 * Purpose: Verify the API performs acceptably under expected, sustained traffic.
 * Pattern: Ramp up → Steady state → Ramp down
 *
 * Run: k6 run load-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('error_rate');
const responseTime = new Trend('response_time', true);

// ----------------------------------------------------------------
// Test configuration
// ----------------------------------------------------------------
export const options = {
  stages: [
    { duration: '1m',  target: 10  }, // Ramp up to 10 virtual users over 1 minute
    { duration: '1m',  target: 25  }, // Ramp up to 25 virtual users
    { duration: '3m',  target: 25  }, // Hold steady state at 25 VUs for 3 minutes
    { duration: '1m',  target: 0   }, // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95% of requests must complete under 2s
    http_req_failed:   ['rate<0.05'],   // Error rate must stay below 5%
    error_rate:        ['rate<0.05'],
  },
};

const BASE_URL = 'https://lwrlkjxym6.execute-api.us-east-1.amazonaws.com/prod/echo';
const API_KEY  = '0NSn7DN3iw607cecVNuhj8iTdVzadBIY8eBXvsJU';

const HEADERS = {
  'Content-Type': 'application/json',
  'x-api-key': API_KEY,
};

// ----------------------------------------------------------------
// Default function — runs once per VU per iteration
// ----------------------------------------------------------------
export default function () {
  const payload = JSON.stringify({
    StudentName:  'Load Test User',
    StudentEmail: 'loadtest@quinnipiac.edu',
  });

  const res = http.post(BASE_URL, payload, { headers: HEADERS });

  // Track custom metrics
  responseTime.add(res.timings.duration);
  errorRate.add(res.status !== 200);

  // Assertions — failures are logged but do not stop the test
  check(res, {
    'status is 200':          (r) => r.status === 200,
    'response has message ok': (r) => r.json('message') === 'ok',
    'response time < 2000ms': (r) => r.timings.duration < 2000,
    'student name echoed':    (r) => r.json('echo.student.name') === 'Load Test User',
  });

  sleep(1); // 1 second think time between requests per VU
}

// ----------------------------------------------------------------
// Summary output — printed after the test completes
// ----------------------------------------------------------------
export function handleSummary(data) {
  const passed = data.metrics.http_req_failed.values.rate < 0.05
    && data.metrics.http_req_duration.values['p(95)'] < 2000;

  return {
    stdout: `
========================================
  LOAD TEST SUMMARY
========================================
  Total Requests:   ${data.metrics.http_reqs.values.count}
  Failed Requests:  ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%
  Avg Response:     ${data.metrics.http_req_duration.values.avg.toFixed(0)}ms
  p95 Response:     ${data.metrics.http_req_duration.values['p(95)'].toFixed(0)}ms
  p99 Response:     ${data.metrics.http_req_duration.values['p(99)'].toFixed(0)}ms
  Max Response:     ${data.metrics.http_req_duration.values.max.toFixed(0)}ms
  Throughput:       ${data.metrics.http_reqs.values.rate.toFixed(2)} req/s
  Result:           ${passed ? '✅ PASSED' : '❌ FAILED'}
========================================
`,
  };
}
