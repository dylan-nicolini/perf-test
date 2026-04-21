import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  vus: 10,
  duration: '30s',
};

export default function () {
  const url = 'https://p4hhmp3dhn2rykpxoamkg5sjzi0yyrgg.lambda-url.us-east-1.on.aws';

  // You must include there
  const payload = JSON.stringify({
    Name: "Dylan Nicolini",
    Email: "Dylan.Nicolini@quinnipiac.edu",
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post(url, payload, params);


  const body = res.body || "";

  check(res, {
    'status is 200': (r) => r.status === 200,
    
  });

  sleep(1);
}