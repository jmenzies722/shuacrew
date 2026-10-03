import type { ReactNode } from "react";
import type { CompanionPreferences, RobotEyes, RobotMouth } from "../lib/companion";

/**
 * The robots, drawn like little 3D toys: a lit shell (your finish, in the material you pick) with a rim light and a
 * soft shadow underneath, graphite or trim-coloured joints, and a dark glass visor whose eyes glow. Every piece —
 * eyes, mouth, hat, face piece, neck piece — is drawn against each robot's own head and body, so all of them fit
 * all three robots. Vector, so it's crisp from a notch portrait to the workshop; "pixel" turns the same drawing
 * into pixel art with a filter, keeping every animation.
 */
type Palette = { light: string; base: string; deep: string; id: string };
interface Frame {
  head: { x: number; y: number; w: number; h: number }; visor: { x: number; y: number; w: number; h: number; r: number };
  eyeY: number; gap: number; mouthY: number; neckY: number; badge: [number, number];
}
type Kind = "spark" | "scout" | "atlas" | "nova";
const FRAMES: Record<Kind, Frame> = {
  spark: { head: { x: 15, y: 9, w: 70, h: 52 }, visor: { x: 22, y: 18, w: 56, h: 35, r: 16 }, eyeY: 34.5, gap: 12, mouthY: 45.5, neckY: 63, badge: [60, 77] },
  scout: { head: { x: 19, y: 14, w: 62, h: 47 }, visor: { x: 27, y: 23, w: 46, h: 30, r: 13 }, eyeY: 36, gap: 11, mouthY: 46, neckY: 63, badge: [63, 70] },
  atlas: { head: { x: 13, y: 17, w: 74, h: 45 }, visor: { x: 21, y: 25, w: 58, h: 28, r: 9 }, eyeY: 37.5, gap: 13, mouthY: 47, neckY: 65, badge: [70, 69] },
  nova: { head: { x: 16, y: 12, w: 68, h: 54 }, visor: { x: 25, y: 25, w: 50, h: 28, r: 14 }, eyeY: 38, gap: 11, mouthY: 47.5, neckY: 68, badge: [58, 72] },
};

function tone(hex: string, toward: number, amount: number) {
  const v = parseInt(hex.slice(1), 16), m = (c: number) => Math.round(c + (toward - c) * amount);
  return `#${[v >> 16 & 255, v >> 8 & 255, v & 255].map((c) => m(c).toString(16).padStart(2, "0")).join("")}`;
}

