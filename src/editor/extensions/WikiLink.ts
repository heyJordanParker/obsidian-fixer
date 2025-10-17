import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
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
        priority: 100,
        getAttrs: (element) => {
          const href = (element as HTMLElement).getAttribute('data-wikilink');
          const alias = (element as HTMLElement).textContent;
          console.log('WikiLink parseHTML:', { href, alias, element: (element as HTMLElement).outerHTML });
          return {
            href,
            alias: alias !== href ? alias : null,
          };
        },
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
          console.log('WikiLink serialize:', { href, alias, attrs: node.attrs });

          if (!href) {
            console.error('WikiLink serialize: href is null/empty!', node.attrs);
            return;
          }

          if (alias && alias !== href) {
            state.write(`[[${href}|${alias}]]`);
          } else {
            state.write(`[[${href}]]`);
          }
        },
        parse: {
          setup(markdownit: any) {
            // Register inline rule with markdown-it to parse [[wikilinks]]
            // Register before 'link' to prevent markdown links from interfering
            markdownit.inline.ruler.before('link', 'wikilink', function wikilink(state: any, silent: boolean) {
              const start = state.pos;
              const max = state.posMax;

              // Check if we have [[
              if (state.src.charCodeAt(start) !== 0x5B /* [ */ ||
                  state.src.charCodeAt(start + 1) !== 0x5B /* [ */) {
                return false;
              }

              // Find closing ]]
              let pos = start + 2;
              while (pos < max) {
                if (state.src.charCodeAt(pos) === 0x5D /* ] */ &&
                    state.src.charCodeAt(pos + 1) === 0x5D /* ] */) {
                  break;
                }
                pos++;
              }

              if (pos >= max) {
                return false;
              }

              // Extract content
              const content = state.src.slice(start + 2, pos);
              const parts = content.split('|');
              const href = parts[0].trim();
              const alias = parts[1]?.trim() || href;

              if (!silent) {
                const token = state.push('html_inline', '', 0);
                token.content = `<a data-wikilink="${href}" class="internal-link" href="#">${alias}</a>`;
                console.log('WikiLink parse:', { href, alias, html: token.content });
              }

              state.pos = pos + 2;
              return true;
            });
          },
        },
      },
    };
  },
});
