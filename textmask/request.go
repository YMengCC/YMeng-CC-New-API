package textmask

import (
	"bytes"
	"encoding/json"
	"slices"
	"strconv"
	"strings"
)

type object map[string]json.RawMessage

func decodeObject(raw []byte) (object, error) {
	var value object
	if len(bytes.TrimSpace(raw)) == 0 || bytes.TrimSpace(raw)[0] != '{' || json.Unmarshal(raw, &value) != nil || value == nil {
		return nil, ErrUnsupported
	}
	return value, nil
}

func decodeArray(raw []byte) ([]json.RawMessage, error) {
	var value []json.RawMessage
	if len(bytes.TrimSpace(raw)) == 0 || bytes.TrimSpace(raw)[0] != '[' || json.Unmarshal(raw, &value) != nil {
		return nil, ErrUnsupported
	}
	return value, nil
}

func stringValue(raw []byte) (string, error) {
	var value string
	if len(bytes.TrimSpace(raw)) == 0 || bytes.TrimSpace(raw)[0] != '"' || json.Unmarshal(raw, &value) != nil {
		return "", ErrUnsupported
	}
	return value, nil
}

func optionalEmpty(raw []byte) bool {
	raw = bytes.TrimSpace(raw)
	return len(raw) == 0 || bytes.Equal(raw, []byte("null")) || bytes.Equal(raw, []byte("\"\"")) || bytes.Equal(raw, []byte("[]")) || bytes.Equal(raw, []byte("{}"))
}

// whitelist removes only empty unknown extensions; populated extensions fail closed.
func whitelist(value object, fields string) error {
	allowed := strings.Fields(fields)
	for key, raw := range value {
		if !slices.Contains(allowed, key) {
			if !optionalEmpty(raw) {
				return ErrUnsupported
			}
			delete(value, key)
		}
	}
	return nil
}

func setJSON(value object, key string, data any) error {
	raw, err := json.Marshal(data)
	if err != nil {
		return ErrUnsupported
	}
	value[key] = raw
	return nil
}

func (s *Session) maskString(value object, key string, required bool) error {
	raw, exists := value[key]
	if !exists {
		if required {
			return ErrUnsupported
		}
		return nil
	}
	text, err := stringValue(raw)
	if err != nil {
		return err
	}
	text, err = s.maskText(text)
	if err != nil {
		return err
	}
	return setJSON(value, key, text)
}

func (s *Session) maskStrings(raw []byte) ([]byte, error) {
	if len(bytes.TrimSpace(raw)) > 0 && bytes.TrimSpace(raw)[0] == '"' {
		text, err := stringValue(raw)
		if err != nil {
			return nil, err
		}
		text, err = s.maskText(text)
		if err != nil {
			return nil, err
		}
		return json.Marshal(text)
	}
	items, err := decodeArray(raw)
	if err != nil {
		return nil, err
	}
	for i, item := range items {
		text, err := stringValue(item)
		if err != nil {
			return nil, err
		}
		text, err = s.maskText(text)
		if err != nil {
			return nil, err
		}
		items[i], err = json.Marshal(text)
		if err != nil {
			return nil, ErrUnsupported
		}
	}
	return json.Marshal(items)
}

func numericSettings(value object, fields string) error {
	for field := range strings.FieldsSeq(fields) {
		raw, exists := value[field]
		if !exists {
			continue
		}
		if _, err := strconv.ParseFloat(string(raw), 64); err != nil {
			return ErrUnsupported
		}
	}
	return nil
}

func boolSettings(value object, fields string) error {
	for field := range strings.FieldsSeq(fields) {
		raw, exists := value[field]
		if !exists {
			continue
		}
		if string(raw) != "true" && string(raw) != "false" {
			return ErrUnsupported
		}
	}
	return nil
}

func enumSetting(value object, field, allowed string) error {
	raw, exists := value[field]
	if !exists {
		return nil
	}
	text, err := stringValue(raw)
	if err != nil || !slices.Contains(strings.Fields(allowed), text) {
		return ErrUnsupported
	}
	return nil
}

