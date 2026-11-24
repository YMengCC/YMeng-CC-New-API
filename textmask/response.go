package textmask

import (
	"bytes"
	"encoding/json"
	"strconv"
	"strings"
)

func streamIndex(value object, field string, fallback int) (string, error) {
	raw, ok := value[field]
	if !ok {
		return strconv.Itoa(fallback), nil
	}
	index, err := strconv.ParseUint(string(raw), 10, 32)
	if err != nil {
		return "", ErrUnsupported
	}
	return strconv.FormatUint(index, 10), nil
}

func (s *Session) streamItemKey(value object) (string, error) {
	if raw, ok := value["item_id"]; ok {
		text, err := stringValue(raw)
		if err != nil || text == "" || len(text) > maxOpaqueBytes || strings.Contains(text, s.marker) {
			return "", ErrUnsupported
		}
		return text, nil
	}
	return streamIndex(value, "output_index", 0)
}

func (s *Session) restoreField(value object, field, key string, stream, final bool) error {
	raw, ok := value[field]
	if !ok {
		return nil
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil
	}
	text, err := stringValue(raw)
	if err != nil {
		return err
	}
	if stream {
		text = s.restoreDelta(key, text, final)
	} else {
		text = s.restoreText(text)
		if strings.Contains(text, s.prefix) {
			return ErrIncomplete
		}
	}
	return setJSON(value, field, text)
}

// restoreContent deliberately avoids recursive replacement of arbitrary strings:
// IDs, metadata, usage, citations and signatures are never text lanes.
func (s *Session) restoreContent(value object, field, key string, stream, final bool) error {
	raw, ok := value[field]
	if !ok || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil
	}
	if len(bytes.TrimSpace(raw)) > 0 && bytes.TrimSpace(raw)[0] == '"' {
		return s.restoreField(value, field, key, stream, final)
	}
	parts, err := decodeArray(raw)
	if err != nil {
		return err
	}
	for i, item := range parts {
		part, err := decodeObject(item)
		if err != nil {
			return err
		}
		kind, _ := stringValue(part["type"])
		lane := key + "/" + strconv.Itoa(i)
		switch kind {
		case "text", "output_text", "input_text":
			err = s.restoreField(part, "text", lane, stream, final)
		case "refusal":
			err = s.restoreField(part, "refusal", lane, stream, final)
		case "thinking":
			if signature, ok := part["signature"]; ok {
				if text, e := stringValue(signature); e != nil || text != "" {
					return ErrUnsupported
				}
			}
			err = s.restoreField(part, "thinking", lane, stream, final)
		case "tool_use":
			if err = whitelist(part, "type id name input"); err != nil {
				return err
			}
			if input, ok := part["input"]; ok {
				restored, e := s.restoreJSONValue(input, 0)
				if e != nil {
					return e
				}
				part["input"] = restored
			}
		case "redacted_thinking": // Opaque signed payloads remain unchanged.
		default:
			return ErrUnsupported
		}
		if err != nil {
			return err
		}
		parts[i], err = json.Marshal(part)
		if err != nil {
			return ErrUnsupported
		}
	}
	return setJSON(value, field, parts)
}

func (s *Session) restoreMessage(message object, key string, stream, final bool) error {
	if raw, ok := message["function_call"]; ok && !optionalEmpty(raw) {
		return ErrUnsupported
	}
	if err := s.restoreContent(message, "content", key+"/content", stream, final); err != nil {
		return err
	}
	for _, field := range []string{"refusal", "reasoning", "reasoning_content", "reasoning_text"} {
		if err := s.restoreField(message, field, key+"/"+field, stream, final); err != nil {
			return err
		}
	}
	if err := s.restoreChatToolCalls(message, key, stream, final); err != nil {
		return err
	}
	// Finish may arrive in a separate delta containing no content fields.
	if stream && final {
		for _, field := range []string{"content", "refusal", "reasoning", "reasoning_content", "reasoning_text"} {
			lane := key + "/" + field
			if _, ok := s.pending[lane]; ok {
				tail := s.restoreDelta(lane, "", true)
				if tail != "" {
					if err := setJSON(message, field, tail); err != nil {
						return err
					}
				}
			}
		}
	}
	return nil
}