export function RobotCharacter({ preferences: p, palette: c, crop }: {
  preferences: CompanionPreferences; palette: Palette; crop: "full" | "portrait";
}) {
  const kind: Kind = p.character === "atlas" || p.character === "nova" || p.character === "spark" ? p.character : "scout", f = FRAMES[kind];
  const id = (name: string) => `${name}-${c.id}`, url = (name: string) => `url(#${id(name)})`;
  // Auto trim is graphite, or a light steel on a dark shell so the joints don't disappear into it.
  const dark = (() => { const v = parseInt(c.base.slice(1), 16); return (0.3 * (v >> 16 & 255) + 0.59 * (v >> 8 & 255) + 0.11 * (v & 255)) < 70; })();
  const trim = p.trim === "auto" ? (dark ? "#7b8494" : "#2b3240") : p.trim, trimLight = tone(trim, 255, 0.28), eyes = p.eyeColor;
  const m = p.material, glass = m === "glass";
  const shellStops = m === "metal" ? [[0, c.light], [0.32, c.base], [0.5, tone(c.light, 255, 0.35)], [0.68, c.base], [1, c.deep]]
    : m === "matte" ? [[0, tone(c.base, 255, 0.18)], [0.6, c.base], [1, tone(c.base, 0, 0.22)]]
    : [[0, tone(c.light, 255, 0.3)], [0.42, c.base], [1, c.deep]];
  const shine = m === "matte" ? 0 : m === "metal" ? 0.5 : glass ? 0.75 : 0.6;
  const shell = { fill: url("shell"), fillOpacity: glass ? 0.78 : 1 };
  const pixel = p.style === "pixel";
  const H = f.head, hx = H.x + H.w / 2;
  const headShape = kind === "nova"
    ? <path d={`M${H.x} ${H.y + 28}Q${H.x} ${H.y} ${hx} ${H.y}Q${H.x + H.w} ${H.y} ${H.x + H.w} ${H.y + 28}Q${H.x + H.w} ${H.y + H.h - 2} ${hx} ${H.y + H.h}Q${H.x} ${H.y + H.h - 2} ${H.x} ${H.y + 28}Z`} />
    : <rect x={H.x} y={H.y} width={H.w} height={H.h} rx={kind === "atlas" ? 13 : kind === "spark" ? 25 : 21} />;
  const V = f.visor;

  return <svg className={`robot-art robot-${kind} ${pixel ? "is-pixel" : ""}`} viewBox={crop === "portrait" ? "10 0 80 80" : "0 0 100 110"} fill="none" shapeRendering={pixel ? "crispEdges" : undefined}>
    <defs>
      <radialGradient id={id("shell")} cx="34%" cy="22%" r="95%">{shellStops.map(([o, s]) => <stop key={o} offset={o} stopColor={s as string} />)}</radialGradient>
      <linearGradient id={id("trim")} x1="0" y1="0" x2="0" y2="1"><stop stopColor={trimLight} /><stop offset="1" stopColor={tone(trim, 0, 0.35)} /></linearGradient>
      <linearGradient id={id("visor")} x1="0" y1="0" x2=".4" y2="1"><stop stopColor="#26303f" /><stop offset=".55" stopColor="#0d121b" /><stop offset="1" stopColor="#05070b" /></linearGradient>
      <radialGradient id={id("visor-glow")} cx="50%" cy="45%" r="60%"><stop stopColor={eyes} stopOpacity=".28" /><stop offset="1" stopColor={eyes} stopOpacity="0" /></radialGradient>
      <linearGradient id={id("rim")} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#fff" stopOpacity=".75" /><stop offset=".35" stopColor="#fff" stopOpacity="0" /></linearGradient>
      <linearGradient id={id("under")} x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stopColor={c.deep} stopOpacity="0" /><stop offset="1" stopColor={tone(c.deep, 0, 0.4)} stopOpacity=".55" /></linearGradient>
      <linearGradient id={id("gold")} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#fff3b0" /><stop offset=".5" stopColor="#f5c542" /><stop offset="1" stopColor="#b7791f" /></linearGradient>
      <linearGradient id={id("jet")} x1="0" y1="0" x2="0" y2="1"><stop stopColor={eyes} stopOpacity=".95" /><stop offset="1" stopColor={eyes} stopOpacity="0" /></linearGradient>
      <clipPath id={id("head")}>{headShape}</clipPath>
      <clipPath id={id("visor-clip")}><rect x={V.x} y={V.y} width={V.w} height={V.h} rx={V.r} /></clipPath>
      <filter id={id("glow")} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      <filter id={id("soft")} x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="2" /></filter>
      {/* Pixel art: sample one point per 3-unit cell (about 33 across), then grow it to fill the cell. */}
      <filter id={id("pixel")} x="0" y="0" width="100" height="110" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse">
        <feFlood x="1" y="1" width="1" height="1" floodColor="#000" /><feComposite x="0" y="0" width="3" height="3" /><feTile result="grid" />
        <feComposite in="SourceGraphic" in2="grid" operator="in" /><feMorphology operator="dilate" radius="1.5" />
      </filter>
    </defs>
    <g filter={pixel ? url("pixel") : undefined}>
      <ellipse cx="50" cy="104" rx={kind === "nova" ? 17 : kind === "atlas" ? 27 : kind === "spark" ? 20 : 22} ry="3.6" fill="#000" opacity=".28" filter={pixel ? undefined : url("soft")} />
      <g className="robot-body">
        {kind === "nova" && <path className="robot-orbit" d="M16 80Q16 71 50 71Q84 71 84 80" stroke={c.light} strokeWidth="1.6" opacity=".45" />}
        <Body kind={kind} c={c} shell={shell} url={url} eyes={eyes} />
        {kind === "nova" && <path className="robot-orbit" d="M16 80Q16 89 50 89Q84 89 84 80" stroke={c.light} strokeWidth="2" opacity=".8" />}
        <Neck kind={p.neck} y={f.neckY} badge={f.badge} eyes={eyes} url={url} />
        <g className="robot-head">
          <Ears kind={kind} H={H} url={url} eyes={eyes} glow={url("glow")} />
          <g {...shell}>{headShape}</g>
          <g clipPath={url("head")}>
            <rect x={H.x} y={H.y} width={H.w} height={H.h} fill={url("under")} />
            {shine > 0 && <ellipse cx={H.x + H.w * 0.3} cy={H.y + 7} rx={H.w * 0.2} ry="4.5" fill="#fff" opacity={shine * 0.55} transform={`rotate(-14 ${H.x + H.w * 0.3} ${H.y + 7})`} />}
          </g>
          {!pixel && <g fill="none" stroke={url("rim")} strokeWidth="1.3">{headShape}</g>}
          {kind === "atlas" && <path d={`M${H.x + 9} ${H.y + 4.5}H${H.x + 19}M${H.x + H.w - 19} ${H.y + 4.5}H${H.x + H.w - 9}`} stroke={eyes} strokeWidth="1.8" strokeLinecap="round" filter={url("glow")} />}
          {/* The visor: dark glass, lit from inside by the eyes, with a diagonal reflection across it. */}
          <rect x={V.x - 1.4} y={V.y - 1.4} width={V.w + 2.8} height={V.h + 2.8} rx={V.r + 1.4} fill={url("trim")} />
          <rect x={V.x} y={V.y} width={V.w} height={V.h} rx={V.r} fill={url("visor")} />
          {!pixel && <><rect x={V.x} y={V.y} width={V.w} height={V.h} rx={V.r} fill={url("visor-glow")} />
          <g clipPath={url("visor-clip")}><path d={`M${V.x + V.w * 0.55} ${V.y}L${V.x + V.w * 0.72} ${V.y}L${V.x + V.w * 0.42} ${V.y + V.h}L${V.x + V.w * 0.25} ${V.y + V.h}Z`} fill="#fff" opacity=".06" />
            <path d={`M${V.x + 5} ${V.y + 3.2}H${V.x + V.w * 0.42}`} stroke="#fff" strokeOpacity=".22" strokeWidth="1.6" strokeLinecap="round" /></g></>}
          <g filter={pixel ? undefined : url("glow")}>
            <Eyes style={p.eyes} cx={hx} cy={f.eyeY} gap={f.gap} color={eyes} />
            <Mouth style={p.mouth} cx={hx} y={f.mouthY} color={eyes} />
          </g>
          <FaceWear kind={p.faceWear} cx={hx} cy={f.eyeY} gap={f.gap} V={V} trim={trimLight} />
          <Hat kind={p.hat} H={H} c={c} eyes={eyes} trim={trim} url={url} round={kind !== "atlas"} />
        </g>
      </g>
    </g>
  </svg>;
}

