/**
 * Exact places in System Settings. Each page opens directly by its link (x-apple.systempreferences:<id>), so "take me
 * to Night Shift" lands on Displays instead of a guided hunt. The ids are the pane extensions installed on this Mac
 * (read from /System/Library/ExtensionKit on macOS 27); the words are how people actually ask.
 */
export interface Pane { key: string; name: string; id: string; anchor?: string; words: string[] }

const P = (key: string, name: string, id: string, words: string[], anchor?: string): Pane => ({ key, name, id: `com.apple.${id}`, words, ...(anchor ? { anchor } : {}) });
export const PANES: Pane[] = [
  P("wifi", "Wi-Fi", "wifi-settings-extension", ["wi-fi", "wifi", "wireless", "wi fi", "internet connection"]),
  P("bluetooth", "Bluetooth", "BluetoothSettings", ["bluetooth", "airpods", "pair", "pairing"]),
  P("network", "Network", "Network-Settings.extension", ["network", "ethernet", "firewall", "dns", "proxy"]),
  P("vpn", "VPN", "NetworkExtensionSettingsUI.NESettingsUIExtension", ["vpn"]),
  P("notifications", "Notifications", "Notifications-Settings.extension", ["notifications", "notification", "alerts", "banners"]),
  P("sound", "Sound", "Sound-Settings.extension", ["sound", "volume", "speakers", "output device", "input device", "alert sound", "microphone level"]),
  P("focus", "Focus", "Focus-Settings.extension", ["focus", "do not disturb", "dnd"]),
  P("screen-time", "Screen Time", "Screen-Time-Settings.extension", ["screen time", "app limits", "downtime"]),
  P("general", "General", "systempreferences.GeneralSettings", ["general", "about this mac", "about"]),
  P("appearance", "Appearance", "Appearance-Settings.extension", ["appearance", "dark mode", "light mode", "accent colour", "accent color", "scroll bars"]),
  P("accessibility", "Accessibility", "Accessibility-Settings.extension", ["accessibility", "voiceover", "zoom", "reduce motion", "larger text", "cursor size"]),
  P("control-center", "Control Center", "ControlCenter-Settings.extension", ["control center", "control centre", "menu bar", "menu bar icons"]),
  P("siri", "Apple Intelligence & Siri", "Siri-Settings.extension", ["siri", "apple intelligence", "hey siri"]),
  P("spotlight", "Spotlight", "Spotlight-Settings.extension", ["spotlight", "search results"]),
  P("desktop", "Desktop & Dock", "Desktop-Settings.extension", ["desktop & dock", "desktop and dock", "dock", "hot corners", "stage manager", "mission control", "widgets on desktop"]),
  P("displays", "Displays", "Displays-Settings.extension", ["display", "displays", "night shift", "resolution", "brightness", "true tone", "refresh rate", "external monitor", "monitor"]),
  P("wallpaper", "Wallpaper", "Wallpaper-Settings.extension", ["wallpaper", "background image", "desktop picture", "desktop background"]),
  P("battery", "Battery", "Battery-Settings.extension", ["battery", "low power mode", "energy", "battery health"]),
  P("lock-screen", "Lock Screen", "Lock-Screen-Settings.extension", ["lock screen", "screen saver", "turn display off", "require password"]),
  P("touch-id", "Touch ID & Password", "Touch-ID-Settings.extension", ["touch id", "fingerprint", "login password", "change password"]),
  P("users", "Users & Groups", "Users-Groups-Settings.extension", ["users", "groups", "user account", "guest user"]),
  P("internet-accounts", "Internet Accounts", "Internet-Accounts-Settings.extension", ["internet accounts", "mail accounts", "add account", "google account"]),
  P("game-center", "Game Center", "Game-Center-Settings.extension", ["game center"]),
  P("wallet", "Wallet & Apple Pay", "WalletSettingsExtension", ["wallet", "apple pay", "cards"]),
  P("keyboard", "Keyboard", "Keyboard-Settings.extension", ["keyboard", "keyboard shortcuts", "shortcuts", "dictation", "input sources", "key repeat", "globe key", "fn key"]),
  P("trackpad", "Trackpad", "Trackpad-Settings.extension", ["trackpad", "tap to click", "gestures", "scroll direction"]),
  P("mouse", "Mouse", "Mouse-Settings.extension", ["mouse", "tracking speed"]),
  P("printers", "Printers & Scanners", "Print-Scan-Settings.extension", ["printer", "printers", "scanner", "scanners"]),
  P("software-update", "Software Update", "Software-Update-Settings.extension", ["software update", "update macos", "macos update", "system update"]),
  P("storage", "Storage", "settings.Storage", ["storage", "disk space", "free up space", "manage storage"]),
  P("airdrop", "AirDrop & Handoff", "AirDrop-Handoff-Settings.extension", ["airdrop", "handoff", "airplay receiver"]),
  P("login-items", "Login Items & Extensions", "LoginItems-Settings.extension", ["login items", "open at login", "startup apps", "background items"]),
  P("date-time", "Date & Time", "Date-Time-Settings.extension", ["date", "time", "time zone", "24-hour", "clock"]),
  P("language", "Language & Region", "Localization-Settings.extension", ["language", "region", "date format", "temperature units"]),
  P("sharing", "Sharing", "Sharing-Settings.extension", ["sharing", "screen sharing", "file sharing", "remote login", "computer name", "remote management"]),
  P("time-machine", "Time Machine", "Time-Machine-Settings.extension", ["time machine", "backup", "backups"]),
  P("startup-disk", "Startup Disk", "Startup-Disk-Settings.extension", ["startup disk"]),
  P("transfer-reset", "Transfer or Reset", "Transfer-Reset-Settings.extension", ["transfer or reset", "erase all content", "factory reset"]),
  P("apple-account", "Apple Account & iCloud", "systempreferences.AppleIDSettings", ["apple account", "apple id", "icloud", "icloud drive", "find my"]),
  P("family", "Family", "Family-Settings.extension", ["family", "family sharing"]),
  P("headphones", "Headphones", "HeadphoneSettings", ["headphones", "airpods settings", "noise cancellation"]),
  P("privacy", "Privacy & Security", "settings.PrivacySecurity.extension", ["privacy", "security", "privacy & security", "filevault", "gatekeeper"]),
  ...[
    ["screen-recording", "Screen & System Audio Recording", "Privacy_ScreenCapture", ["screen recording", "screen capture", "screen & system audio"]],
    ["accessibility-access", "Accessibility access", "Privacy_Accessibility", ["accessibility access", "accessibility permission", "control my computer"]],
    ["full-disk-access", "Full Disk Access", "Privacy_AllFiles", ["full disk access", "disk access", "access all files"]],
    ["microphone", "Microphone access", "Privacy_Microphone", ["microphone access", "microphone permission", "mic access", "microphone"]],
    ["camera", "Camera access", "Privacy_Camera", ["camera access", "camera permission", "camera"]],
    ["automation", "Automation", "Privacy_Automation", ["automation", "apple events", "control other apps"]],
    ["location", "Location Services", "Privacy_LocationServices", ["location services", "location access", "location"]],
    ["contacts-access", "Contacts access", "Privacy_Contacts", ["contacts access", "contacts permission"]],
    ["calendars-access", "Calendars access", "Privacy_Calendars", ["calendar access", "calendars access", "calendar permission"]],
    ["reminders-access", "Reminders access", "Privacy_Reminders", ["reminders access", "reminders permission"]],
    ["photos-access", "Photos access", "Privacy_Photos", ["photos access", "photos permission"]],
  ].map(([key, name, anchor, words]) => P(key as string, name as string, "settings.PrivacySecurity.extension", words as string[], anchor as string)),
];

/** The link that opens a page directly. */
export const paneURL = (p: Pane) => `x-apple.systempreferences:${p.id}${p.anchor ? `?${p.anchor}` : ""}`;

/** The page a request is about: the longest matching phrase wins ("screen recording" over "screen"), whole words only. */
export function findPane(text: string): Pane | null {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9&+\-\s]/g, " ").replace(/\s+/g, " ")} `;
  let best: { p: Pane; len: number } | null = null;
  for (const p of PANES) for (const w of [p.key.replace(/-/g, " "), ...p.words]) {
    if (t.includes(` ${w} `) && (!best || w.length > best.len)) best = { p, len: w.length };
  }
  return best?.p ?? null;
}
