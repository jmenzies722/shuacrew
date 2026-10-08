/**
 * Shua's eyes on the real world. When you show it something — a part, your wiring, a robot, what's in your hand — the
 * notch takes one picture with the Mac's camera (built in, or your iPhone as a Continuity Camera) and attaches it the
 * way it attaches a screenshot. Only when you ask: the camera is on for about a second, then off.
 */

const THING = "(?:hands?|desk|bench|board|breadboard|robot|build|project|wiring|circuit|setup|drawing|sketch|solder(?:ing)?|joints?|pcb|arduino|raspberry pi|esp32|motors?|servos?|sensors?|parts?|kit|printer|print|chassis|connections?|assembly|plants?)";
const CAMERA = new RegExp(`\\b(?:camera|webcam|(?:look|looking) at (?:this|these|that|it|what i'?m (?:holding|showing)|(?:my|the|this) ${THING})|(?:what|which)(?:'s| is| are)? (?:this|these|that) (?:thing|part|component|chip|board|sensor|motor|tool|connector|cable|plant|bug)s?|what am i (?:holding|showing)|(?:can|do) you see (?:this|these|me|it|what i'?m (?:holding|showing))|i'?m (?:holding|showing you)|in my hands?|in front of me|on my (?:desk|bench|table)|(?:check|look over|inspect|review) (?:my|this|the) ${THING})\\b`, "i");
const SCREENISH = /\b(screen|window|tab|page|browser|editor|terminal|code)\b/i;

/** Asked to look at something in the real world (not the screen). "Don't use the camera" is respected. */
export function needsCamera(q: string): boolean {
  if (/\b(?:don'?t|do not|without|never)\b[^.!?]*\b(?:camera|webcam)\b/i.test(q)) return false;
  if (!CAMERA.test(q)) return false;
  return /\b(?:camera|webcam)\b/i.test(q) || !SCREENISH.test(q);
}

const BUILD = /\b(robots?|robotics|arduino|raspberry pi|esp32|esp8266|microcontroller|breadboard|solder(?:ing)?|servos?|stepper|motor driver|h-bridge|dc motors?|wiring|circuits?|pcb|resistors?|capacitors?|transistors?|leds?|sensors?|lipo|battery pack|3d print(?:er|ed|ing)?|chassis|gearbox|actuators?|multimeter|oscilloscope)\b/i;
/** Building something physical: electronics, robotics, making. */
export const building = (q: string) => BUILD.test(q);

export const CAMERA_NOTE = "CAMERA (just now): the attached photo was taken with their camera — the real world in front of them, not the screen. Describe what you actually see. If something is blurry, cut off or too dark to be sure, say so and ask them to hold it closer, steadier or in better light. Never guess at labels, pin numbers or values you can't read.";

export const BUILD_NOTE = "BUILDING SOMETHING PHYSICAL (electronics, robotics, making): be the bench mentor. Be exact — pin names and numbers, wire colours, polarity, voltages, part numbers. Safety first: power off before rewiring, check polarity before power, care with LiPo batteries and mains, eye protection for cutting and soldering. One step at a time, then ask them to show you the result (\"show me when it's wired\"). When something's wrong, say exactly what and how to fix it.";

/** Why the camera couldn't be used, in words you can act on. */
export function cameraProblem(e: unknown): string {
  const name = (e as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Shua can't use the camera yet: reopen ShuaCrew once (it needs the update), and allow Camera for ShuaCrew in System Settings → Privacy & Security.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "There's no camera to use: connect one, or bring your iPhone near the Mac to use it as a Continuity Camera.";
  if (name === "NotReadableError") return "Another app is using the camera. Close it and ask again.";
  return `The camera didn't give a picture${(e as Error)?.message ? `: ${(e as Error).message}` : "."}`;
}

/** One picture from the Mac's camera, as a JPEG file ready to attach (the camera is on for about a second). */
export async function cameraShot(): Promise<File> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  try {
    const video = document.createElement("video");
    video.muted = true; video.playsInline = true; video.srcObject = stream;
    await video.play();
    await new Promise((r) => setTimeout(r, 700)); // let exposure and focus settle
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("no frame");
    return new File([blob], "mac-camera.jpg", { type: "image/jpeg" });
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