function Body({ kind, c, shell, url, eyes }: { kind: Kind; c: Palette; shell: { fill: string; fillOpacity: number }; url: (n: string) => string; eyes: string }) {
  const joint = url("trim"), rim = { fill: "none", stroke: url("rim"), strokeWidth: 1 };
  if (kind === "spark") {
    // The original: an egg of a body with a glowing button, shell-capped arms ending in little grippers, chunky boots.
    const egg = "M35 67Q35 60 50 60Q65 60 65 67L64 79Q62 92 50 92Q38 92 36 79Z";
    const arm = (s: 1 | -1) => <>
      <circle cx={50 + s * 16} cy="67.5" r="4.6" fill={joint} />
      <ellipse cx={50 + s * 21} cy="75" rx="5.2" ry="7.4" transform={`rotate(${-s * 22} ${50 + s * 21} 75)`} {...shell} />
      <path d={`M${50 + s * 22} 81.5L${50 + s * 24} 84`} stroke={joint} strokeWidth="3.4" strokeLinecap="round" />
      <path d={`M${50 + s * 21.5} 84.5Q${50 + s * 28.5} 85 ${50 + s * 26.5} 91.5M${50 + s * 24} 87Q${50 + s * 22} 90 ${50 + s * 23.5} 92`} stroke={joint} strokeWidth="2.6" strokeLinecap="round" fill="none" />
    </>;
    return <>
      {[44.5, 55.5].map((x) => <rect key={x} x={x - 3.5} y="86" width="7" height="9" rx="3" fill={joint} />)}
      {[43.5, 56.5].map((x) => <g key={`b${x}`}><rect x={x - 8} y="93" width="16" height="9" rx="4.5" {...shell} /><rect x={x - 8} y="100" width="16" height="3" rx="1.5" fill={joint} />
        <path d={`M${x - 5} 94.8H${x + 3}`} stroke="#fff" strokeOpacity=".4" strokeWidth="1" strokeLinecap="round" /></g>)}
      <g className="robot-arm-left">{arm(-1)}</g>
      <g className="robot-arm-right">{arm(1)}</g>
      <rect x="43.5" y="57.5" width="13" height="6" rx="3" fill={joint} />
      <path d={egg} {...shell} /><path d={egg} fill={url("under")} /><path d={egg} {...rim} />
      <ellipse cx="44" cy="66" rx="5" ry="2.4" fill="#fff" opacity=".35" transform="rotate(-18 44 66)" />
      <circle cx="50" cy="70" r="4" fill={joint} /><circle className="robot-core" cx="50" cy="70" r="2.6" fill={eyes} filter={url("glow")} />
    </>;
  }
  if (kind === "nova") return <>
    <path className="robot-thruster" d="M44 88Q50 108 56 88Z" fill={url("jet")} />
    <path d="M33 71Q22 75 19 87Q28 83 36 79Z" {...shell} /><g className="robot-arm-right"><path d="M67 71Q78 75 81 87Q72 83 64 79Z" {...shell} /></g>
    <path d="M35 70Q50 63 65 70L61 83Q50 96 39 83Z" {...shell} /><path d="M35 70Q50 63 65 70" {...rim} />
    <path d="M39 83Q50 96 61 83" fill="none" stroke={c.deep} strokeOpacity=".5" strokeWidth="1.2" />
    <circle cx="50" cy="76" r="5.4" fill={url("visor")} /><circle className="robot-core" cx="50" cy="76" r="2.6" fill={eyes} filter={url("glow")} />
    <ellipse cx="50" cy="67.5" rx="12" ry="3" fill={joint} />
  </>;
  const atlas = kind === "atlas";
  const torso = atlas ? { x: 25, y: 64, w: 50, h: 28, r: 10 } : { x: 33, y: 62, w: 34, h: 27, r: 13 };
  const arm = (side: 1 | -1) => {
    const sx = 50 + side * (atlas ? 26 : 17), hx = 50 + side * (atlas ? 34 : 27);
    return <>
      {atlas && <circle cx={sx} cy="69" r="7.5" {...shell} />}
      <path d={`M${sx} ${atlas ? 72 : 67}Q${hx + side * 1} ${atlas ? 76 : 72} ${hx} ${atlas ? 85 : 81}`} stroke={joint} strokeWidth={atlas ? 8.5 : 6.5} strokeLinecap="round" />
      {atlas ? <rect x={hx - 6} y="83" width="12" height="10" rx="4" {...shell} /> : <circle cx={hx} cy="83.5" r="5" {...shell} />}
    </>;
  };
  const legs = atlas ? [38, 62] : [43, 57], bootW = atlas ? 20 : 15;
  return <>
    {legs.map((x) => <rect key={x} x={x - (atlas ? 5.5 : 4)} y={atlas ? 89 : 85} width={atlas ? 11 : 8} height="10" rx="4" fill={joint} />)}
    {legs.map((x) => <g key={`b${x}`}><rect x={x - bootW / 2} y={atlas ? 96 : 94} width={bootW} height="8" rx="4" {...shell} /><path d={`M${x - bootW / 2 + 3} ${atlas ? 97.5 : 95.5}H${x + bootW / 2 - 3}`} stroke="#fff" strokeOpacity=".35" strokeWidth="1" strokeLinecap="round" /></g>)}
    <g className="robot-arm-left">{arm(-1)}</g>
    <g className="robot-arm-right">{arm(1)}</g>
    <rect x={44} y={58} width={12} height={8} rx={3} fill={joint} />
    <rect x={torso.x} y={torso.y} width={torso.w} height={torso.h} rx={torso.r} {...shell} />
    <rect x={torso.x} y={torso.y} width={torso.w} height={torso.h} rx={torso.r} fill={url("under")} />
    <rect x={torso.x} y={torso.y} width={torso.w} height={torso.h} rx={torso.r} {...rim} />
    {atlas ? <>
      <rect x="33" y="70" width="34" height="15" rx="5" fill={url("visor")} />
      {[38, 43, 48].map((x, i) => <circle key={x} cx={x} cy="77.5" r="1.4" fill={eyes} opacity={1 - i * 0.28} filter={url("glow")} />)}
      <circle className="robot-core" cx="59" cy="77.5" r="3.6" fill={eyes} filter={url("glow")} />
    </> : <>
      <rect x="40" y="68" width="20" height="15" rx="7" fill={url("visor")} />
      <path className="robot-core" d="M51.2 70.5L46.4 76.6H50.4L48.8 81L54 74.6H50Z" fill={eyes} filter={url("glow")} />
    </>}
  </>;
}