func (s *Session) maskParts(raw []byte, protocol string) ([]byte, error) {
	if len(bytes.TrimSpace(raw)) > 0 && bytes.TrimSpace(raw)[0] == '"' {
		return s.maskStrings(raw)
	}
	parts, err := decodeArray(raw)
	if err != nil {
		return nil, err
	}
	for i, part := range parts {
		value, err := decodeObject(part)
		if err != nil {
			return nil, err
		}
		switch protocol {
		case "gemini":
			err = s.maskGeminiPart(value)
		case "claude":
			err = s.maskClaudePart(value)
		default:
			err = s.maskTextPart(value, protocol)
		}
		if err != nil {
			return nil, err
		}
		parts[i], err = json.Marshal(value)
		if err != nil {
			return nil, ErrUnsupported
		}
	}
	return json.Marshal(parts)
}

func (s *Session) maskTextPart(value object, protocol string) error {
	if err := whitelist(value, "type text cache_control"); err != nil {
		return err
	}
	delete(value, "cache_control")
	kind, err := stringValue(value["type"])
	if err != nil || (kind != "text" && !(protocol == "responses" && (kind == "input_text" || kind == "output_text"))) {
		return ErrUnsupported
	}
	return s.maskString(value, "text", true)
}

func (s *Session) maskClaudePart(value object) error {
	kind, err := stringValue(value["type"])
	if err != nil {
		return ErrUnsupported
	}
	switch kind {
	case "text":
		if err = whitelist(value, "type text cache_control"); err != nil {
			return err
		}
		delete(value, "cache_control")
		return s.maskString(value, "text", true)
	case "tool_use":
		if err = whitelist(value, "type id name input cache_control"); err != nil {
			return err
		}
		delete(value, "cache_control")
		if err = s.opaqueField(value, "id", true); err != nil {
			return err
		}
		if _, err = s.toolName(value, "name"); err != nil {
			return err
		}
		if input, ok := value["input"]; ok {
			masked, e := s.maskJSONValue(input, 0)
			if e != nil {
				return e
			}
			value["input"] = masked
		}
		return nil
	case "tool_result":
		if err = whitelist(value, "type tool_use_id content is_error cache_control"); err != nil {
			return err
		}
		delete(value, "cache_control")
		if err = s.opaqueField(value, "tool_use_id", true); err != nil {
			return err
		}
		if raw, ok := value["content"]; ok {
			content, e := s.maskClaudeToolResultContent(raw)
			if e != nil {
				return e
			}
			value["content"] = content
		}
		return boolSettings(value, "is_error")
	case "thinking":
		if err = whitelist(value, "type thinking signature cache_control"); err != nil {
			return err
		}
		delete(value, "cache_control")
		if signature, ok := value["signature"]; ok && !optionalEmpty(signature) {
			if err = s.opaqueField(value, "signature", true); err != nil {
				return err
			}
			if _, err = stringValue(value["thinking"]); err != nil {
				return err
			}
			return nil
		}
		return s.maskString(value, "thinking", true)
	case "redacted_thinking":
		if err = whitelist(value, "type data cache_control"); err != nil {
			return err
		}
		delete(value, "cache_control")
		return s.opaqueField(value, "data", true)
	default:
		return ErrUnsupported
	}
}

func (s *Session) maskClaudeToolResultContent(raw []byte) ([]byte, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return raw, nil
	}
	if trimmed[0] == '"' {
		return s.maskStrings(raw)
	}
	items, err := decodeArray(raw)
	if err != nil {
		return nil, err
	}
	for i, item := range items {
		part, err := decodeObject(item)
		if err != nil {
			return nil, err
		}
		if err = s.maskTextPart(part, "claude"); err != nil {
			return nil, err
		}
		items[i], err = json.Marshal(part)
		if err != nil {
			return nil, ErrUnsupported
		}
	}
	return json.Marshal(items)
}

