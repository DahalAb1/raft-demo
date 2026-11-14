import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { scenarios, story, chapterStart } from '../docs/story.mjs';

for (const [name, scenario] of Object.entries(scenarios)) {
  test(name + ': every frame respects commitment and ordered application', () => {
    for (const frame of scenario.frames) {
      assert.equal(frame.nodes.length, 3);
      assert.ok(frame.nodes.filter(n => n.role === 'Leader' && n.online).length <= 1);
      for (const n of frame.nodes) {
        assert.ok(n.applied <= n.commit && n.commit <= n.log.length, frame.tag);
        let value = null, version = 0;
        for (let i = 0; i < n.log.length; i++) {
          const e = n.log[i];
          assert.equal(e.index, i + 1);
          if (i < n.applied && e.expected === version) { value = e.value; version++; }
          if (i < n.commit) {
            // Even an offline replica counts toward the historical commitment proof.
            assert.ok(frame.nodes.filter(peer => {
              const other = peer.log[i];
              return other && other.term === e.term && other.value === e.value && other.expected === e.expected;
            }).length >= 2, frame.tag + ': committed without a majority');
          }
        }
        assert.equal(n.value, value, frame.tag);
        assert.equal(n.version, version, frame.tag);
      }
      if (frame.message) {
        assert.ok(frame.message.from === 'client' || frame.nodes[frame.message.from].online, frame.tag);
        for (const target of frame.message.to) assert.ok(target === 'client' || frame.nodes[target].online, frame.tag);
      }
      if (frame.client.kind === 'saved') {
        assert.ok(frame.nodes.some(n => n.value === frame.client.confirmed && n.applied > 0), frame.tag);
      }
    }
  });
  test(name + ': each chapter is reachable and snapshots are independent', () => {
    for (let i = 0; i < scenario.chapters.length; i++) assert.ok(chapterStart(scenario.frames, i) >= 0);
    for (let i = 1; i < scenario.frames.length; i++) {
      assert.notEqual(scenario.frames[i].nodes, scenario.frames[i - 1].nodes);
      assert.notEqual(scenario.frames[i].nodes[0].log, scenario.frames[i - 1].nodes[0].log);
    }
  });
}
test('the app waits for a committed and applied operation before receiving success', () => {
  assert.equal(story.find(f => f.tag === 'ack-library').client.kind, 'waiting');
  assert.equal(story.find(f => f.tag === 'commit-library').client.kind, 'waiting');
  const confirmation = story.find(f => f.tag === 'confirmed-library');
  assert.equal(confirmation.client.kind, 'saved');
  assert.equal(confirmation.nodes[0].value, 'Library');
  assert.equal(confirmation.nodes[2].value, null, 'slow follower should still be behind');
});
test('recovery shows the missing write and distinguishes a stored log from applied state', () => {
  const stale = story.find(f => f.tag === 'offline-stale');
  assert.deepEqual(stale.nodes.map(n => n.value), ['Library', 'Café', 'Café']);
  const stored = story.find(f => f.tag === 'catchup-stored').nodes[0];
  assert.equal(stored.term, 2);
  assert.equal(stored.log.length, 2);
  assert.equal(stored.value, null);
  assert.equal(stored.applied, 0);
  assert.deepEqual(story.at(-1).nodes.map(n => [n.value, n.version]), [['Café', 2], ['Café', 2], ['Café', 2]]);
});
test('one of three cannot commit or acknowledge the pending write', () => {
  const pending = scenarios.quorum.frames.find(f => f.tag === 'quorum-pending');
  assert.equal(pending.nodes.filter(n => n.online).length, 1);
  assert.equal(pending.nodes[1].log.at(-1).value, 'Park');
  assert.equal(pending.nodes[1].value, 'Café');
  assert.equal(pending.client.kind, 'waiting');
  assert.equal(pending.meter.blocked, true);
});
test('stale writes are replicated and applied but do not overwrite the value', () => {
  const rejection = scenarios.version.frames.find(f => f.tag === 'bob-rejected');
  assert.equal(rejection.nodes[1].applied, 4);
  assert.equal(rejection.nodes[1].log[3].value, 'Museum');
  assert.equal(rejection.nodes[1].value, 'Park');
  assert.equal(rejection.nodes[1].version, 3);
  const done = scenarios.version.frames.at(-1);
  assert.equal(done.client.kind, 'rejected');
  assert.deepEqual(done.nodes.map(n => n.applied), [4, 4, 4]);
  assert.deepEqual(done.nodes.map(n => n.value), ['Park', 'Park', 'Park']);
});
test('the page is self-contained on GitHub Pages and has no repository links', () => {
  const html = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /github\.com|<script[^>]+https?:/);
  for (const match of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)) {
    assert.ok(existsSync(new URL('../docs/' + match[1], import.meta.url)), match[1]);
  }
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate IDs');
  const script = readFileSync(new URL('../docs/app.mjs', import.meta.url), 'utf8');
  for (const match of script.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.includes(match[1]), match[1]);
});

test('the main story introduces three followers and demonstrates the first election', () => {
  assert.deepEqual(story[0].nodes.map(n => n.role), ['Follower', 'Follower', 'Follower']);
  assert.deepEqual(story[0].nodes.map(n => n.term), [0, 0, 0]);
  const campaign = story.find(f => f.tag === 'initial-request-vote');
  assert.equal(campaign.nodes[0].role, 'Candidate');
  assert.equal(campaign.nodes[0].votedFor, 0);
  assert.deepEqual(campaign.message.to, [1, 2]);
  const elected = story.find(f => f.tag === 'initial-leader');
  assert.equal(elected.nodes[0].role, 'Leader');
  assert.ok(elected.nodes.filter(n => n.votedFor === 0 && n.term === 1).length >= 2);
  assert.ok(story.indexOf(elected) < story.findIndex(f => f.tag === 'request-library'));
});
test('the first update is sent to both followers', () => {
  assert.deepEqual(story.find(f => f.tag === 'copy-library').message.to, [1, 2]);
});
test('all scenarios are visible before the animation', () => {
  const html = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
  for (const name of Object.keys(scenarios)) {
    assert.ok(html.indexOf('data-scenario="' + name + '"') < html.indexOf('id="demo"'));
  }
  assert.ok(html.indexOf('id="step-text"') < html.indexOf('id="network"'), 'explanation should precede event');
});