function Ears({ kind, H, url, eyes, glow }: { kind: string; H: Frame["head"]; url: (n: string) => string; eyes: string; glow: string }) {
  const y = H.y + H.h * 0.52;
  if (kind === "atlas") return <>{[H.x - 5, H.x + H.w - 2].map((x) => <g key={x}><rect x={x} y={y - 10} width="7" height="20" rx="3" fill={url("trim")} />
    <path d={`M${x + 2} ${y - 4}H${x + 5}M${x + 2} ${y}H${x + 5}M${x + 2} ${y + 4}H${x + 5}`} stroke="#000" strokeOpacity=".35" strokeWidth="1" /></g>)}</>;
  if (kind === "spark") return <>{[H.x - 0.5, H.x + H.w + 0.5].map((x) => <g key={x}><rect x={x - 4.5} y={y - 9.5} width="9" height="19" rx="4.5" fill={url("trim")} />
    <rect x={x - 2.4} y={y - 6.5} width="4.8" height="13" rx="2.4" fill="none" stroke={eyes} strokeWidth="1.6" filter={glow} /></g>)}</>;
  if (kind === "nova") return <>{[-1, 1].map((s) => <path key={s} d={`M${50 + s * 33} ${y - 8}L${50 + s * 40} ${y - 15}L${50 + s * 38} ${y + 4}Z`} fill={url("trim")} />)}</>;
  return <>{[H.x - 1, H.x + H.w + 1].map((x) => <g key={x}><circle cx={x} cy={y} r="6.8" fill={url("trim")} /><circle cx={x} cy={y} r="2.7" fill={eyes} opacity=".9" filter={glow} /></g>)}</>;
}