func (s *Session) restoreChatToolCalls(message object, key string, stream, final bool) error {
	raw, ok := message["tool_calls"]
	if !ok || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil
	}
	calls, err := decodeArray(raw)
	if err != nil {
		return err
	}
	for i, item := range calls {
		call, err := decodeObject(item)
		if err != nil {
			return err
		}
		if stream {
			if err = whitelist(call, "index id type function"); err != nil {
				return err
			}
		} else if err = whitelist(call, "id type function"); err != nil {
			return err
		}
		index, err := streamIndex(call, "index", i)
		if err != nil {
			return err
		}
		function, err := decodeObject(call["function"])
		if err != nil {
			return err
		}
		if err = whitelist(function, "name arguments"); err != nil {
			return err
		}
		if args, ok := function["arguments"]; ok && !bytes.Equal(bytes.TrimSpace(args), []byte("null")) {
			if stream {
				text, e := stringValue(args)
				if e != nil {
					return e
				}
				if text != "" {
					if e = s.restoreJSONField(function, "arguments", key+"/tool/"+index+"/arguments", true, false); e != nil {
						return e
					}
				}
			} else {
				restored, e := s.restoreJSONString(args)
				if e != nil {
					return e
				}
				function["arguments"] = restored
			}
		}
		call["function"], _ = json.Marshal(function)
		calls[i], _ = json.Marshal(call)
	}
	message["tool_calls"], _ = json.Marshal(calls)
	if stream && final {
		prefix := key + "/tool/"
		for lane := range s.pending {
			if strings.HasPrefix(lane, prefix) {
				return ErrIncomplete
			}
		}
	}
	return nil
}

func (s *Session) restoreJSONField(value object, field, key string, stream, final bool) error {
	raw, ok := value[field]
	if !ok || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil
	}
	text, err := stringValue(raw)
	if err != nil {
		return err
	}
	if stream {
		text = s.restoreJSONDelta(key, text, final)
		if s.incomplete {
			return ErrIncomplete
		}
	} else {
		restored, e := s.restoreJSONString(raw)
		if e != nil {
			return e
		}
		value[field] = restored
		return nil
	}
	return setJSON(value, field, text)
}

func (s *Session) restoreSnapshot(value object, field, key string) error {
	raw, ok := value[field]
	if !ok || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil
	}
	text, err := stringValue(raw)
	if err != nil {
		return err
	}
	if text == "" {
		return nil
	}
	delete(s.pending, key)
	restored, err := s.restoreJSONDocument([]byte(text))
	if err != nil {
		return err
	}
	return setJSON(value, field, string(restored))
}

func (s *Session) restoreGeminiPart(part object, lane string, stream, final bool) error {
	if err := whitelist(part, "text thought thoughtSignature functionCall functionResponse"); err != nil {
		return err
	}
	if err := boolSettings(part, "thought"); err != nil {
		return err
	}
	if err := s.opaqueField(part, "thoughtSignature", false); err != nil {
		return err
	}
	if _, ok := part["text"]; ok {
		if raw, has := part["thoughtSignature"]; has && !optionalEmpty(raw) {
			return ErrUnsupported
		}
		return s.restoreField(part, "text", lane, stream, final)
	}
	if raw, ok := part["functionCall"]; ok {
		call, err := decodeObject(raw)
		if err != nil {
			return err
		}
		if err = whitelist(call, "id name args"); err != nil {
			return err
		}
		if err = s.opaqueField(call, "id", false); err != nil {
			return err
		}
		if _, err = s.toolName(call, "name"); err != nil {
			return err
		}
		if args, ok := call["args"]; ok {
			restored, e := s.restoreJSONValue(args, 0)
			if e != nil {
				return e
			}
			call["args"] = restored
		}
		part["functionCall"], err = json.Marshal(call)
		return err
	}
	if _, ok := part["functionResponse"]; ok {
		return ErrUnsupported
	}
	return ErrUnsupported
}

