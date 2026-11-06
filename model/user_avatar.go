package model

import (
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrUserAvatarNotFound reports a user without an uploaded avatar.
var ErrUserAvatarNotFound = errors.New("user avatar not found")

// UserAvatar stores one uploaded avatar per user. The image lives beside the
// user row instead of the users table so profile and session reads never drag
// the blob along, and multi-node deployments need no shared volume. MimeType is
// derived from the image bytes by service.ReadAvatarUpload, never from the
// client.
type UserAvatar struct {
	UserId    int    `json:"user_id" gorm:"primaryKey;autoIncrement:false"`
	MimeType  string `json:"mime_type" gorm:"type:varchar(32);not null"`
	Size      int64  `json:"size" gorm:"not null"`
	Width     int    `json:"width" gorm:"not null"`
	Height    int    `json:"height" gorm:"not null"`
	Sha256    string `json:"sha256" gorm:"type:char(64);not null"`
	Data      []byte `json:"-" gorm:"not null"`
	CreatedAt int64  `json:"created_at" gorm:"type:bigint;autoCreateTime"`
	UpdatedAt int64  `json:"updated_at" gorm:"type:bigint;autoUpdateTime"`
}

func (UserAvatar) TableName() string {
	return "user_avatars"
}

// SaveUserAvatar replaces the user's avatar and bumps avatar_version in one
// transaction. The version only feeds avatar cache busting; it deliberately
// leaves auth_version and the user cache schema untouched.
func SaveUserAvatar(userId int, avatar *UserAvatar) (int64, error) {
	if userId <= 0 || avatar == nil {
		return 0, errors.New("invalid user avatar")
	}
	var version int64
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Select("id").First(&user, userId).Error; err != nil {
			return err
		}
		avatar.UserId = userId
		if err := tx.Clauses(clause.OnConflict{UpdateAll: true}).Create(avatar).Error; err != nil {
			return err
		}
		var bumpErr error
		version, bumpErr = bumpUserAvatarVersion(tx, userId)
		return bumpErr
	})
	return version, err
}

// DeleteUserAvatar removes the user's avatar and bumps avatar_version even when
// no row existed, so a stale client cache still expires.
func DeleteUserAvatar(userId int) (int64, error) {
	if userId <= 0 {
		return 0, errors.New("invalid user avatar")
	}
	var version int64
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Select("id").First(&user, userId).Error; err != nil {
			return err
		}
		if err := tx.Where("user_id = ?", userId).Delete(&UserAvatar{}).Error; err != nil {
			return err
		}
		var bumpErr error
		version, bumpErr = bumpUserAvatarVersion(tx, userId)
		return bumpErr
	})
	return version, err
}

func bumpUserAvatarVersion(tx *gorm.DB, userId int) (int64, error) {
	if err := tx.Model(&User{}).Where("id = ?", userId).UpdateColumn("avatar_version", gorm.Expr("avatar_version + 1")).Error; err != nil {
		return 0, err
	}
	var version int64
	err := tx.Model(&User{}).Where("id = ?", userId).Pluck("avatar_version", &version).Error
	return version, err
}

// GetUserAvatar loads one avatar, including its bytes, for the blob endpoint.
func GetUserAvatar(userId int) (*UserAvatar, error) {
	if userId <= 0 {
		return nil, errors.New("invalid user id")
	}
	var avatar UserAvatar
	// A soft-deleted account must not continue exposing its profile image.
	err := DB.Where("user_id = ?", userId).
		Where("user_id IN (?)", DB.Model(&User{}).Select("id")).
		First(&avatar).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrUserAvatarNotFound
	}
	if err != nil {
		return nil, err
	}
	return &avatar, nil
}
