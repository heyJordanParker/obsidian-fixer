import TaskItem from '@tiptap/extension-task-item';

export const CustomTaskItem = TaskItem.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const checked = node.attrs.checked ? 'x' : ' ';
          state.write(`[${checked}] `);
          state.renderContent(node);
        },
      },
    };
  },
});