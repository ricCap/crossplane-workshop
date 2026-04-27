// @ts-check
'use strict';

// Replaces `{{REF}}` inside fenced and inline code blocks with the git
// ref the page should pin to:
//
//   - Pages under `versioned_docs/version-<ref>/` → `<ref>` (e.g. `v0.2.0`).
//   - Everything else → `process.env.WORKSHOP_REF` if set, else `main`.
//
// This lets a single MDX source pin URLs to the right tag once docs are
// versioned, without touching the fenced-block ergonomics.

const REF_PLACEHOLDER = /\{\{REF\}\}/g;

function refForFile(vfilePath) {
  if (vfilePath) {
    const m = vfilePath.match(/versioned_docs[\/\\]version-([^\/\\]+)[\/\\]/);
    if (m) return m[1];
  }
  return process.env.WORKSHOP_REF || 'main';
}

function replaceRefPlugin() {
  return (tree, file) => {
    const ref = refForFile(file && file.path);
    const stack = [tree];
    while (stack.length) {
      const node = stack.pop();
      if (!node) continue;
      if ((node.type === 'code' || node.type === 'inlineCode') && typeof node.value === 'string') {
        node.value = node.value.replace(REF_PLACEHOLDER, ref);
      }
      if (Array.isArray(node.children)) {
        for (const c of node.children) stack.push(c);
      }
    }
  };
}

module.exports = replaceRefPlugin;