func (s *Session) restoreResponsesReasoning(part object) error {
	if err := whitelist(part, "type id summary content encrypted_content status"); err != nil {
		return err
	}
	if err := s.opaqueField(part, "id", false); err != nil {
		return err
	}
	if err := s.opaqueField(part, "encrypted_content", false); err != nil {
		return err
	}
	if err := enumSetting(part, "status", "completed incomplete in_progress"); err != nil {
		return err
	}
	for _, lane := range []struct {
		field string
		kind  string
	}{
		{"summary", "summary_text"},
		{"content", "reasoning_text"},
	} {
		raw, ok := part[lane.field]
		if !ok {
			continue
		}
		items, err := decodeArray(raw)
		if err != nil {
			return err
		}
		for j, item := range items {
			text, err := decodeObject(item)
			if err != nil {
				return err
			}
			if err = whitelist(text, "type text"); err != nil {
				return err
			}
			kind, err := stringValue(text["type"])
			if err != nil || kind != lane.kind {
				return ErrUnsupported
			}
			if err = s.restoreField(text, "text", "", false, true); err != nil {
				return err
			}
			items[j], _ = json.Marshal(text)
		}
		part[lane.field], _ = json.Marshal(items)
	}
	return nil
}

func responseItemKey(part object) string {
	for _, field := range []string{"id", "call_id"} {
		if raw, ok := part[field]; ok {
			if text, err := stringValue(raw); err == nil && text != "" {
				return text
			}
		}
	}
	return "unknown"
}

func (s *Session) restoreResponsesFunctionCall(part object) error {
	if err := whitelist(part, "type id call_id name arguments status"); err != nil {
		return err
	}
	if err := s.opaqueField(part, "id", false); err != nil {
		return err
	}
	if err := s.opaqueField(part, "call_id", false); err != nil {
		return err
	}
	if _, err := s.toolName(part, "name"); err != nil {
		return err
	}
	if err := enumSetting(part, "status", "completed incomplete in_progress"); err != nil {
		return err
	}
	key := "responses/fn/" + responseItemKey(part) + "/args"
	if args, ok := part["arguments"]; ok && !bytes.Equal(bytes.TrimSpace(args), []byte("null")) {
		if err := s.restoreSnapshot(part, "arguments", key); err != nil {
			return err
		}
	}
	return nil
}

