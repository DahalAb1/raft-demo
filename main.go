// A narrated demonstration of raft-kv: three servers, one linearizable
// key/value store. The implementation comes from raft-kv, with a local
// diagnostic added to KVServer to verify each replica's applied state.
// The driver and harness stand-ins let it run outside the course harness.
//
// Run it:  go run .
package main

import (
	"fmt"
	"time"

	"raft-kv/kvraft"
	"raft-kv/kvsrv/rpc"
	"raft-kv/kvtest"
	"raft-kv/labrpc"
	"raft-kv/raftapi"
	"raft-kv/tester"
)

const nServers = 3

type node struct {
	name      string
	persister *tester.Persister
	kv        *kvraft.KVServer
	raft      raftapi.Raft // also implements Kill()
	alive     bool
}

type cluster struct {
	net   *labrpc.Network
	nodes []*node
	names []string
}

func makeCluster() *cluster {
	c := &cluster{net: labrpc.MakeNetwork()}
	for i := 0; i < nServers; i++ {
		c.names = append(c.names, fmt.Sprintf("server-%d", i))
		c.nodes = append(c.nodes, &node{
			name:      c.names[i],
			persister: tester.MakePersister(),
		})
	}
	for i := range c.nodes {
		c.startNode(i)
	}
	return c
}

// startNode boots server i, on a fresh disk at first boot and on its
// old Persister after a crash; the difference is the whole of scene 5.
func (c *cluster) startNode(i int) {
	ends := make([]*labrpc.ClientEnd, nServers)
	for j := 0; j < nServers; j++ {
		ends[j] = c.net.MakeEnd(c.names[j])
	}
	parts := kvraft.StartKVServer(ends, kvraft.Gid, i, c.nodes[i].persister, tester.MaxRaftState)
	c.nodes[i].kv = parts[0].(*kvraft.KVServer)
	c.nodes[i].raft = parts[1].(raftapi.Raft)
	c.nodes[i].alive = true

	srv := labrpc.MakeServer()
	srv.AddService("KVServer", parts[0])
	srv.AddService("Raft", parts[1])
	c.net.AddServer(c.names[i], srv)
}

func (c *cluster) kill(i int) {
	c.net.Disconnect(c.names[i])
	if k, ok := c.nodes[i].raft.(interface{ Kill() }); ok {
		k.Kill()
	}
	c.nodes[i].alive = false
}

func (c *cluster) stop() {
	for i, n := range c.nodes {
		if n.alive {
			c.kill(i)
		}
	}
}

