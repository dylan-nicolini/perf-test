/**
 * SER 330 — Performance Testing Lab
 * STRESS TEST
 *
 * Purpose: Gradually increase load beyond normal capacity to find the
 *          breaking point — where errors spike or latency becomes unacceptable.
 * Pattern: Incremental ramp up in stages with no cool-down between stages.
 *
 * Run: k6 run stress-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate    = new Rate('error_rate');
const responseTime = new Trend('response_time', true);
const errorCount   = new Counter('error_count');

// ----------------------------------------------------------------
// Test configuration
// ----------------------------------------------------------------
export const options = {
  stages: [
    { duration: '1m',  target: 10  }, // Warm up
    { duration: '2m',  target: 25  }, // Normal load
    { duration: '2m',  target: 50  }, // Above normal
    { duration: '2m',  target: 75  }, // High load
    { duration: '2m',  target: 100 }, // Very high load
    { duration: '2m',  target: 125 }, // Stress zone
    { duration: '2m',  target: 150 }, // Breaking point?
    { duration: '3m',  target: 0   }, // Recovery — ramp all the way down
  ],
  thresholds: {
    // These thresholds define when the test is considered "failed"
    // For a stress test, we expect them to be breached at high load —
    // that's the point. Watch WHERE in the stages they break.
    http_req_duration: ['p(95)<5000'],  // Allow up to 5s under stress
    http_req_failed:   ['rate<0.20'],   // Allow up to 20% errors under stress
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
    StudentName:  'Stress Test User',
    StudentEmail: 'stresstest@quinnipiac.edu',
  });

  const res = http.post(BASE_URL, payload, {
    headers: HEADERS,
    timeout: '10s', // Allow longer timeout for stressed system
  });

  responseTime.add(res.timings.duration);

  const failed = res.status !== 200;
  errorRate.add(failed);
  if (failed) errorCount.add(1);

  check(res, {
    'status is 200':          (r) => r.status === 200,
    'response time < 5000ms': (r) => r.timings.duration < 5000,
    'no 429 throttle':        (r) => r.status !== 429,
    'no 503 unavailable':     (r) => r.status !== 503,
  });

  sleep(0.5); // Shorter think time to maximise pressure
}

// ----------------------------------------------------------------
// Summary
// ----------------------------------------------------------------
export function handleSummary(data) {
  const p95  = data.metrics.http_req_duration.values['p(95)'].toFixed(0);
  const p99  = data.metrics.http_req_duration.values['p(99)'].toFixed(0);
  const errR = (data.metrics.http_req_failed.values.rate * 100).toFixed(2);

  return {
    stdout: `
========================================
  STRESS TEST SUMMARY
========================================
  Total Requests:   ${data.metrics.http_reqs.values.count}
  Failed Requests:  ${errR}%
  Total Errors:     ${data.metrics.error_count ? data.metrics.error_count.values.count : 'N/A'}
  Avg Response:     ${data.metrics.http_req_duration.values.avg.toFixed(0)}ms
  p95 Response:     ${p95}ms
  p99 Response:     ${p99}ms
  Max Response:     ${data.metrics.http_req_duration.values.max.toFixed(0)}ms
  Throughput:       ${data.metrics.http_reqs.values.rate.toFixed(2)} req/s

  ANALYSIS:
  - If errors spiked at a specific stage, that stage marks the saturation point.
  - If p99 > 5000ms, the system was under unacceptable stress at that point.
  - Recovery stage shows how quickly the system stabilises after load drops.
========================================
`,
  };
}