func (s *Session) restoreResponse(value object, stream bool) error {
	if raw, ok := value["choices"]; ok {
		choices, err := decodeArray(raw)
		if err != nil {
			return err
		}
		for i, item := range choices {
			choice, err := decodeObject(item)
			if err != nil {
				return err
			}
			index, err := streamIndex(choice, "index", i)
			if err != nil {
				return err
			}
			key := "chat/" + index
			final := false
			if raw, ok := choice["finish_reason"]; ok && !optionalEmpty(raw) {
				final = true
			}
			for _, field := range []string{"delta", "message"} {
				if raw, ok := choice[field]; ok {
					message, e := decodeObject(raw)
					if e != nil {
						return e
					}
					if e = s.restoreMessage(message, key, stream && field == "delta", final); e != nil {
						return e
					}
					choice[field], _ = json.Marshal(message)
				}
			}
			if err = s.restoreField(choice, "text", key+"/text", stream, final); err != nil {
				return err
			}
			if stream && final {
				if tail := s.restoreDelta(key+"/text", "", true); tail != "" {
					if err = setJSON(choice, "text", tail); err != nil {
						return err
					}
				}
			}
			choices[i], _ = json.Marshal(choice)
		}
		if err = setJSON(value, "choices", choices); err != nil {
			return err
		}
	}
	if raw, ok := value["candidates"]; ok {
		candidates, err := decodeArray(raw)
		if err != nil {
			return err
		}
		for i, item := range candidates {
			candidate, err := decodeObject(item)
			if err != nil {
				return err
			}
			index, err := streamIndex(candidate, "index", i)
			if err != nil {
				return err
			}
			final := false
			if raw, ok := candidate["finishReason"]; ok && !optionalEmpty(raw) {
				final = true
			}
			if raw, ok := candidate["content"]; ok {
				content, e := decodeObject(raw)
				if e != nil {
					return e
				}
				parts, e := decodeArray(content["parts"])
				if e != nil {
					return e
				}
				for j, item := range parts {
					part, e := decodeObject(item)
					if e != nil {
						return e
					}
					lane := "gemini/" + index + "/" + strconv.Itoa(j)
					if e = s.restoreGeminiPart(part, lane, stream, final); e != nil {
						return e
					}
					parts[j], _ = json.Marshal(part)
				}
				content["parts"], _ = json.Marshal(parts)
				candidate["content"], _ = json.Marshal(content)
			}
			if stream && final {
				prefix := "gemini/" + index + "/"
				for key := range s.pending {
					if strings.HasPrefix(key, prefix) {
						s.restoreDelta(key, "", true)
					}
				}
			}
			candidates[i], _ = json.Marshal(candidate)
		}
		if err = setJSON(value, "candidates", candidates); err != nil {
			return err
		}
	}
	if raw, ok := value["output"]; ok {
		output, err := decodeArray(raw)
		if err != nil {
			return err
		}
		for i, item := range output {
			part, err := decodeObject(item)
			if err != nil {
				return err
			}
			kind, _ := stringValue(part["type"])
			switch kind {
			case "message":
				if err = s.restoreMessage(part, "output/"+strconv.Itoa(i), false, true); err != nil {
					return err
				}
			case "reasoning":
				if err = s.restoreResponsesReasoning(part); err != nil {
					return err
				}
			case "function_call":
				if err = s.restoreResponsesFunctionCall(part); err != nil {
					return err
				}
			default:
				return ErrUnsupported
			}
			output[i], _ = json.Marshal(part)
		}
		if err = setJSON(value, "output", output); err != nil {
			return err
		}
	}
	if err := s.restoreMessage(value, "root", false, true); err != nil {
		return err
	}
	if err := s.restoreField(value, "output_text", "", false, true); err != nil {
		return err
	}
	if raw, ok := value["error"]; ok && !optionalEmpty(raw) {
		detail, err := decodeObject(raw)
		if err != nil {
			return err
		}
		if err = s.restoreField(detail, "message", "", false, true); err != nil {
			return err
		}
		value["error"], _ = json.Marshal(detail)
	}
	return nil
}

func (s *Session) RestoreJSON(body []byte) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil, ErrClosed
	}
	value, err := decodeObject(body)
	if err != nil {
		return nil, err
	}
	s.restoreBudget = maxRestoredTextBytes
	if err = s.restoreResponse(value, false); err != nil {
		return nil, err
	}
	if s.incomplete {
		return nil, ErrIncomplete
	}
	result, err := json.Marshal(value)
	if err != nil {
		return nil, ErrUnsupported
	}
	if bytes.Contains(result, []byte(s.prefix)) {
		return nil, ErrIncomplete
	}
	return result, nil
}

