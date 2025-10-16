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
        class: 'mention',
      }),
      `@${node.attrs.label}`,
    ];
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
