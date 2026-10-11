import type { EnvDocument } from './model';
import { resolveEntries } from './resolve';
import { commentText } from './serialize';
import type { ViewDocument, ViewEntry } from '../shared/protocol';

/** Plain, JSON-safe projection of the document for the webview. */
export function toViewDocument(doc: EnvDocument): ViewDocument {
  const resolutions = resolveEntries(doc);
  return {
    groups: doc.groups.map((group) => ({
      name: group.name,
      comment: commentText(group.comment),
      entries: group.items.flatMap((item): ViewEntry[] => {
        if (item.type !== 'entry') {
          return [];
        }
        const entry: ViewEntry = {
          key: item.key,
          value: item.value,
          quote: item.quote,
          exported: item.exported,
          comment: commentText(item.comment),
        };
        if (item.inlineComment !== undefined) {
          entry.inlineComment = item.inlineComment;
        }
        if (item.disabled) {
          entry.disabled = true;
        }
        const resolution = resolutions.get(item);
        if (resolution && resolution.references.length > 0) {
          entry.references = resolution.references;
          entry.resolved = resolution.value;
        }
        if (resolution && resolution.diagnostics.length > 0) {
          entry.warnings = resolution.diagnostics.map((d) => d.message);
        }
        return [entry];
      }),
    })),
  };
}
