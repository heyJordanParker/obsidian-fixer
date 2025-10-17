import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { SuggestionList } from '../ui/SuggestionList';

export interface Command {
  title: string;
  icon: string;
  command: (props: any) => void;
}

export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        pluginKey: new PluginKey('slashCommands'),
        startOfLine: false,
        command: ({ editor, range, props }: any) => {
          // Execute the command stored in the item
          props.command({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }: { query: string }) => {
          const commands = [
            {
              title: 'Heading 1',
              icon: 'H1',
              command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run();
              },
            },
            {
              title: 'Heading 2',
              icon: 'H2',
              command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run();
              },
            },
            {
              title: 'Heading 3',
              icon: 'H3',
              command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run();
              },
            },
            {
              title: 'Bullet List',
              icon: '•',
              command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).toggleBulletList().run();
              },
            },
            {
              title: 'Numbered List',
              icon: '1.',
              command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).toggleOrderedList().run();
              },
            },
            {
              title: 'Code Block',
              icon: '</>',
              command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).setCodeBlock().run();
              },
            },
            {
              title: 'Quote',
              icon: '❝',
              command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).setBlockquote().run();
              },
            },
            {
              title: 'Divider',
              icon: '—',
              command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).setHorizontalRule().run();
              },
            },
          ];

          return commands
            .filter((item) =>
              item.title.toLowerCase().includes(query.toLowerCase())
            )
            .slice(0, 10);
        },
        render: () => {
          let component: SuggestionList;

          return {
            onStart: (props: any) => {
              component = new SuggestionList(props);
            },
            onUpdate: (props: any) => {
              component.updateProps(props);
            },
            onKeyDown: (props: any) => {
              if (!component) return false;
              return component.onKeyDown(props);
            },
            onExit: () => {
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
