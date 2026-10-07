import { describe, expect, it } from "vitest";
import { parsePosting, privateAddress, publicUrl, readPosting, textOf } from "./learning-posting.js";

const page = (ld: unknown, body = "") => `<html><head><title>Ignore me</title><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body>${body}</body></html>`;
const desc = "<p>We're hiring a <b>Platform Engineer</b> to run Kubernetes &amp; Terraform at scale.</p><ul><li>5 years with AWS</li><li>Go or Python</li></ul>".repeat(2);

describe("reading a pasted job link", () => {
  it("takes the posting from schema.org JobPosting data", () => {
    const p = parsePosting(page({ "@context": "https://schema.org", "@type": "JobPosting", title: "Platform Engineer", description: desc,
      hiringOrganization: { "@type": "Organization", name: "Acme" }, jobLocation: { address: { addressLocality: "New York", addressRegion: "NY" } } }), new URL("https://boards.greenhouse.io/acme/jobs/1"));
    expect(p).toMatchObject({ company: "Acme", role: "Platform Engineer", location: "New York, NY" });
    expect(p.description).toContain("Kubernetes & Terraform");
    expect(p.description).toContain("• 5 years with AWS");
    expect(p.description).not.toMatch(/<|&amp;/);
  });

  it("falls back to the page's title and the hiring site's company", () => {
    const html = `<html><head><title>Senior Designer - Lumen | Careers</title></head><body><script>track()</script>${desc}</body></html>`;
    const p = parsePosting(html, new URL("https://jobs.lever.co/lumen/abc"));
    expect(p).toMatchObject({ company: "Lumen", role: "Senior Designer" });
    expect(p.description).not.toContain("track()");
  });

  it("never reads this Mac, its network or the tailnet", async () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.2", "172.20.0.1", "169.254.1.1", "100.93.226.100", "::1", "fd00::1", "::ffff:127.0.0.1"]) expect(privateAddress(ip)).toBe(true);
    expect(privateAddress("140.82.112.3")).toBe(false);
    const resolve = async (h: string) => (h === "evil.example" ? ["127.0.0.1"] : ["140.82.112.3"]);
    expect(await publicUrl("http://localhost:7420/api/snapshot", resolve)).toMatch(/this network/);
    expect(await publicUrl("https://josh.tail322510.ts.net/", resolve)).toMatch(/this network/);
    expect(await publicUrl("https://evil.example/job", resolve)).toMatch(/this network/); // a public name pointing home
    expect(await publicUrl("file:///etc/passwd", resolve)).toMatch(/Only web links/);
    expect(await publicUrl("https://jobs.example/1", resolve)).toBeInstanceOf(URL);
  });

  it("checks every redirect, and says plainly when a site won't be read", async () => {
    const resolve = async (h: string) => (h === "inside.example" ? ["192.168.1.9"] : ["140.82.112.3"]);
    const redirectHome = (async () => new Response(null, { status: 302, headers: { location: "https://inside.example/admin" } })) as unknown as typeof fetch;
    expect(await readPosting("https://jobs.example/1", { fetch: redirectHome, resolve })).toMatch(/this network/);
    const blocked = (async () => new Response("no", { status: 999 })) as unknown as typeof fetch;
    expect(await readPosting("https://linkedin.example/jobs/1", { fetch: blocked, resolve })).toMatch(/Paste the description/);
    const ok = (async () => new Response(page({ "@type": "JobPosting", title: "SRE", description: desc, hiringOrganization: { name: "Acme" } }), { status: 200 })) as unknown as typeof fetch;
    expect(await readPosting("https://jobs.example/1", { fetch: ok, resolve })).toMatchObject({ company: "Acme", role: "SRE" });
  });

  it("turns HTML into readable text", () => {
    expect(textOf("<p>One&nbsp;&mdash; two</p><style>x{}</style><p>Three &#38; four</p>")).toBe("One — two\nThree & four");
  });
});
