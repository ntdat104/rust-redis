// Lightweight, dependency-free JSON helpers for the value viewers.

export function tryParseJson(text: string): unknown | undefined {
  const t = text.trim();
  if (t === "") return undefined;
  const first = t[0];
  // Only treat object/array/quoted/number/bool/null as JSON worth formatting.
  if (!"{[\"-0123456789tfn".includes(first)) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

/** True when the text is JSON that benefits from structured formatting. */
export function isFormattableJson(text: string): boolean {
  const parsed = tryParseJson(text);
  return typeof parsed === "object" && parsed !== null;
}

export function prettyJson(text: string): string {
  const parsed = tryParseJson(text);
  return parsed === undefined ? text : JSON.stringify(parsed, null, 2);
}

export function minifyJson(text: string): string {
  const parsed = tryParseJson(text);
  return parsed === undefined ? text : JSON.stringify(parsed);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Wrap JSON tokens in <span> elements for syntax highlighting. */
export function highlightJson(json: string): string {
  const escaped = escapeHtml(json);
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "json-number";
      if (/^"/.test(match)) {
        cls = /:\s*$/.test(match) ? "json-key" : "json-string";
      } else if (match === "true" || match === "false") {
        cls = "json-bool";
      } else if (match === "null") {
        cls = "json-null";
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}
