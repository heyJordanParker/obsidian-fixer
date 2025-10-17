import TaskList from '@tiptap/extension-task-list';

export const CustomTaskList = TaskList.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.renderList(node, '  ', () => '* ');
        },
      },
    };
  },
});
