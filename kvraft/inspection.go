package kvraft

import "raft-kv/kvsrv/rpc"

// AppliedValue is a local diagnostic, not a linearizable client read.
// It lets the demo prove that this specific replica has replayed its log.
// Applications must use Get, which goes through consensus.
func (kv *KVServer) AppliedValue(key string) (string, rpc.Tversion, bool) {
	kv.stateMu.RLock()
	defer kv.stateMu.RUnlock()
	e, ok := kv.kvs[key]
	return e.Value, e.Version, ok
}
