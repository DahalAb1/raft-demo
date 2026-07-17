// Package labrpc is a minimal in-process RPC network, written from
// scratch for this demo as a stand-in for the course package of the
// same name. It routes calls between named nodes, dispatches by
// reflection ("Raft.RequestVote" -> method RequestVote on the service
// registered as "Raft"), and round-trips arguments and replies through
// gob so the demo keeps real serialization semantics.
//
// It deliberately does NOT simulate an unreliable network (drops,
// reorders, duplicates); the course harness did that job during
// development. Nodes can be disconnected, which is how the demo crashes
// a server: every call to or from a disconnected node fails.
package labrpc

import (
	"bytes"
	"encoding/gob"
	"fmt"
	"math/rand"
	"reflect"
	"strings"
	"sync"
	"time"
)

// Network connects named servers. Safe for concurrent use.
type Network struct {
	mu        sync.Mutex
	servers   map[string]*Server
	connected map[string]bool
}

func MakeNetwork() *Network {
	return &Network{
		servers:   make(map[string]*Server),
		connected: make(map[string]bool),
	}
}

// AddServer registers (or replaces, on restart) the server behind a name
// and connects it.
func (n *Network) AddServer(name string, s *Server) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.servers[name] = s
	n.connected[name] = true
}

func (n *Network) Connect(name string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.connected[name] = true
}

// Disconnect makes every call to or from the node fail, which is how
// the demo simulates a crash.
func (n *Network) Disconnect(name string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.connected[name] = false
}

func (n *Network) IsConnected(name string) bool {
	n.mu.Lock()
	defer n.mu.Unlock()
	return n.connected[name]
}

// MakeEnd returns a ClientEnd that dials the named target.
func (n *Network) MakeEnd(target string) *ClientEnd {
	return &ClientEnd{net: n, target: target}
}

// Call routes an RPC to the named server. Used by tester.Clnt, which
// addresses servers by name per call.
func (n *Network) Call(target string, svcMeth string, args interface{}, reply interface{}) bool {
	n.mu.Lock()
	srv, ok := n.servers[target]
	up := n.connected[target]
	n.mu.Unlock()
	if !ok || !up {
		return false
	}

	// a small random delay so the demo's timing looks like a network
	time.Sleep(time.Duration(1+rand.Intn(2)) * time.Millisecond)

	if !srv.dispatch(svcMeth, args, reply) {
		return false
	}

	// if the target dropped while the call was in flight, the reply is
	// lost: the caller learns nothing, exactly like a real dead node
	n.mu.Lock()
	up = n.connected[target]
	n.mu.Unlock()
	return up
}

// ClientEnd is one node's handle for calling one target node.
type ClientEnd struct {
	net    *Network
	target string
}

// Call sends an RPC and waits for the reply. It returns false if the
// target is dead or unreachable; callers treat false as a dropped RPC.
func (e *ClientEnd) Call(svcMeth string, args interface{}, reply interface{}) bool {
	return e.net.Call(e.target, svcMeth, args, reply)
}

// Server is one node's set of registered services.
type Server struct {
	mu       sync.Mutex
	services map[string]*service
}

func MakeServer() *Server {
	return &Server{services: make(map[string]*service)}
}

// AddService registers a receiver under a name, e.g. "Raft" or
// "KVServer". RPC method names are "<name>.<Method>".
func (s *Server) AddService(name string, rcvr interface{}) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.services[name] = makeService(rcvr)
}

func (s *Server) dispatch(svcMeth string, args interface{}, reply interface{}) bool {
	dot := strings.Index(svcMeth, ".")
	if dot < 0 {
		panic(fmt.Sprintf("labrpc: bad method %q", svcMeth))
	}
	s.mu.Lock()
	svc, ok := s.services[svcMeth[:dot]]
	s.mu.Unlock()
	if !ok {
		return false
	}
	return svc.call(svcMeth[dot+1:], args, reply)
}

type service struct {
	rcvr    reflect.Value
	methods map[string]reflect.Method
}

func makeService(rcvr interface{}) *service {
	svc := &service{
		rcvr:    reflect.ValueOf(rcvr),
		methods: make(map[string]reflect.Method),
	}
	t := reflect.TypeOf(rcvr)
	for i := 0; i < t.NumMethod(); i++ {
		m := t.Method(i)
		// an RPC handler looks like: func (r *R) Name(args *A, reply *B)
		if m.Type.NumIn() == 3 && m.Type.NumOut() == 0 &&
			m.Type.In(1).Kind() == reflect.Ptr && m.Type.In(2).Kind() == reflect.Ptr {
			svc.methods[m.Name] = m
		}
	}
	return svc
}

func (svc *service) call(name string, args interface{}, reply interface{}) bool {
	m, ok := svc.methods[name]
	if !ok {
		panic(fmt.Sprintf("labrpc: unknown handler %q", name))
	}

	// round-trip args through gob into a fresh struct so the handler
	// gets a private copy, exactly as if the request crossed a wire
	argv := reflect.New(m.Type.In(1).Elem())
	if !gobRoundTrip(args, argv.Interface()) {
		return false
	}
	replyv := reflect.New(m.Type.In(2).Elem())

	m.Func.Call([]reflect.Value{svc.rcvr, argv, replyv})

	// and the reply travels back the same way
	return gobRoundTrip(replyv.Interface(), reply)
}

func gobRoundTrip(from interface{}, to interface{}) bool {
	var buf bytes.Buffer
	if err := gob.NewEncoder(&buf).Encode(from); err != nil {
		panic(fmt.Sprintf("labrpc: encode %T: %v (missing labgob.Register?)", from, err))
	}
	if err := gob.NewDecoder(&buf).Decode(to); err != nil {
		panic(fmt.Sprintf("labrpc: decode %T: %v", to, err))
	}
	return true
}
