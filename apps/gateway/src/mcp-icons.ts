export interface McpIcon { src: string; mimeType?: "image/png" | "image/jpeg" }
/** Metadata is retained for inspection; it is never embedded or fetched directly by a view. */
export function boundedIcons(input: unknown): McpIcon[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 4).flatMap(icon => {
    if (!icon || typeof icon.src !== "string" || icon.src.length > 4096 || ![undefined, "image/png", "image/jpeg"].includes(icon.mimeType)) return [];
    try {
      const url = new URL(icon.src);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return [];
      return [{ src: url.href, ...(icon.mimeType ? { mimeType: icon.mimeType } : {}) }];
    } catch { return []; }
  });
}
/** Fail closed: no vetted bounded image decoder in this build. Only bundled reviewed assets render.
 * No network, data URI decode, credentials, DNS, redirects or cache exist on this fallback path. */
export async function loadMcpIcon(_serverId: string, _iconIndex: number): Promise<Uint8Array | null> { return null; }
