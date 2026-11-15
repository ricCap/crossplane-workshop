// Inline-code counterpart of src/theme/CodeBlock: fills `<your pair ID>` and
// `<your registry>` in prose like "yours is `<your pair ID>-my-platform`".
import React from 'react';
import CodeInline from '@theme-original/CodeInline';
import { fillPlaceholders, useWorkshopValues } from '@site/src/lib/workshopValues';

export default function CodeInlineWrapper({ children, ...props }) {
  const values = useWorkshopValues();
  if (typeof children !== 'string') return <CodeInline {...props}>{children}</CodeInline>;
  return <CodeInline {...props}>{fillPlaceholders(children, values)}</CodeInline>;
}
