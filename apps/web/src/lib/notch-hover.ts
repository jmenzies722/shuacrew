export function scheduleNotchClose(close: () => void, dragging: () => boolean) {
  let timer: ReturnType<typeof setTimeout>;
  const attempt = () => {
    if (dragging()) { timer = setTimeout(attempt, 100); return; }
    close();
  };
  timer = setTimeout(attempt, 450);
  return () => clearTimeout(timer);
}
