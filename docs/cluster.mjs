// A browser teaching model, independent of the Go implementation.
// Five fixed members; delayed links, connection loss, crash/restart; no snapshots or reads.
export const names = ['West', 'Central', 'East', 'North', 'South'];
const clone = value => structuredClone(value);
export class Cluster {
  constructor({ seeded = false, seed = 41, value = 'Hello' } = {}) {
    this.seed = seed; this.time = 0; this.serial = 0; this.events = []; this.messages = [];
    this.client = { value: seeded ? value : null, version: seeded ? 1 : 0, status: seeded ? 'Saved' : 'No message saved yet', pending: null };
    this.nodes = names.map((name, id) => ({ id, name, online: true, connected: true, role: 'Follower', term: seeded ? 1 : 0,
      vote: null, votes: [], log: seeded ? [{ term: 1, value, expected: 0, request: 0 }] : [],
      commit: seeded ? 1 : 0, applied: seeded ? 1 : 0, value: seeded ? value : null, version: seeded ? 1 : 0,
      next: names.map(() => 1), match: names.map(() => 0), results: {}, heartbeat: 0, applyAt: 0, deadline: 0, wait: 0 }));
    for (const node of this.nodes) this.resetDeadline(node);
    if (seeded) {
      const n = this.nodes[0]; n.role = 'Leader'; n.next = names.map(() => 2); n.match = names.map(() => 1);
      this.note(`“${value}” is saved on all five servers. West coordinates updates.`, 'saved');
    } else this.note('Five servers are starting. Each waits a different time before asking to lead.', 'election');
  }
  random() { this.seed = (Math.imul(1664525, this.seed) + 1013904223) >>> 0; return this.seed / 4294967296; }
  resetDeadline(n) { n.wait = 2500 + this.random() * 2800; n.deadline = this.time + n.wait; }
  get leader() { return this.nodes.filter(n => n.online && n.connected && n.role === 'Leader').sort((a,b) => b.term - a.term)[0]; }
  note(text, kind = 'message') {
    this.events.unshift({ id: ++this.serial, time: this.time, text, kind });
    this.events.length = Math.min(this.events.length, 40);
  }
  send(from, to, type, body = {}) {
    this.messages.push({ id: ++this.serial, from, to, type, body: clone(body), start: this.time,
      end: this.time + 430 + this.random() * 120 });
  }
  follower(n, term) {
    if (term > n.term) { n.term = term; n.vote = null; }
    n.role = 'Follower'; n.votes = []; this.resetDeadline(n);
  }
  election(n) {
    n.role = 'Candidate'; n.term++; n.vote = n.id; n.votes = [n.id]; this.resetDeadline(n);
    this.note(`${n.name} stopped hearing a leader. It votes for itself and asks the other servers to vote.`, 'election');
    this.nodes.filter(p => p.id !== n.id).forEach(p => this.send(n.id, p.id, 'vote', { term: n.term,
      lastIndex: n.log.length, lastTerm: n.log.at(-1)?.term || 0 }));
  }
  becomeLeader(n) {
    n.role = 'Leader'; n.next = this.nodes.map(() => n.log.length + 1); n.match = this.nodes.map(() => 0);
    n.match[n.id] = n.log.length; n.heartbeat = this.time;
    this.note(`${n.name} has three votes and becomes leader. It can now coordinate updates for the app.`, 'election');
    this.replicate(n);
  }
  replicate(n, only = null) {
    this.nodes.filter(p => p.id !== n.id && (only === null || p.id === only)).forEach(p => {
      const prev = n.next[p.id] - 1;
      this.send(n.id, p.id, 'append', { term: n.term, prev, prevTerm: n.log[prev - 1]?.term || 0,
        entries: n.log.slice(prev), commit: n.commit });
    });
    n.heartbeat = this.time + 1400;
  }
  save(value, expected = this.client.version) {
    if (this.client.pending || !/^[\p{L}\p{M}\p{N}]{1,14}$/u.test(value)) return false;
    this.client.pending = { id: ++this.serial, value, expected, lastTry: -Infinity, uncertain: false };
    this.client.status = 'Waiting for agreement';
    this.note(`Your app asks to save ${value}. Receiving the request alone is not a successful save.`, 'write');
    this.tryRequest(); return true;
  }
  tryRequest() {
    const p = this.client.pending, leader = this.leader;
    if (!p || !leader || this.time - p.lastTry < 4600) return;
    p.lastTry = this.time; this.send('client', leader.id, 'request', { ...p, term: leader.term });
  }
  toggle(id) {
    const n = this.nodes[id];
    n.online = !n.online;
    if (!n.online) {
      n.role = 'Offline';
      this.note(`${n.name} is offline. Its stored history remains, but it cannot send messages or vote.`, 'failure');
    } else {
      n.role = 'Follower'; n.commit = 0; n.applied = 0; n.value = null; n.version = 0; n.results = {}; n.recovering = true; this.resetDeadline(n);
      this.note(`${n.name} restarts with its log. It must learn what is committed and rebuild its current message.`, 'recovery');
    }
  }
  disconnect(id) {
    const n = this.nodes[id]; n.connected = !n.connected;
    this.note(n.connected ? `${n.name} is connected again. It can exchange messages and catch up.` : `${n.name} lost its connection. The computer is running, but its messages cannot reach the others.`, n.connected ? 'recovery' : 'failure');
  }
  receive(m) {
    if (m.from !== 'client' && !this.nodes[m.from].connected) return;
    if (m.to !== 'client' && !this.nodes[m.to].connected) return;
    const b = m.body;
    if (m.to === 'client') {
      if (m.type !== 'result' || !this.client.pending || b.id !== this.client.pending.id) return;
      this.client.value = b.value; this.client.version = b.version;
      this.client.status = b.accepted ? 'Saved' : 'Version changed';
      this.note(b.accepted ? `Saved: ${b.value}. The leader applied the agreed change before replying to your app.`
        : `The old edit was rejected. The message stays ${b.value}; its version has already changed.`, b.accepted ? 'saved' : 'failure');
      this.client.pending = null; return;
    }
    const n = this.nodes[m.to];
    if (!n.online) return;
    if (m.type === 'request') {
      if (n.role !== 'Leader' || b.term !== n.term) return;
      // One UI submission at a time. Retransmission of this visual request is deduplicated.
      const existing = n.log.findIndex(e => e.request === b.id);
      if (existing < 0 || (existing >= n.applied && n.log[existing].term !== n.term)) {
        n.log.push({ term: n.term, value: b.value, expected: b.expected, request: b.id });
        n.match[n.id] = n.log.length;
        this.note(`${n.name} stores ${b.value} in its log and sends copies. The current message has not changed yet.`, 'write');
      } else if (existing < n.applied) {
        const e = n.log[existing];
        this.send(n.id, 'client', 'result', { id: b.id, accepted: e.accepted, value: n.value, version: n.version });
      }
      this.replicate(n); return;
    }
    if (b.term > n.term) this.follower(n, b.term);
    if (m.type === 'vote') {
      const lastTerm = n.log.at(-1)?.term || 0;
      const fresh = b.lastTerm > lastTerm || (b.lastTerm === lastTerm && b.lastIndex >= n.log.length);
      const granted = b.term === n.term && (n.vote === null || n.vote === m.from) && fresh;
      if (granted) { n.vote = m.from; this.resetDeadline(n); }
      this.send(n.id, m.from, 'ballot', { term: n.term, granted });
    } else if (m.type === 'ballot') {
      if (n.role !== 'Candidate' || b.term !== n.term || !b.granted) return;
      if (!n.votes.includes(m.from)) {
        n.votes.push(m.from);
        if(n.votes.length===2)this.note(`${n.name} has two votes, including its own. It remains a candidate until three servers support it.`, 'election');
      }
      if (n.votes.length >= 3) this.becomeLeader(n);
    } else if (m.type === 'append') {
      if (b.term < n.term) { this.send(n.id, m.from, 'ack', { term: n.term, ok: false, next: n.log.length + 1 }); return; }
      if (n.role !== 'Follower') this.follower(n, b.term);
      this.resetDeadline(n);
      if (b.prev > n.log.length || (b.prev > 0 && n.log[b.prev - 1]?.term !== b.prevTerm)) {
        this.send(n.id, m.from, 'ack', { term: n.term, ok: false, next: Math.max(1, Math.min(b.prev, n.log.length + 1)) }); return;
      }
      b.entries.forEach((e, i) => {
        const at = b.prev + i;
        if (n.log[at] && n.log[at].term !== e.term) n.log.length = at;
        if (!n.log[at]) n.log.push(clone(e));
      });
      const commit = Math.min(b.commit, b.prev + b.entries.length);
      if (commit > n.commit) { n.commit = commit; n.applyAt = this.time + 220; }
      this.send(n.id, m.from, 'ack', { term: n.term, ok: true, match: b.prev + b.entries.length });
    } else if (m.type === 'ack') {
      if (n.role !== 'Leader' || b.term !== n.term) return;
      if (!b.ok) { n.next[m.from] = Math.max(n.match[m.from] + 1, Math.min(n.next[m.from], b.next)); this.replicate(n, m.from); return; }
      n.match[m.from] = Math.max(n.match[m.from], b.match); n.next[m.from] = n.match[m.from] + 1;
      for (let i = n.log.length; i > n.commit; i--) {
        if (n.log[i - 1].term === n.term && n.match.filter(v => v >= i).length >= 3) {
          n.commit = i; n.applyAt = this.time + 300;
          this.note(`${n.name} has evidence of three stored copies. The update is committed: part of the agreed history.`, 'commit');
          this.replicate(n); break;
        }
      }
    }
  }
  step(ms) {
    // Fixed bounded steps make pause/resume and faster playback deterministic.
    let left = ms;
    while (left > 0) {
      const dt = Math.min(50, left); left -= dt; this.time += dt;
      const ready = this.messages.filter(m => m.end <= this.time);
      this.messages = this.messages.filter(m => m.end > this.time);
      ready.forEach(m => this.receive(m));
      for (const n of this.nodes) {
        if (!n.online) continue;
        if (n.role === 'Leader' && this.time >= n.heartbeat) this.replicate(n);
        else if (n.role !== 'Leader' && this.time >= n.deadline) this.election(n);
        if (n.applied < n.commit && this.time >= n.applyAt) {
          const e = n.log[n.applied++];
          const previous = n.results[e.request];
          e.accepted = previous ? previous.accepted : e.expected === n.version;
          e.replayed = !!previous;
          if (!previous && e.accepted) { n.value = e.value; n.version++; }
          n.results[e.request] = previous || { accepted: e.accepted, value: n.value, version: n.version };
          n.applyAt = this.time + 240;
          if (n.recovering && n.applied === n.commit) {
            n.recovering = false;
            this.note(`${n.name} has replayed its agreed history. Its current message is ${n.value}.`, 'recovery');
          }
          if (n.role === 'Leader' && this.client.pending?.id === e.request) {
            this.send(n.id, 'client', 'result', { id: e.request, ...n.results[e.request] });
          }
        }
      }
      this.tryRequest();
    }
  }
}
