import Blockquote from '@tiptap/extension-blockquote';

export const CustomBlockquote = Blockquote.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.wrapBlock('> ', null, node, () => state.renderContent(node));
        },
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Enter': () => {
        if (this.editor.isActive('blockquote')) {
          return this.editor.commands.setHardBreak();
        }
        return false;
      },
    };
  },
});
