/**
此文件为旧版支付设置文件，如需增加新的参数、变量等，请在 payment_setting.go 中添加
This file is the old version of the payment settings file. If you need to add new parameters, variables, etc., please add them in payment_setting.go
*/

package operation_setting

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
)

var PayAddress = ""
var CustomCallbackAddress = ""
var EpayId = ""
var EpayKey = ""
var Price = 7.3
var MinTopUp = 1
var USDExchangeRate = 7.3

var PayMethods = []map[string]string{
	{
		"name": "支付宝",
		"icon": "SiAlipay",
		"type": "alipay",
	},
	{
		"name": "微信",
		"icon": "SiWechat",
		"type": "wxpay",
	},
	{
		"name":      "自定义1",
		"icon":      "LuCreditCard",
		"type":      "custom1",
		"min_topup": "50",
	},
}

func UpdatePayMethodsByJsonString(jsonString string) error {
	PayMethods = make([]map[string]string, 0)
	if err := common.Unmarshal([]byte(jsonString), &PayMethods); err != nil {
		return err
	}
	legacyPrefix := "cat" + "fk"
	nameReplacer := strings.NewReplacer("Cat"+"FK", "JingSoft", "Cat"+"fk", "JingSoft", legacyPrefix, "JingSoft")
	for i := range PayMethods {
		switch strings.ToLower(strings.TrimSpace(PayMethods[i]["type"])) {
		case legacyPrefix:
			PayMethods[i]["type"] = JingSoftPaymentMethodLegacy
		case legacyPrefix + "_alipay":
			PayMethods[i]["type"] = JingSoftPaymentMethodAlipay
		case legacyPrefix + "_wxpay":
			PayMethods[i]["type"] = JingSoftPaymentMethodWeChat
		}
		if name := PayMethods[i]["name"]; name != "" {
			PayMethods[i]["name"] = nameReplacer.Replace(name)
		}
	}
	return nil
}

func PayMethods2JsonString() string {
	jsonBytes, err := common.Marshal(PayMethods)
	if err != nil {
		return "[]"
	}
	return string(jsonBytes)
}

func ContainsPayMethod(method string) bool {
	for _, payMethod := range PayMethods {
		if payMethod["type"] == method {
			return true
		}
	}
	return false
}
