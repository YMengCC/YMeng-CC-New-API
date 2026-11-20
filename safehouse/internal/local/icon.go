package local

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/png"
	"math"
	"sync"
)

var (
	iconOnce sync.Once
	iconPNG  []byte
)

// IconPNG draws the safe-house mark: a rounded pink house with a face and a
// keyhole door. It is generated rather than committed as a binary asset.
func IconPNG() []byte {
	iconOnce.Do(func() {
		iconPNG = drawIcon(64)
	})
	return iconPNG
}

// IconICO wraps the PNG in an ICO container, which Windows accepts for tray
// icons since Vista.
func IconICO() []byte {
	data := IconPNG()
	var out bytes.Buffer
	_ = binary.Write(&out, binary.LittleEndian, [3]uint16{0, 1, 1})
	out.Write([]byte{64, 64, 0, 0})
	_ = binary.Write(&out, binary.LittleEndian, [2]uint16{1, 32})
	_ = binary.Write(&out, binary.LittleEndian, [2]uint32{uint32(len(data)), 22})
	out.Write(data)
	return out.Bytes()
}

func drawIcon(size int) []byte {
	const samples = 4
	roof := color.NRGBA{R: 0xDB, G: 0x27, B: 0x77, A: 0xFF}
	wall := color.NRGBA{R: 0xF9, G: 0xA8, B: 0xD4, A: 0xFF}
	ink := color.NRGBA{R: 0x83, G: 0x18, B: 0x43, A: 0xFF}
	blush := color.NRGBA{R: 0xEC, G: 0x48, B: 0x99, A: 0xFF}
	door := color.NRGBA{R: 0xFF, G: 0xFF, B: 0xFF, A: 0xFF}

	// Shapes in a 0..1 unit square; later shapes paint over earlier ones.
	shade := func(x, y float64) (color.NRGBA, bool) {
		var result color.NRGBA
		hit := false
		if roundedRect(x, y, 0.16, 0.42, 0.84, 0.92, 0.10) {
			result, hit = wall, true
		}
		// Roof: a triangle with a rounded apex feel from its thickness.
		if y >= 0.10 && y <= 0.50 {
			half := (y - 0.10) / 0.40 * 0.46
			if math.Abs(x-0.5) <= half {
				result, hit = roof, true
			}
		}
		if circle(x, y, 0.37, 0.60, 0.035) || circle(x, y, 0.63, 0.60, 0.035) {
			result, hit = ink, true
		}
		if circle(x, y, 0.29, 0.69, 0.045) || circle(x, y, 0.71, 0.69, 0.045) {
			result, hit = blush, true
		}
		if roundedRect(x, y, 0.42, 0.70, 0.58, 0.92, 0.07) {
			result, hit = door, true
		}
		if circle(x, y, 0.5, 0.78, 0.025) || (x >= 0.488 && x <= 0.512 && y >= 0.78 && y <= 0.85) {
			result, hit = roof, true
		}
		return result, hit
	}

	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	for py := range size {
		for px := range size {
			var r, g, b, a float64
			for sy := range samples {
				for sx := range samples {
					x := (float64(px) + (float64(sx)+0.5)/samples) / float64(size)
					y := (float64(py) + (float64(sy)+0.5)/samples) / float64(size)
					if c, ok := shade(x, y); ok {
						r += float64(c.R)
						g += float64(c.G)
						b += float64(c.B)
						a++
					}
				}
			}
			if a == 0 {
				continue
			}
			img.SetNRGBA(px, py, color.NRGBA{
				R: uint8(r / a), G: uint8(g / a), B: uint8(b / a),
				A: uint8(255 * a / (samples * samples)),
			})
		}
	}
	var out bytes.Buffer
	_ = png.Encode(&out, img)
	return out.Bytes()
}

func circle(x, y, cx, cy, radius float64) bool {
	return (x-cx)*(x-cx)+(y-cy)*(y-cy) <= radius*radius
}

func roundedRect(x, y, left, top, right, bottom, radius float64) bool {
	if x < left || x > right || y < top || y > bottom {
		return false
	}
	cx := min(max(x, left+radius), right-radius)
	cy := min(max(y, top+radius), bottom-radius)
	return circle(x, y, cx, cy, radius)
}
