import { ICON_NAMES, Icon } from "pibarm-ds";

const cell: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
  padding: "10px 6px",
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  color: "var(--text-muted)",
};

export const TheSet = () => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 4 }}>
    {ICON_NAMES.map((name) => (
      <div key={name} style={cell}>
        <Icon name={name} size={20} />
        {name}
      </div>
    ))}
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
    <Icon name="git-branch" size={14} />
    <Icon name="git-branch" size={20} />
    <Icon name="git-branch" size={28} />
    <Icon name="git-branch" size={40} />
  </div>
);

export const Coloured = () => (
  <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
    <Icon name="activity" size={24} color="var(--pea-600)" />
    <Icon name="gauge" size={24} color="var(--mustard-600)" />
    <Icon name="git-pull-request" size={24} color="var(--plum-600)" />
    <Icon name="alert-triangle" size={24} color="var(--tomato-600)" />
    <Icon name="sandwich" size={24} color="var(--orange-500)" />
  </div>
);
