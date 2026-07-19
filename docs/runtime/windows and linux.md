---
title: windows and linux
stage: design
status: draft
created: 2026-07-19
tags:
  - pibarm
  - runtime
  - design
  - desktop
hub: "[[pibarm runtime design]]"
---

# windows and linux

PRD F11: no app ships this cycle, but the architecture must not calcify around macOS. This note records the strategy (D9 in [[pibarm runtime design]]) and the concrete guardrails the earlier milestones must respect.

## Strategy

**Reuse the web client inside a Tauri 2 shell** when the time comes, adding the native integrations that matter per platform, rather than writing two more fully-native apps.

Reasoning: the [[web client]] already implements the whole surface against the protocol; Tauri adds a real webview, native menus, tray/notification APIs, and small binaries. The macOS app stays fully native ([[macos app]]) because that was the explicit requirement; Windows/Linux get 90% of the value for 15% of the cost, and can be promoted to native later if usage justifies it. All-native-everywhere and Electron were considered and set aside (cost; weight).

## What each platform adds over the bare web client

| Integration | Windows | Linux |
| --- | --- | --- |
| Notifications + actions | WinRT toast notifications with buttons/inline reply | XDG desktop notifications (actions where the notifier supports them) |
| Glanceable state | system tray icon + flyout (menu bar extra equivalent) | tray via StatusNotifierItem where available |
| Badge counts | taskbar overlay badge | Unity/dock APIs where present; tray fallback |
| Keychain | Windows Credential Manager (via keyring layer) | libsecret/Secret Service |
| URI scheme | `pibarm://` registration | `.desktop` handler |
| Host lifecycle | host as a user service (Task Scheduler / service wrapper); note: pi/pibarmd on Windows likely means **WSL2 first**, native later | systemd user unit (already an M1 seed) |

The WSL2 caveat is the honest one: the runtime host shells out to git, pi, `gh`/`hut`, and worktrees all day; certifying that on native Windows is its own project. First Windows target: app runs native, host runs in WSL2, connected over localhost — which the protocol already supports by design.

## Guardrails on earlier milestones (the actual point of this note)

1. **Nothing platform-specific in the protocol.** Notifications, keychains, URI schemes are client concerns; the host emits abstract events ([[runtime core and protocol]]).
2. **Web client stays shell-agnostic**: no assumption that it runs in a browser tab — feature-detect Notifications API vs a `window.__pibarmShell` bridge (the Tauri shim slot), keyboard handling that tolerates native menus taking shortcuts.
3. **Keychain access behind one host-side interface** with macOS Keychain, libsecret, and Credential Manager backends ([[forge integration]] auth; [[security, permissions and notifications]]).
4. **Path discipline**: host code treats worktree/journal paths as opaque and slash-normalised; no `~` expansion in clients.
5. **CI keeps a Linux host job green from M1** — the host must never become macOS-only by accident, which also keeps the tailnet/headless-server host story alive.

## Issue seeds (M5, groundwork earlier)

- shell bridge interface in the web client (`__pibarmShell` feature detection)
- keychain abstraction with three backends (host-side, needed by M4 auth anyway)
- Linux host job in CI from M1
- Tauri shell spike: menus, tray, toasts, URI scheme on both platforms
- WSL2 host + native Windows app connection guide

## Related

[[pibarm runtime design]] · [[web client]] · [[macos app]] · [[security, permissions and notifications]]
