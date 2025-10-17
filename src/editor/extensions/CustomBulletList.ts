import BulletList from '@tiptap/extension-bullet-list';

export const CustomBulletList = BulletList.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.renderList(node, '  ', () => '- ');
        },
      },
    };
  },
});
