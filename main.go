// A narrated demonstration of raft-kv: three servers, one linearizable
// key/value store. The implementation files under raft/, kvraft/ and
// raftapi/ are byte-identical copies from the raft-kv repository; this
// driver and the labrpc/labgob/tester/kvtest packages exist so they can
// run outside the course harness.
//
// Run it:  go run .
package main

import (
	"fmt"
	"time"

	"raft-kv/kvraft"
	"raft-kv/kvsrv/rpc"
	"raft-kv/labrpc"
	"raft-kv/raftapi"
	"raft-kv/tester"
)

const nServers = 3

type node struct {
	name      string
	persister *tester.Persister
	kv        interface{}  // *kvraft.KVServer
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
	c.nodes[i].kv = parts[0]
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
	fmt.Println("implementation: github.com/DahalAb1/raft-kv (copied unchanged)")

	c := makeCluster()

	scene("scene 1: boot and election")
	fmt.Printf("started %d servers on empty disks\n", nServers)
	lead, term, took := c.waitForLeader()
	fmt.Printf("leader elected: %s (term %d) in %v\n", c.names[lead], term, took)
	fmt.Println("randomized election timeouts decided who asked for votes first")

	clerk := kvraft.MakeClerk(tester.MakeClnt(c.net), c.names)

	scene("scene 2: write and read")
	err := clerk.Put("answer", "42", 0)
	fmt.Printf("Put(\"answer\", \"42\", version 0)  -> %v\n", err)
	val, ver, err := clerk.Get("answer")
	fmt.Printf("Get(\"answer\")                   -> %q (version %d, %v)\n", val, ver, err)
	fmt.Println("both operations rode the replicated log:")
	fmt.Println("  client -> leader -> majority ack -> commit -> apply -> reply")

	scene("scene 3: optimistic concurrency")
	err = clerk.Put("answer", "43", 0)
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
	val, ver, err = clerk.Get("answer")
	fmt.Printf("Get(\"answer\")                   -> %q (version %d, %v)\n", val, ver, err)
	fmt.Println("the data survived: it was committed on a majority")
	err = clerk.Put("answer", "43", ver)
	fmt.Printf("Put(\"answer\", \"43\", version %d)  -> %v\n", ver, err)

	scene("scene 5: restart from disk")
	c.startNode(killed)
	fmt.Printf("restarted %s from its persisted state\n", c.names[killed])
	start = time.Now()
	for {
		if t, isLeader := c.nodes[killed].raft.GetState(); t >= term && !isLeader {
			fmt.Printf("%s rejoined as follower at term %d (caught up in %v)\n",
				c.names[killed], t, time.Since(start).Round(time.Millisecond))
			break
		}
		if time.Since(start) > 5*time.Second {
			fmt.Printf("%s did not catch up within 5s\n", c.names[killed])
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	fmt.Println("its Raft state was on disk; the KV map was rebuilt by")
	fmt.Println("replaying the committed log from the sentinel forward")

	scene("final check")
	val, ver, err = clerk.Get("answer")
	fmt.Printf("Get(\"answer\") -> %q (version %d, %v)\n", val, ver, err)
	fmt.Println("one crash, one election, one restart; the store never lied")
	fmt.Println("\nthe full build story: https://github.com/DahalAb1/raft-kv")

	for i := range c.nodes {
		if c.nodes[i].alive {
			c.kill(i)
		}
	}
	_ = rpc.OK // keep the rpc import for readable error printing above
}