func (s *Session) maskGeminiPart(value object) error {
	if err := whitelist(value, "text thought thoughtSignature functionCall functionResponse"); err != nil {
		return err
	}
	lanes := 0
	if _, ok := value["text"]; ok {
		lanes++
	}
	if _, ok := value["functionCall"]; ok {
		lanes++
	}
	if _, ok := value["functionResponse"]; ok {
		lanes++
	}
	if lanes != 1 {
		return ErrUnsupported
	}
	if err := boolSettings(value, "thought"); err != nil {
		return err
	}
	if err := s.opaqueField(value, "thoughtSignature", false); err != nil {
		return err
	}
	if _, ok := value["text"]; ok {
		if signature, signed := value["thoughtSignature"]; signed && !optionalEmpty(signature) {
			if _, err := stringValue(value["text"]); err != nil {
				return err
			}
			return nil
		}
		return s.maskString(value, "text", true)
	}
	if raw, ok := value["functionCall"]; ok {
		call, err := decodeObject(raw)
		if err != nil {
			return err
		}
		if err = whitelist(call, "id name args partialArgs willContinue"); err != nil {
			return err
		}
		if err = s.opaqueField(call, "id", false); err != nil {
			return err
		}
		if _, err = s.toolName(call, "name"); err != nil {
			return err
		}
		for _, field := range []string{"partialArgs", "willContinue"} {
			if v, ok := call[field]; ok && !optionalEmpty(v) {
				return ErrUnsupported
			}
		}
		if args, ok := call["args"]; ok {
			masked, e := s.maskJSONValue(args, 0)
			if e != nil {
				return e
			}
			call["args"] = masked
		}
		value["functionCall"], err = json.Marshal(call)
		return err
	}
	response, err := decodeObject(value["functionResponse"])
	if err != nil {
		return err
	}
	if err = whitelist(response, "name response id willContinue scheduling parts"); err != nil {
		return err
	}
	if err = s.opaqueField(response, "id", false); err != nil {
		return err
	}
	if _, err = s.toolName(response, "name"); err != nil {
		return err
	}
	for _, field := range []string{"willContinue", "scheduling", "parts"} {
		if v, ok := response[field]; ok && !optionalEmpty(v) {
			return ErrUnsupported
		}
	}
	if body, ok := response["response"]; ok {
		masked, e := s.maskJSONValue(body, 0)
		if e != nil {
			return e
		}
		response["response"] = masked
	}
	value["functionResponse"], err = json.Marshal(response)
	return err
}

func (s *Session) maskMessages(raw []byte, protocol string) ([]byte, error) {
	messages, err := decodeArray(raw)
	if err != nil || len(messages) == 0 {
		return nil, ErrUnsupported
	}
	for i, message := range messages {
		value, err := decodeObject(message)
		if err != nil {
			return nil, err
		}
		switch protocol {
		case "chat":
			err = s.maskChatMessage(value)
		case "claude":
			err = s.maskClaudeMessage(value)
		case "gemini":
			err = s.maskGeminiMessage(value)
		default:
			return nil, ErrUnsupported
		}
		if err != nil {
			return nil, err
		}
		messages[i], err = json.Marshal(value)
		if err != nil {
			return nil, ErrUnsupported
		}
	}
	return json.Marshal(messages)
}

func (s *Session) maskChatMessage(value object) error {
	if err := whitelist(value, "role content tool_calls tool_call_id"); err != nil {
		return err
	}
	role, err := stringValue(value["role"])
	if err != nil || !slices.Contains(strings.Fields("system developer user assistant tool"), role) {
		return ErrUnsupported
	}
	switch role {
	case "tool":
		if err = s.opaqueField(value, "tool_call_id", true); err != nil {
			return err
		}
		if err = s.maskContentField(value, "content", "chat", true, true); err != nil {
			return err
		}
		if raw, ok := value["tool_calls"]; ok && !optionalEmpty(raw) {
			return ErrUnsupported
		}
		return nil
	case "assistant":
		if err = s.maskContentField(value, "content", "chat", false, true); err != nil {
			return err
		}
		if raw, ok := value["tool_calls"]; ok {
			value["tool_calls"], err = s.maskChatToolCalls(raw)
			return err
		}
		return nil
	default:
		if err = s.maskContentField(value, "content", "chat", true, false); err != nil {
			return err
		}
		for _, field := range []string{"tool_calls", "tool_call_id"} {
			if raw, ok := value[field]; ok && !optionalEmpty(raw) {
				return ErrUnsupported
			}
		}
		return nil
	}
}

func (s *Session) maskClaudeMessage(value object) error {
	if err := whitelist(value, "role content"); err != nil {
		return err
	}
	role, err := stringValue(value["role"])
	if err != nil || !slices.Contains([]string{"user", "assistant"}, role) {
		return ErrUnsupported
	}
	value["content"], err = s.maskParts(value["content"], "claude")
	return err
}

