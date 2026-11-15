# raft-demo

A runnable demonstration of [raft-kv](https://github.com/DahalAb1/raft-kv),
my Raft consensus implementation with a linearizable key/value store on
top. That repository holds the implementation and the full build story;
this one exists so you can watch the code work: three servers boot,
elect a leader, serve versioned reads and writes through the replicated
log, survive the leader being killed, and recover a crashed server from
its persisted state.

Prefer a browser? A guided, interactive illustration lives
at [dahalab1.github.io/raft-demo](https://dahalab1.github.io/raft-demo/),
served by GitHub Pages from `docs/` in this repo.

## Run it

```
go run .
```

Requires Go 1.26.3 or newer, with no other runtime dependencies. Expected
output below is abbreviated; timings vary because elections are randomized:

```
=== raft-kv demo: 3 servers, one linearizable KV store ===

--- scene 1: boot and election ------------------------------
leader elected: server-2 (term 1) in 458ms

--- scene 2: write and read ---------------------------------
Put("answer", "42", version 0)  -> OK
Get("answer")                   -> "42" (version 1, OK)

--- scene 3: optimistic concurrency -------------------------
Put("answer", "43", version 0)  -> ErrVersion

--- scene 4: kill the leader --------------------------------
killed server-2 (was leader at term 1)
new leader: server-1 (term 2) after 442ms
Get("answer")                   -> "42" (version 1, OK)

--- scene 5: restart from simulated storage -----------------
server-2 locally applied answer="43" version=2 (caught up in 107ms)

--- final check ---------------------------------------------
Get("answer") -> "43" (version 2, OK)
verified: all three replicas locally hold answer="43" version=2
```

Each operation is checked against its expected result. The recovery check
reads the restarted replica's local applied value under a lock; simply
observing a new term is not sufficient. The driver fails on incorrect
results or deadlines rather than printing an unconditional success.

## Browser demo

The page is a static site with locally bundled fonts and assets. No build,
framework, CDN, or backend is needed. Preview it with:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory docs
```

Open <http://127.0.0.1:8765/>. Visitors enter their name, up to three friends,
and a one-word message. Names remain in browser session storage. Five circles
represent the same five servers throughout a manually paced story:

1. **Introduction:** different servers can hold different copies before they
   coordinate. A friend may reach a server that has not received the message.
2. **Leader Election:** introduce the roles, then show a candidate's self-vote,
   incoming votes, a majority of three, and the new leader's heartbeats.
3. **Persistence:** follow recording, replication, acknowledgments, commitment,
   application, and confirmation. Explain why majorities overlap and how the
   election's history check protects confirmed changes.
4. **Hardware / Network Failure:** lose the leader, elect a replacement, lose
   a second server, then isolate a running server. Restore the group and replay
   retained history to rebuild the restarted servers' current state.
5. **Experiment:** submit words, stop or restart any server, disconnect or
   reconnect its network, pause, restore the group, or reset.

The navigation can open any section directly. Back and Replay revisit the
guided exchanges. Each step has one explanation and a labeled message animation;
the visitor decides when to continue. “A closer look” reveals logs, terms,
commit/application positions, and the model's limitations. It pauses the live
experiment. Reduced-motion preference removes guided motion and starts the
experiment paused. The old `explore.html` URL redirects to `#experiment`.

The story uses scripted snapshots; the experiment runs an independent JavaScript
model. Neither executes the Go implementation. The model uses five fixed members,
randomized elections, log freshness checks, current-term majority commitment,
ordered application, and restarts with retained in-memory logs. Links have slowed
delivery; each server can be isolated from the rest of the group. It does not
model arbitrary partitions, replicated reads, or snapshots. One UI submission
runs at a time; request identities deduplicate retries for clarity. That differs
from the real Clerk's version/ErrMaybe path. The Go driver retains its original
three-server, numeric-string example.

West, Central, East, North, and South are illustrative names, not deployed regions.

GitHub Pages is configured to publish **`main` → `/docs`**, at
<https://dahalab1.github.io/raft-demo/>. Commit and push the complete `docs/`
directory (including modules and assets) when ready. No hosting migration
or separate deployment command is needed.

## Verification

```sh
node --test tests/*.test.mjs
go test -race ./...
go run -race .
```

The Node checks validate story snapshots, majority evidence, confirmation order,
recovery, personalization, navigation data, and local asset references. The
cluster tests cover 40 election schedules, failure at multiple write stages,
majority loss, recovery, stale writes, delayed replication requests, and isolated
leaders rejoining the group. The Go integration test verifies a real crash,
an update during the outage, and reconstruction on the restarted replica.
These checks are not a substitute for the excluded course harness or a
general Raft correctness proof.

## What is what

```
raft/, raftapi/, kvraft/, kvsrv/rpc/
    implementation copied from raft-kv at commit a13ac8d
    KVServer adds a synchronized local AppliedValue diagnostic for
    recovery verification; consensus and client behavior are unchanged

labrpc/, labgob/, tester/, kvtest/
    minimal original stand-ins for the course harness packages the
    implementation compiles against: an in-process RPC network with
    reflection dispatch and gob serialization, a Persister (each
    server's simulated disk), and two small interface shims

main.go
    the narrated, checked scenario

docs/index.html, docs/style.css, docs/app.mjs, docs/story.mjs
    unified page, responsive styling, controls, and personalized story snapshots

docs/explore.html
    redirect for the previous experiment URL

docs/cluster.mjs, docs/cluster-view.mjs
    independent teaching model and server/message visualization

docs/assets/
    bundled fonts, licenses, and asset provenance
```

## Honesty notes

- The implementation was built against the MIT 6.5840 lab structure.
  The course harness, tests, and handout code are not included here,
  per course policy; every stand-in package in this repo was written
  from scratch for this demo.
- The RPC layer here does not simulate an unreliable network (drops,
  reorders, duplicates, partitions). The course harness did that job
  during development. Historical repeated-run results are documented
  in the implementation repository, not reproduced by this demo. The
  story of what that surfaced, from a 14%
  election flake to a 10ms latency comb, is in the
  [raft-kv README](https://github.com/DahalAb1/raft-kv).
- A killed server here is disconnected and stopped; its restart uses
  the same in-memory Persister object. This simulates retaining storage
  during a server restart; it does not provide actual disk durability or
  survive termination of the whole process.
- KV snapshot/restore integration is unfinished and disabled. Recovery
  reconstructs the KV map by replaying the retained committed log.

## License

MIT, see [LICENSE](LICENSE).
