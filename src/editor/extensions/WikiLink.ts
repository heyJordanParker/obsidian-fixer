import { Node, mergeAttributes } from '@tiptap/core';
import type { Vault, Workspace } from 'obsidian';

export interface WikiLinkOptions {
  vault: Vault;
  workspace: Workspace;
}

export const WikiLink = Node.create<WikiLinkOptions>({
  name: 'wikilink',

  group: 'inline',

  inline: true,

  atom: true,

  addOptions() {
    return {
      vault: null as any,
      workspace: null as any,
    };
  },

  addAttributes() {
    return {
      href: {
        default: null,
      },
      alias: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-wikilink]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const alias = node.attrs.alias || node.attrs.href;

    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        'data-wikilink': node.attrs.href,
        class: 'internal-link',
        href: '#',
      }),
      alias,
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const { href, alias } = node.attrs;
          if (alias && alias !== href) {
            state.write(`[[${href}|${alias}]]`);
          } else {
            state.write(`[[${href}]]`);
          }
        },
        parse: {
          // tiptap-markdown will handle parsing [[links]]
          match: /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/,
          runner(state: any, match: any, type: any) {
            const href = match[1];
            const alias = match[2] || null;
            state.openNode(type, { href, alias });
            state.closeNode();
          },
        },
      },
    };
  },
});
