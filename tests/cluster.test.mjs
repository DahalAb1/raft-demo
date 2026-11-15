import test from 'node:test';
import assert from 'node:assert/strict';
import { Cluster } from '../docs/cluster.mjs';
import { readFileSync, existsSync } from 'node:fs';
function settle(c, condition, limit = 60000) {
  for (let t = 0; t < limit; t += 50) { c.step(50); invariants(c); if (condition()) return; }
  assert.fail('condition not reached: ' + JSON.stringify(c.client));
}
function invariants(c) {
  const leaders = c.nodes.filter(n => n.online && n.role === 'Leader');
  assert.equal(new Set(leaders.map(n => n.term)).size, leaders.length, 'at most one leader per term');
  for (const n of c.nodes) {
    assert.ok(n.applied <= n.commit && n.commit <= n.log.length, 'valid committed/applied bounds');
    let value = null, version = 0; const seen = new Set();
    for (let i = 0; i < n.applied; i++) {
      const e = n.log[i];
      if (!seen.has(e.request) && e.expected === version) { value = e.value; version++; }
      seen.add(e.request);
      const count = c.nodes.filter(p => p.log[i]?.term === e.term && p.log[i]?.value === e.value).length;
      assert.ok(count >= 3, 'applied entry has majority replication evidence');
    }
    assert.equal(n.value, value); assert.equal(n.version, version);
  }
}
test('randomized elections and confirmed updates work across 40 schedules', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const c = new Cluster({seed}); settle(c, () => !!c.leader);
    c.save('Hello'); assert.notEqual(c.client.status, 'Saved');
    settle(c, () => !c.client.pending && c.nodes.every(n => n.value === 'Hello'));
    assert.equal(c.client.version, 1);
  }
});
test('two connected servers cannot confirm a write; restoring a third unblocks it', () => {
  const c = new Cluster({seeded:true}); c.toggle(1); c.toggle(2); c.toggle(3); c.save('Park');
  c.step(12000); invariants(c);
  assert.equal(c.client.value,'Hello'); assert.ok(c.client.pending);
  assert.equal(c.nodes[0].commit,1); assert.equal(c.nodes[0].log.length,2);
  c.toggle(1); settle(c, () => !c.client.pending);
  assert.equal(c.client.value,'Park');
});
test('a saved change survives leader loss and the old leader catches up', () => {
  const c = new Cluster({seeded:true}); c.toggle(0); settle(c, () => !!c.leader);
  c.save('Café'); settle(c, () => !c.client.pending);
  assert.equal(c.nodes[0].value,'Hello'); c.toggle(0);
  assert.equal(c.nodes[0].value,null); assert.equal(c.nodes[0].log.length,1);
  settle(c, () => c.nodes.every(n => n.value === 'Café'));
});
test('leader failure at different in-flight write stages eventually resolves', () => {
  for (const ms of [0,300,700,1000,1300,1700,2200]) {
    const c = new Cluster({seeded:true}); c.save('Café'); c.step(ms); c.toggle(0);
    settle(c, () => !c.client.pending); assert.equal(c.client.value,'Café');
    assert.equal(c.client.version,2, 'retries must not apply the same update twice');
    c.toggle(0); settle(c, () => c.nodes.every(n => n.value === 'Café' && n.version === 2));
  }
});
test('an old version is replicated and rejected without changing the plan', () => {
  const c=new Cluster({seeded:true});c.save('Park',0);settle(c,()=>!c.client.pending);
  assert.equal(c.client.status,'Version changed');assert.equal(c.client.value,'Hello');
  assert.equal(c.leader.log.length,2);assert.equal(c.leader.applied,2);
});
test('an old matching replication request does not erase a newer suffix', () => {
  const c=new Cluster({seeded:true});c.save('Café');settle(c,()=>c.nodes.every(n=>n.applied===2));
  c.receive({from:0,to:1,type:'append',body:{term:1,prev:0,prevTerm:0,entries:[c.nodes[0].log[0]],commit:1}});
  assert.equal(c.nodes[1].log.length,2);assert.equal(c.nodes[1].commit,2);invariants(c);
});
test('a stale candidate cannot win a vote from a more up-to-date follower', () => {
  const c=new Cluster({seeded:true});c.toggle(2);c.save('Café');settle(c,()=>!c.client.pending);
  const voter=c.nodes[1];c.receive({from:2,to:1,type:'vote',body:{term:2,lastIndex:1,lastTerm:1}});
  assert.equal(voter.vote,null);assert.equal(c.messages.at(-1).body.granted,false);
});
test('a disconnected leader cannot confirm a new write, while three others can elect a replacement',()=>{
 const c=new Cluster({seeded:true});c.disconnect(0);c.disconnect(1);c.step(20000);
 assert.ok(c.leader);assert.notEqual(c.leader.id,0);assert.notEqual(c.leader.id,1);
 c.save('Again');settle(c,()=>!c.client.pending);assert.equal(c.client.value,'Again');
 assert.equal(c.nodes[0].value,'Hello');c.disconnect(0);c.disconnect(1);
 settle(c,()=>c.nodes.every(n=>n.value==='Again'));assert.equal(c.nodes.filter(n=>n.role==='Leader').length,1);
});
test('the simulator accepts only bounded single-word messages',()=>{
 const c=new Cluster();assert.equal(c.save('two words'),false);assert.equal(c.save('<img>'),false);assert.equal(c.save('Hello'),true);
});
