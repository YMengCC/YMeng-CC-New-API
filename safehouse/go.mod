module github.com/QuantumNous/new-api/safehouse

go 1.26

require (
	fyne.io/systray v1.12.2
	github.com/QuantumNous/new-api/textmask v0.0.0
	github.com/stretchr/testify v1.11.1
	golang.org/x/sys v0.45.0
)

require (
	github.com/davecgh/go-spew v1.1.1 // indirect
	github.com/godbus/dbus/v5 v5.1.0 // indirect
	github.com/pmezard/go-difflib v1.0.0 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)

replace github.com/QuantumNous/new-api/textmask => ../textmask
