/** Morning, afternoon or evening, by the clock on your Mac: the home screen and the notch say it the same way. */
export function dayGreeting(now = new Date()): string {
  const h = now.getHours();
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
