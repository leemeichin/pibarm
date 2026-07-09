---
name: model-presets
description: Configure and use named pi model/tool/thinking presets for planning, execution, and subagents. Use when selecting or standardizing models by task role.
---

# Model Presets

This repo includes an `agent-presets` extension that reads `.pi/agent-presets.json`.

## Setup

Copy the example and edit model ids for your account/provider setup:

```bash
cp .pi/agent-presets.example.json .pi/agent-presets.json
```

## Preset Shape

```json
{
  "presets": {
    "planner": {
      "provider": "anthropic",
      "model": "claude-opus-4-1",
      "thinkingLevel": "high",
      "tools": ["read", "bash", "mcporter_list", "elicit_plan_questions", "create_git_worktree"]
    }
  }
}
```

`model` may also be `provider/model-id` when `provider` is omitted.

## Usage

- `/preset` — list presets
- `/preset planner` — apply one preset
- `/plan ...` — read-only plan mode plus prompt
- `/execute-plan` — execute the last captured plan
- `/execute-plan worktree <name>` — execute the last captured plan in an isolated worktree
