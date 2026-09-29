import type { CompanionPreferences } from "../lib/companion";

/** Vector robots stay crisp from a notch-sized portrait to the character workshop. */
export function RobotCharacter({ preferences: p, palette: c, crop }: {
  preferences: CompanionPreferences; palette: { light: string; base: string; deep: string; id: string }; crop: "full" | "portrait";
}) {
  const atlas = p.character === "atlas", nova = p.character === "nova";
  const shell = `robot-shell-${c.id}`, visor = `robot-visor-${c.id}`;
  const eyes = p.eyeColor, y = atlas ? 42 : 40;
  return <svg className={`robot-art robot-${p.character} face-${p.face}`} viewBox={crop === "portrait" ? "18 12 64 64" : "0 0 100 110"} fill="none">
    <defs>
      <linearGradient id={shell} x1="20" y1="15" x2="80" y2="95" gradientUnits="userSpaceOnUse"><stop stopColor={c.light} /><stop offset=".48" stopColor={c.base} /><stop offset="1" stopColor={c.deep} /></linearGradient>
      <linearGradient id={visor} x1="30" y1="28" x2="70" y2="60" gradientUnits="userSpaceOnUse"><stop stopColor="#283849" /><stop offset="1" stopColor="#080e18" /></linearGradient>
    </defs>
    <ellipse cx="50" cy="102" rx={nova ? 19 : 25} ry="3" fill={c.deep} opacity=".2" />
    <g className="robot-body">
      {nova ? <>
        <ellipse className="robot-orbit" cx="50" cy="80" rx="32" ry="9" stroke={c.light} strokeWidth="2" opacity=".7" />
        <path d="M37 69Q50 60 63 69L60 82Q50 94 40 82Z" fill={`url(#${shell})`} stroke={c.light} strokeWidth=".7" />
        <path className="robot-thruster" d="M44 89Q50 106 56 89" fill={eyes} opacity=".7" />
        <path d="M30 72L20 83L31 81M70 72L80 83L69 81" fill={`url(#${shell})`} />
      </> : <>
        <g className="robot-arm robot-arm-left"><path d={atlas ? "M25 65L17 70L17 84" : "M31 66L22 73L21 82"} stroke={c.deep} strokeWidth={atlas ? 10 : 7} strokeLinecap="round" /><circle cx={atlas ? 17 : 21} cy="85" r={atlas ? 7 : 5} fill={`url(#${shell})`} /><path d={atlas ? "M15 84V88" : "M19 84V87"} stroke={c.light} strokeWidth="1.5" strokeLinecap="round" /></g>
        <g className="robot-arm robot-arm-right"><path d={atlas ? "M75 65L83 70L83 84" : "M69 66L78 73L79 82"} stroke={c.deep} strokeWidth={atlas ? 10 : 7} strokeLinecap="round" /><circle cx={atlas ? 83 : 79} cy="85" r={atlas ? 7 : 5} fill={`url(#${shell})`} /></g>
        <path d="M39 85V95M61 85V95" stroke="#263342" strokeWidth={atlas ? 10 : 7} strokeLinecap="round" />
        <rect x={atlas ? 26 : 31} y="94" width={atlas ? 23 : 17} height="7" rx="3.5" fill={c.deep} /><rect x="53" y="94" width={atlas ? 23 : 17} height="7" rx="3.5" fill={c.deep} />
        <rect x={atlas ? 27 : 33} y="62" width={atlas ? 46 : 34} height="28" rx={atlas ? 8 : 12} fill={`url(#${shell})`} stroke={c.light} strokeWidth=".8" />
        {atlas ? <><path d="M35 70H65M36 81H42M46 81H52" stroke={c.deep} strokeWidth="2" strokeLinecap="round" /><circle className="robot-core" cx="60" cy="80" r="3" fill={eyes} /></> : <><circle cx="50" cy="75" r="7" fill="#14202c" /><path className="robot-core" d="M51 69L46 76H51L49 81L55 73H50Z" fill={eyes} /></>}
      </>}
      <g className="robot-head">
        {nova ? <path d="M17 40Q18 13 50 13Q82 13 83 40Q83 65 50 67Q17 65 17 40Z" fill={`url(#${shell})`} stroke={c.light} /> : <rect x={atlas ? 14 : 20} y={atlas ? 20 : 18} width={atlas ? 72 : 60} height="45" rx={atlas ? 12 : 20} fill={`url(#${shell})`} stroke={c.light} />}
        {atlas ? <><rect x="9" y="34" width="6" height="17" rx="3" fill={c.deep} /><rect x="85" y="34" width="6" height="17" rx="3" fill={c.deep} /><path d="M22 25H34M66 25H77" stroke={c.light} strokeWidth="2" strokeLinecap="round" /></> : <><circle cx="20" cy="41" r="4" fill={c.deep} /><circle cx="80" cy="41" r="4" fill={c.deep} /></>}
        <rect x={atlas ? 22 : 26} y="28" width={atlas ? 56 : 48} height="29" rx={nova ? 14 : 10} fill={`url(#${visor})`} />
        <path d="M33 31H48" stroke="#fff" strokeOpacity=".18" strokeWidth="2" strokeLinecap="round" />
        <g className="robot-eyes" fill={eyes}>
          {p.face === "bright" ? <><path d={`M33 ${y+2}Q38 ${y-8}43 ${y+2}M57 ${y+2}Q62 ${y-8}67 ${y+2}`} fill="none" stroke={eyes} strokeWidth="3.5" strokeLinecap="round" /></> : <><rect x="34" y={y-5} width="7" height={p.face === "calm" ? 8 : 12} rx="3.5" /><rect x="59" y={y-5} width="7" height={p.face === "curious" ? 9 : 8} rx="3.5" /></>}
        </g>
        <path className="robot-smile" d="M46 50Q50 53 54 50" stroke={eyes} strokeWidth="1.7" strokeLinecap="round" />
        <ellipse className="robot-mouth" cx="50" cy="51" rx="3.5" ry="2.5" fill={eyes} />
        {p.accessory === "antenna" && <g><path d="M50 18V8" stroke={c.light} strokeWidth="3" /><circle className="robot-core" cx="50" cy="6" r="4" fill={eyes} /></g>}
        {p.accessory === "cap" && <g><path d="M25 24Q26 8 48 8Q66 8 71 24Z" fill={c.deep} /><path d="M28 23H79" stroke={c.light} strokeWidth="5" strokeLinecap="round" /><path d="M47 10V20" stroke={c.light} strokeOpacity=".4" /></g>}
        {p.accessory === "headphones" && <g stroke="#263342" strokeWidth="5"><path d="M15 43V29Q15 8 50 8Q85 8 85 29V43" /><rect x="11" y="32" width="9" height="21" rx="4" fill={c.light} /><rect x="80" y="32" width="9" height="21" rx="4" fill={c.light} /></g>}
        {p.accessory === "glasses" && <g stroke={c.light} strokeWidth="2"><rect x="29" y="33" width="18" height="15" rx="5" /><rect x="53" y="33" width="18" height="15" rx="5" /><path d="M47 39H53M25 37H29M71 37H75" /></g>}
      </g>
      {p.accessory === "scarf" && <g fill={c.light}><path d="M30 61Q50 70 70 61L68 68Q50 77 32 68Z" /><path d="M58 69L67 70L63 87L55 84Z" /></g>}
      {p.accessory === "badge" && <path d="M61 69L63 73L68 74L64 77L65 82L61 80L57 82L58 77L54 74L59 73Z" fill={eyes} stroke={c.deep} strokeWidth=".8" />}
    </g>
  </svg>;
}
