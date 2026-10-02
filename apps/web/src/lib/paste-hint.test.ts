import { describe, expect, it } from "vitest";
import { pasteTarget } from "./paste-hint";

describe("paste hints", () => {
  it("takes the code block the paste instruction is about, and where it goes", () => {
    expect(pasteTarget("Open Terminal and paste this into Terminal:\n```bash\nbrew install ffmpeg\n```\nThen press Return.")).toEqual({ text: "brew install ffmpeg", where: "Terminal" });
    expect(pasteTarget("```\nexport PATH=\"$HOME/bin:$PATH\"\n```\nPaste that into your .zshrc and save.")).toEqual({ text: 'export PATH="$HOME/bin:$PATH"', where: ".zshrc" });
  });
  it("prefers the block after the instruction when there are several", () => {
    const r = pasteTarget("This is what it does:\n```\nold\n```\nNow paste this:\n```\nnew line\n```");
    expect(r?.text).toBe("new line");
  });
  it("uses inline code or a quoted phrase in the same sentence", () => {
    expect(pasteTarget("Paste `defaults write com.apple.dock autohide -bool true` into Terminal.")?.text).toBe("defaults write com.apple.dock autohide -bool true");
    expect(pasteTarget("Just paste “Quarterly review — moved to Friday” in the subject field.")).toEqual({ text: "Quarterly review — moved to Friday", where: "subject field" });
  });
  it("stays out of the way when nothing is to be pasted", () => {
    expect(pasteTarget("Here's the command:\n```\nls -la\n```")).toBeNull();
    expect(pasteTarget("You can paste images into Notes.")).toBeNull();
  });
});
