import { HardBreak } from '@tiptap/extension-hard-break';

export const CustomHardBreak = HardBreak.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any, parent: any, index: number) {
          // Since breaks: true is enabled in Markdown config, all newlines are hard breaks
          // So we serialize hard breaks as plain newlines instead of \\\n
          for (let i = index + 1; i < parent.childCount; i++) {
            if (parent.child(i).type != node.type) {
              state.write('\n');
              return;
            }
          }
        },
        parse: {
          // handled by markdown-it
        },
      },
    };
  },
});
