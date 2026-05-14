import React from 'react';
import Layout from '@theme-original/DocItem/Layout';
import ModuleProgress from '@site/src/components/ModuleProgress';

// Swizzle wrapper around the default DocItem layout. We render the
// per-page progress strip above the doc body on every workshop page so
// participants can see "stage X/N · next: …" without having to click
// each <ValidateCheck /> chip. ModuleProgress is no-op when no pair ID
// is set, so non-workshop pages and pre-setup navigation stay clean.
export default function LayoutWrapper(props) {
  return (
    <>
      <ModuleProgress />
      <Layout {...props} />
    </>
  );
}
