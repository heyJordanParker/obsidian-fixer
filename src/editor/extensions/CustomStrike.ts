import { Mark, mergeAttributes } from '@tiptap/core';

// Custom Strike extension with Cmd+Shift+X shortcut (Mac standard)
export const CustomStrike = Mark.create({
  name: 'strike',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [
      { tag: 's' },
      { tag: 'del' },
      { tag: 'strike' },
      {
        style: 'text-decoration',
        consuming: false,
        getAttrs: (style) => (style as string).includes('line-through') ? {} : false,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['s', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      toggleStrike: () => ({ commands }) => {
        return commands.toggleMark(this.name);
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-x': () => this.editor.commands.toggleStrike(),
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize: {
          open: '~~',
          close: '~~',
          mixable: true,
          expelEnclosingWhitespace: true,
        },
        parse: {
          // Use the default markdown-it parsing for ~~text~~
        },
      },
    };
  },
});