// A follower's term alone does not establish that its KV map is caught up.
func (c *cluster) waitForApplied(i int, value string, version rpc.Tversion, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for {
		got, ver, ok := c.nodes[i].kv.AppliedValue("answer")
		if c.nodes[i].alive && ok && got == value && ver == version {
			return nil
		}
		if !time.Now().Before(deadline) {
			return fmt.Errorf("%s did not apply answer=%q version=%d (got %q version=%d, exists=%v)", c.names[i], value, version, got, ver, ok)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// The Clerk intentionally retries forever. Give the narrated demo a deadline
// so a regression produces a failing process rather than an endless wait.
func within[T any](name string, work func() T) T {
	result := make(chan T, 1)
	go func() { result <- work() }()
	select {
	case value := <-result:
		return value
	case <-time.After(5 * time.Second):
		panic(name + " did not finish within 5s")
	}
}

func checkedPut(ck kvtest.IKVClerk, value string, version rpc.Tversion, expected rpc.Err) rpc.Err {
	err := within("Put", func() rpc.Err { return ck.Put("answer", value, version) })
	if err != expected {
		panic(fmt.Sprintf("Put: got %v, want %v", err, expected))
	}
	return err
}

func checkedGet(ck kvtest.IKVClerk, expected string, version rpc.Tversion) (string, rpc.Tversion, rpc.Err) {
	reply := within("Get", func() rpc.GetReply {
		value, ver, err := ck.Get("answer")
		return rpc.GetReply{Value: value, Version: ver, Err: err}
	})
	if reply.Err != rpc.OK || reply.Value != expected || reply.Version != version {
		panic(fmt.Sprintf("Get: got %+v, want %q version=%d OK", reply, expected, version))
	}
	return reply.Value, reply.Version, reply.Err
}

// leader returns the index and term of the highest-term node that
// currently believes it is leader, or -1 if none does.
func (c *cluster) leader() (int, int) {
	best, bestTerm := -1, -1
	for i, n := range c.nodes {
		if !n.alive {
			continue
		}
		if term, isLeader := n.raft.GetState(); isLeader && term > bestTerm {
			best, bestTerm = i, term
		}
	}
	return best, bestTerm
}

func (c *cluster) waitForLeader() (int, int, time.Duration) {
	start := time.Now()
	for time.Since(start) < 10*time.Second {
		if i, term := c.leader(); i >= 0 {
			return i, term, time.Since(start).Round(time.Millisecond)
		}
		time.Sleep(20 * time.Millisecond)
	}
	panic("no leader elected within 10s")
}

func scene(title string) {
	fmt.Printf("\n--- %s %s\n", title, dashes(56-len(title)))
}

func dashes(n int) string {
	if n < 3 {
		n = 3
	}
	s := ""
	for i := 0; i < n; i++ {
		s += "-"
	}
	return s
}

func main() {
	fmt.Println("=== raft-kv demo: 3 servers, one linearizable KV store ===")
	fmt.Println("implementation: github.com/DahalAb1/raft-kv (with local recovery inspection)")

	c := makeCluster()
	defer c.stop()

	scene("scene 1: boot and election")
	fmt.Printf("started %d servers with empty simulated storage\n", nServers)
	lead, term, took := c.waitForLeader()
	fmt.Printf("leader elected: %s (term %d) in %v\n", c.names[lead], term, took)
	fmt.Println("randomized election timeouts decided who asked for votes first")

	clerk := kvraft.MakeClerk(tester.MakeClnt(c.net), c.names)

	scene("scene 2: write and read")
	err := checkedPut(clerk, "42", 0, rpc.OK)
	fmt.Printf("Put(\"answer\", \"42\", version 0)  -> %v\n", err)
	val, ver, err := checkedGet(clerk, "42", 1)
	fmt.Printf("Get(\"answer\")                   -> %q (version %d, %v)\n", val, ver, err)
	fmt.Println("both operations rode the replicated log:")
	fmt.Println("  client -> leader -> majority ack -> commit -> apply -> reply")

	scene("scene 3: optimistic concurrency")
	err = checkedPut(clerk, "43", 0, rpc.ErrVersion)
	fmt.Printf("Put(\"answer\", \"43\", version 0)  -> %v\n", err)
	fmt.Println("the store is a compare-and-swap: version 0 is stale (the key")
	fmt.Println("is at 1), so the write is refused instead of clobbering state")

	scene("scene 4: kill the leader")
	killed := lead
	c.kill(killed)
	fmt.Printf("killed %s (was leader at term %d)\n", c.names[killed], term)
	start := time.Now()
	lead, term, _ = c.waitForLeader()
	fmt.Printf("new leader: %s (term %d) after %v\n",
		c.names[lead], term, time.Since(start).Round(time.Millisecond))
	val, ver, err = checkedGet(clerk, "42", 1)
	fmt.Printf("Get(\"answer\")                   -> %q (version %d, %v)\n", val, ver, err)
	fmt.Println("the data survived: it was committed on a majority")
	err = checkedPut(clerk, "43", ver, rpc.OK)
	fmt.Printf("Put(\"answer\", \"43\", version %d)  -> %v\n", ver, err)

	scene("scene 5: restart from simulated storage")
	c.startNode(killed)
	fmt.Printf("restarted %s from its persisted state\n", c.names[killed])
	start = time.Now()
	if err := c.waitForApplied(killed, "43", 2, 5*time.Second); err != nil {
		panic(err)
	}
	fmt.Printf("%s locally applied answer=\"43\" version=2 (caught up in %v)\n",
		c.names[killed], time.Since(start).Round(time.Millisecond))
	fmt.Println("its saved Raft log survived in the in-memory Persister;")
	fmt.Println("verified that this restarted server rebuilt its own KV value")

	scene("final check")
	val, ver, err = checkedGet(clerk, "43", 2)
	fmt.Printf("Get(\"answer\") -> %q (version %d, %v)\n", val, ver, err)
	for i := range c.nodes {
		if err := c.waitForApplied(i, "43", 2, 5*time.Second); err != nil {
			panic(err)
		}
	}
	fmt.Println("verified: all three replicas locally hold answer=\"43\" version=2")
	fmt.Println("\nthe full build story: https://github.com/DahalAb1/raft-kv")

}
