import { Kbd } from "pibarm-ds";

const wrap: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
  fontFamily: "var(--font-body)",
  fontSize: 14.5,
  color: "var(--text-body)",
};

export const Keys = () => (
  <div style={wrap}>
    <Kbd>/</Kbd>
    <Kbd>⌘</Kbd>
    <Kbd>⌥</Kbd>
    <Kbd>⇧</Kbd>
    <Kbd>Esc</Kbd>
    <Kbd>Tab</Kbd>
  </div>
);

export const InProse = () => (
  <p style={wrap}>
    Press <Kbd>/</Kbd> in pi to browse the commands, or <Kbd>⌘</Kbd> + <Kbd>K</Kbd> to jump straight
    to one.
  </p>
);
