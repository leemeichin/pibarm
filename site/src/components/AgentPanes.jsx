import React from "react";

// Terminal-faithful replay of pibarm's dedicated tmux agent window. The 3-pane
// layout and transcript syntax mirror a captured pi + agent-render.mjs session.
export default function AgentPanesDemo({ scenario }) {
  const maxLines = Math.max(...scenario.panes.map((pane) => pane.lines.length));
  const [frame, setFrame] = React.useState(0);

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFrame(maxLines);
      return;
    }

    setFrame(0);
    const timer = window.setInterval(
      () => setFrame((current) => (current >= maxLines + 4 ? 0 : current + 1)),
      650,
    );
    return () => window.clearInterval(timer);
  }, [scenario.id, maxLines]);

  return (
    <div className="agent-terminal" aria-label={`${scenario.title}: tmux agent panes`}>
      <div className="agent-terminal__chrome">
        <div className="pib-term__dots" aria-hidden="true">
          <span className="pib-term__dot" style={{ background: "#e0685b" }} />
          <span className="pib-term__dot" style={{ background: "#e6b02c" }} />
          <span className="pib-term__dot" style={{ background: "#6fa84c" }} />
        </div>
        <span>tmux — {scenario.project}</span>
      </div>

      <div className="agent-terminal__panes">
        {scenario.panes.map((pane) => {
          const visibleLines = pane.lines.slice(0, frame);
          return (
            <div className="agent-terminal__pane" key={pane.name}>
              {visibleLines.map((line, index) => (
                <div className={`agent-terminal__line agent-terminal__line--${line.kind}`} key={index}>
                  {line.text || "\u00a0"}
                </div>
              ))}
              {frame > 0 && frame < pane.lines.length && <span className="pib-term__caret" aria-hidden="true" />}
            </div>
          );
        })}
      </div>

      <div className="agent-terminal__tmuxbar" aria-hidden="true">
        <span>[{scenario.project}]</span>
        <span>1:pi</span>
        <strong>2:pibarm-agents*</strong>
        <span className="agent-terminal__clock">{scenario.time}</span>
      </div>
    </div>
  );
}