function Eyes({ style, cx, cy, gap, color }: { style: RobotEyes; cx: number; cy: number; gap: number; color: string }) {
  const pair = (draw: (x: number) => ReactNode) => <>{draw(cx - gap)}{draw(cx + gap)}</>;
  return <g className="robot-eyes" fill={color}>
    {style === "moon" && pair((x) => <g key={x}><circle cx={x} cy={cy} r="5.4" /><circle cx={x + 1.5} cy={cy - 1.3} r="2.9" fill="#100c08" /><circle cx={x + 2.3} cy={cy - 2.1} r=".9" fill="#fff" opacity=".9" /></g>)}
    {style === "round" && pair((x) => <g key={x}><circle cx={x} cy={cy} r="5" /><circle cx={x + 1.7} cy={cy - 1.9} r="1.6" fill="#fff" /><circle cx={x - 1.6} cy={cy + 1.8} r=".75" fill="#fff" opacity=".8" /></g>)}
    {style === "pill" && pair((x) => <rect key={x} x={x - 3.4} y={cy - 6} width="6.8" height="12" rx="3.4" />)}
    {style === "pixel" && pair((x) => <g key={x} shapeRendering="crispEdges"><rect x={x - 4} y={cy - 4} width="8" height="8" /><rect x={x - 6} y={cy - 2} width="12" height="4" /><rect x={x} y={cy - 4} width="2.6" height="2.6" fill="#fff" /></g>)}
    {style === "visor" && <><rect x={cx - gap - 6} y={cy - 2.6} width={gap * 2 + 12} height="5.2" rx="2.6" /><rect x={cx - gap - 2} y={cy - 1} width={gap * 2 + 4} height="2" rx="1" fill="#fff" opacity=".7" /></>}
    {style === "happy" && pair((x) => <path key={x} d={`M${x - 5} ${cy + 2}Q${x} ${cy - 6} ${x + 5} ${cy + 2}`} fill="none" stroke={color} strokeWidth="3.2" strokeLinecap="round" />)}
    {style === "star" && pair((x) => <path key={x} d={`M${x} ${cy - 6}Q${x + 1} ${cy - 1} ${x + 6} ${cy}Q${x + 1} ${cy + 1} ${x} ${cy + 6}Q${x - 1} ${cy + 1} ${x - 6} ${cy}Q${x - 1} ${cy - 1} ${x} ${cy - 6}Z`} />)}
  </g>;
}

