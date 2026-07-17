# raft-demo

A runnable demonstration of [raft-kv](https://github.com/DahalAb1/raft-kv),
my Raft consensus implementation with a linearizable key/value store on
top. That repository holds the implementation and the full build story;
this one exists so you can watch the code work: three servers boot,
elect a leader, serve versioned reads and writes through the replicated
log, survive the leader being killed, and recover a crashed server from
its persisted state.

## Run it

```
go run .
```

Thirty seconds, no dependencies outside the Go toolchain. Expected
output (timings vary; elections are randomized by design):

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

--- scene 5: restart from disk ------------------------------
server-2 rejoined as follower at term 2 (caught up in 104ms)

--- final check ---------------------------------------------
Get("answer") -> "43" (version 2, OK)
```

## What is what

```
raft/, raftapi/, kvraft/, kvsrv/rpc/
    byte-identical copies of the implementation files in raft-kv
    (at commit a13ac8d); the code being demonstrated

labrpc/, labgob/, tester/, kvtest/
    minimal original stand-ins for the course harness packages the
    implementation compiles against: an in-process RPC network with
    reflection dispatch and gob serialization, a Persister (each
    server's simulated disk), and two small interface shims

main.go
    the narrated scenario
```

## Honesty notes

- The implementation was built against the MIT 6.5840 lab structure.
  The course harness, tests, and handout code are not included here,
  per course policy; every stand-in package in this repo was written
  from scratch for this demo.
- The RPC layer here does not simulate an unreliable network (drops,
  reorders, duplicates, partitions). The course harness did that job
  during development: the implementation passed 100-run test gauntlets
  under those conditions. The story of what that surfaced, from a 14%
  election flake to a 10ms latency comb, is in the
  [raft-kv README](https://github.com/DahalAb1/raft-kv).
- A killed server here is disconnected and stopped; its restart uses
  the same Persister object, which is the demo equivalent of rebooting
  a machine with its disk intact.

## License

MIT, see [LICENSE](LICENSE).
