package textmask

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAgentToolContracts(t *testing.T) {
	t.Run("chat tools arguments and tool results", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		request := map[string]any{
			"model": "m",
			"messages": []any{
				map[string]any{"role": "user", "content": "mail alice@example.com"},
				map[string]any{"role": "assistant", "content": nil, "tool_calls": []any{
					map[string]any{"id": "call_1", "type": "function", "function": map[string]any{
						"name": "lookup", "arguments": `{"email":"alice@example.com","limit":3}`,
					}},
				}},
				map[string]any{"role": "tool", "tool_call_id": "call_1", "content": "found alice@example.com"},
			},
			"tools": []any{map[string]any{"type": "function", "function": map[string]any{
				"name":        "lookup",
				"description": "Look up alice@example.com",
				"parameters": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"email": map[string]any{"type": "string", "description": "account identifier"},
					},
					"required": []any{"email"},
				},
				"strict": false,
			}}},
			"tool_choice":         "auto",
			"parallel_tool_calls": true,
		}
		body, err := json.Marshal(request)
		require.NoError(t, err)
		masked, err := s.MaskJSON(body, "chat")
		require.NoError(t, err)
		assert.NotContains(t, string(masked), "alice@example.com")
		assert.Contains(t, string(masked), `"strict":false`)
		assert.Contains(t, string(masked), `"properties":{"email"`)
		token := s.forward["alice@example.com"]
		require.NotEmpty(t, token)

		reply := map[string]any{"choices": []any{map[string]any{
			"index": 0,
			"message": map[string]any{
				"role": "assistant", "content": "done",
				"tool_calls": []any{map[string]any{
					"id": "call_2", "type": "function", "function": map[string]any{
						"name": "lookup", "arguments": `{"email":"` + token + `"}`,
					},
				}},
			},
			"finish_reason": "tool_calls",
		}}}
		raw, err := json.Marshal(reply)
		require.NoError(t, err)
		restored, err := s.RestoreJSON(raw)
		require.NoError(t, err)
		assert.Contains(t, string(restored), "alice@example.com")
		assert.NotContains(t, string(restored), string(GatewayMarker))
	})

	t.Run("chat streaming tool arguments split across deltas", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		body, err := json.Marshal(map[string]any{"model": "m", "stream": true, "messages": []any{map[string]any{"role": "user", "content": "alice@example.com"}}})
		require.NoError(t, err)
		_, err = s.MaskJSON(body, "chat")
		require.NoError(t, err)
		token := s.forward["alice@example.com"]
		require.NotEmpty(t, token)
		split := len(token) / 2
		first := `{"email":"` + token[:split]
		second := token[split:] + `"}`

		event := func(arguments string) []byte {
			raw, e := json.Marshal(map[string]any{"choices": []any{map[string]any{
				"index": 0,
				"delta": map[string]any{"tool_calls": []any{map[string]any{
					"index": 0, "id": "call_1", "type": "function",
					"function": map[string]any{"name": "lookup", "arguments": arguments},
				}}},
			}}})
			require.NoError(t, e)
			return raw
		}
		out, err := s.RestoreEvent(event(first))
		require.NoError(t, err)
		assert.NotContains(t, string(out), "alice@example.com")
		out, err = s.RestoreEvent(event(second))
		require.NoError(t, err)
		assert.Contains(t, string(out), "alice@example.com")
		_, err = s.RestoreEvent([]byte(`{"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}`))
		require.NoError(t, err)
		_, err = s.RestoreEvent([]byte(`[DONE]`))
		require.NoError(t, err)
		require.NoError(t, s.Finish())
	})

	t.Run("responses agent loop and function call stream", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		request := map[string]any{
			"model": "m",
			"input": []any{
				map[string]any{"type": "message", "role": "user", "content": []any{map[string]any{"type": "input_text", "text": "alice@example.com"}}},
				map[string]any{"type": "reasoning", "id": "rs_1", "summary": []any{map[string]any{"type": "summary_text", "text": "mail alice@example.com"}}, "encrypted_content": "opaque-reasoning"},
				map[string]any{"type": "function_call", "call_id": "call_1", "name": "lookup", "arguments": `{"email":"alice@example.com"}`},
				map[string]any{"type": "function_call_output", "call_id": "call_1", "output": "found alice@example.com"},
			},
			"tools":               []any{map[string]any{"type": "function", "name": "lookup", "description": "lookup alice@example.com", "parameters": map[string]any{"type": "object", "properties": map[string]any{"email": map[string]any{"type": "string"}}}}},
			"include":             []any{"reasoning.encrypted_content"},
			"prompt_cache_key":    "cache-secret",
			"client_metadata":     map[string]any{"originator": "codex_cli_rs"},
			"parallel_tool_calls": false,
		}
		body, err := json.Marshal(request)
		require.NoError(t, err)
		masked, err := s.MaskJSON(body, "responses")
		require.NoError(t, err)
		assert.NotContains(t, string(masked), "alice@example.com")
		assert.NotContains(t, string(masked), "cache-secret")
		assert.NotContains(t, string(masked), "codex_cli_rs")
		assert.Contains(t, string(masked), "opaque-reasoning")
		assert.Contains(t, string(masked), `"include":["reasoning.encrypted_content"]`)
		token := s.forward["alice@example.com"]
		require.NotEmpty(t, token)

		reply := map[string]any{"id": "resp_1", "output": []any{
			map[string]any{"type": "reasoning", "id": "rs_2", "summary": []any{map[string]any{"type": "summary_text", "text": token}}, "encrypted_content": "opaque-reply"},
			map[string]any{"type": "function_call", "id": "fc_1", "call_id": "call_2", "name": "lookup", "arguments": `{"email":"` + token + `"}`, "status": "completed"},
		}}
		raw, err := json.Marshal(reply)
		require.NoError(t, err)
		restored, err := s.RestoreJSON(raw)
		require.NoError(t, err)
		assert.Contains(t, string(restored), "alice@example.com")
		assert.Contains(t, string(restored), "opaque-reply")

		args := `{"email":"` + token + `"}`
		split := len(token) / 2
		delta := func(fragment string) []byte {
			raw, e := json.Marshal(map[string]any{"type": "response.function_call_arguments.delta", "item_id": "fc_1", "output_index": 0, "delta": fragment})
			require.NoError(t, e)
			return raw
		}
		first, err := s.RestoreEvent(delta(args[:strings.Index(args, token)+split]))
		require.NoError(t, err)
		assert.NotContains(t, string(first), "alice@example.com")
		second, err := s.RestoreEvent(delta(args[strings.Index(args, token)+split:]))
		require.NoError(t, err)
		assert.Contains(t, string(second), "alice@example.com")
		done, err := s.RestoreEvent(func() []byte {
			raw, e := json.Marshal(map[string]any{"type": "response.function_call_arguments.done", "item_id": "fc_1", "output_index": 0, "arguments": args})
			require.NoError(t, e)
			return raw
		}())
		require.NoError(t, err)
		assert.Contains(t, string(done), "alice@example.com")
		item := map[string]any{"type": "function_call", "id": "fc_1", "call_id": "call_2", "name": "lookup", "arguments": args, "status": "completed"}
		raw, err = json.Marshal(map[string]any{"type": "response.output_item.done", "output_index": 0, "item": item})
		require.NoError(t, err)
		_, err = s.RestoreEvent(raw)
		require.NoError(t, err)
		raw, err = json.Marshal(map[string]any{"type": "response.completed", "response": map[string]any{"id": "resp_1", "output": []any{item}}})
		require.NoError(t, err)
		_, err = s.RestoreEvent(raw)
		require.NoError(t, err)
		require.NoError(t, s.Finish())
	})

	t.Run("responses done snapshot clears a pending argument lane", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		_, err = s.MaskJSON([]byte(`{"model":"m","input":"alice@example.com","stream":true}`), "responses")
		require.NoError(t, err)
		token := s.forward["alice@example.com"]
		require.NotEmpty(t, token)
		args := `{"email":"` + token + `"}`
		half := len(args) / 2
		delta, err := json.Marshal(map[string]any{"type": "response.function_call_arguments.delta", "item_id": "fc_9", "output_index": 0, "delta": args[:half]})
		require.NoError(t, err)
		_, err = s.RestoreEvent(delta)
		require.NoError(t, err)
		done, err := json.Marshal(map[string]any{"type": "response.function_call_arguments.done", "item_id": "fc_9", "output_index": 0, "arguments": args})
		require.NoError(t, err)
		restored, err := s.RestoreEvent(done)
		require.NoError(t, err)
		assert.Contains(t, string(restored), "alice@example.com")
		_, err = s.RestoreEvent([]byte(`{"type":"response.completed","response":{"output":[]}}`))
		require.NoError(t, err)
		require.NoError(t, s.Finish())
	})

	t.Run("claude tool use tool result and input json stream", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		request := map[string]any{
			"model": "m", "max_tokens": 128,
			"system": []any{map[string]any{"type": "text", "text": "alice@example.com", "cache_control": map[string]any{"type": "ephemeral"}}},
			"messages": []any{
				map[string]any{"role": "user", "content": []any{map[string]any{"type": "text", "text": "alice@example.com"}}},
				map[string]any{"role": "assistant", "content": []any{map[string]any{"type": "tool_use", "id": "toolu_1", "name": "lookup", "input": map[string]any{"email": "alice@example.com"}}}},
				map[string]any{"role": "user", "content": []any{map[string]any{"type": "tool_result", "tool_use_id": "toolu_1", "content": []any{map[string]any{"type": "text", "text": "found alice@example.com"}}}}},
			},
			"tools":       []any{map[string]any{"name": "lookup", "description": "lookup alice@example.com", "input_schema": map[string]any{"type": "object", "properties": map[string]any{"email": map[string]any{"type": "string"}}}}},
			"tool_choice": map[string]any{"type": "auto"},
			"metadata":    map[string]any{"user_id": "alice@example.com"},
		}
		body, err := json.Marshal(request)
		require.NoError(t, err)
		masked, err := s.MaskJSON(body, "claude")
		require.NoError(t, err)
		assert.NotContains(t, string(masked), "alice@example.com")
		assert.NotContains(t, string(masked), "cache_control")
		assert.NotContains(t, string(masked), "user_id")
		token := s.forward["alice@example.com"]
		require.NotEmpty(t, token)

		reply := map[string]any{"type": "message", "content": []any{map[string]any{"type": "tool_use", "id": "toolu_2", "name": "lookup", "input": map[string]any{"email": token}}}}
		raw, err := json.Marshal(reply)
		require.NoError(t, err)
		restored, err := s.RestoreJSON(raw)
		require.NoError(t, err)
		assert.Contains(t, string(restored), "alice@example.com")

		args := `{"email":"` + token + `"}`
		split := len(token) / 2
		start, err := json.Marshal(map[string]any{"type": "content_block_start", "index": 1, "content_block": map[string]any{"type": "tool_use", "id": "toolu_3", "name": "lookup", "input": map[string]any{}}})
		require.NoError(t, err)
		_, err = s.RestoreEvent(start)
		require.NoError(t, err)
		delta := func(fragment string) []byte {
			raw, e := json.Marshal(map[string]any{"type": "content_block_delta", "index": 1, "delta": map[string]any{"type": "input_json_delta", "partial_json": fragment}})
			require.NoError(t, e)
			return raw
		}
		first, err := s.RestoreEvent(delta(args[:strings.Index(args, token)+split]))
		require.NoError(t, err)
		assert.NotContains(t, string(first), "alice@example.com")
		second, err := s.RestoreEvent(delta(args[strings.Index(args, token)+split:]))
		require.NoError(t, err)
		assert.Contains(t, string(second), "alice@example.com")
		_, err = s.RestoreEvent([]byte(`{"type":"content_block_stop","index":1}`))
		require.NoError(t, err)
		_, err = s.RestoreEvent([]byte(`{"type":"message_stop"}`))
		require.NoError(t, err)
		require.NoError(t, s.Finish())
	})

	t.Run("gemini function declarations calls and responses", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		request := map[string]any{
			"model": "m",
			"contents": []any{
				map[string]any{"role": "user", "parts": []any{map[string]any{"text": "alice@example.com"}}},
				map[string]any{"role": "model", "parts": []any{map[string]any{"functionCall": map[string]any{"id": "fc_1", "name": "lookup", "args": map[string]any{"email": "alice@example.com"}}}}},
				map[string]any{"role": "user", "parts": []any{map[string]any{"functionResponse": map[string]any{"name": "lookup", "response": map[string]any{"output": "alice@example.com"}}}}},
			},
			"tools":      []any{map[string]any{"functionDeclarations": []any{map[string]any{"name": "lookup", "description": "lookup alice@example.com", "parameters": map[string]any{"type": "OBJECT", "properties": map[string]any{"email": map[string]any{"type": "STRING"}}}}}}},
			"toolConfig": map[string]any{"functionCallingConfig": map[string]any{"mode": "AUTO", "allowedFunctionNames": []any{"lookup"}}},
		}
		body, err := json.Marshal(request)
		require.NoError(t, err)
		masked, err := s.MaskJSON(body, "gemini")
		require.NoError(t, err)
		assert.NotContains(t, string(masked), "alice@example.com")
		token := s.forward["alice@example.com"]
		require.NotEmpty(t, token)

		reply := map[string]any{"candidates": []any{map[string]any{"content": map[string]any{"parts": []any{map[string]any{"functionCall": map[string]any{"id": "fc_2", "name": "lookup", "args": map[string]any{"email": token}}}}}}}}
		raw, err := json.Marshal(reply)
		require.NoError(t, err)
		restored, err := s.RestoreJSON(raw)
		require.NoError(t, err)
		assert.Contains(t, string(restored), "alice@example.com")

		chunk, err := json.Marshal(map[string]any{"candidates": []any{map[string]any{"index": 0, "content": map[string]any{"parts": []any{map[string]any{"functionCall": map[string]any{"name": "lookup", "args": map[string]any{"email": token}}}}}}}})
		require.NoError(t, err)
		out, err := s.RestoreEvent(chunk)
		require.NoError(t, err)
		assert.Contains(t, string(out), "alice@example.com")
		_, err = s.RestoreEvent([]byte(`{"candidates":[{"index":0,"finishReason":"STOP"}]}`))
		require.NoError(t, err)
		require.NoError(t, s.Finish())
	})

	t.Run("agent shapes that still fail closed", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		cases := []struct{ protocol, body string }{
			{"chat", `{"model":"m","messages":[{"role":"user","content":"x"}],"tools":[{"type":"web_search"}]}`},
			{"chat", `{"model":"m","messages":[{"role":"tool","tool_call_id":"c","content":[{"type":"image_url","image_url":{"url":"https://x"}}]}]}`},
			{"chat", `{"model":"m","messages":[{"role":"user","content":"x"}],"tools":[{"type":"function","function":{"name":"lookup","parameters":{"type":"object","properties":{"email":{"type":"string","enum":["alice@example.com"]}}}}}]}`},
			{"chat", `{"model":"m","messages":[{"role":"user","content":"x"}],"tools":[{"type":"function","function":{"name":"lookup","parameters":{"type":"object","properties":{"email":{"type":"string","description":"alice@example.com"}}}}}]}`},
			{"chat", `{"model":"m","messages":[{"role":"assistant","content":null,"tool_calls":[{"id":"c","type":"function","function":{"name":"lookup","arguments":"not-json"}}]}]}`},
			{"chat", `{"model":"m","messages":[{"role":"user","content":"x"}],"tools":[{"type":"function","function":{"name":"` + string(GatewayMarker) + `x]]","parameters":{"type":"object"}}}]}`},
			{"responses", `{"model":"m","input":"x","include":["reasoning.summary"]}`},
			{"responses", `{"model":"m","input":"x","max_tool_calls":-1}`},
			{"responses", `{"model":"m","input":[{"type":"function_call","call_id":"c","name":"lookup","arguments":"not-json"}]}`},
			{"responses", `{"model":"m","input":[{"type":"function_call_output","call_id":"c","output":[{"type":"input_image","image_url":"https://x"}]}]}`},
			{"claude", `{"model":"m","max_tokens":1,"messages":[{"role":"assistant","content":[{"type":"thinking","thinking":"secret","signature":123}]}]}`},
			{"claude", `{"model":"m","max_tokens":1,"messages":[{"role":"user","content":[{"type":"tool_result","tool_use_id":"t","content":[{"type":"image","source":{"data":"x"}}]}]}]}`},
			{"claude", `{"model":"m","max_tokens":1,"messages":[{"role":"user","content":"x"}],"thinking":{"type":"enabled","budget_tokens":"big"}}`},
			{"gemini", `{"model":"m","contents":[{"role":"model","parts":[{"functionCall":{"name":"lookup","args":{},"partialArgs":[{"jsonPath":"$.x"}],"willContinue":true}}]}]}`},
			{"gemini", `{"model":"m","contents":[{"role":"model","parts":[{"text":"secret","thoughtSignature":123}]}]}`},
		}
		for _, tc := range cases {
			_, err = s.MaskJSON([]byte(tc.body), tc.protocol)
			assert.ErrorIs(t, err, ErrUnsupported, tc.body)
		}
	})

	t.Run("local tool masking composes with gateway", func(t *testing.T) {
		local, err := NewWithMarker(LocalMarker)
		require.NoError(t, err)
		defer local.Close()
		gateway, err := New()
		require.NoError(t, err)
		defer gateway.Close()
		request := map[string]any{
			"model": "m",
			"messages": []any{
				map[string]any{"role": "user", "content": "alice@example.com"},
				map[string]any{"role": "assistant", "content": nil, "tool_calls": []any{map[string]any{"id": "c1", "type": "function", "function": map[string]any{"name": "lookup", "arguments": `{"email":"alice@example.com"}`}}}},
			},
			"tools": []any{map[string]any{"type": "function", "function": map[string]any{"name": "lookup", "parameters": map[string]any{"type": "object"}}}},
		}
		body, err := json.Marshal(request)
		require.NoError(t, err)
		locallyMasked, err := local.MaskJSON(body, "chat")
		require.NoError(t, err)
		assert.Contains(t, string(locallyMasked), string(LocalMarker))
		gatewayMasked, err := gateway.MaskJSON(locallyMasked, "chat")
		require.NoError(t, err)
		assert.Equal(t, 0, gateway.MaskedCount())
		assert.JSONEq(t, string(locallyMasked), string(gatewayMasked))
		assert.Contains(t, string(gatewayMasked), string(LocalMarker))
	})
}
func TestMaskingContracts(t *testing.T) {
	t.Run("session namespace repeated entities and false positives", func(t *testing.T) {
		a, err := New()
		require.NoError(t, err)
		defer a.Close()
		b, err := New()
		require.NoError(t, err)
		defer b.Close()
		original := "contact alice@example.com from 192.168.1.2, id 11010519491231002X; keep 1234567890123456 and 550e8400-e29b-41d4-a716-446655440000"
		masked, err := a.MaskJSON([]byte(`{"model":"gpt","messages":[{"role":"user","content":"`+original+`"}]}`), "chat")
		require.NoError(t, err)
		assert.NotContains(t, string(masked), "alice@example.com")
		assert.NotContains(t, string(masked), "192.168.1.2")
		assert.NotContains(t, string(masked), "11010519491231002X")
		assert.Contains(t, string(masked), "1234567890123456")
		assert.Contains(t, string(masked), "550e8400-e29b-41d4-a716-446655440000")
		var maskedRequest object
		require.NoError(t, json.Unmarshal(masked, &maskedRequest))
		maskedMessages, err := decodeArray(maskedRequest["messages"])
		require.NoError(t, err)
		maskedMessage, err := decodeObject(maskedMessages[0])
		require.NoError(t, err)
		maskedText, err := stringValue(maskedMessage["content"])
		require.NoError(t, err)
		assert.Equal(t, original, a.RestoreText(maskedText))
		other, err := b.MaskJSON([]byte(`{"model":"gpt","messages":[{"role":"user","content":"alice@example.com"}]}`), "chat")
		require.NoError(t, err)
		assert.NotEqual(t, string(masked), string(other))
	})
	t.Run("Chinese labels and sentence punctuation are not entity boundaries", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		original := "邮箱alice@example.com，电话13800138000，联系bob@example.com."
		body, err := json.Marshal(map[string]any{"model": "m", "messages": []any{map[string]any{"role": "user", "content": original}}})
		require.NoError(t, err)
		masked, err := s.MaskJSON(body, "chat")
		require.NoError(t, err)
		assert.NotContains(t, string(masked), "alice@example.com")
		assert.NotContains(t, string(masked), "13800138000")
		assert.NotContains(t, string(masked), "bob@example.com")
	})
	t.Run("metadata preserved and responses stateless", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		input := []byte(`{"model":"gpt","input":"mail bob@example.com","max_output_tokens":123,"temperature":0,"store":false}`)
		masked, err := s.MaskJSON(input, "responses")
		require.NoError(t, err)
		assert.Contains(t, string(masked), `"store":false`)
		assert.Contains(t, string(masked), `"max_output_tokens":123`)
		token := s.forward["bob@example.com"]
		body := []byte(`{"id":"resp_secret","usage":{"total_tokens":9},"metadata":{"email":"bob@example.com"},"output":[{"type":"message","id":"msg_1","content":[{"type":"output_text","text":"Hi ` + token + `"}]}]}`)
		restored, err := s.RestoreJSON(body)
		require.NoError(t, err)
		assert.Contains(t, string(restored), "bob@example.com")
		assert.Contains(t, string(restored), "resp_secret")
		assert.Contains(t, string(restored), `"total_tokens":9`)
		assert.Contains(t, string(restored), `"metadata":{"email":"bob@example.com"}`)
	})
	t.Run("reject opaque and malformed requests", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		cases := []struct{ protocol, body string }{{"chat", `{"model":"m","messages":[{"role":"user","content":[{"type":"image_url","image_url":{"url":"https://x"}}]}]}`}, {"chat", `{"model":"m","messages":[{"role":"user","content":"x"}],"tools":[{"type":"function"}]}`}, {"responses", `{"model":"m","input":"x","previous_response_id":"r_1"}`}, {"responses", `{"model":"m","input":"x","background":true}`}, {"claude", `{"model":"m","max_tokens":1,"messages":[{"role":"user","content":"x"}],"tools":[{}]}`}, {"gemini", `{"model":"m","contents":[{"role":"user","parts":[{"inlineData":{"data":"secret"}}]}]}`}, {"chat", `{"model":"m","messages":[{"role":"user","content":"x"}],"future":{"secret":"opaque"}}`}, {"chat", `{"model":"m","messages":[{"role":"user","content":"` + string(GatewayMarker) + `spoof]]"}]}`}}
		for _, tc := range cases {
			_, err = s.MaskJSON([]byte(tc.body), tc.protocol)
			assert.ErrorIs(t, err, ErrUnsupported)
		}
	})
	t.Run("each supported protocol masks text and restores its response", func(t *testing.T) {
		cases := []struct{ protocol, request, response string }{
			{"chat", `{"model":"m","messages":[{"role":"user","content":"alice@example.com"}],"temperature":0,"stream":false}`, `{"choices":[{"message":{"content":"TOKEN"}}]}`},
			{"completions", `{"model":"m","prompt":["alice@example.com"],"logprobs":0}`, `{"choices":[{"text":"TOKEN"}]}`},
			{"responses", `{"model":"m","input":[{"role":"user","content":[{"type":"input_text","text":"alice@example.com"}]}]}`, `{"output":[{"type":"message","content":[{"type":"output_text","text":"TOKEN"}]}]}`},
			{"claude", `{"model":"m","messages":[{"role":"user","content":"alice@example.com"}],"max_tokens":128}`, `{"type":"message","content":[{"type":"text","text":"TOKEN"}]}`},
			{"gemini", `{"contents":[{"role":"user","parts":[{"text":"alice@example.com"}]}],"generationConfig":{"temperature":0}}`, `{"candidates":[{"content":{"parts":[{"text":"TOKEN"}]}}]}`},
		}
		for _, tc := range cases {
			t.Run(tc.protocol, func(t *testing.T) {
				s, err := New()
				require.NoError(t, err)
				defer s.Close()
				masked, err := s.MaskJSON([]byte(tc.request), tc.protocol)
				require.NoError(t, err)
				assert.NotContains(t, string(masked), "alice@example.com")
				token := s.forward["alice@example.com"]
				require.NotEmpty(t, token)
				result, err := s.RestoreJSON([]byte(strings.ReplaceAll(tc.response, "TOKEN", token)))
				require.NoError(t, err)
				assert.Contains(t, string(result), "alice@example.com")
				assert.NotContains(t, string(result), string(GatewayMarker))
			})
		}
	})
	t.Run("Gemini malformed roles and mismatched private key blocks cannot pass through", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		_, err = s.MaskJSON([]byte(`{"contents":[{"role":{"secret":"alice@example.com"},"parts":[{"text":"hello"}]}]}`), "gemini")
		require.ErrorIs(t, err, ErrUnsupported)
		body, err := json.Marshal(map[string]any{"model": "m", "input": "-----BEGIN RSA PRIVATE KEY-----\nfixture\n-----END EC PRIVATE KEY-----"})
		require.NoError(t, err)
		_, err = s.MaskJSON(body, "responses")
		require.ErrorIs(t, err, ErrUnsupported)
	})
	t.Run("compound field names and enum values cannot bypass validation", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		for _, input := range []string{
			`{"model":"m","messages":[{"role":"user","content":"hello"}],"temperature top_p":{"secret":"alice@example.com"}}`,
			`{"model":"m","messages":[{"role":"user assistant","content":"hello"}]}`,
			`{"model":"m","messages":[{"role":"user","content":"hello"}],"reasoning_effort":"low medium"}`,
		} {
			_, err = s.MaskJSON([]byte(input), "chat")
			assert.ErrorIs(t, err, ErrUnsupported)
		}
	})
	t.Run("stream split lanes and completion", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		masked, err := s.MaskJSON([]byte(`{"model":"m","messages":[{"role":"user","content":"x@example.com"}],"stream":true}`), "chat")
		require.NoError(t, err)
		var value object
		require.NoError(t, json.Unmarshal(masked, &value))
		messages, _ := decodeArray(value["messages"])
		msg, _ := decodeObject(messages[0])
		token, err := stringValue(msg["content"])
		require.NoError(t, err)
		split := len(token) / 2
		parts := []string{token[:split], token[split:]}
		first, err := s.RestoreEvent([]byte(`{"choices":[{"index":0,"delta":{"content":"` + parts[0] + `"}}]}`))
		require.NoError(t, err)
		assert.NotContains(t, string(first), "x@example")
		second, err := s.RestoreEvent([]byte(`{"choices":[{"index":1,"delta":{"content":"other"}},{"index":0,"delta":{"content":"` + parts[1] + `"}}]}`))
		require.NoError(t, err)
		assert.Contains(t, string(second), "x@example.com")
		assert.Contains(t, string(second), "other")
		done, err := s.RestoreEvent([]byte(`[DONE]`))
		require.NoError(t, err)
		assert.Equal(t, "[DONE]", string(done))
		require.NoError(t, s.Finish())
	})
	t.Run("native protocol SSE restores split tokens before completion", func(t *testing.T) {
		cases := []struct{ name, first, second, final string }{
			{"responses", `{"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"TOKEN"}`, `{"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"TOKEN"}`, `{"type":"response.completed","response":{"output":[]}}`},
			{"claude", `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"TOKEN"}}`, `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"TOKEN"}}`, `{"type":"message_stop"}`},
			{"gemini", `{"candidates":[{"index":0,"content":{"parts":[{"text":"TOKEN"}]}}]}`, `{"candidates":[{"index":0,"content":{"parts":[{"text":"TOKEN"}]},"finishReason":"STOP"}]}`, `[DONE]`},
		}
		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				s, err := New()
				require.NoError(t, err)
				defer s.Close()
				_, err = s.MaskJSON([]byte(`{"model":"m","input":"alice@example.com"}`), "responses")
				require.NoError(t, err)
				token := s.forward["alice@example.com"]
				split := len(token) / 2
				_, err = s.RestoreEvent([]byte(strings.ReplaceAll(tc.first, "TOKEN", token[:split])))
				require.NoError(t, err)
				result, err := s.RestoreEvent([]byte(strings.ReplaceAll(tc.second, "TOKEN", token[split:])))
				require.NoError(t, err)
				assert.Contains(t, string(result), "alice@example.com")
				_, err = s.RestoreEvent([]byte(tc.final))
				require.NoError(t, err)
				require.NoError(t, s.Finish())
			})
		}
	})
	t.Run("unknown token from this request fails closed", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		_, err = s.MaskJSON([]byte(`{"model":"m","input":"alice@example.com"}`), "responses")
		require.NoError(t, err)
		unknown := []byte(`{"output_text":"` + s.prefix + `999]]"}`)
		_, err = s.RestoreJSON(unknown)
		require.ErrorIs(t, err, ErrIncomplete)
	})
	t.Run("incomplete token fails at finish", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		_, err = s.MaskJSON([]byte(`{"model":"m","messages":[{"role":"user","content":"a@example.com"}],"stream":true}`), "chat")
		require.NoError(t, err)
		token := s.forward["a@example.com"]
		prefix := token[:len(token)-2]
		out := s.RestoreDelta("lane", prefix, false)
		assert.Empty(t, out)
		require.ErrorIs(t, s.Finish(), ErrIncomplete)
	})
	t.Run("local layer composes with gateway layer", func(t *testing.T) {
		local, err := NewWithMarker(LocalMarker)
		require.NoError(t, err)
		defer local.Close()
		gateway, err := New()
		require.NoError(t, err)
		defer gateway.Close()
		original := "mail alice@example.com or call 13800138000"
		body, err := json.Marshal(map[string]any{"model": "m", "messages": []any{map[string]any{"role": "user", "content": original}}})
		require.NoError(t, err)

		locallyMasked, err := local.MaskJSON(body, "chat")
		require.NoError(t, err)
		assert.Contains(t, string(locallyMasked), string(LocalMarker))
		assert.NotContains(t, string(locallyMasked), "alice@example.com")
		assert.Equal(t, 2, local.MaskedCount())

		// The gateway sees only local tokens: nothing to mask, nothing rejected.
		gatewayMasked, err := gateway.MaskJSON(locallyMasked, "chat")
		require.NoError(t, err)
		assert.Equal(t, 0, gateway.MaskedCount())
		assert.JSONEq(t, string(locallyMasked), string(gatewayMasked))

		reply := []byte(`{"choices":[{"index":0,"message":{"role":"assistant","content":"` + local.forward["alice@example.com"] + `"}}]}`)
		viaGateway, err := gateway.RestoreJSON(reply)
		require.NoError(t, err)
		assert.JSONEq(t, string(reply), string(viaGateway))
		restored, err := local.RestoreJSON(viaGateway)
		require.NoError(t, err)
		assert.Contains(t, string(restored), "alice@example.com")
	})
	t.Run("a layer rejects input carrying its own marker", func(t *testing.T) {
		local, err := NewWithMarker(LocalMarker)
		require.NoError(t, err)
		defer local.Close()
		_, err = local.MaskText("spoof " + string(LocalMarker) + "x]]")
		require.ErrorIs(t, err, ErrUnsupported)
		_, err = NewWithMarker("[[XX:")
		require.Error(t, err)
	})
	t.Run("route table", func(t *testing.T) {
		cases := []struct {
			method, path, protocol string
			ok                     bool
		}{
			{"POST", "/v1/chat/completions", "chat", true},
			{"POST", "/v1/responses", "responses", true},
			{"POST", "/v1/messages", "claude", true},
			{"POST", "/v1beta/models/gemini-pro:streamGenerateContent", "gemini", true},
			{"POST", "/v1/embeddings", "", false},
			{"GET", "/v1/responses", "", false},
		}
		for _, tc := range cases {
			protocol, ok := ProtocolForRoute(tc.method, tc.path)
			assert.Equal(t, tc.protocol, protocol, tc.path)
			assert.Equal(t, tc.ok, ok, tc.path)
		}
	})
	t.Run("stream restorer reframes split chunks", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		_, err = s.MaskJSON([]byte(`{"model":"m","messages":[{"role":"user","content":"a@example.com"}],"stream":true}`), "chat")
		require.NoError(t, err)
		token := s.forward["a@example.com"]
		stream := "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"hi " + token + "\"}}]}\r\n\r\ndata: [DONE]\n\n"
		restorer := s.NewStreamRestorer(MaxEventBytes)
		var out strings.Builder
		emit := func(event []byte) error { out.Write(event); return nil }
		for chunk := range strings.SplitSeq(stream[:40]+"|"+stream[40:70]+"|"+stream[70:], "|") {
			require.NoError(t, restorer.Write([]byte(chunk), emit))
		}
		require.NoError(t, restorer.Close())
		assert.Contains(t, out.String(), "hi a@example.com")
		assert.Contains(t, out.String(), "data: [DONE]")
	})
	t.Run("stream restorer fails on a trailing partial event", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		restorer := s.NewStreamRestorer(MaxEventBytes)
		require.NoError(t, restorer.Write([]byte("data: {\"choices\":[]}"), func([]byte) error { return nil }))
		require.ErrorIs(t, restorer.Close(), ErrIncomplete)
	})
}

