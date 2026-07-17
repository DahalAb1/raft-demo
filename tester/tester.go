// Package tester holds the small pieces of scaffolding the copied
// implementation files expect from the course harness: a Persister
// (each server's simulated disk), a string-addressed RPC client, and a
// few constants. Original stand-ins, not course code.
package tester

import (
	"sync"

	"raft-kv/labrpc"
)

// Persister is one server's stable storage. Save is "here is the
// complete new contents of the disk": both slots, every call. A
// restarted server is handed its old Persister; that is the whole
// crash-recovery story.
type Persister struct {
	mu        sync.Mutex
	raftstate []byte
	snapshot  []byte
}

func MakePersister() *Persister {
	return &Persister{}
}

func (p *Persister) Save(raftstate []byte, snapshot []byte) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.raftstate = clone(raftstate)
	p.snapshot = clone(snapshot)
}

func (p *Persister) ReadRaftState() []byte {
	p.mu.Lock()
	defer p.mu.Unlock()
	return clone(p.raftstate)
}

func (p *Persister) ReadSnapshot() []byte {
	p.mu.Lock()
	defer p.mu.Unlock()
	return clone(p.snapshot)
}

func (p *Persister) RaftStateSize() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.raftstate)
}

func clone(b []byte) []byte {
	if b == nil {
		return nil
	}
	c := make([]byte, len(b))
	copy(c, b)
	return c
}

// Clnt is the client-side dialer the Clerk uses: it addresses servers
// by name on every call instead of holding per-target ends.
type Clnt struct {
	net *labrpc.Network
}

func MakeClnt(net *labrpc.Network) *Clnt {
	return &Clnt{net: net}
}

func (c *Clnt) Call(server string, svcMeth string, args interface{}, reply interface{}) bool {
	return c.net.Call(server, svcMeth, args, reply)
}

// Tgid identifies a server group; the demo runs exactly one.
type Tgid int

// TesterClnt appears in one constructor signature the demo never calls.
type TesterClnt struct{}

// MaxRaftState = -1 disables rsm-triggered snapshots. Load-bearing: the
// KV layer's Snapshot/Restore are intentionally stubs (lab 4C was out
// of scope), so the snapshot path must never be asked to run.
const MaxRaftState = -1

// UseRaftStateMachine is a course-harness flag; the demo always builds
// the real Raft underneath the rsm.
var UseRaftStateMachine = false
