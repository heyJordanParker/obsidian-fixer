import { Node, mergeAttributes } from '@tiptap/core';
import { Suggestion, SuggestionOptions } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import type { Vault, Workspace } from 'obsidian';
import { SuggestionList } from '../ui/SuggestionList';

export interface FileMentionOptions {
  vault: Vault;
  workspace: Workspace;
  suggestion: Partial<SuggestionOptions>;
}

export const FileMention = Node.create<FileMentionOptions>({
  name: 'mention',

  group: 'inline',

  inline: true,

  atom: true,

  addOptions() {
    return {
      vault: null as any,
      workspace: null as any,
      suggestion: {
        char: '@',
        pluginKey: new PluginKey('mention'),
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: this.name,
                attrs: props,
              },
              {
                type: 'text',
                text: ' ',
              },
            ])
            .run();
        },
        allow: ({ state, range }) => {
          return true;
        },
      },
    };
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-mention'),
      },
      label: {
        default: null,
        parseHTML: element => element.getAttribute('data-label'),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-mention]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-mention': node.attrs.id,
        'data-label': node.attrs.label,
        class: 'mention',
      }),
      node.attrs.label,
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`[[${node.attrs.label}]]`);
        },
        parse: {
          setup(markdownit: any) {
            // Register inline rule with markdown-it to parse @mentions
            markdownit.inline.ruler.after('emphasis', 'mention', function mention(state: any, silent: boolean) {
              const start = state.pos;
              const max = state.posMax;

              // Check if we have @
              if (state.src.charCodeAt(start) !== 0x40 /* @ */) {
                return false;
              }

              // Find the end of the mention (space, newline, or end of string)
              let pos = start + 1;
              while (pos < max) {
                const char = state.src.charCodeAt(pos);
                // Stop at whitespace, punctuation (except underscore/hyphen), or special chars
                if (char === 0x20 /* space */ ||
                    char === 0x0A /* \n */ ||
                    char === 0x0D /* \r */ ||
                    (char >= 0x21 && char <= 0x2F && char !== 0x2D /* - */ && char !== 0x5F /* _ */) ||
                    (char >= 0x3A && char <= 0x40) ||
                    (char >= 0x5B && char <= 0x60 && char !== 0x5F /* _ */) ||
                    (char >= 0x7B && char <= 0x7E)) {
                  break;
                }
                pos++;
              }

              // Need at least one character after @
              if (pos === start + 1) {
                return false;
              }

              // Extract the mention name
              const mentionName = state.src.slice(start + 1, pos);

              if (!silent) {
                const token = state.push('html_inline', '', 0);
                token.content = `<span data-mention="${mentionName}" data-label="${mentionName}" class="mention">${mentionName}</span>`;
              }

              state.pos = pos;
              return true;
            });
          },
        },
      },
    };
  },

  addProseMirrorPlugins() {
    const vault = this.options.vault;

    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,

        items: async ({ query }) => {
          const files = vault.getMarkdownFiles();

          return files
            .filter(file =>
              file.basename.toLowerCase().includes(query.toLowerCase())
            )
            .slice(0, 10)
            .map(file => ({
              id: file.path,
              label: file.basename,
            }));
        },

        render: () => {
          let component: SuggestionList;

          return {
            onStart: props => {
              component = new SuggestionList(props);
            },

            onUpdate(props) {
              component.updateProps(props);
            },

            onKeyDown(props) {
              if (!component) return false;
              return component.onKeyDown(props);
            },

            onExit() {
              if (component) {
                component.destroy();
              }
            },
          };
        },
      }),
    ];
  },
});
