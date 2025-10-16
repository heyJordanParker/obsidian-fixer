import { Node, mergeAttributes, textblockTypeInputRule } from '@tiptap/core';

export const CodeBlockExtension = Node.create({
  name: 'codeBlock',

  content: 'text*',

  marks: '',

  group: 'block',

  code: true,

  defining: true,

  addOptions() {
    return {
      languageClassPrefix: 'language-',
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      language: {
        default: null,
        parseHTML: element => {
          const { languageClassPrefix } = this.options;
          const classList = element.firstElementChild?.classList;
          if (!classList) return null;

          const classNames = Array.from(classList);
          const languages = classNames
            .filter(className => className.startsWith(languageClassPrefix))
            .map(className => className.replace(languageClassPrefix, ''));
          const language = languages[0];

          if (!language) {
            return null;
          }

          return language;
        },
        rendered: false,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'pre',
        preserveWhitespace: 'full',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'pre',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      [
        'code',
        {
          class: node.attrs.language
            ? `language-${node.attrs.language}`
            : null,
        },
        0,
      ],
    ];
  },

  addCommands() {
    return {
      setCodeBlock: attributes => ({ commands }) => {
        return commands.setNode(this.name, attributes);
      },
      toggleCodeBlock: attributes => ({ commands }) => {
        return commands.toggleNode(this.name, 'paragraph', attributes);
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-c': () => this.editor.commands.toggleCodeBlock(),
      Backspace: () => {
        const { empty, $anchor } = this.editor.state.selection;
        const isAtStart = $anchor.pos === 1;

        if (!empty || $anchor.parent.type.name !== this.name) {
          return false;
        }

        if (isAtStart) {
          return this.editor.commands.clearNodes();
        }

        return false;
      },
    };
  },

  addInputRules() {
    return [
      textblockTypeInputRule({
        find: /^```([a-z]+)?[\s\n]$/,
        type: this.type,
        getAttributes: match => ({
          language: match[1],
        }),
      }),
    ];
  },
});
