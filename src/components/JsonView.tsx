import { useMemo } from "react";
import { highlightJson, isFormattableJson, prettyJson } from "../json";

/** Read-only, syntax-highlighted JSON block. */
export function JsonView({ text }: { text: string }) {
  const html = useMemo(() => highlightJson(prettyJson(text)), [text]);
  return <pre className="json-view" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Render JSON with highlighting when applicable, otherwise plain text. */
export function MaybeJson({ text }: { text: string }) {
  if (isFormattableJson(text)) return <JsonView text={text} />;
  return <span>{text}</span>;
}
