import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ReactMarkdown from 'react-markdown';
import { BookCitationProvider } from '@/components/assistant/BookCitations';
import { MarkdownText } from '@/components/assistant/MarkdownText';
import { MessageCard } from '@/services/reedy/ui/MessageCard';
import type { ReedyMessage } from '@/services/reedy/store/reedyStore';

const cfi = 'epubcfi(/6/2!/4/2,/1:0,/1:27)';
afterEach(cleanup);

vi.mock('@assistant-ui/react-markdown', () => ({
  MarkdownTextPrimitive: (props: Parameters<typeof ReactMarkdown>[0]) => (
    <ReactMarkdown
      remarkPlugins={props.remarkPlugins}
      components={props.components}
    >{`MVP answer ${cfi}.`}</ReactMarkdown>
  ),
  unstable_memoizeMarkdownComponents: (components: unknown) => components,
  useIsMarkdownCodeBlock: () => false,
}));

const unknownCfi = 'epubcfi(/6/4!/4/2/1:0)';

const message = (text: string): ReedyMessage => ({
  id: 'answer',
  role: 'assistant',
  parts: [
    { type: 'text', text },
    {
      type: 'citation',
      cfi,
      snippet: 'A passage from the book.',
      sectionIndex: 0,
      chapterTitle: 'Chapter one',
    },
  ],
  createdAt: 0,
});

describe('book citations in chat answers', () => {
  it('uses the same retrieved citation navigation in the MVP Markdown renderer', () => {
    const navigate = vi.fn();
    const source = {
      id: 'passage',
      cfi,
      text: 'A passage',
      sectionIndex: 0,
      chapterTitle: 'Chapter one',
    };
    render(
      <BookCitationProvider sources={[source]} onSourceClick={navigate}>
        <MarkdownText />
      </BookCitationProvider>,
    );
    fireEvent.click(screen.getByRole('link', { name: '[1]' }));
    expect(navigate).toHaveBeenCalledWith(source);
  });

  it('recognizes a retrieved CFI written as inline code, keeping other inline code unchanged', () => {
    render(
      <MessageCard
        message={message(`See \`${cfi}\` and \`some code\`.`)}
        onSourceClick={vi.fn()}
      />,
    );
    expect(screen.getByRole('link', { name: '[1]' })).toBeTruthy();
    expect(screen.getByText('some code').tagName).toBe('CODE');
  });

  it('renders a retrieved CFI as a readable inline citation that navigates to its source', () => {
    const navigate = vi.fn();
    render(
      <MessageCard message={message(`This is supported by ${cfi}.`)} onSourceClick={navigate} />,
    );

    const citation = screen.getByRole('link', { name: '[1]' });
    expect(citation.textContent).toBe('[1]');
    expect(citation.getAttribute('title')).toBe('Chapter one');
    fireEvent.click(citation);
    expect(navigate).toHaveBeenCalledWith(cfi);
  });

  it('navigates a Markdown link to a retrieved CFI instead of following its href', () => {
    const navigate = vi.fn();
    render(
      <MessageCard message={message(`See [the meeting](${cfi}).`)} onSourceClick={navigate} />,
    );

    const notPrevented = fireEvent.click(screen.getByRole('link', { name: 'the meeting' }));
    expect(notPrevented).toBe(false);
    expect(navigate).toHaveBeenCalledWith(cfi);
  });

  it('does not follow a Markdown link to an unknown CFI', () => {
    const navigate = vi.fn();
    render(
      <MessageCard message={message(`See [elsewhere](${unknownCfi}).`)} onSourceClick={navigate} />,
    );

    const notPrevented = fireEvent.click(screen.getByRole('link', { name: 'elsewhere' }));
    expect(notPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not turn unknown CFIs or fenced code examples into navigation links', () => {
    const navigate = vi.fn();
    render(
      <MessageCard
        message={message(`Unknown ${unknownCfi}.\n\n\`\`\`text\n${cfi}\n\`\`\``)}
        onSourceClick={navigate}
      />,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(`Unknown ${unknownCfi}.`)).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });
});
