/** Stable key for a shopping line (persist checkboxes across minor text tweaks). */
export function normalizeShoppingLineKey(line: string): string {
  return line.trim().toLowerCase().replace(/\s+/g, " ");
}
