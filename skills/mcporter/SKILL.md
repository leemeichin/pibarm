---
name: mcporter
description: Use MCP servers through the mcporter CLI wrapper from pi. Use when the task needs external MCP-backed tools, server discovery, or tool calls via mcporter.
---

# Mcporter

Use this skill when the user wants MCP functionality through `mcporter`.

## Workflow

1. Check project configuration:
   - `.pi/mcporter.json` if present
   - `.pi/mcporter.example.json` for the expected shape
2. Use `/mcporter` to inspect the configured wrapper command.
3. Use `mcporter_list` before `mcporter_call` when you need server/tool discovery or schemas.
4. Use `mcporter_resource` to list/read MCP resources.
5. Prefer explicit, small tool arguments. Keep MCP calls auditable in the response.

## Tools

`mcporter_list` accepts optional `server` and `schema` fields.

The `mcporter_call` pi tool accepts:

```json
{
  "server": "server-name",
  "tool": "tool-name",
  "arguments": { "key": "value" }
}
```

The extension expands these into the configured `mcporter` command template. The default template uses `mcporter call {selector} --args {argumentsJson} --output json`.

## Configuration

Copy `.pi/mcporter.example.json` to `.pi/mcporter.json` and adjust `callArgs`, `listArgs`, or `resourceArgs` to match the installed mcporter version.

Supported placeholders:

- `{server}`
- `{tool}`
- `{selector}` (`server.tool`)
- `{argumentsJson}`
- `{schemaFlag}`
- `{uri}`
