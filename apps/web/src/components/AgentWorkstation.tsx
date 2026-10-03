import type { NodeState } from "../lib/floor-graph";

export function AgentWorkstation({ state, identity, live = true }: { state: NodeState; identity: string; live?: boolean }) {
  const sprite = Array.from(identity).reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0) % 4;
  const working = state === "working" && live;
  const indicator = state === "failed" ? "var(--bad)" : state === "waiting" ? "var(--wait)" : "var(--c)";
  return <svg className="hq-workstation" data-sprite={sprite} viewBox="0 0 120 96" fill="none" shapeRendering="crispEdges" aria-hidden="true">
    <path d="M12 78H108V84H12Z" fill="#141c29" opacity=".6" />
    <path d="M20 60H26V80H20ZM94 60H100V80H94Z" fill="#353747" />
    <path d="M18 50H102V62H18Z" fill="#735a4c" />
    <path d="M18 48H102V54H18Z" fill="#bd9672" />
    <path d="M18 54H102V58H18Z" fill="#947457" />
    <path d="M82 60H100V76H82Z" fill="#655245" />
    <path d="M84 62H98V66H84ZM84 68H98V72H84Z" fill="#8e7055" />
    <path d="M89 63H93V65H89ZM89 69H93V71H89Z" fill="#d0b18c" />
    <path d="M48 18H82V42H48Z" fill="#141f30" />
    <path d="M50 20H80V39H50Z" fill="#45576a" />
    <path d="M52 22H78V37H52Z" fill="#182d3a" />
    <g fill="var(--c)" opacity={state === "idle" ? .25 : .85}>
      <path d="M55 25H65V27H55ZM55 29H74V31H55ZM55 33H69V35H55Z" />
      {working && <path className="hq-pixel-cursor" d="M71 33H75V35H71Z" />}
    </g>
    <path d="M62 42H68V47H62ZM57 47H73V49H57Z" fill="#374452" />
    <path d="M47 51H78V57H47Z" fill="#e0d4ba" />
    <path d="M49 52H75V53H49ZM49 54H69V55H49Z" fill="#9e9381" />
    <path d="M88 41H96V49H88ZM96 42H99V47H96Z" fill="#e4dac8" />
    <path d="M89 41H95V43H89Z" fill="#655044" />
    <path d="M23 43H31V49H23Z" fill="#a16e53" />
    <path d="M25 33H29V44H25ZM20 35H25V40H20ZM29 31H34V37H29Z" fill="#79a582" />
    <path d="M32 64H58V80H32ZM36 80H40V87H36ZM50 80H54V87H50Z" fill="#293a4b" />
    <path d="M35 58H55V74H35Z" fill="var(--c)" />
    <path d="M36 73H43V83H36ZM48 73H55V83H48Z" fill="#35435b" />
    <path d="M34 81H43V85H34ZM48 81H57V85H48Z" fill="#172638" />
    <path d="M36 32H54V36H58V53H54V57H36V53H32V36H36Z" fill="#d9d8c8" />
    <path d="M36 36H54V50H36Z" fill="#283a4a" />
    <path d={state === "idle" ? "M38 43H42V45H38ZM48 43H52V45H48Z" : "M38 40H42V45H38ZM48 40H52V45H48Z"} fill={indicator} />
    <path d="M42 48H48V50H42Z" fill={indicator} />
    {sprite === 0 && <path d="M43 26H47V32H43ZM41 23H49V27H41Z" fill="var(--c)" />}
    {sprite === 1 && <path d="M30 39H34V49H30ZM56 39H60V49H56ZM34 30H56V34H34Z" fill="var(--c)" />}
    {sprite === 2 && <path d="M34 28H39V35H34ZM51 28H56V35H51ZM39 31H51V35H39Z" fill="var(--c)" />}
    {sprite === 3 && <path d="M35 29H55V34H35ZM31 33H59V36H31Z" fill="var(--c)" />}
    <g className={working ? "hq-pixel-typing" : undefined}>
      <path d="M31 58H37V68H31ZM54 58H60V65H54Z" fill="var(--c)" />
      <path d="M31 56H37V61H31ZM54 54H60V59H54Z" fill="#d9d8c8" />
    </g>
    <path d="M31 68H59V75H31Z" fill="#41576b" />
    <path d="M33 68H57V71H33Z" fill="#5b7283" />
    <path d="M44 75H47V88H44ZM34 88H57V91H34ZM33 89H37V93H33ZM54 89H58V93H54Z" fill="#1b2939" />
    {state === "waiting" && <g fill="var(--wait)"><path d="M65 5H79V17H65Z" /><path d="M65 17H69V21H65Z" /><path d="M71 7H73V12H71ZM71 14H73V16H71Z" fill="#172638" /></g>}
    {state === "failed" && <path d="M67 7H70V10H73V7H76V10H73V13H76V16H73V13H70V16H67V13H70V10H67Z" fill="var(--bad)" />}
  </svg>;
}
