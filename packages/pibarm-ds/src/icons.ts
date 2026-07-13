/**
 * Curated Lucide icon set.
 *
 * Icons are imported by name (never via lucide's `icons` barrel with a dynamic
 * key) so the bundler can tree-shake down to just this set — the barrel lookup
 * pulls in all ~1600 icons.
 *
 * To add an icon: import it from "lucide" and add it to ICONS. The key is the
 * kebab-case name callers pass to <Icon name="…" />, and `IconName` derives
 * from this map, so an unknown name is a type error rather than a blank space.
 */
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardList,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Folder,
  Gauge,
  GitBranch,
  GitPullRequest,
  Info,
  Layers,
  Lock,
  NotebookPen,
  Play,
  Plus,
  RefreshCw,
  Sandwich,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Users,
  X,
  Zap,
} from "lucide";

/** Lucide's icon data shape: a list of [tag, attributes] pairs. */
export type IconNode = [tag: string, attrs: Record<string, string | number>][];

/**
 * Lucide 1.x ships no brand icons, so the GitHub mark is inlined here.
 * Drawn on the same 24x24 grid as the Lucide set, but filled rather than
 * stroked — Icon renders it with `fill="currentColor"` and no stroke.
 */
const GithubMark: IconNode = [
  [
    "path",
    {
      d: "M12 .5a12 12 0 0 0-3.79 23.4c.6.1.82-.26.82-.58v-2.23c-3.34.72-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.58A12 12 0 0 0 12 .5Z",
    },
  ],
];

/** Icons that are filled rather than stroked (brand marks). */
export const FILLED_ICONS = new Set<string>(["github"]);

export const ICONS = {
  activity: Activity as IconNode,
  "alert-triangle": AlertTriangle as IconNode,
  "arrow-left": ArrowLeft as IconNode,
  "arrow-right": ArrowRight as IconNode,
  bell: Bell as IconNode,
  bot: Bot as IconNode,
  check: Check as IconNode,
  "chevron-down": ChevronDown as IconNode,
  "chevron-right": ChevronRight as IconNode,
  circle: Circle as IconNode,
  "clipboard-list": ClipboardList as IconNode,
  clock: Clock as IconNode,
  copy: Copy as IconNode,
  "external-link": ExternalLink as IconNode,
  "file-text": FileText as IconNode,
  folder: Folder as IconNode,
  gauge: Gauge as IconNode,
  "git-branch": GitBranch as IconNode,
  "git-pull-request": GitPullRequest as IconNode,
  github: GithubMark,
  info: Info as IconNode,
  layers: Layers as IconNode,
  lock: Lock as IconNode,
  "notebook-pen": NotebookPen as IconNode,
  play: Play as IconNode,
  plus: Plus as IconNode,
  "refresh-cw": RefreshCw as IconNode,
  sandwich: Sandwich as IconNode,
  search: Search as IconNode,
  settings: Settings as IconNode,
  "sliders-horizontal": SlidersHorizontal as IconNode,
  sparkles: Sparkles as IconNode,
  terminal: Terminal as IconNode,
  users: Users as IconNode,
  x: X as IconNode,
  zap: Zap as IconNode,
} satisfies Record<string, IconNode>;

/** Every icon name <Icon /> accepts. */
export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];