function Mouth({ style, cx, y, color }: { style: RobotMouth; cx: number; y: number; color: string }) {
  const line = { fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <>
    <g className="robot-smile">
      {style === "smile" && <path d={`M${cx - 4.5} ${y - 1}Q${cx} ${y + 3} ${cx + 4.5} ${y - 1}`} {...line} />}
      {style === "grin" && <path d={`M${cx - 5} ${y - 1.5}H${cx + 5}Q${cx + 4.5} ${y + 4} ${cx} ${y + 4}Q${cx - 4.5} ${y + 4} ${cx - 5} ${y - 1.5}Z`} fill={color} />}
      {style === "flat" && <path d={`M${cx - 4} ${y}H${cx + 4}`} {...line} />}
      {style === "cat" && <path d={`M${cx - 5} ${y - 1}Q${cx - 2.5} ${y + 3} ${cx} ${y - .5}Q${cx + 2.5} ${y + 3} ${cx + 5} ${y - 1}`} {...line} />}
      {style === "o" && <ellipse cx={cx} cy={y + .5} rx="2.2" ry="2.6" {...line} strokeWidth={1.6} />}
    </g>
    <ellipse className="robot-mouth" cx={cx} cy={y + .5} rx="3.6" ry="2.6" fill={color} />
  </>;
}

function FaceWear({ kind, cx, cy, gap, V, trim }: { kind: CompanionPreferences["faceWear"]; cx: number; cy: number; gap: number; V: Frame["visor"]; trim: string }) {
  if (kind === "glasses") return <g stroke={trim} strokeWidth="1.6" fill="#fff" fillOpacity=".06"><rect x={cx - gap - 7.5} y={cy - 6.5} width="15" height="13" rx="4.5" /><rect x={cx + gap - 7.5} y={cy - 6.5} width="15" height="13" rx="4.5" /><path d={`M${cx - gap + 7.5} ${cy - 1}Q${cx} ${cy - 4} ${cx + gap - 7.5} ${cy - 1}M${V.x - 2} ${cy - 3}H${cx - gap - 7.5}M${cx + gap + 7.5} ${cy - 3}H${V.x + V.w + 2}`} fill="none" /></g>;
  if (kind === "shades") return <g><path d={`M${cx - gap - 8.5} ${cy - 5}H${cx + gap + 8.5}V${cy - 2}Q${cx + gap + 8} ${cy + 6} ${cx + gap} ${cy + 6}Q${cx + 3} ${cy + 6} ${cx + 2.5} ${cy - 1}H${cx - 2.5}Q${cx - 3} ${cy + 6} ${cx - gap} ${cy + 6}Q${cx - gap - 8} ${cy + 6} ${cx - gap - 8.5} ${cy - 2}Z`} fill="#07090d" stroke="#3a4352" strokeWidth=".8" />
    <path d={`M${cx - gap - 5} ${cy - 2.5}L${cx - gap - 1} ${cy - 2.5}M${cx + gap - 5} ${cy - 2.5}L${cx + gap - 1} ${cy - 2.5}`} stroke="#fff" strokeOpacity=".55" strokeWidth="1.2" strokeLinecap="round" /></g>;
  if (kind === "monocle") return <g fill="none"><circle cx={cx + gap} cy={cy} r="7.5" stroke="#f5c542" strokeWidth="1.6" fill="#fff" fillOpacity=".08" /><path d={`M${cx + gap + 5} ${cy + 5.5}Q${cx + gap + 9} ${cy + 16} ${cx + gap + 3} ${cy + 24}`} stroke="#f5c542" strokeWidth=".8" strokeDasharray="1.4 1" /></g>;
  if (kind === "blush") return <g fill="#ff6b8a" opacity=".5"><ellipse cx={V.x - 1} cy={V.y + V.h - 1} rx="4.5" ry="2.6" /><ellipse cx={V.x + V.w + 1} cy={V.y + V.h - 1} rx="4.5" ry="2.6" /></g>;
  return null;
}

function Hat({ kind, H, c, eyes, trim, url, round }: { kind: CompanionPreferences["hat"]; H: Frame["head"]; c: Palette; eyes: string; trim: string; url: (n: string) => string; round: boolean }) {
  const cx = H.x + H.w / 2, top = H.y + (round ? 1 : 0), w = H.w;
  const tw = tone(trim, 255, 0.2), td = tone(trim, 0, 0.3);
  switch (kind) {
    case "antenna": return <g><path d={`M${cx} ${top + 1}V${top - 10}`} stroke={url("trim")} strokeWidth="2.6" strokeLinecap="round" /><circle className="robot-core" cx={cx} cy={top - 12} r="4" fill={eyes} filter={url("glow")} /><circle cx={cx - 1.2} cy={top - 13.3} r="1.2" fill="#fff" opacity=".8" /></g>;
    case "cap": return <g><path d={`M${cx - w * 0.4} ${top + 8}Q${cx - w * 0.4} ${top - 12} ${cx} ${top - 12}Q${cx + w * 0.4} ${top - 12} ${cx + w * 0.4} ${top + 8}Z`} fill={c.deep} /><path d={`M${cx - w * 0.4} ${top + 8}Q${cx - w * 0.4} ${top - 12} ${cx} ${top - 12}Q${cx + w * 0.4} ${top - 12} ${cx + w * 0.4} ${top + 8}Z`} fill={url("rim")} opacity=".5" />
      <path d={`M${cx + w * 0.05} ${top + 7}H${cx + w * 0.62}Q${cx + w * 0.62} ${top + 11} ${cx + w * 0.3} ${top + 11}H${cx + w * 0.05}Z`} fill={tone(c.deep, 0, 0.3)} /><circle cx={cx} cy={top - 12} r="2" fill={c.light} /></g>;
    case "beanie": return <g><path d={`M${cx - w * 0.42} ${top + 9}Q${cx - w * 0.44} ${top - 14} ${cx} ${top - 14}Q${cx + w * 0.44} ${top - 14} ${cx + w * 0.42} ${top + 9}Z`} fill={tw} />
      {[-0.28, -0.14, 0, 0.14, 0.28].map((d) => <path key={d} d={`M${cx + w * d} ${top - 10 + Math.abs(d) * 14}V${top + 4}`} stroke={td} strokeOpacity=".5" strokeWidth="1" />)}
      <rect x={cx - w * 0.45} y={top + 2} width={w * 0.9} height="8" rx="4" fill={trim} /><path d={`M${cx - w * 0.4} ${top + 4.2}H${cx + w * 0.4}`} stroke="#fff" strokeOpacity=".25" strokeWidth="1" strokeLinecap="round" />
      <circle cx={cx} cy={top - 15} r="5" fill={eyes} /><circle cx={cx - 1.5} cy={top - 16.5} r="1.6" fill="#fff" opacity=".5" /></g>;
    case "headphones": return <g><path d={`M${H.x - 1} ${H.y + H.h * 0.5}V${H.y + 10}Q${H.x - 1} ${H.y - 9} ${cx} ${H.y - 9}Q${H.x + H.w + 1} ${H.y - 9} ${H.x + H.w + 1} ${H.y + 10}V${H.y + H.h * 0.5}`} stroke={url("trim")} strokeWidth="4.5" strokeLinecap="round" />
      {[H.x - 4, H.x + H.w - 6].map((x) => <g key={x}><rect x={x} y={H.y + H.h * 0.3} width="10" height="22" rx="5" fill={url("trim")} /><rect x={x + 2.5} y={H.y + H.h * 0.3 + 3} width="5" height="16" rx="2.5" fill={eyes} opacity=".85" filter={url("glow")} /></g>)}</g>;
    case "crown": return <g><path d={`M${cx - 14} ${top + 3}L${cx - 16} ${top - 13}L${cx - 7} ${top - 5}L${cx} ${top - 16}L${cx + 7} ${top - 5}L${cx + 16} ${top - 13}L${cx + 14} ${top + 3}Z`} fill={url("gold")} stroke="#a16207" strokeWidth=".6" strokeLinejoin="round" />
      {[-16, 0, 16].map((d) => <circle key={d} cx={cx + d} cy={top - (d === 0 ? 16 : 13)} r="1.8" fill="#fff3b0" />)}<circle cx={cx} cy={top - 3.5} r="2.6" fill={eyes} filter={url("glow")} /></g>;
    case "halo": return <g className="robot-halo"><ellipse cx={cx} cy={top - 9} rx="17" ry="4.2" stroke="#fde68a" strokeWidth="2.8" filter={url("glow")} /><ellipse cx={cx} cy={top - 9} rx="17" ry="4.2" stroke="#fff" strokeOpacity=".7" strokeWidth=".8" /></g>;
    case "bow": return <g transform={`translate(${H.x + H.w * 0.78} ${top + 3}) rotate(18)`}><path d="M0 0L-10 -7Q-12 0 -10 7Z M0 0L10 -7Q12 0 10 7Z" fill={eyes} /><path d="M0 0L-10 -7Q-12 0 -10 7Z M0 0L10 -7Q12 0 10 7Z" fill="#fff" opacity=".18" /><circle r="3" fill={tone(eyes, 0, 0.2)} /></g>;
    case "tophat": return <g><rect x={cx - 11} y={top - 21} width="22" height="22" rx="2.5" fill="#15171c" /><rect x={cx - 11} y={top - 8} width="22" height="4.5" fill={eyes} /><ellipse cx={cx} cy={top + 1} rx="19" ry="3.4" fill="#0d0f13" /><path d={`M${cx - 8} ${top - 19}V${top - 10}`} stroke="#fff" strokeOpacity=".18" strokeWidth="2" strokeLinecap="round" /></g>;
    default: return null;
  }
}

function Neck({ kind, y, badge, eyes, url }: { kind: CompanionPreferences["neck"]; y: number; badge: [number, number]; eyes: string; url: (n: string) => string }) {
  if (kind === "scarf") return <g><path d={`M31 ${y - 3}Q50 ${y + 6} 69 ${y - 3}L67 ${y + 3}Q50 ${y + 12} 33 ${y + 3}Z`} fill={eyes} /><path d={`M58 ${y + 4}L66 ${y + 5}L62 ${y + 20}L55 ${y + 17}Z`} fill={tone(eyes, 0, 0.18)} /><path d={`M33 ${y}Q50 ${y + 8} 67 ${y}`} stroke="#fff" strokeOpacity=".3" strokeWidth="1" /></g>;
  if (kind === "bowtie") return <g transform={`translate(50 ${y + 1})`}><path d="M0 0L-9 -5.5Q-10.5 0 -9 5.5Z M0 0L9 -5.5Q10.5 0 9 5.5Z" fill={eyes} /><rect x="-2.6" y="-2.6" width="5.2" height="5.2" rx="1.4" fill={tone(eyes, 0, 0.25)} /></g>;
  if (kind === "badge") return <g transform={`translate(${badge[0]} ${badge[1]})`}><path d="M0 -5.5L1.6 -1.7L5.6 -1.6L2.5 1L3.5 5L0 2.8L-3.5 5L-2.5 1L-5.6 -1.6L-1.6 -1.7Z" fill={url("gold")} stroke="#a16207" strokeWidth=".5" /></g>;
  return null;
}
