'use client';

/**
 * LexOS Contract Redline Editor
 * Tiptap-based rich text editor with track changes
 */

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useEditor, EditorContent, Editor, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import { Mark, mergeAttributes } from '@tiptap/core';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Undo,
  Redo,
  Check,
  X,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Eye,
  EyeOff,
} from 'lucide-react';

// ============================================================================
// CUSTOM MARKS FOR TRACK CHANGES
// ============================================================================

// Insertion mark - text added by AI or user
const Insertion = Mark.create({
  name: 'insertion',
  
  addAttributes() {
    return {
      author: { default: 'ai' },
      timestamp: { default: () => new Date().toISOString() },
      suggestionId: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'ins' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['ins', mergeAttributes(HTMLAttributes, { 
      class: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-b-2 border-green-500' 
    }), 0];
  },
});

// Deletion mark - text removed/struck through
const Deletion = Mark.create({
  name: 'deletion',
  
  addAttributes() {
    return {
      author: { default: 'ai' },
      timestamp: { default: () => new Date().toISOString() },
      suggestionId: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'del' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['del', mergeAttributes(HTMLAttributes, { 
      class: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 line-through' 
    }), 0];
  },
});

// Comment mark - highlighted text with associated comment
const Comment = Mark.create({
  name: 'comment',
  
  addAttributes() {
    return {
      commentId: { default: null },
      author: { default: null },
      content: { default: '' },
      timestamp: { default: () => new Date().toISOString() },
      resolved: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-comment]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 
      'data-comment': HTMLAttributes.commentId,
      class: HTMLAttributes.resolved 
        ? 'bg-gray-100 dark:bg-gray-800' 
        : 'bg-yellow-100 dark:bg-yellow-900/30 border-b-2 border-yellow-500 cursor-pointer' 
    }), 0];
  },
});

// ============================================================================
// TYPES
// ============================================================================

interface Suggestion {
  id: string;
  type: 'insertion' | 'deletion' | 'replacement';
  originalText?: string;
  suggestedText?: string;
  reason: string;
  clauseType?: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  position: { from: number; to: number };
  status: 'pending' | 'accepted' | 'rejected';
}

interface CommentData {
  id: string;
  author: string;
  authorName: string;
  content: string;
  timestamp: string;
  resolved: boolean;
  position: { from: number; to: number };
}

interface RedlineEditorProps {
  documentId: string;
  initialContent: string;
  suggestions?: Suggestion[];
  comments?: CommentData[];
  readOnly?: boolean;
  onSave?: (content: string) => Promise<void>;
  onSuggestionAction?: (suggestionId: string, action: 'accept' | 'reject') => Promise<void>;
  onCommentAdd?: (comment: Omit<CommentData, 'id' | 'timestamp'>) => Promise<void>;
  onCommentResolve?: (commentId: string) => Promise<void>;
  onExport?: (format: 'docx' | 'pdf' | 'html') => Promise<void>;
}

// ============================================================================
// TOOLBAR BUTTON COMPONENT
// ============================================================================

