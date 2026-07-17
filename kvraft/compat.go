package kvraft

import "raft-kv/tester"

// Gid is referenced by NewServer in the copied server.go; the course
// harness defines it in an excluded file. The demo runs a single group.
const Gid tester.Tgid = 0
