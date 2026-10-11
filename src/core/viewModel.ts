import type { EnvDocument } from './model';
import { commentText } from './serialize';
import type { ViewDocument, ViewEntry } from '../shared/protocol';

/** Plain, JSON-safe projection of the document for the webview. */
export function toViewDocument(doc: EnvDocument): ViewDocument {
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
        return [entry];
      }),
    })),
  };
}
