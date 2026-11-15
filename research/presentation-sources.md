# Source notes

Reviewed November 14, 2026. Public professional/project material only.
The final UI remains a minimal demo; it does not make performance or
production-readiness claims.

- [Public profile](https://github.com/DahalAb1/DahalAb1/blob/main/README.md):
  identifies Abhinesh Dahal, CS and Applied Mathematics at Texas State, and
  the systems projects. No unrelated name-search results were used.
- [raft-kv README](https://github.com/DahalAb1/raft-kv/blob/8bfe50a45de9d68bace8aacfae8694119ff46b2a/README.md):
  Go implementation, replicated versioned KV service, RSM bridge, ambiguous
  retries, and current scope. Source revision reviewed:
  `8bfe50a45de9d68bace8aacfae8694119ff46b2a`.
- [Build story](https://github.com/DahalAb1/raft-kv/blob/8bfe50a45de9d68bace8aacfae8694119ff46b2a/docs/build-story.md):
  development history and latency investigations. Its latency figures are
  historical lab measurements; they are not benchmarks of this browser model.
- [Clerk](https://github.com/DahalAb1/raft-kv/blob/8bfe50a45de9d68bace8aacfae8694119ff46b2a/kvraft/client.go):
  version mismatch after an uncertain attempt can return `ErrMaybe`.
- [Redis project](https://github.com/DahalAb1/Redis): reviewed for context about
  non-blocking I/O and event-loop interests; not presented as Raft functionality.
- [Raft's official explanation](https://raft.github.io/): protocol reference
  for majority agreement, replicated logs, and state-machine application.

Visitors choose their own one-word messages and friend names; these stay in
browser session storage. Server names and timing are illustrative. Neither the
guided story nor the experiment connects to a deployed Go cluster.
Raft-level snapshot support must not be described as finished KV snapshot
integration. The companion Go demo's Persister is in memory, not durable disk.

The experiment is a separate, bounded educational model: a fixed five-member
cluster, delayed links, crash/restart, per-server isolation, no snapshots or
read execution, and one client submission at a time. Browser request deduplication is a deliberate
simplification, distinct from the real Clerk's conditional-version behavior.