const ToolbarButton: React.FC<{
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}> = ({ onClick, active, disabled, title, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`p-2 rounded transition-colors ${
      active 
        ? 'bg-[#C9A84C] text-[#0A1628]' 
        : 'text-gray-400 hover:text-white hover:bg-gray-700'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    {children}
  </button>
);

const ToolbarDivider: React.FC = () => (
  <div className="w-px h-6 bg-gray-600 mx-1" />
);

// ============================================================================
// SUGGESTION PANEL COMPONENT
// ============================================================================

const SuggestionPanel: React.FC<{
  suggestions: Suggestion[];
  currentIndex: number;
  onNavigate: (direction: 'prev' | 'next') => void;
  onAction: (id: string, action: 'accept' | 'reject') => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
}> = ({ suggestions, currentIndex, onNavigate, onAction, onAcceptAll, onRejectAll }) => {
  const pendingSuggestions = suggestions.filter(s => s.status === 'pending');
  const current = pendingSuggestions[currentIndex];

  if (pendingSuggestions.length === 0) {
    return (
      <div className="bg-[#112240] border border-gray-700 rounded-lg p-4 text-center">
        <Check className="w-8 h-8 text-green-500 mx-auto mb-2" />
        <p className="text-gray-300">All suggestions reviewed</p>
      </div>
    );
  }

  const getRiskColor = (risk?: string) => {
    switch (risk) {
      case 'critical': return 'text-red-500 bg-red-500/10';
      case 'high': return 'text-orange-500 bg-orange-500/10';
      case 'medium': return 'text-yellow-500 bg-yellow-500/10';
      default: return 'text-green-500 bg-green-500/10';
    }
  };

  return (
    <div className="bg-[#112240] border border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
        <span className="text-sm text-gray-400">
          Suggestion {currentIndex + 1} of {pendingSuggestions.length}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onNavigate('prev')}
            disabled={currentIndex === 0}
            className="p-1 rounded hover:bg-gray-700 disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => onNavigate('next')}
            disabled={currentIndex === pendingSuggestions.length - 1}
            className="p-1 rounded hover:bg-gray-700 disabled:opacity-50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Current suggestion */}
      {current && (
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getRiskColor(current.riskLevel)}`}>
              {current.riskLevel?.toUpperCase() || 'INFO'}
            </span>
            {current.clauseType && (
              <span className="px-2 py-0.5 rounded text-xs bg-blue-500/10 text-blue-400">
                {current.clauseType.replace(/_/g, ' ')}
              </span>
            )}
          </div>

          <p className="text-sm text-gray-300">{current.reason}</p>

          {current.type === 'deletion' && current.originalText && (
            <div className="text-sm">
              <span className="text-gray-500">Remove: </span>
              <span className="text-red-400 line-through">{current.originalText}</span>
            </div>
          )}

          {current.type === 'insertion' && current.suggestedText && (
            <div className="text-sm">
              <span className="text-gray-500">Add: </span>
              <span className="text-green-400">{current.suggestedText}</span>
            </div>
          )}

          {current.type === 'replacement' && (
            <div className="text-sm space-y-1">
              <div>
                <span className="text-gray-500">From: </span>
                <span className="text-red-400 line-through">{current.originalText}</span>
              </div>
              <div>
                <span className="text-gray-500">To: </span>
                <span className="text-green-400">{current.suggestedText}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={() => onAction(current.id, 'accept')}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm"
            >
              <Check className="w-4 h-4" />
              Accept
            </button>
            <button
              onClick={() => onAction(current.id, 'reject')}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
            >
              <X className="w-4 h-4" />
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Batch actions */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-gray-700 bg-gray-800/50">
        <button
          onClick={onAcceptAll}
          className="text-xs text-green-400 hover:text-green-300"
        >
          Accept All ({pendingSuggestions.length})
        </button>
        <button
          onClick={onRejectAll}
          className="text-xs text-red-400 hover:text-red-300"
        >
          Reject All
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// COMMENTS PANEL COMPONENT
// ============================================================================

const CommentsPanel: React.FC<{
  comments: CommentData[];
  onResolve: (id: string) => void;
  showResolved: boolean;
  onToggleResolved: () => void;
}> = ({ comments, onResolve, showResolved, onToggleResolved }) => {
  const filteredComments = showResolved 
    ? comments 
    : comments.filter(c => !c.resolved);

  return (
    <div className="bg-[#112240] border border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
        <span className="text-sm font-medium">Comments ({filteredComments.length})</span>
        <button
          onClick={onToggleResolved}
          className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
        >
          {showResolved ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {showResolved ? 'Hide' : 'Show'} resolved
        </button>
      </div>

      <div className="max-h-80 overflow-y-auto">
        {filteredComments.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            No comments
          </div>
        ) : (
          filteredComments.map((comment) => (
            <div 
              key={comment.id} 
              className={`p-3 border-b border-gray-700 last:border-0 ${
                comment.resolved ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start justify-between mb-1">
                <span className="text-sm font-medium text-[#C9A84C]">
                  {comment.authorName}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(comment.timestamp).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-gray-300 mb-2">{comment.content}</p>
              {!comment.resolved && (
                <button
                  onClick={() => onResolve(comment.id)}
                  className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  Resolve
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN EDITOR COMPONENT
// ============================================================================

export const RedlineEditor: React.FC<RedlineEditorProps> = ({
  documentId,
  initialContent,
  suggestions = [],
  comments = [],
  readOnly = false,
  onSave,
  onSuggestionAction,
  onCommentAdd,
  onCommentResolve,
  onExport,
}) => {
  const [localSuggestions, setLocalSuggestions] = useState<Suggestion[]>(suggestions);
  const [localComments, setLocalComments] = useState<CommentData[]>(comments);
  const [currentSuggestionIndex, setCurrentSuggestionIndex] = useState(0);
  const [showResolved, setShowResolved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showChanges, setShowChanges] = useState(true);
  const [activePanel, setActivePanel] = useState<'suggestions' | 'comments'>('suggestions');

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Start typing...' }),
      CharacterCount,
      Insertion,
      Deletion,
      Comment,
    ],
    content: initialContent,
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[500px] p-6',
      },
    },
  });

  // Apply suggestions to editor
  useEffect(() => {
    if (!editor || !showChanges) return;

    // This would apply visual marks for suggestions
    // In a real implementation, you'd traverse suggestions and apply marks
  }, [editor, showChanges, localSuggestions]);

  // Handle suggestion navigation
  const handleNavigate = (direction: 'prev' | 'next') => {
    const pendingCount = localSuggestions.filter(s => s.status === 'pending').length;
    if (direction === 'prev' && currentSuggestionIndex > 0) {
      setCurrentSuggestionIndex(i => i - 1);
    } else if (direction === 'next' && currentSuggestionIndex < pendingCount - 1) {
      setCurrentSuggestionIndex(i => i + 1);
    }
  };

  // Handle suggestion action
  const handleSuggestionAction = async (id: string, action: 'accept' | 'reject') => {
    const suggestion = localSuggestions.find(s => s.id === id);
    if (!suggestion || !editor) return;

    if (action === 'accept') {
      // Apply the change to the editor
      if (suggestion.type === 'deletion' && suggestion.position) {
        editor.chain()
          .focus()
          .setTextSelection(suggestion.position)
          .deleteSelection()
          .run();
      } else if (suggestion.type === 'insertion' && suggestion.suggestedText) {
        editor.chain()
          .focus()
          .setTextSelection(suggestion.position)
          .insertContent(suggestion.suggestedText)
          .run();
      } else if (suggestion.type === 'replacement' && suggestion.suggestedText) {
        editor.chain()
          .focus()
          .setTextSelection(suggestion.position)
          .deleteSelection()
          .insertContent(suggestion.suggestedText)
          .run();
      }
    }

    // Update local state
    setLocalSuggestions(prev => 
      prev.map(s => s.id === id ? { ...s, status: action === 'accept' ? 'accepted' : 'rejected' } : s)
    );

    // Call parent handler
    if (onSuggestionAction) {
      await onSuggestionAction(id, action);
    }

    // Auto-advance to next suggestion
    const remaining = localSuggestions.filter(s => s.status === 'pending' && s.id !== id);
    if (remaining.length > 0 && currentSuggestionIndex >= remaining.length) {
      setCurrentSuggestionIndex(Math.max(0, remaining.length - 1));
    }
  };

  // Batch actions
  const handleAcceptAll = async () => {
    const pending = localSuggestions.filter(s => s.status === 'pending');
    for (const suggestion of pending) {
      await handleSuggestionAction(suggestion.id, 'accept');
    }
  };

  const handleRejectAll = async () => {
    const pending = localSuggestions.filter(s => s.status === 'pending');
    for (const suggestion of pending) {
      await handleSuggestionAction(suggestion.id, 'reject');
    }
  };

  // Handle comment resolve
  const handleCommentResolve = async (id: string) => {
    setLocalComments(prev =>
      prev.map(c => c.id === id ? { ...c, resolved: true } : c)
    );
    if (onCommentResolve) {
      await onCommentResolve(id);
    }
  };

  // Handle save
  const handleSave = async () => {
    if (!editor || !onSave) return;
    setIsSaving(true);
    try {
      await onSave(editor.getHTML());
    } finally {
      setIsSaving(false);
    }
  };

  // Handle export
  const handleExport = async (format: 'docx' | 'pdf' | 'html') => {
    if (onExport) {
      await onExport(format);
    }
  };

  // Stats
  const stats = useMemo(() => {
    const pending = localSuggestions.filter(s => s.status === 'pending').length;
    const accepted = localSuggestions.filter(s => s.status === 'accepted').length;
    const rejected = localSuggestions.filter(s => s.status === 'rejected').length;
    const unresolvedComments = localComments.filter(c => !c.resolved).length;
    return { pending, accepted, rejected, unresolvedComments };
  }, [localSuggestions, localComments]);

  if (!editor) {
    return (
      <div className="flex items-center justify-center h-96 bg-[#0A1628]">
        <div className="animate-spin w-8 h-8 border-2 border-[#C9A84C] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0A1628]">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-4 py-2 bg-[#112240] border-b border-gray-700 flex-wrap">
        {/* Text formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Bold (Ctrl+B)"
        >
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Italic (Ctrl+I)"
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          title="Underline (Ctrl+U)"
        >
          <UnderlineIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          title="Strikethrough"
        >
          <Strikethrough className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Alignment */}
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          active={editor.isActive({ textAlign: 'left' })}
          title="Align left"
        >
          <AlignLeft className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          active={editor.isActive({ textAlign: 'center' })}
          title="Align center"
        >
          <AlignCenter className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          active={editor.isActive({ textAlign: 'right' })}
          title="Align right"
        >
          <AlignRight className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          active={editor.isActive({ textAlign: 'justify' })}
          title="Justify"
        >
          <AlignJustify className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Lists */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="Bullet list"
        >
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="Numbered list"
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarDivider />

        {/* History */}
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo (Ctrl+Z)"
        >
          <Undo className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo (Ctrl+Y)"
        >
          <Redo className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Track changes toggle */}
        <ToolbarButton
          onClick={() => setShowChanges(!showChanges)}
          active={showChanges}
          title="Show/hide changes"
        >
          {showChanges ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </ToolbarButton>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-gray-400 mr-4">
          <span>{stats.pending} pending</span>
          <span className="text-green-400">{stats.accepted} accepted</span>
          <span className="text-red-400">{stats.rejected} rejected</span>
        </div>

        {/* Export */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleExport('docx')}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
          >
            <Download className="w-3 h-3" />
            DOCX
          </button>
          <button
            onClick={() => handleExport('pdf')}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
          >
            <FileText className="w-3 h-3" />
            PDF
          </button>
        </div>

        {/* Save */}
        {onSave && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1 px-3 py-1.5 bg-[#C9A84C] hover:bg-[#B8973D] text-[#0A1628] rounded text-sm font-medium disabled:opacity-50"
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-[#0A1628] border-t-transparent rounded-full animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Save
          </button>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className="flex-1 overflow-auto bg-white dark:bg-gray-900">
          <EditorContent editor={editor} />
          
          {/* Bubble menu for selected text */}
          {editor && (
            <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
              <div className="flex items-center gap-1 p-1 bg-[#112240] rounded-lg shadow-lg border border-gray-700">
                <button
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  className={`p-1.5 rounded ${editor.isActive('bold') ? 'bg-[#C9A84C] text-[#0A1628]' : 'text-white hover:bg-gray-700'}`}
                >
                  <Bold className="w-4 h-4" />
                </button>
                <button
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  className={`p-1.5 rounded ${editor.isActive('italic') ? 'bg-[#C9A84C] text-[#0A1628]' : 'text-white hover:bg-gray-700'}`}
                >
                  <Italic className="w-4 h-4" />
                </button>
                <button
                  onClick={() => editor.chain().focus().toggleHighlight().run()}
                  className={`p-1.5 rounded ${editor.isActive('highlight') ? 'bg-[#C9A84C] text-[#0A1628]' : 'text-white hover:bg-gray-700'}`}
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
              </div>
            </BubbleMenu>
          )}
        </div>

        {/* Side panel */}
        <div className="w-80 border-l border-gray-700 bg-[#0A1628] overflow-y-auto">
          {/* Panel tabs */}
          <div className="flex border-b border-gray-700">
            <button
              onClick={() => setActivePanel('suggestions')}
              className={`flex-1 px-4 py-2 text-sm font-medium ${
                activePanel === 'suggestions'
                  ? 'text-[#C9A84C] border-b-2 border-[#C9A84C]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Suggestions
              {stats.pending > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-[#C9A84C] text-[#0A1628] rounded-full">
                  {stats.pending}
                </span>
              )}
            </button>
            <button
              onClick={() => setActivePanel('comments')}
              className={`flex-1 px-4 py-2 text-sm font-medium ${
                activePanel === 'comments'
                  ? 'text-[#C9A84C] border-b-2 border-[#C9A84C]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Comments
              {stats.unresolvedComments > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-yellow-500 text-[#0A1628] rounded-full">
                  {stats.unresolvedComments}
                </span>
              )}
            </button>
          </div>

          {/* Panel content */}
          <div className="p-4">
            {activePanel === 'suggestions' ? (
              <SuggestionPanel
                suggestions={localSuggestions}
                currentIndex={currentSuggestionIndex}
                onNavigate={handleNavigate}
                onAction={handleSuggestionAction}
                onAcceptAll={handleAcceptAll}
                onRejectAll={handleRejectAll}
              />
            ) : (
              <CommentsPanel
                comments={localComments}
                onResolve={handleCommentResolve}
                showResolved={showResolved}
                onToggleResolved={() => setShowResolved(!showResolved)}
              />
            )}
          </div>

          {/* AI disclaimer */}
          <div className="p-4 border-t border-gray-700">
            <p className="text-xs text-gray-500 text-center">
              ⚠️ AI-generated suggestions — requires attorney review
            </p>
          </div>
        </div>
      </div>

      {/* Character count footer */}
      <div className="px-4 py-1 bg-[#112240] border-t border-gray-700 text-xs text-gray-500">
        {editor.storage.characterCount.characters()} characters · {editor.storage.characterCount.words()} words
      </div>
    </div>
  );
};

export default RedlineEditor;
