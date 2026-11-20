//go:build windows

package main

import (
	"fyne.io/systray"
	"golang.org/x/sys/windows"

	"github.com/QuantumNous/new-api/safehouse/internal/local"
)

// runUntilQuit shows a tray icon with "open panel" and "quit" and blocks
// until either the tray or the panel asks to quit.
func runUntilQuit(panelURL string, done <-chan struct{}, requestQuit func()) {
	systray.Run(func() {
		systray.SetIcon(local.IconICO())
		systray.SetTooltip("萌萌的安全小屋 Mengmeng's Safe House")
		open := systray.AddMenuItem("打开控制面板 Open panel", "")
		systray.AddSeparator()
		quit := systray.AddMenuItem("退出 Quit", "")
		systray.SetOnTapped(func() { openBrowser(panelURL) })
		go func() {
			for {
				select {
				case <-open.ClickedCh:
					openBrowser(panelURL)
				case <-quit.ClickedCh:
					requestQuit()
				case <-done:
					systray.Quit()
					return
				}
			}
		}()
	}, nil)
}

// notifyError shows a message box because the GUI build has no console.
func notifyError(message string) {
	text, _ := windows.UTF16PtrFromString(message)
	title, _ := windows.UTF16PtrFromString("萌萌的安全小屋")
	_, _ = windows.MessageBox(0, text, title, windows.MB_OK|windows.MB_ICONWARNING)
}