func TestSignedReasoningPassThrough(t *testing.T) {
	t.Run("claude signed thinking request and response", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()

		request := map[string]any{
			"model":      "m",
			"max_tokens": 1,
			"thinking":   map[string]any{"type": "enabled", "budget_tokens": 1024, "display": "summarized"},
			"messages": []any{
				map[string]any{"role": "user", "content": "ordinary alice@example.com"},
				map[string]any{"role": "assistant", "content": []any{map[string]any{
					"type": "thinking", "thinking": "private alice@example.com", "signature": "sig-1",
				}}},
			},
		}
		body, err := json.Marshal(request)
		require.NoError(t, err)
		masked, err := s.MaskJSON(body, "claude")
		require.NoError(t, err)
		assert.Contains(t, string(masked), `"thinking":"private alice@example.com"`)
		assert.Contains(t, string(masked), `"signature":"sig-1"`)
		assert.NotContains(t, string(masked), "ordinary alice@example.com")
		token := s.forward["alice@example.com"]
		require.NotEmpty(t, token)

		adaptive, err := json.Marshal(map[string]any{
			"model": "m", "max_tokens": 1,
			"thinking": map[string]any{"type": "adaptive", "display": "omitted"},
			"messages": []any{map[string]any{"role": "user", "content": "x"}},
		})
		require.NoError(t, err)
		_, err = s.MaskJSON(adaptive, "claude")
		require.NoError(t, err)

		reply := map[string]any{
			"type": "message",
			"content": []any{
				map[string]any{"type": "thinking", "thinking": "private " + token, "signature": "sig-2"},
				map[string]any{"type": "text", "text": "ordinary " + token},
			},
		}
		raw, err := json.Marshal(reply)
		require.NoError(t, err)
		restored, err := s.RestoreJSON(raw)
		require.NoError(t, err)
		assert.Contains(t, string(restored), `"thinking":"private `+token+`"`)
		assert.Contains(t, string(restored), "ordinary alice@example.com")

		events := []map[string]any{
			{"type": "content_block_start", "index": 0, "content_block": map[string]any{"type": "thinking", "thinking": "private " + token, "signature": "sig-3"}},
			{"type": "content_block_delta", "index": 0, "delta": map[string]any{"type": "thinking_delta", "thinking": " more " + token}},
			{"type": "content_block_delta", "index": 0, "delta": map[string]any{"type": "signature_delta", "signature": "sig-4"}},
			{"type": "content_block_stop", "index": 0},
			{"type": "content_block_delta", "index": 1, "delta": map[string]any{"type": "text_delta", "text": "ordinary " + token}},
			{"type": "message_stop"},
		}
		for _, event := range events {
			data, e := json.Marshal(event)
			require.NoError(t, e)
			out, e := s.RestoreEvent(data)
			require.NoError(t, e, string(data))
			delta, ok := event["delta"].(map[string]any)
			if !ok {
				continue
			}
			switch delta["type"] {
			case "text_delta":
				assert.Contains(t, string(out), "ordinary alice@example.com")
			case "thinking_delta":
				assert.Contains(t, string(out), token)
			}
		}
	})

	t.Run("gemini signed thought request and response", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()

		request := map[string]any{
			"model": "m",
			"contents": []any{
				map[string]any{"role": "user", "parts": []any{map[string]any{"text": "ordinary alice@example.com"}}},
				map[string]any{"role": "model", "parts": []any{map[string]any{
					"text": "private alice@example.com", "thought": true, "thoughtSignature": "sig-1",
				}}},
			},
		}
		body, err := json.Marshal(request)
		require.NoError(t, err)
		masked, err := s.MaskJSON(body, "gemini")
		require.NoError(t, err)
		assert.Contains(t, string(masked), `"text":"private alice@example.com"`)
		assert.Contains(t, string(masked), `"thoughtSignature":"sig-1"`)
		assert.NotContains(t, string(masked), "ordinary alice@example.com")
		token := s.forward["alice@example.com"]
		require.NotEmpty(t, token)

		reply := map[string]any{"candidates": []any{map[string]any{"content": map[string]any{"parts": []any{
			map[string]any{"text": "private " + token, "thought": true, "thoughtSignature": "sig-2"},
			map[string]any{"text": "ordinary " + token},
		}}}}}
		raw, err := json.Marshal(reply)
		require.NoError(t, err)
		restored, err := s.RestoreJSON(raw)
		require.NoError(t, err)
		assert.Contains(t, string(restored), `"text":"private `+token+`"`)
		assert.Contains(t, string(restored), "ordinary alice@example.com")

		events := []map[string]any{
			{"candidates": []any{map[string]any{"index": 0, "content": map[string]any{"parts": []any{
				map[string]any{"text": "private " + token, "thought": true, "thoughtSignature": "sig-3"},
			}}}}},
			{"candidates": []any{map[string]any{"index": 0, "content": map[string]any{"parts": []any{
				map[string]any{"text": "ordinary " + token},
			}}}}},
			{"candidates": []any{map[string]any{"index": 0, "finishReason": "STOP"}}},
		}
		for i, event := range events {
			data, e := json.Marshal(event)
			require.NoError(t, e)
			out, e := s.RestoreEvent(data)
			require.NoError(t, e, string(data))
			if i == 0 {
				assert.Contains(t, string(out), token)
			}
			if i == 1 {
				assert.Contains(t, string(out), "ordinary alice@example.com")
			}
		}
		require.NoError(t, s.Finish())
	})

	t.Run("malformed signed blocks still fail closed", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		for _, body := range []string{
			`{"type":"message","content":[{"type":"thinking","thinking":"x","signature":123}]}`,
			`{"type":"message","content":[{"type":"thinking","thinking":"x","signature":"sig","extra":true}]}`,
			`{"candidates":[{"content":{"parts":[{"text":"x","thoughtSignature":123}]}}]}`,
			`{"candidates":[{"content":{"parts":[{"text":"x","thoughtSignature":"sig","extra":true}]}}]}`,
		} {
			_, e := s.RestoreJSON([]byte(body))
			assert.ErrorIs(t, e, ErrUnsupported, body)
		}
		for _, body := range []string{
			`{"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"x","signature":"sig","extra":true}}`,
			`{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"x","extra":true}}`,
			`{"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":123}}`,
			`{"candidates":[{"index":0,"content":{"parts":[{"text":"x","thoughtSignature":"sig","extra":true}]}}]}`,
		} {
			_, e := s.RestoreEvent([]byte(body))
			assert.ErrorIs(t, e, ErrUnsupported, body)
		}
	})
}
