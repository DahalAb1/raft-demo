// Package kvtest declares the Clerk interface the copied client
// satisfies. Original stand-in for the course package of the same name.
package kvtest

import "raft-kv/kvsrv/rpc"

type IKVClerk interface {
	Get(key string) (string, rpc.Tversion, rpc.Err)
	Put(key string, value string, version rpc.Tversion) rpc.Err
}
