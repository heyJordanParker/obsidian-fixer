import Blockquote from '@tiptap/extension-blockquote';

export const CustomBlockquote = Blockquote.extend({
  // Use default blockquote serialization
  // Hard breaks inside blockquotes are handled by CustomHardBreak
});
