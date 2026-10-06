/**
 * One icon language for the whole app: crew members, ventures and playbooks are drawn with the
 * same line icons as everything else — never emoji. The data keeps a short icon name (e.g.
 * "telescope"); anything older that still holds an emoji is mapped to its nearest icon.
 */
import {
  Anchor,
  AudioLines,
  Blocks,
  Box,
  BrainCircuit,
  Briefcase,
  Camera,
  ChartLine,
  Code2,
  Coffee,
  Compass,
  Cpu,
  Feather,
  Flame,
  FlaskConical,
  Gem,
  Globe,
  Hammer,
  Heart,
  Hexagon,
  LayoutTemplate,
  Layers,
  Leaf,
  Lightbulb,
  type LucideIcon,
  Megaphone,
  Moon,
  Mountain,
  Music,
  Orbit,
  Palette,
  PenTool,
  Rocket,
  ScanSearch,
  Shield,
  ShoppingBag,
  Sparkles,
  Sprout,
  Sun,
  Target,
  Telescope,
  TrendingUp,
  Wallet,
  Waves,
  Workflow,
  Zap,
} from "lucide-react";

export const ICONS: Record<string, LucideIcon> = {
  "audio-lines": AudioLines,
  telescope: Telescope,
  code: Code2,
  "pen-tool": PenTool,
  megaphone: Megaphone,
  "chart-line": ChartLine,
  brain: BrainCircuit,
  flask: FlaskConical,
  shield: Shield,
  briefcase: Briefcase,
  palette: Palette,
  cpu: Cpu,
  feather: Feather,
  sprout: Sprout,
  rocket: Rocket,
  leaf: Leaf,
  zap: Zap,
  flame: Flame,
  gem: Gem,
  globe: Globe,
  layers: Layers,
  box: Box,
  blocks: Blocks,
  hexagon: Hexagon,
  sparkles: Sparkles,
  target: Target,
  compass: Compass,
  mountain: Mountain,
  waves: Waves,
  moon: Moon,
  sun: Sun,
  coffee: Coffee,
  wallet: Wallet,
  heart: Heart,
  music: Music,
  camera: Camera,
  "shopping-bag": ShoppingBag,
  anchor: Anchor,
  orbit: Orbit,
  lightbulb: Lightbulb,
  "layout-template": LayoutTemplate,
  hammer: Hammer,
  "scan-search": ScanSearch,
  "trending-up": TrendingUp,
  workflow: Workflow,
};

/** What an older emoji becomes. */
const FROM_EMOJI: Record<string, string> = {
  "🔎": "telescope", "🔍": "telescope", "🛠️": "code", "🛠": "code", "🎨": "pen-tool", "📣": "megaphone", "📈": "chart-line",
  "🌿": "sprout", "🌱": "sprout", "🌙": "moon", "💡": "lightbulb", "🚀": "rocket", "✨": "sparkles", "🧭": "compass",
  "🔥": "flame", "💎": "gem", "⚡": "zap", "⚡️": "zap", "🎯": "target", "🌍": "globe", "🌎": "globe", "☕": "coffee", "💰": "wallet",
};

/** Sensible icons when nothing is set: by crew role, by playbook. */
export const DEFAULTS: Record<string, string> = {
  researcher: "telescope",
  engineer: "code",
  designer: "pen-tool",
  marketer: "megaphone",
  operator: "chart-line",
  shua: "audio-lines",
  "validate-idea": "lightbulb",
  "landing-page": "layout-template",
  mvp: "hammer",
  launch: "rocket",
  "competitor-teardown": "scan-search",
  "growth-review": "trending-up",
};

/** The icon for a stored value (an icon name, or a legacy emoji), else the fallback, else none. */
export function iconFor(value?: string, fallback?: string): LucideIcon | undefined {
  const key = value && ICONS[value] ? value : value && FROM_EMOJI[value.trim()] ? FROM_EMOJI[value.trim()] : fallback && ICONS[fallback] ? fallback : fallback ? DEFAULTS[fallback] : undefined;
  return key ? ICONS[key] : undefined;
}

/**
 * Draws a crew member's, venture's or playbook's icon. With nothing to draw it shows a crisp
 * monogram — never an emoji.
 */
export function Glyph({ name, fallback, label, size = 16, className = "", strokeWidth = 1.75 }: { name?: string; fallback?: string; label?: string; size?: number; className?: string; strokeWidth?: number }) {
  const Icon = iconFor(name, fallback);
  if (Icon) return <Icon size={size} strokeWidth={strokeWidth} className={className} aria-hidden />;
  return (
    <span className={`glyph-mono ${className}`} style={{ fontSize: size * 0.62, width: size, height: size }} aria-hidden>
      {(label ?? "·").replace(/[^a-z0-9]/gi, "").slice(0, 1).toUpperCase() || "·"}
    </span>
  );
}

/** A grid of icons to choose from, for crew members, ventures and playbooks. */
export function IconPicker({ value, onChange, choices = Object.keys(ICONS), color }: { value?: string; onChange: (name: string) => void; choices?: string[]; color?: string }) {
  const current = value && ICONS[value] ? value : value ? FROM_EMOJI[value] : undefined;
  return (
    <div className="icon-picker" role="radiogroup" aria-label="Icon">
      {choices.map((name) => {
        const Icon = ICONS[name]!;
        return (
          <button key={name} type="button" role="radio" aria-checked={current === name} aria-label={name} title={name} className={current === name ? "is-on" : ""} style={current === name && color ? ({ "--pick": color } as React.CSSProperties) : undefined} onClick={() => onChange(name)}>
            <Icon size={15} strokeWidth={1.75} />
          </button>
        );
      })}
    </div>
  );
}
