import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * TiptapEditor — rich-text composer for the author draft surface.
 *
 * Uncontrolled internally: the parent passes `value` as the initial HTML and
 * reacts to `onChange({ body, plainText })`. To swap to a different draft,
 * remount the editor with a `key={draftId}` from the parent rather than
 * mutating `value` mid-edit (resetting content while typing is jarring).
 *
 * `plainText` is derived from `editor.getText()` so the submit-readiness
 * checklist can do char counts (≥300 at submit, per workflows §7.1) without
 * re-parsing HTML.
 */
export interface TiptapEditorProps {
  /** Initial HTML content. Subsequent external changes are ignored — remount with `key` to reset. */
  value?: string;
  placeholder?: string;
  onChange?: (next: { body: string; plainText: string }) => void;
  /** Optional className for the outer card. */
  className?: string;
  /** Read-only mode (e.g. for previews). */
  editable?: boolean;
  /** Accessible label for the editing region. */
  ariaLabel?: string;
}

export function TiptapEditor({
  value = '',
  placeholder = 'Start writing…',
  onChange,
  className,
  editable = true,
  ariaLabel = 'Article body',
}: TiptapEditorProps): JSX.Element {
  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder })],
    content: value,
    editable,
    onUpdate({ editor: ed }) {
      onChange?.({ body: ed.getHTML(), plainText: ed.getText() });
    },
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        class:
          // Hand-rolled prose styling — no @tailwindcss/typography dep. Targets
          // the elements StarterKit produces.
          'min-h-[20rem] px-4 py-3 text-body-base text-ink-primary focus:outline-none ' +
          '[&_p]:my-3 [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:font-display [&_h1]:text-display-md [&_h1]:font-semibold ' +
          '[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-display-sm [&_h2]:font-semibold ' +
          '[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:font-display [&_h3]:text-body-xl [&_h3]:font-semibold ' +
          '[&_ul]:my-3 [&_ul]:pl-6 [&_ul]:list-disc [&_ol]:my-3 [&_ol]:pl-6 [&_ol]:list-decimal ' +
          '[&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-brand-red-500 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-ink-secondary ' +
          '[&_code]:rounded [&_code]:bg-surface-subtle [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-body-sm ' +
          '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface-inverse [&_pre]:px-4 [&_pre]:py-3 [&_pre]:text-ink-inverse ' +
          '[&_p.is-editor-empty]:text-ink-tertiary [&_p.is-editor-empty]:before:content-[attr(data-placeholder)] [&_p.is-editor-empty]:before:float-left [&_p.is-editor-empty]:before:h-0 [&_p.is-editor-empty]:before:pointer-events-none',
      },
    },
  });

  // Keep editable state in sync if the parent toggles it post-mount.
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border border-line bg-surface focus-within:border-brand-red-500 focus-within:ring-2 focus-within:ring-brand-red-500/20',
        className,
      )}
    >
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────

function Toolbar({ editor }: { editor: Editor | null }): JSX.Element {
  // Render placeholder buttons while the editor mounts so layout doesn't jump.
  const disabled = !editor;

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-1 border-b border-line bg-surface-subtle px-2 py-1.5"
    >
      <ToolbarButton
        ariaLabel="Bold"
        active={!!editor?.isActive('bold')}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBold().run()}
        icon={<Bold className="h-4 w-4" aria-hidden="true" />}
      />
      <ToolbarButton
        ariaLabel="Italic"
        active={!!editor?.isActive('italic')}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        icon={<Italic className="h-4 w-4" aria-hidden="true" />}
      />
      <ToolbarButton
        ariaLabel="Strikethrough"
        active={!!editor?.isActive('strike')}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleStrike().run()}
        icon={<Strikethrough className="h-4 w-4" aria-hidden="true" />}
      />

      <Divider />

      <ToolbarButton
        ariaLabel="Heading 1"
        active={!!editor?.isActive('heading', { level: 1 })}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
        icon={<Heading1 className="h-4 w-4" aria-hidden="true" />}
      />
      <ToolbarButton
        ariaLabel="Heading 2"
        active={!!editor?.isActive('heading', { level: 2 })}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        icon={<Heading2 className="h-4 w-4" aria-hidden="true" />}
      />
      <ToolbarButton
        ariaLabel="Heading 3"
        active={!!editor?.isActive('heading', { level: 3 })}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        icon={<Heading3 className="h-4 w-4" aria-hidden="true" />}
      />

      <Divider />

      <ToolbarButton
        ariaLabel="Bullet list"
        active={!!editor?.isActive('bulletList')}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
        icon={<List className="h-4 w-4" aria-hidden="true" />}
      />
      <ToolbarButton
        ariaLabel="Numbered list"
        active={!!editor?.isActive('orderedList')}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        icon={<ListOrdered className="h-4 w-4" aria-hidden="true" />}
      />
      <ToolbarButton
        ariaLabel="Quote"
        active={!!editor?.isActive('blockquote')}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        icon={<Quote className="h-4 w-4" aria-hidden="true" />}
      />
      <ToolbarButton
        ariaLabel="Code block"
        active={!!editor?.isActive('codeBlock')}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
        icon={<Code className="h-4 w-4" aria-hidden="true" />}
      />

      <Divider />

      <ToolbarButton
        ariaLabel="Undo"
        disabled={disabled || !editor?.can().chain().focus().undo().run()}
        onClick={() => editor?.chain().focus().undo().run()}
        icon={<Undo2 className="h-4 w-4" aria-hidden="true" />}
      />
      <ToolbarButton
        ariaLabel="Redo"
        disabled={disabled || !editor?.can().chain().focus().redo().run()}
        onClick={() => editor?.chain().focus().redo().run()}
        icon={<Redo2 className="h-4 w-4" aria-hidden="true" />}
      />
    </div>
  );
}

interface ToolbarButtonProps {
  ariaLabel: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: ReactNode;
}

function ToolbarButton({
  ariaLabel,
  active = false,
  disabled,
  onClick,
  icon,
}: ToolbarButtonProps): JSX.Element {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red-500',
        'disabled:cursor-not-allowed disabled:opacity-40',
        active
          ? 'bg-brand-red-50 text-brand-red-600'
          : 'text-ink-secondary hover:bg-surface hover:text-ink-primary',
      )}
    >
      {icon}
    </button>
  );
}

function Divider(): JSX.Element {
  return <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />;
}
