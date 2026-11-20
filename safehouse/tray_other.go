//go:build !windows

package main

import (
	"fmt"
	"os"
)

// runUntilQuit blocks until the panel or a signal asks to quit. Trays on
// macOS need CGO, which the cross-compiled release cannot use.
func runUntilQuit(_ string, done <-chan struct{}, _ func()) {
	<-done
}

func notifyError(message string) {
	fmt.Fprintln(os.Stderr, message)
}
