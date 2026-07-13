import { Button, Icon } from "pibarm-ds";

const row: React.CSSProperties = { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" };

export const Variants = () => (
  <div style={row}>
    <Button variant="primary">Read the docs</Button>
    <Button variant="secondary">GitHub</Button>
    <Button variant="ghost">Watch it work</Button>
    <Button variant="danger">Bin the worktree</Button>
  </div>
);

export const Sizes = () => (
  <div style={row}>
    <Button size="sm">Small</Button>
    <Button size="md">Medium</Button>
    <Button size="lg">Large</Button>
  </div>
);

export const WithIcons = () => (
  <div style={row}>
    <Button variant="primary" size="lg" leading={<Icon name="terminal" size={16} />}>
      Read the docs
    </Button>
    <Button variant="ghost" size="lg" leading={<Icon name="play" size={16} />}>
      Watch it work
    </Button>
    <Button variant="secondary" size="sm" leading={<Icon name="github" size={15} />}>
      GitHub
    </Button>
  </div>
);

export const AsLink = () => (
  <div style={row}>
    <Button as="a" href="https://github.com/leemeichin/pibarm" variant="primary" leading={<Icon name="layers" size={15} />}>
      See the demo
    </Button>
  </div>
);

export const Disabled = () => (
  <div style={row}>
    <Button variant="primary" disabled>
      Executing…
    </Button>
    <Button variant="ghost" disabled>
      Unavailable
    </Button>
  </div>
);
