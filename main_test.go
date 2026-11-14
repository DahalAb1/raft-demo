package main

import (
	"testing"
	"time"

	"raft-kv/kvraft"
	"raft-kv/kvsrv/rpc"
	"raft-kv/tester"
)

func TestRecoveryVerifiesTheRestartedReplica(t *testing.T) {
	c := makeCluster()
	defer c.stop()
	leader, _, _ := c.waitForLeader()

	// A valid term/role is not evidence of a reconstructed KV value.
	if err := c.waitForApplied(leader, "43", 2, 20*time.Millisecond); err == nil {
		t.Fatal("empty replica was incorrectly reported as caught up")
	}
	ck := kvraft.MakeClerk(tester.MakeClnt(c.net), c.names)
	checkedPut(ck, "42", 0, rpc.OK)
	checkedGet(ck, "42", 1)
	checkedPut(ck, "99", 0, rpc.ErrVersion)
	for i := range c.nodes {
		if err := c.waitForApplied(i, "42", 1, 3*time.Second); err != nil {
			t.Fatal(err)
		}
	}

	c.kill(leader)
	c.waitForLeader()
	checkedGet(ck, "42", 1)
	checkedPut(ck, "43", 1, rpc.OK)

	oldValue, oldVersion, _ := c.nodes[leader].kv.AppliedValue("answer")
	if oldValue != "42" || oldVersion != 1 {
		t.Fatalf("offline replica unexpectedly changed: %q v%d", oldValue, oldVersion)
	}
	oldServer := c.nodes[leader].kv
	c.startNode(leader)
	if oldServer == c.nodes[leader].kv {
		t.Fatal("restart reused the old KV server")
	}
	for i := range c.nodes {
		if err := c.waitForApplied(i, "43", 2, 3*time.Second); err != nil {
			t.Fatal(err)
		}
	}
	checkedGet(ck, "43", 2)
}
