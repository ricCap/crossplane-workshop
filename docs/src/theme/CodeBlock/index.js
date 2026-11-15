// Wraps the upstream CodeBlock (not ejected) to fill `<your pair ID>` and
// `<your registry>` with the participant's own values, so the copy button
// copies a command that runs as-is. Only plain-string code blocks are
// rewritten; blocks with React children pass through untouched. Until the
// values are read after mount, the block renders exactly as on the server.
import React from 'react';
import CodeBlock from '@theme-original/CodeBlock';
import { fillPlaceholders, useWorkshopValues } from '@site/src/lib/workshopValues';

function toText(children) {
  if (typeof children === 'string') return children;
  if (Array.isArray(children) && children.every((c) => typeof c === 'string')) {
    return children.join('');
  }
  return null;
}

export default function CodeBlockWrapper({ children, ...props }) {
  const values = useWorkshopValues();
  const text = toText(children);
  if (text === null) return <CodeBlock {...props}>{children}</CodeBlock>;
  return <CodeBlock {...props}>{fillPlaceholders(text, values)}</CodeBlock>;
}
