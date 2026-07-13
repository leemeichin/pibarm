import { Badge } from "pibarm-ds";

const row: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };

export const Tones = () => (
  <div style={row}>
    <Badge tone="success">success</Badge>
    <Badge tone="warning">warning</Badge>
    <Badge tone="danger">danger</Badge>
    <Badge tone="info">info</Badge>
    <Badge tone="merged">merged</Badge>
    <Badge tone="accent">accent</Badge>
    <Badge tone="muted">muted</Badge>
  </div>
);

/** PR state mapping, straight from the TUI statusline. */
export const PullRequestStates = () => (
  <div style={row}>
    <Badge tone="success" dot>
      open
    </Badge>
    <Badge tone="muted" dot>
      draft
    </Badge>
    <Badge tone="merged" dot>
      merged
    </Badge>
    <Badge tone="danger" dot>
      closed
    </Badge>
  </div>
);

export const Solid = () => (
  <div style={row}>
    <Badge tone="success" solid>
      pass
    </Badge>
    <Badge tone="warning" solid>
      running
    </Badge>
    <Badge tone="danger" solid>
      fail
    </Badge>
    <Badge tone="info" solid>
      info
    </Badge>
    <Badge tone="merged" solid>
      merged
    </Badge>
    <Badge tone="accent" solid>
      wezterm
    </Badge>
    <Badge tone="muted" solid>
      muted
    </Badge>
  </div>
);

/** The terminal-native form: flat mono token, no chip. */
export const TerminalForm = () => (
  <div
    style={{
      ...row,
      background: "var(--surface-code)",
      padding: "14px 16px",
      borderRadius: "var(--radius-md)",
      fontFamily: "var(--font-mono)",
    }}
  >
    <Badge variant="term" tone="success" dot>
      open
    </Badge>
    <Badge variant="term" tone="muted" dot>
      draft
    </Badge>
    <Badge variant="term" tone="merged" dot>
      merged
    </Badge>
    <Badge variant="term" tone="warning" dot>
      CI running
    </Badge>
  </div>
);
