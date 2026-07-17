// Package labgob is a thin wrapper over encoding/gob. It exists so the
// implementation files copied from raft-kv compile unchanged; it is an
// original stand-in for the course package of the same name, not a copy.
package labgob

import (
	"encoding/gob"
	"io"
)

// Register records a concrete type with gob so values of that type can
// travel inside interface{} fields (log commands, wrapped requests).
func Register(value interface{}) {
	gob.Register(value)
}

func NewEncoder(w io.Writer) *gob.Encoder {
	return gob.NewEncoder(w)
}

func NewDecoder(r io.Reader) *gob.Decoder {
	return gob.NewDecoder(r)
}