func (s *Session) maskGeminiMessage(value object) error {
	if err := whitelist(value, "role parts"); err != nil {
		return err
	}
	if rawRole, ok := value["role"]; ok {
		role, err := stringValue(rawRole)
		if err != nil || (role != "" && !slices.Contains([]string{"user", "model"}, role)) {
			return ErrUnsupported
		}
	}
	masked, err := s.maskParts(value["parts"], "gemini")
	if err != nil {
		return err
	}
	value["parts"] = masked
	return nil
}

func (s *Session) maskContentField(value object, field, protocol string, required, allowNull bool) error {
	raw, ok := value[field]
	if !ok {
		if required {
			return ErrUnsupported
		}
		return nil
	}
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return ErrUnsupported
	}
	if bytes.Equal(trimmed, []byte("null")) {
		if allowNull {
			return nil
		}
		return ErrUnsupported
	}
	if trimmed[0] == '"' {
		return s.maskString(value, field, true)
	}
	if trimmed[0] != '[' {
		return ErrUnsupported
	}
	masked, err := s.maskParts(raw, protocol)
	if err != nil {
		return err
	}
	value[field] = masked
	return nil
}

func (s *Session) maskChatToolCalls(raw []byte) ([]byte, error) {
	if optionalEmpty(raw) {
		return raw, nil
	}
	items, err := decodeArray(raw)
	if err != nil || len(items) > maxToolCount {
		return nil, ErrUnsupported
	}
	for i, item := range items {
		call, err := decodeObject(item)
		if err != nil {
			return nil, err
		}
		if err = whitelist(call, "id type function"); err != nil {
			return nil, err
		}
		if err = s.opaqueField(call, "id", true); err != nil {
			return nil, err
		}
		kind, err := stringValue(call["type"])
		if err != nil || kind != "function" {
			return nil, ErrUnsupported
		}
		function, err := decodeObject(call["function"])
		if err != nil {
			return nil, err
		}
		if err = whitelist(function, "name arguments"); err != nil {
			return nil, err
		}
		if _, err = s.toolName(function, "name"); err != nil {
			return nil, err
		}
		if _, ok := function["arguments"]; !ok {
			return nil, ErrUnsupported
		}
		if err = s.maskJSONStringField(function, "arguments"); err != nil {
			return nil, err
		}
		call["function"], err = json.Marshal(function)
		if err != nil {
			return nil, ErrUnsupported
		}
		items[i], err = json.Marshal(call)
		if err != nil {
			return nil, ErrUnsupported
		}
	}
	return json.Marshal(items)
}

func (s *Session) maskResponsesInput(raw []byte) ([]byte, error) {
	if len(bytes.TrimSpace(raw)) > 0 && bytes.TrimSpace(raw)[0] == '"' {
		return s.maskStrings(raw)
	}
	items, err := decodeArray(raw)
	if err != nil || len(items) == 0 {
		return nil, ErrUnsupported
	}
	for i, item := range items {
		value, err := decodeObject(item)
		if err != nil {
			return nil, err
		}
		kind := ""
		if rawType, ok := value["type"]; ok {
			if kind, err = stringValue(rawType); err != nil {
				return nil, err
			}
		}
		if kind == "" {
			if _, ok := value["role"]; !ok {
				return nil, ErrUnsupported
			}
			kind = "message"
		}
		switch kind {
		case "message":
			err = s.maskResponsesMessage(value)
		case "function_call":
			err = s.maskResponsesFunctionCall(value)
		case "function_call_output":
			err = s.maskResponsesFunctionOutput(value)
		case "reasoning":
			err = s.maskResponsesReasoning(value)
		default:
			return nil, ErrUnsupported
		}
		if err != nil {
			return nil, err
		}
		items[i], err = json.Marshal(value)
		if err != nil {
			return nil, ErrUnsupported
		}
	}
	return json.Marshal(items)
}

func (s *Session) maskResponsesMessage(value object) error {
	if err := whitelist(value, "type role content"); err != nil {
		return err
	}
	if err := enumSetting(value, "type", "message"); err != nil {
		return err
	}
	role, err := stringValue(value["role"])
	if err != nil || !slices.Contains(strings.Fields("system developer user assistant"), role) {
		return ErrUnsupported
	}
	return s.maskContentField(value, "content", "responses", true, false)
}

