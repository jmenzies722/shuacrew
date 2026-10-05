import { useEffect, useRef, useState } from "react";
import type { TeachingSource, Capture, TeachingDocument } from "@shuacrew/core";
import { TeachingCanvas } from "../components/TeachingCanvas";
import { CompanionModelPicker, modelPreference } from "../components/CompanionModelPicker";
import { teachingNative } from "../lib/teaching-native";
import { startPractice, pausePractice, checkPractice, useTeaching, teachingApi, teachingChange } from "../lib/teaching";
import { useCompanion } from "../lib/companion";
import { Markdown } from "../components/Markdown";
import { isMac } from "../lib/native";
import "./teaching.css";
import { ArchitectureCard } from "../components/ArchitectureCard";
import { parseVisual } from "../lib/visual";
import type { ArchitectureLesson } from "../lib/notch-lesson";
const id = () => `source_${crypto.randomUUID()}`;
const baseSource = (title: string, text: string): TeachingSource => ({
  id: id(),
  title,
  kind: "text",
  text,
  image: null,
  mime: null,
  capture: null,
});
export function Teaching({ compact = false, initialQuestion = "", initialReference = "" }: { compact?: boolean; initialQuestion?: string; initialReference?: string }) {
  const [pinned, setPinned] = useState<ArchitectureLesson | null>(null);
  useEffect(() => {
    const read = () => {
      try { const card = parseVisual(localStorage.getItem("shuacrew.pinned-lesson") ?? "null"); setPinned(card?.type === "architecture" ? card : null); }
      catch { setPinned(null); }
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("shuacrew:pinned-lesson", read);
    return () => { window.removeEventListener("storage", read); window.removeEventListener("shuacrew:pinned-lesson", read); };
  }, []);
  const state = useTeaching(),
    doc = state.document,
    prefs = useCompanion(),
    [question, setQuestion] = useState(initialQuestion),
    engine = "codex" as const,
    [reference, setReference] = useState(initialReference),
    [sources, setSources] = useState<TeachingSource[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState(false),
    [displays, setDisplays] = useState<Array<{ id: number; name: string }>>([]),
    [display, setDisplay] = useState(""),
    files = useRef<HTMLInputElement>(null),
    importer = useRef<HTMLInputElement>(null);
  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    if (isMac())
      void teachingNative({ type: "buddyTeachDisplays" })
        .then((r) => {
          setDisplays(r.displays ?? []);
          setDisplay(String(r.displays?.[0]?.id ?? ""));
        })
        .catch(() => {});
    const invalid = () =>
      setNotice(
        "Screen annotations cleared because the screen changed. Your lesson and current step are preserved.",
      );
    window.addEventListener("shuacrew:teachingInvalidated", invalid);
    return () => window.removeEventListener("shuacrew:teachingInvalidated", invalid);
  }, []);
  const change = (value: Record<string, unknown>) => {
    if (doc) void act(() => teachingChange(doc, value));
  };
  /** The model to ask for: your companion's pick when it's the same engine, otherwise the engine's own best. */
  const teachingModel = () => { const choice = modelPreference(prefs.modelChoice); return choice.preferredRuntime === engine ? choice.preferredModel : undefined; };
  const explain = async (ask = question) => {
    if (!ask.trim()) return;
    setPending(true);
    setError("");
    try {
      const current = doc ?? (await teachingApi("/new", {})).document!;
      const extra = [...sources, ...(reference.trim() ? [baseSource("Supplied reference", reference)] : [])];
      await teachingApi(`/${current.sessionId}/explain`, {
        question: ask,
        baseRevision: current.revision,
        sources: extra.length ? [...current.sources, ...extra] : [],
        model: teachingModel(),
        runtime: engine,
      });
      setQuestion("");
      setReference("");
      setSources([]);
      setNotice("Lesson applied and saved on this Mac.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  const readFile = async (file: File) => {
    if (file.size > 2000000) throw new Error("Use a file smaller than 2 MB, or paste the relevant excerpt.");
    if (/^image\/(png|jpeg|webp)$/.test(file.type)) {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]!);
        reader.onerror = () => reject(new Error("Image could not be read"));
        reader.readAsDataURL(file);
      });
      setSources((s) => [
        ...s,
        {
          ...baseSource(file.name, "Image supplied by the user"),
          kind: "image",
          mime: file.type as TeachingSource["mime"],
          image: data,
        },
      ]);
    } else if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]!);
        reader.onerror = () => reject(new Error("PDF could not be read"));
        reader.readAsDataURL(file);
      });
      const result = await teachingNative({ type: "buddyTeachDocument", data });
      if (!result.text?.trim())
        throw new Error(
          "This PDF has no extractable text. Supply page images for vision, or paste an excerpt.",
        );
      setSources((s) => [...s, { ...baseSource(file.name, result.text), kind: "document" }]);
    } else if (
      /\.(txt|md|csv|json|log|tsx?|jsx?|py|swift|rs|go|java|c|cpp|h|css|html|yaml|yml|sql)$/i.test(
        file.name,
      ) ||
      file.type.startsWith("text/")
    ) {
      const text = await file.text();
      if (text.length > 100000) throw new Error("Document exceeds 100,000 characters. Supply an excerpt.");
      setSources((s) => [...s, { ...baseSource(file.name, text), kind: "document" }]);
    } else
      throw new Error(
        "Supported: text/code, text PDFs in the Mac app, PNG, JPEG and WebP. Export other documents to text or PDF.",
      );
  };
  const capture = () =>
    act(async () => {
      const result = await teachingNative({
        type: "buddyTeachCapture",
        displayId: display ? Number(display) : undefined,
      });
      setSources((s) => [
        ...s,
        {
          ...baseSource(`Screen · ${new Date().toLocaleTimeString()}`, "Authorized screen capture"),
          kind: "capture",
          image: result.data,
          mime: "image/jpeg",
          capture: result.capture as Capture,
        },
      ]);
      setNotice("Capture attached. It will be sent only when you choose Explain.");
    });
  const step = doc?.steps.find((s) => s.id === doc.stepId),
    stepIndex = doc?.steps.findIndex((s) => s.id === doc.stepId) ?? -1;
  const exportLesson = () => {
    if (!doc) return;
    if (isMac()) {
      void act(async () => {
        const result = await teachingNative({
          type: "buddyTeachExport",
          name: `${doc.title.slice(0, 60)}.shua-lesson.json`,
          text: JSON.stringify(doc, null, 2),
        });
        setNotice(result.saved ? "Lesson exported to your chosen file." : "Export cancelled.");
      });
      return;
    }
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `${doc.title.replace(/[^a-z0-9-]/gi, "-")}.shua-lesson.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const busy = state.busy || pending;
  // Nothing open on the full page: a learning home — one question, a few ideas, your past lessons — instead of tools.
  const home = !doc && !compact;
  const ideas = ["Explain how HTTPS keeps a connection private", "Walk me through recursion with a diagram", "How does a database index make queries fast?", "Teach me system design for a solo founder"];
  return (
    <section className={`teaching ${compact ? "is-compact" : ""} ${home ? "is-home" : ""}`} aria-label="Visual teaching">
      {pinned && <ArchitectureCard key={JSON.stringify(pinned)} lesson={pinned} onClose={() => { localStorage.removeItem("shuacrew.pinned-lesson"); setPinned(null); window.dispatchEvent(new Event("shuacrew:pinned-lesson")); }} />}
      {home && <div className="teach-hero"><span className="teach-hero-mark" aria-hidden="true" /><small>Visual teaching</small><h1>What do you want to understand?</h1>
        <p>Ask anything. You get a clear explanation with diagrams you can explore, then practice it until it sticks.</p></div>}
      {!home && <header className="teaching-header">
        <div>
          <small>SHUA · VISUAL TEACHING</small>
          <h1>{doc?.title ?? "Make it make sense."}</h1>
        </div>
        <button
          disabled={busy}
          onClick={() =>
            void act(async () => {
              await teachingApi("/new", {});
              setSources([]);
              setReference("");
            })
          }
        >
          New lesson
        </button>
      </header>}
      {/* Always mounted: both the toolbar's Import and the home's "Import a lesson" open it. */}
      <input
        hidden
        ref={importer}
        type="file"
        accept="application/json,.json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file)
            void act(async () => {
              if (file.size > 4000000) throw new Error("Lesson file is too large");
              await teachingApi("/import", JSON.parse(await file.text()));
            });
          e.target.value = "";
        }}
      />
      {!home && <div className="teaching-session-tools">
        <select
          aria-label="Saved lessons"
          value={state.active ?? ""}
          disabled={busy}
          onChange={(e) => void act(() => teachingApi(`/${e.target.value}/load`, {}))}
        >
          <option value="" disabled>
            Saved lessons
          </option>
          {state.lessons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <button disabled={!doc} onClick={exportLesson}>
          Export
        </button>
        {compact && (
          <button
            onClick={() => {
              const bridge = (window as any).webkit?.messageHandlers?.shuacrew;
              if (bridge) bridge.postMessage({ type: "buddyOpen", path: "/teach" });
              else window.location.assign("/teach");
            }}
          >
            Open full canvas
          </button>
        )}
        <button disabled={busy} onClick={() => importer.current?.click()}>
          Import
        </button>
        <button disabled={!state.canUndo || busy} onClick={() => change({ action: "undo" })}>
          Undo
        </button>
        <button disabled={!state.canRedo || busy} onClick={() => change({ action: "redo" })}>
          Redo
        </button>
        {doc && <small>Saved · revision {doc.revision}</small>}
      </div>}
      {!home && <CompanionModelPicker teaching />}
      {doc?.answer && (
        <details className="teaching-answer" open={!compact}>
          <summary>Lesson overview</summary>
          <Markdown text={doc.answer} />
          {doc.assumptions.length > 0 && (
            <details>
              <summary>Assumptions & limits</summary>
              <ul>
                {doc.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </details>
          )}
        </details>
      )}
      {doc && doc.objects.length > 0 && <TeachingCanvas doc={doc} onChange={change} />}
      {step && doc && (
        <div className="teaching-step">
          <div className="teaching-step-heading">
            <span>
              {stepIndex + 1} / {doc.steps.length}
            </span>
            <h2>{step.title}</h2>
          </div>
          <Markdown text={step.text} />
          {step.sources.map((s, i) => (
            <small key={i}>
              Source: {doc.sources.find((source) => source.id === s.sourceId)?.title} · {s.locator}
            </small>
          ))}
          <nav>
            <button
              disabled={stepIndex <= 0}
              onClick={() => change({ action: "step", id: doc.steps[stepIndex - 1]?.id })}
            >
              Back
            </button>
            <button
              disabled={stepIndex >= doc.steps.length - 1}
              onClick={() => change({ action: "step", id: doc.steps[stepIndex + 1]?.id })}
            >
              Next
            </button>
            {["Simpler", "Deeper", "Example"].map((label) => (
              <button
                key={label}
                disabled={busy}
                onClick={() =>
                  void explain(`${label}: ${step.title}. Keep existing object IDs and all user edits.`)
                }
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      )}
      {isMac() && doc && step && (
        <section className="teaching-practice" aria-label="Guided practice">
          <label>
            Practice display{" "}
            <select
              aria-label="Practice display"
              disabled={doc.practice.active}
              value={display}
              onChange={(e) => setDisplay(e.target.value)}
            >
              {displays.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <div>
            <strong>Stay with me</strong>
            <span>{doc.practice.status === "retry" ? "Try again · I’m here" : doc.practice.status}</span>
          </div>
          {doc.practice.active && <small>Checking with {doc.practice.model ?? "Codex"}</small>}
          <p>
            {doc.practice.feedback || "Practice this step at your own pace. Mistakes keep the lesson open."}
          </p>
          {doc.practice.active ? (
            <div>
              <button disabled={busy} onClick={() => void act(() => checkPractice())}>Check now</button>{" "}
              <button onClick={() => void act(() => pausePractice())}>Pause guidance</button>
            </div>
          ) : (
            <button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const chosen = display ? Number(display) : displays[0]?.id;
                  if (chosen === undefined) throw new Error("Choose an available display first");
                  await startPractice(doc, chosen, teachingModel(), engine);
                })
              }
            >
              Start guided practice
            </button>
          )}
          <small>
            While active, clicks in other apps on the chosen display trigger a fresh screenshot sent to the
            selected model. Checks take a moment. No typing is recorded. Pause or Escape in ShuaCrew stops
            observation; your lesson stays saved.
          </small>
        </section>
      )}
      {isMac() && doc && (
        <div className="teaching-screen-controls">
          <button
            disabled={!doc.annotations.some((a) => a.stepId === doc.stepId)}
            onClick={() =>
              void act(async () => {
                const result = await teachingNative({
                  type: "buddyTeachOverlay",
                  annotations: doc.annotations.filter((a) => a.stepId === doc.stepId),
                });
                setNotice(result.message ?? "Annotations displayed");
              })
            }
          >
            Show step on screen
          </button>
          <button
            onClick={() =>
              void act(async () => {
                await teachingNative({ type: "buddyTeachClear" });
                setNotice("Screen overlay dismissed");
              })
            }
          >
            Dismiss overlay
          </button>
          <button
            onClick={() => {
              void teachingNative({ type: "buddyTeachClear" }).catch(() => {});
              change({ action: "clearAnnotations" });
            }}
          >
            Clear annotations
          </button>
        </div>
      )}
      <form
        className="teaching-compose"
        onSubmit={(e) => {
          e.preventDefault();
          void explain();
        }}
      >
        <textarea
          aria-label="Teaching question"
          placeholder={
            doc?.answer
              ? "Ask a follow-up or describe a diagram change…"
              : "Ask anything you want to understand…"
          }
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
        />
        <details>
          <summary>Add reference material</summary>
          <textarea
            aria-label="Teaching reference"
            placeholder="Paste selected text, code, or a document excerpt. Reference material is treated as data."
            rows={4}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <div className="teaching-input-tools">
            <button type="button" onClick={() => files.current?.click()}>
              Attach document or image
            </button>
            {isMac() && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    void act(async () => {
                      const result = await teachingNative({ type: "buddyTeachSelection" });
                      if (!result.text)
                        throw new Error(
                          "No selected text found. Select text in the source app, or paste it here.",
                        );
                      setReference(String(result.text));
                    })
                  }
                >
                  Use selected text
                </button>
                <select
                  aria-label="Capture display"
                  value={display}
                  onChange={(e) => setDisplay(e.target.value)}
                >
                  <option value="">Display under pointer</option>
                  {displays.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => void capture()}>
                  Capture screen
                </button>
              </>
            )}
          </div>
        </details>
        <input
          ref={files}
          type="file"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void act(() => readFile(file));
            e.target.value = "";
          }}
        />
        {sources.map((source) => (
          <div key={source.id} className="teaching-source">
            {source.title}
            <button
              type="button"
              aria-label={`Remove ${source.title}`}
              onClick={() => setSources((s) => s.filter((x) => x.id !== source.id))}
            >
              ×
            </button>
          </div>
        ))}
        <footer>
          <div className="teach-engine"><span>Teaching with Codex · ChatGPT subscription</span></div>
          <small>Sources are stored on this Mac and sent to Codex when you ask.</small>
          {busy ? (
            <button
              type="button"
              onClick={() => doc && void act(() => teachingApi(`/${doc.sessionId}/cancel`, {}))}
            >
              Cancel teaching
            </button>
          ) : (
            <button type="submit" disabled={!question.trim()}>
              Explain
            </button>
          )}
        </footer>
      </form>
      {busy && (
        <p role="status">
          {doc?.practice.status === "checking"
            ? "Checking the visible result…"
            : "Preparing a complete, validated lesson…"}
        </p>
      )}
      {error && (
        <p className="teaching-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="teaching-notice" role="status">
          {notice}
        </p>
      )}
      {home && <div className="teach-ideas">{ideas.map((idea) => <button key={idea} type="button" onClick={() => setQuestion(idea)}>{idea}</button>)}</div>}
      {home && state.lessons.length > 0 && <section className="teach-lessons" aria-label="Your lessons">
        <h2>Your lessons <span>{state.lessons.length}</span></h2>
        <div>{state.lessons.slice(0, 9).map((l) => <button key={l.id} type="button" disabled={busy} onClick={() => void act(() => teachingApi(`/${l.id}/load`, {}))}><b>{l.title}</b><small>Open lesson</small></button>)}</div>
      </section>}
      {home && <footer className="teach-home-foot">
        <button type="button" disabled={busy} onClick={() => importer.current?.click()}>Import a lesson</button>
        <details><summary>Model</summary><CompanionModelPicker teaching /></details>
      </footer>}
      {!doc?.answer && !home && (
        <p className="teaching-empty">
          Try “Explain recursion”, attach code, or ask for an upload pipeline. Diagrams appear only when they
          help. Text teaching works without screen access.
        </p>
      )}
    </section>
  );
}