// RestoreEvent accepts one SSE data payload, not its event:/data: framing.
// The caller must call Finish at EOF and must not emit DONE after any error.
// Function-tool argument deltas use a dedicated lane and snapshots are applied
// without appending to that lane.
func (s *Session) RestoreEvent(data []byte) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil, ErrClosed
	}
	if bytes.Equal(bytes.TrimSpace(data), []byte("[DONE]")) {
		if err := s.finish(); err != nil {
			return nil, err
		}
		return data, nil
	}
	value, err := decodeObject(data)
	if err != nil {
		return nil, err
	}
	s.restoreBudget = maxRestoredTextBytes
	kind, _ := stringValue(value["type"])
	terminal := false
	switch kind {
	case "response.output_text.delta", "response.refusal.delta", "response.reasoning_text.delta", "response.reasoning_summary_text.delta":
		output, e := streamIndex(value, "output_index", 0)
		if e != nil {
			return nil, e
		}
		content, e := streamIndex(value, "content_index", 0)
		if e != nil {
			return nil, e
		}
		summary, e := streamIndex(value, "summary_index", 0)
		if e != nil {
			return nil, e
		}
		family := strings.TrimSuffix(kind, ".delta")
		key := family + "/" + output + "/" + content + "/" + summary
		if err = s.restoreField(value, "delta", key, true, false); err != nil {
			return nil, err
		}
	case "response.output_text.done", "response.refusal.done", "response.reasoning_text.done", "response.reasoning_summary_text.done":
		output, e := streamIndex(value, "output_index", 0)
		if e != nil {
			return nil, e
		}
		content, e := streamIndex(value, "content_index", 0)
		if e != nil {
			return nil, e
		}
		summary, e := streamIndex(value, "summary_index", 0)
		if e != nil {
			return nil, e
		}
		key := strings.TrimSuffix(kind, ".done") + "/" + output + "/" + content + "/" + summary
		// Done text is a snapshot, not another delta. Never append it to the lane.
		if s.pending[key] != "" {
			return nil, ErrIncomplete
		}
		field := "text"
		if kind == "response.refusal.done" {
			field = "refusal"
		}
		if err = s.restoreField(value, field, "", false, true); err != nil {
			return nil, err
		}
	case "content_block_delta":
		index, e := streamIndex(value, "index", 0)
		if e != nil {
			return nil, e
		}
		delta, e := decodeObject(value["delta"])
		if e != nil {
			return nil, e
		}
		deltaType, _ := stringValue(delta["type"])
		switch deltaType {
		case "text_delta":
			err = s.restoreField(delta, "text", "claude/"+index+"/text", true, false)
		case "input_json_delta":
			err = s.restoreJSONField(delta, "partial_json", "claude/"+index+"/input_json", true, false)
		case "thinking_delta", "signature_delta":
			return nil, ErrUnsupported
		default:
			return nil, ErrUnsupported
		}
		if err != nil {
			return nil, err
		}
		value["delta"], _ = json.Marshal(delta)
	case "content_block_start":
		index, e := streamIndex(value, "index", 0)
		if e != nil {
			return nil, e
		}
		block, e := decodeObject(value["content_block"])
		if e != nil {
			return nil, e
		}
		blockType, _ := stringValue(block["type"])
		switch blockType {
		case "text":
			err = s.restoreField(block, "text", "claude/"+index+"/text", true, false)
		case "tool_use":
			if err = whitelist(block, "type id name input"); err != nil {
				return nil, err
			}
			if input, ok := block["input"]; ok {
				restored, e := s.restoreJSONValue(input, 0)
				if e != nil {
					return nil, e
				}
				block["input"] = restored
			}
		case "thinking":
			return nil, ErrUnsupported
		case "redacted_thinking":
		default:
			return nil, ErrUnsupported
		}
		if err != nil {
			return nil, err
		}
		value["content_block"], _ = json.Marshal(block)
	case "content_block_stop":
		index, e := streamIndex(value, "index", 0)
		if e != nil {
			return nil, e
		}
		for key := range s.pending {
			if strings.HasPrefix(key, "claude/"+index+"/") {
				return nil, ErrIncomplete
			}
		}
	case "message_stop":
		if err = s.finish(); err != nil {
			return nil, err
		}
	case "response.completed", "response.failed", "response.incomplete":
		// The full response snapshot may complete a tool-argument lane, so
		// finish only after restoreResponse has processed it.
		terminal = true
	case "response.function_call_arguments.delta":
		item, e := s.streamItemKey(value)
		if e != nil {
			return nil, e
		}
		if err = s.restoreJSONField(value, "delta", "responses/fn/"+item+"/args", true, false); err != nil {
			return nil, err
		}
	case "response.function_call_arguments.done":
		item, e := s.streamItemKey(value)
		if e != nil {
			return nil, e
		}
		if err = s.restoreSnapshot(value, "arguments", "responses/fn/"+item+"/args"); err != nil {
			return nil, err
		}
	case "response.reasoning_summary_part.added", "response.reasoning_summary_part.done":
		part, e := decodeObject(value["part"])
		if e != nil {
			return nil, e
		}
		if e = whitelist(part, "type text"); e != nil {
			return nil, e
		}
		partType, e := stringValue(part["type"])
		if e != nil || partType != "summary_text" {
			return nil, ErrUnsupported
		}
		if e = s.restoreField(part, "text", "", false, true); e != nil {
			return nil, e
		}
		value["part"], _ = json.Marshal(part)
		if kind == "response.reasoning_summary_part.done" {
			output, e := streamIndex(value, "output_index", 0)
			if e != nil {
				return nil, e
			}
			summary, e := streamIndex(value, "summary_index", 0)
			if e != nil {
				return nil, e
			}
			delete(s.pending, "response.reasoning_summary_text/"+output+"/0/"+summary)
		}
	case "response.output_item.added", "response.output_item.done":
		item, e := decodeObject(value["item"])
		if e != nil {
			return nil, e
		}
		itemType, _ := stringValue(item["type"])
		if itemType != "message" && itemType != "reasoning" && itemType != "function_call" {
			return nil, ErrUnsupported
		}
		wrapper := object{}
		if e = setJSON(wrapper, "output", []object{item}); e != nil {
			return nil, e
		}
		if e = s.restoreResponse(wrapper, false); e != nil {
			return nil, e
		}
		parts, e := decodeArray(wrapper["output"])
		if e != nil {
			return nil, e
		}
		value["item"] = parts[0]
	case "response.content_part.added", "response.content_part.done":
		part, e := decodeObject(value["part"])
		if e != nil {
			return nil, e
		}
		partType, _ := stringValue(part["type"])
		if partType != "output_text" && partType != "refusal" {
			return nil, ErrUnsupported
		}
		if e = s.restoreField(part, "text", "", false, true); e != nil {
			return nil, e
		}
		if e = s.restoreField(part, "refusal", "", false, true); e != nil {
			return nil, e
		}
		value["part"], _ = json.Marshal(part)
	case "", "message", "message_start", "message_delta", "ping", "error", "response.created", "response.in_progress", "response.queued":
	default:
		return nil, ErrUnsupported
	}
	if raw, ok := value["response"]; ok {
		response, e := decodeObject(raw)
		if e != nil {
			return nil, e
		}
		if e = s.restoreResponse(response, false); e != nil {
			return nil, e
		}
		value["response"], _ = json.Marshal(response)
	}
	if raw, ok := value["message"]; ok && kind == "message_start" {
		message, e := decodeObject(raw)
		if e != nil {
			return nil, e
		}
		if e = s.restoreResponse(message, false); e != nil {
			return nil, e
		}
		value["message"], _ = json.Marshal(message)
	}
	if err = s.restoreResponse(value, true); err != nil {
		return nil, err
	}
	if s.incomplete {
		return nil, ErrIncomplete
	}
	result, err := json.Marshal(value)
	if err != nil {
		return nil, ErrUnsupported
	}
	if bytes.Contains(result, []byte(s.prefix)) {
		return nil, ErrIncomplete
	}
	if terminal {
		if err = s.finish(); err != nil {
			return nil, err
		}
	}
	return result, nil
}
