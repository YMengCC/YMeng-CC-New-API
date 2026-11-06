package service

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"io"
	"mime/multipart"
	"net/http"

	_ "image/jpeg"
	_ "image/png"

	_ "golang.org/x/image/webp"
)

const (
	// MaxAvatarSize caps one uploaded avatar at 1 MiB. The web client crops to
	// 512x512 before uploading, so this leaves ample headroom.
	MaxAvatarSize int64 = 1024 * 1024
	// MaxAvatarDimension caps both edges. Larger images are rejected rather
	// than resized so decompression work stays bounded per request.
	MaxAvatarDimension = 512
)

// UploadedAvatar is a validated avatar ready to persist.
type UploadedAvatar struct {
	MimeType string
	Data     []byte
	Width    int
	Height   int
	Sha256   string
}

var avatarFormatByContentType = map[string]string{
	"image/jpeg": "jpeg",
	"image/png":  "png",
	"image/webp": "webp",
}

// ReadAvatarUpload validates a multipart avatar upload. The client-supplied
// filename and part content type are ignored: the server sniffs the bytes,
// accepts only raster JPEG/PNG/WebP, and confirms the decoded format matches
// the sniffed content type so a mislabeled payload cannot be stored as
// something a browser would execute.
func ReadAvatarUpload(header *multipart.FileHeader) (*UploadedAvatar, error) {
	if header == nil {
		return nil, errors.New("avatar file is required")
	}
	if header.Size <= 0 || header.Size > MaxAvatarSize {
		return nil, fmt.Errorf("avatar must be between 1 byte and %d KB", MaxAvatarSize/1024)
	}
	source, err := header.Open()
	if err != nil {
		return nil, err
	}
	defer source.Close()

	data, err := io.ReadAll(io.LimitReader(source, MaxAvatarSize+1))
	if err != nil {
		return nil, err
	}
	if len(data) == 0 || int64(len(data)) > MaxAvatarSize {
		return nil, fmt.Errorf("avatar must be between 1 byte and %d KB", MaxAvatarSize/1024)
	}

	contentType := http.DetectContentType(data)
	expectedFormat, ok := avatarFormatByContentType[contentType]
	if !ok {
		return nil, errors.New("avatar must be a JPEG, PNG, or WebP image")
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, errors.New("avatar file is not a readable image")
	}
	if format != expectedFormat {
		return nil, errors.New("avatar content does not match its image type")
	}
	if config.Width <= 0 || config.Height <= 0 {
		return nil, errors.New("avatar has invalid dimensions")
	}
	if config.Width > MaxAvatarDimension || config.Height > MaxAvatarDimension {
		return nil, fmt.Errorf("avatar dimensions must not exceed %d by %d pixels", MaxAvatarDimension, MaxAvatarDimension)
	}
	// Header-only parsing accepts truncated payloads. Decode the bounded raster
	// as well before persisting bytes that browsers will later consume.
	if _, decodedFormat, err := image.Decode(bytes.NewReader(data)); err != nil || decodedFormat != expectedFormat {
		return nil, errors.New("avatar file is not a readable image")
	}

	sum := sha256.Sum256(data)
	return &UploadedAvatar{
		MimeType: contentType,
		Data:     data,
		Width:    config.Width,
		Height:   config.Height,
		Sha256:   hex.EncodeToString(sum[:]),
	}, nil
}