func (s *Session) maskResponsesFunctionCall(value object) error {
	if err := whitelist(value, "type call_id name arguments"); err != nil {
		return err
	}
	if err := s.opaqueField(value, "call_id", true); err != nil {
		return err
	}
	if _, err := s.toolName(value, "name"); err != nil {
		return err
	}
	if _, ok := value["arguments"]; !ok {
		return ErrUnsupported
	}
	return s.maskJSONStringField(value, "arguments")
}

func (s *Session) maskResponsesFunctionOutput(value object) error {
	if err := whitelist(value, "type call_id output"); err != nil {
		return err
	}
	if err := s.opaqueField(value, "call_id", true); err != nil {
		return err
	}
	raw, ok := value["output"]
	if !ok {
		return ErrUnsupported
	}
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return ErrUnsupported
	}
	if bytes.Equal(trimmed, []byte("null")) {
		return nil
	}
	if trimmed[0] == '"' {
		return s.maskString(value, "output", true)
	}
	if trimmed[0] != '[' {
		return ErrUnsupported
	}
	items, err := decodeArray(raw)
	if err != nil {
		return err
	}
	for i, item := range items {
		part, err := decodeObject(item)
		if err != nil {
			return err
		}
		if err = whitelist(part, "type text"); err != nil {
			return err
		}
		kind, err := stringValue(part["type"])
		if err != nil || (kind != "input_text" && kind != "output_text" && kind != "text") {
			return ErrUnsupported
		}
		if err = s.maskString(part, "text", true); err != nil {
			return err
		}
		items[i], err = json.Marshal(part)
		if err != nil {
			return ErrUnsupported
		}
	}
	value["output"], err = json.Marshal(items)
	return err
}

func (s *Session) maskResponsesReasoning(value object) error {
	if err := whitelist(value, "type id summary content encrypted_content"); err != nil {
		return err
	}
	if err := s.opaqueField(value, "id", false); err != nil {
		return err
	}
	if err := s.opaqueField(value, "encrypted_content", false); err != nil {
		return err
	}
	if raw, ok := value["summary"]; ok {
		if err := s.maskReasoningParts(value, "summary", "summary_text", raw); err != nil {
			return err
		}
	}
	if raw, ok := value["content"]; ok {
		if err := s.maskReasoningParts(value, "content", "reasoning_text", raw); err != nil {
			return err
		}
	}
	return nil
}

func (s *Session) maskReasoningParts(value object, field, allowedType string, raw []byte) error {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) || bytes.Equal(trimmed, []byte("[]")) {
		return nil
	}
	items, err := decodeArray(raw)
	if err != nil {
		return err
	}
	for i, item := range items {
		part, err := decodeObject(item)
		if err != nil {
			return err
		}
		if err = whitelist(part, "type text"); err != nil {
			return err
		}
		kind, err := stringValue(part["type"])
		if err != nil || kind != allowedType {
			return ErrUnsupported
		}
		if err = s.maskString(part, "text", true); err != nil {
			return err
		}
		items[i], err = json.Marshal(part)
		if err != nil {
			return ErrUnsupported
		}
	}
	value[field], err = json.Marshal(items)
	return err
}

func (s *Session) maskPrompt(raw []byte) ([]byte, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return raw, nil
	}
	if trimmed[0] == '"' {
		return s.maskStrings(raw)
	}
	if trimmed[0] != '[' {
		return nil, ErrUnsupported
	}
	return s.maskParts(raw, "responses")
}

func (s *Session) validateInclude(raw []byte) error {
	if optionalEmpty(raw) {
		return nil
	}
	items, err := decodeArray(raw)
	if err != nil {
		return err
	}
	for _, item := range items {
		text, err := stringValue(item)
		if err != nil || text != "reasoning.encrypted_content" {
			return ErrUnsupported
		}
	}
	return nil
}

