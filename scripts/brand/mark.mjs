// The ShuaCrew mark, one source: Shua's voice inside the crew's orbit, three crew on the ring, on obsidian.
// variant: "mac" (macOS grid: padded squircle + shadow), "ios" (full-bleed square; the system masks it), "glyph" (mark only, currentColor).
export function mark(variant = "mac", id = "m") {
  const crew = [-90, 30, 150], R = 232, C = 512;
  const at = (a) => [C + R * Math.cos(a * Math.PI / 180), C + R * Math.sin(a * Math.PI / 180)];
  const bars = [[-148, 140], [-74, 244], [0, 322], [74, 244], [148, 140]];
  if (variant === "glyph") {
    let g = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="236 236 552 552" fill="currentColor"><circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="currentColor" stroke-width="44"/>`;
    for (const [dx, h] of bars) g += `<rect x="${C + dx - 29}" y="${C - h / 2}" width="58" height="${h}" rx="29"/>`;
    for (const a of crew) { const [x, y] = at(a); g += `<circle cx="${x}" cy="${y}" r="58" fill="var(--logo-cut, #000)"/><circle cx="${x}" cy="${y}" r="40"/>`; }
    return g + `</svg>`;
  }
  const mac = variant === "mac";
  const tile = mac ? { x: 100, y: 100, w: 824, r: 186 } : { x: 0, y: 0, w: 1024, r: 0 };
  const defs = `
  <radialGradient id="${id}bg" cx="50%" cy="30%" r="85%"><stop offset="0" stop-color="#3a3a42"/><stop offset=".38" stop-color="#16161a"/><stop offset=".75" stop-color="#060607"/><stop offset="1" stop-color="#000"/></radialGradient>
  <linearGradient id="${id}rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".46"/><stop offset=".45" stop-color="#fff" stop-opacity=".07"/><stop offset="1" stop-color="#fff" stop-opacity=".16"/></linearGradient>
  <radialGradient id="${id}glow" cx="50%" cy="58%" r="52%"><stop offset="0" stop-color="#8e48ff" stop-opacity=".30"/><stop offset=".5" stop-color="#4f7dff" stop-opacity=".07"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  <linearGradient id="${id}bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".44" stop-color="#e8e9ef"/><stop offset=".56" stop-color="#c3c6d0"/><stop offset="1" stop-color="#f2f3f7"/></linearGradient>
  <linearGradient id="${id}ring" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfbfd"/><stop offset=".5" stop-color="#9da1ae"/><stop offset="1" stop-color="#d7d9e1"/></linearGradient>
  <radialGradient id="${id}node" cx="40%" cy="34%" r="70%"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#eceaf6"/><stop offset="1" stop-color="#a9a4c4"/></radialGradient>
  <linearGradient id="${id}sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <filter id="${id}shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="16" stdDeviation="17" flood-color="#000" flood-opacity=".55"/></filter>
  <filter id="${id}lift" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="9" flood-color="#000" flood-opacity=".6"/></filter>
  <filter id="${id}bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>`;
  const { x, y, w, r } = tile;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>${defs}</defs>`;
  s += mac ? `<rect x="${x}" y="${y}" width="${w}" height="${w}" rx="${r}" fill="#000" filter="url(#${id}shadow)"/><rect x="${x}" y="${y}" width="${w}" height="${w}" rx="${r}" fill="url(#${id}rim)"/>` : "";
  const inset = mac ? 5 : 0;
  s += `<rect x="${x + inset}" y="${y + inset}" width="${w - 2 * inset}" height="${w - 2 * inset}" rx="${Math.max(0, r - inset)}" fill="url(#${id}bg)"/>`;
  s += `<circle cx="${C}" cy="548" r="380" fill="url(#${id}glow)"/>`;
  s += `<path d="M${x + inset} ${y + 210} Q${C} ${y + 70} ${x + w - inset} ${y + 210} L${x + w - inset} ${y + r} Q${x + w - inset} ${y + inset} ${x + w - r} ${y + inset} L${x + r} ${y + inset} Q${x + inset} ${y + inset} ${x + inset} ${y + r}Z" fill="url(#${id}sheen)"/>`;
  // a soft bloom under the mark, then the mark itself lifted off the glass
  const k = mac ? 0.86 : 1.06; // the mark's share of the tile: macOS pads its tile, iOS masks a full square
  s += `<g transform="translate(${C} ${C}) scale(${k}) translate(${-C} ${-C})">`;
  s += `<g opacity=".55" filter="url(#${id}bloom)"><circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#b9a4ff" stroke-opacity=".35" stroke-width="40"/></g>`;
  s += `<g filter="url(#${id}lift)"><circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="url(#${id}ring)" stroke-width="36"/>`;
  for (const [dx, h] of bars) s += `<rect x="${C + dx - 29}" y="${C - h / 2}" width="58" height="${h}" rx="29" fill="url(#${id}bar)"/>`;
  for (const a of crew) { const [cx, cy] = at(a); s += `<circle cx="${cx}" cy="${cy}" r="56" fill="#09090b"/><circle cx="${cx}" cy="${cy}" r="42" fill="url(#${id}node)"/><circle cx="${cx - 13}" cy="${cy - 15}" r="11" fill="#fff" opacity=".9"/>`; }
  return s + `</g></g></svg>`;
}
