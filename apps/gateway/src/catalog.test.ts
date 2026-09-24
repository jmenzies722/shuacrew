import { describe, expect, it } from "vitest";
import { catalogServer } from "./catalog.js";

describe("marketplace cards", () => {
  it("installs an npm server as a local command", () => {
    expect(
      catalogServer({
        name: "io.github.example/files",
        title: "Files",
        description: "Read a repo.",
        packages: [{ registryType: "npm", identifier: "@example/files" }],
      }),
    ).toMatchObject({ kind: "command", command: "npx", args: ["-y", "@example/files"], auth: "none" });
  });

  it("connects a remote server by sign-in, and skips one that wants a pasted key", () => {
    expect(catalogServer({ name: "com.example/mail", remotes: [{ url: "https://mail.example/mcp" }] })).toMatchObject({ kind: "remote", auth: "oauth" });
    expect(catalogServer({ name: "ai.smithery/x", remotes: [{ url: "https://server.smithery.ai/x", headers: [{ isSecret: true, value: "Bearer {key}" }] }] })).toBeNull();
  });
});