// MaskJSON validates and masks one request. Text lanes, function tool
// declarations, tool arguments and tool results are supported; media,
// encrypted/signed history and server-side conversation references are not.
// Responses always opts out of storage; an explicit store:true is rejected.
// Numeric generation parameters remain byte-for-byte raw values for host validation.
func (s *Session) MaskJSON(body []byte, protocol string) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil, ErrClosed
	}
	value, err := decodeObject(body)
	if err != nil {
		return nil, err
	}
	switch protocol {
	case "chat", "completions", "playground":
		fields := "model stream stream_options max_tokens max_completion_tokens min_tokens temperature top_p top_k n frequency_penalty presence_penalty seed logprobs top_logprobs stop reasoning_effort verbosity response_format store"
		if protocol == "chat" {
			fields += " messages tools tool_choice parallel_tool_calls"
		} else if protocol != "completions" {
			fields += " messages"
		} else {
			fields += " prompt suffix echo best_of logit_bias"
		}
		if protocol == "playground" {
			fields += " group"
			if group, exists := value["group"]; exists {
				if _, err = stringValue(group); err != nil {
					return nil, err
				}
			}
		}
		if err = whitelist(value, fields); err != nil {
			return nil, err
		}
		if err = numericSettings(value, "max_tokens max_completion_tokens min_tokens temperature top_p top_k n frequency_penalty presence_penalty seed top_logprobs best_of"); err != nil {
			return nil, err
		}
		if err = boolSettings(value, "stream echo store"); err != nil {
			return nil, err
		}
		if protocol != "completions" {
			if err = boolSettings(value, "logprobs"); err != nil {
				return nil, err
			}
		} else if err = numericSettings(value, "logprobs"); err != nil {
			return nil, err
		}
		if string(value["store"]) == "true" {
			return nil, ErrUnsupported
		}
		if protocol != "completions" {
			value["messages"], err = s.maskMessages(value["messages"], protocol)
		} else {
			value["prompt"], err = s.maskStrings(value["prompt"])
			if err == nil {
				err = s.maskString(value, "suffix", false)
			}
		}
		if err != nil {
			return nil, err
		}
		if protocol == "chat" {
			if err = boolSettings(value, "parallel_tool_calls"); err != nil {
				return nil, err
			}
			if raw, ok := value["tools"]; ok {
				value["tools"], err = s.maskChatTools(raw)
				if err != nil {
					return nil, err
				}
			}
			if raw, ok := value["tool_choice"]; ok {
				value["tool_choice"], err = s.maskChatToolChoice(raw)
				if err != nil {
					return nil, err
				}
			}
		}
		if err = enumSetting(value, "reasoning_effort", "none minimal low medium high xhigh"); err != nil {
			return nil, err
		}
		if err = enumSetting(value, "verbosity", "low medium high"); err != nil {
			return nil, err
		}
		if raw, ok := value["response_format"]; ok {
			format, e := decodeObject(raw)
			if e != nil || whitelist(format, "type") != nil || enumSetting(format, "type", "text json_object") != nil {
				return nil, ErrUnsupported
			}
			value["response_format"], _ = json.Marshal(format)
		}
		// Arbitrary bias keys are token IDs, but values must be numeric.
		if raw, ok := value["logit_bias"]; ok {
			bias, e := decodeObject(raw)
			if e != nil {
				return nil, e
			}
			for key, v := range bias {
				if _, e = strconv.ParseUint(key, 10, 64); e != nil {
					return nil, ErrUnsupported
				}
				if _, e = strconv.ParseFloat(string(v), 64); e != nil {
					return nil, ErrUnsupported
				}
			}
		}
	case "responses":
		if err = whitelist(value, "model input instructions stream stream_options max_output_tokens top_logprobs temperature top_p frequency_penalty presence_penalty store background reasoning text truncation service_tier tools tool_choice parallel_tool_calls max_tool_calls include prompt_cache_key prompt_cache_options prompt_cache_retention client_metadata safety_identifier user"); err != nil {
			return nil, err
		}
		if err = boolSettings(value, "stream store background parallel_tool_calls"); err != nil {
			return nil, err
		}
		if string(value["store"]) == "true" || string(value["background"]) == "true" {
			return nil, ErrUnsupported
		}
		value["store"] = json.RawMessage("false")
		if err = numericSettings(value, "max_output_tokens top_logprobs temperature top_p frequency_penalty presence_penalty max_tool_calls"); err != nil {
			return nil, err
		}
		if raw, ok := value["max_tool_calls"]; ok {
			if _, e := strconv.ParseUint(string(raw), 10, 64); e != nil {
				return nil, ErrUnsupported
			}
		}
		for _, field := range []string{"prompt_cache_key", "prompt_cache_options", "prompt_cache_retention", "client_metadata", "safety_identifier", "user"} {
			delete(value, field)
		}
		if raw, ok := value["include"]; ok {
			if err = s.validateInclude(raw); err != nil {
				return nil, err
			}
		}
		if raw, ok := value["tools"]; ok {
			value["tools"], err = s.maskResponsesTools(raw)
			if err != nil {
				return nil, err
			}
		}
		if raw, ok := value["tool_choice"]; ok {
			value["tool_choice"], err = s.maskResponsesToolChoice(raw)
			if err != nil {
				return nil, err
			}
		}
		raw := value["input"]
		value["input"], err = s.maskResponsesInput(raw)
		if err != nil {
			return nil, err
		}
		if raw, ok := value["instructions"]; ok {
			value["instructions"], err = s.maskPrompt(raw)
			if err != nil {
				return nil, err
			}
		}
		if raw, ok := value["reasoning"]; ok {
			settings, e := decodeObject(raw)
			if e != nil || whitelist(settings, "effort summary") != nil || enumSetting(settings, "effort", "none minimal low medium high xhigh") != nil || enumSetting(settings, "summary", "auto concise detailed") != nil {
				return nil, ErrUnsupported
			}
			value["reasoning"], _ = json.Marshal(settings)
		}
		if raw, ok := value["text"]; ok {
			settings, e := decodeObject(raw)
			if e != nil || whitelist(settings, "format verbosity") != nil || enumSetting(settings, "verbosity", "low medium high") != nil {
				return nil, ErrUnsupported
			}
			if format, exists := settings["format"]; exists {
				f, e := decodeObject(format)
				if e != nil || whitelist(f, "type") != nil || enumSetting(f, "type", "text json_object") != nil {
					return nil, ErrUnsupported
				}
				settings["format"], _ = json.Marshal(f)
			}
			value["text"], _ = json.Marshal(settings)
		}
		if enumSetting(value, "truncation", "auto disabled") != nil || enumSetting(value, "service_tier", "auto default flex priority") != nil {
			return nil, ErrUnsupported
		}
	case "claude":
		if err = whitelist(value, "model system messages max_tokens max_tokens_to_sample temperature top_p top_k stream stop_sequences thinking service_tier tools tool_choice metadata cache_control output_config"); err != nil {
			return nil, err
		}
		if err = numericSettings(value, "max_tokens max_tokens_to_sample temperature top_p top_k"); err != nil {
			return nil, err
		}
		if err = boolSettings(value, "stream"); err != nil {
			return nil, err
		}
		delete(value, "metadata")
		delete(value, "cache_control")
		if raw, ok := value["output_config"]; ok {
			config, e := decodeObject(raw)
			if e != nil || whitelist(config, "effort") != nil || enumSetting(config, "effort", "low medium high max") != nil {
				return nil, ErrUnsupported
			}
			value["output_config"], _ = json.Marshal(config)
		}
		if raw, ok := value["tools"]; ok {
			value["tools"], err = s.maskClaudeTools(raw)
			if err != nil {
				return nil, err
			}
		}
		if raw, ok := value["tool_choice"]; ok {
			value["tool_choice"], err = s.maskClaudeToolChoice(raw)
			if err != nil {
				return nil, err
			}
		}
		value["messages"], err = s.maskMessages(value["messages"], protocol)
		if err != nil {
			return nil, err
		}
		if raw, ok := value["system"]; ok {
			value["system"], err = s.maskParts(raw, protocol)
			if err != nil {
				return nil, err
			}
		}
		if raw, ok := value["thinking"]; ok {
			settings, e := decodeObject(raw)
			if e != nil || whitelist(settings, "type budget_tokens display") != nil {
				return nil, ErrUnsupported
			}
			kind, e := stringValue(settings["type"])
			if e != nil || !slices.Contains([]string{"disabled", "enabled", "adaptive"}, kind) {
				return nil, ErrUnsupported
			}
			if enumSetting(settings, "display", "summarized omitted") != nil || numericSettings(settings, "budget_tokens") != nil {
				return nil, ErrUnsupported
			}
			value["thinking"], _ = json.Marshal(settings)
		}
		if enumSetting(value, "service_tier", "auto standard_only") != nil {
			return nil, ErrUnsupported
		}
	case "gemini":
		if err = whitelist(value, "model contents systemInstruction system_instruction generationConfig safetySettings tools toolConfig tool_config"); err != nil {
			return nil, err
		}
		if raw, ok := value["tools"]; ok {
			value["tools"], err = s.maskGeminiTools(raw)
			if err != nil {
				return nil, err
			}
		}
		for _, field := range []string{"toolConfig", "tool_config"} {
			if raw, ok := value[field]; ok {
				value[field], err = s.maskGeminiToolConfig(raw)
				if err != nil {
					return nil, err
				}
			}
		}
		value["contents"], err = s.maskMessages(value["contents"], protocol)
		if err != nil {
			return nil, err
		}
		for _, field := range []string{"systemInstruction", "system_instruction"} {
			if raw, ok := value[field]; ok {
				item, e := decodeObject(raw)
				if e != nil || whitelist(item, "role parts") != nil || enumSetting(item, "role", "system user") != nil {
					return nil, ErrUnsupported
				}
				item["parts"], err = s.maskParts(item["parts"], protocol)
				if err != nil {
					return nil, err
				}
				value[field], _ = json.Marshal(item)
			}
		}
		if raw, ok := value["generationConfig"]; ok {
			settings, e := decodeObject(raw)
			if e != nil || whitelist(settings, "temperature topP topK maxOutputTokens candidateCount stopSequences responseMimeType presencePenalty frequencyPenalty responseLogprobs logprobs seed thinkingConfig") != nil || numericSettings(settings, "temperature topP topK maxOutputTokens candidateCount presencePenalty frequencyPenalty logprobs seed") != nil || boolSettings(settings, "responseLogprobs") != nil || enumSetting(settings, "responseMimeType", "text/plain application/json") != nil {
				return nil, ErrUnsupported
			}
			if stop, ok := settings["stopSequences"]; ok {
				settings["stopSequences"], err = s.maskStrings(stop)
				if err != nil {
					return nil, err
				}
			}
			if thinking, ok := settings["thinkingConfig"]; ok {
				t, e := decodeObject(thinking)
				if e != nil || whitelist(t, "includeThoughts thinkingBudget thinkingLevel") != nil || boolSettings(t, "includeThoughts") != nil || numericSettings(t, "thinkingBudget") != nil || enumSetting(t, "thinkingLevel", "minimal low medium high") != nil {
					return nil, ErrUnsupported
				}
				settings["thinkingConfig"], _ = json.Marshal(t)
			}
			value["generationConfig"], _ = json.Marshal(settings)
		}
		if raw, ok := value["safetySettings"]; ok {
			settings, e := decodeArray(raw)
			if e != nil {
				return nil, e
			}
			for i, item := range settings {
				setting, e := decodeObject(item)
				if e != nil || whitelist(setting, "category threshold") != nil || enumSetting(setting, "category", "HARM_CATEGORY_HARASSMENT HARM_CATEGORY_HATE_SPEECH HARM_CATEGORY_SEXUALLY_EXPLICIT HARM_CATEGORY_DANGEROUS_CONTENT HARM_CATEGORY_CIVIC_INTEGRITY") != nil || enumSetting(setting, "threshold", "BLOCK_NONE BLOCK_ONLY_HIGH BLOCK_MEDIUM_AND_ABOVE BLOCK_LOW_AND_ABOVE OFF HARM_BLOCK_THRESHOLD_UNSPECIFIED") != nil {
					return nil, ErrUnsupported
				}
				settings[i], _ = json.Marshal(setting)
			}
			value["safetySettings"], _ = json.Marshal(settings)
		}
	default:
		return nil, ErrUnsupported
	}
	if raw, ok := value["model"]; ok {
		model, e := stringValue(raw)
		if e != nil || model == "" || strings.Contains(model, s.marker) {
			return nil, ErrUnsupported
		}
	} else if protocol != "gemini" {
		return nil, ErrUnsupported
	}
	for _, field := range []string{"stop", "stop_sequences"} {
		if raw, ok := value[field]; ok {
			value[field], err = s.maskStrings(raw)
			if err != nil {
				return nil, err
			}
		}
	}
	if raw, ok := value["stream_options"]; ok {
		settings, e := decodeObject(raw)
		if e != nil || whitelist(settings, "include_usage include_obfuscation") != nil || boolSettings(settings, "include_usage include_obfuscation") != nil {
			return nil, ErrUnsupported
		}
		value["stream_options"], _ = json.Marshal(settings)
	}
	result, err := json.Marshal(value)
	if err != nil {
		return nil, ErrUnsupported
	}
	return result, nil
}
