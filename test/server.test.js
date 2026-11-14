import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJobs } from '../src/server.js';

test('parseJobs extracts public job cards', () => {
  const jobs = parseJobs('<li><div data-entity-urn="urn:li:jobPosting:123"><a class="base-card__full-link" href="https://linkedin.com/jobs/view/123">x</a><h3> Dev </h3><h4> Acme </h4><span class="job-search-card__location"> Jakarta </span><time datetime="2026-01-01">today</time></div></li>');
  assert.deepEqual(jobs[0], { id: '123', title: 'Dev', company: 'Acme', location: 'Jakarta', postedAt: '2026-01-01', url: 'https://linkedin.com/jobs/view/123' });
});
