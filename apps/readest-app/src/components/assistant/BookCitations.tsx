'use client';

import { createContext, useContext, useMemo, type ComponentProps, type ReactNode } from 'react';
import remarkGfm from 'remark-gfm';
import type { SourceItem } from '@/services/ai/adapters/reedySourceStore';

type CitationContext = {
  sources: readonly SourceItem[];
  onSourceClick?: (source: SourceItem) => void;
};

const BookCitations = createContext<CitationContext>({ sources: [] });
const citationHref = (index: number) => `#readest-citation-${index + 1}`;

export function BookCitationProvider({
  sources,
  onSourceClick,
  children,
}: CitationContext & { children: ReactNode }) {
  const value = useMemo(() => ({ sources, onSourceClick }), [sources, onSourceClick]);
  return <BookCitations.Provider value={value}>{children}</BookCitations.Provider>;
}

interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
}

// Match only anchors returned by retrieval, without parsing or trusting a CFI
// invented by the model. Working on Markdown nodes leaves links and code intact.
export function useBookCitationPlugins() {
  const { sources } = useContext(BookCitations);
  return useMemo(() => {
    const anchors = sources.flatMap((source, index) =>
      source.cfi ? [{ cfi: source.cfi, index }] : [],
    );
    const citations = () => (tree: MarkdownNode) => {
      const visit = (node: MarkdownNode) => {
        if (!node.children || ['link', 'linkReference', 'code', 'html'].includes(node.type)) return;
        node.children = node.children.flatMap((child): MarkdownNode[] => {
          if (!['text', 'inlineCode'].includes(child.type) || !child.value) {
            visit(child);
            return [child];
          }
          let remaining = child.value;
          const result: MarkdownNode[] = [];
          while (remaining) {
            const match = anchors
              .map((anchor) => ({ ...anchor, offset: remaining.indexOf(anchor.cfi) }))
              .filter((anchor) => anchor.offset >= 0)
              .sort((a, b) => a.offset - b.offset)[0];
            if (!match || (child.type === 'inlineCode' && remaining !== match.cfi)) {
              result.push({ ...child, value: remaining });
              break;
            }
            if (match.offset > 0)
              result.push({ type: 'text', value: remaining.slice(0, match.offset) });
            result.push({
              type: 'link',
              url: citationHref(match.index),
              children: [{ type: 'text', value: `[${match.index + 1}]` }],
            });
            remaining = remaining.slice(match.offset + match.cfi.length);
          }
          return result;
        });
      };
      visit(tree);
    };
    return [remarkGfm, citations];
  }, [sources]);
}

export function BookCitationLink({
  href,
  node: _node,
  ...props
}: ComponentProps<'a'> & { node?: unknown }) {
  const { sources, onSourceClick } = useContext(BookCitations);
  // The model also writes `[label](epubcfi(...))`; as a relative href that
  // would navigate the reader window away, so a CFI link never follows it.
  const source = sources.find(
    (candidate, index) =>
      href === citationHref(index) || (!!candidate.cfi && href === candidate.cfi),
  );
  const isCfi = !!source || !!href?.startsWith('epubcfi(');
  return (
    <a
      {...props}
      href={href}
      target={isCfi ? undefined : props.target}
      rel={isCfi ? undefined : props.rel}
      title={source?.chapterTitle ?? props.title}
      onClick={
        isCfi
          ? (event) => {
              event.preventDefault();
              if (source) onSourceClick?.(source);
            }
          : props.onClick
      }
    />
  );
}
