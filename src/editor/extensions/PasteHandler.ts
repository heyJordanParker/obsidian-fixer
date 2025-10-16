import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Vault, TFile } from 'obsidian';
import type { WYSIWYGView } from '../WYSIWYGView';

export interface PasteHandlerOptions {
  vault: Vault;
  view: WYSIWYGView;
}

export const PasteHandler = Extension.create<PasteHandlerOptions>({
  name: 'pasteHandler',

  addOptions() {
    return {
      vault: null as any,
      view: null as any,
    };
  },

  addProseMirrorPlugins() {
    const vault = this.options.vault;
    const view = this.options.view;

    return [
      new Plugin({
        key: new PluginKey('pasteHandler'),
        props: {
          handlePaste: (editorView, event, slice) => {
            // Handle image paste first
            const items = event.clipboardData?.items;
            if (items) {
              for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type.startsWith('image/')) {
                  const file = item.getAsFile();
                  if (file) {
                    handleImagePaste(file, editorView, vault);
                    return true;
                  }
                }
              }
            }

            // Handle text paste
            const text = event.clipboardData?.getData('text/plain');
            if (!text) return false;

            // Check if user has selected text
            const { from, to } = editorView.state.selection;
            const hasSelection = from !== to;

            if (hasSelection) {
              // Convert selection to link
              const linkUrl = parseLinkFromPaste(text, vault);
              if (linkUrl) {
                const tr = editorView.state.tr;
                tr.addMark(
                  from,
                  to,
                  editorView.state.schema.marks.link.create({ href: linkUrl })
                );
                editorView.dispatch(tr);
                return true;
              }
            } else {
              // Check if pasted text is a wikilink
              const wikiMatch = text.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
              if (wikiMatch) {
                const href = wikiMatch[1];
                const alias = wikiMatch[2] || href;

                const node = editorView.state.schema.nodes.wikilink?.create({
                  href,
                  alias,
                });

                if (node) {
                  const tr = editorView.state.tr.replaceSelectionWith(node);
                  editorView.dispatch(tr);
                  return true;
                }
              }

              // Check if pasted text is a URL
              const parsedLink = parseLinkFromPaste(text, vault);
              if (parsedLink) {
                const linkText = text.startsWith('http') ? text : text;
                const node = editorView.state.schema.text(linkText, [
                  editorView.state.schema.marks.link.create({ href: parsedLink })
                ]);

                const tr = editorView.state.tr.replaceSelectionWith(node);
                editorView.dispatch(tr);
                return true;
              }
            }

            return false;
          },
        },
      }),
    ];
  },
});

async function handleImagePaste(
  file: File,
  view: any,
  vault: Vault
) {
  try {
    // Create attachments folder if it doesn't exist
    const attachmentsFolder = 'attachments';
    if (!vault.getAbstractFileByPath(attachmentsFolder)) {
      await vault.createFolder(attachmentsFolder);
    }

    // Generate filename
    const fileName = `pasted-${Date.now()}.png`;
    const filePath = `${attachmentsFolder}/${fileName}`;

    // Save file to vault
    const buffer = await file.arrayBuffer();
    await vault.createBinary(filePath, buffer);

    // Insert image node
    const { state, dispatch } = view;
    const node = state.schema.nodes.image.create({
      src: filePath,
    });

    const tr = state.tr.replaceSelectionWith(node);
    dispatch(tr);
  } catch (error) {
    console.error('Failed to paste image:', error);
  }
}

function parseLinkFromPaste(text: string, vault: Vault): string | null {
  text = text.trim();

  // Regular URLs
  if (/^https?:\/\//.test(text)) {
    return text;
  }

  // Wikilinks [[Note Name]] or [[Note Name|Display]]
  const wikiMatch = text.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]$/);
  if (wikiMatch) {
    return resolveVaultPath(wikiMatch[1], vault);
  }

  // Markdown links [text](url)
  const mdMatch = text.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (mdMatch) {
    return mdMatch[2];
  }

  // File URLs
  if (text.startsWith('file:///')) {
    return text;
  }

  // Obsidian URIs
  if (text.startsWith('obsidian://')) {
    return text;
  }

  // Bare file paths in vault
  const filePath = resolveVaultPath(text, vault);
  if (filePath) {
    return filePath;
  }

  // URL without protocol
  if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(text)) {
    return 'https://' + text;
  }

  return null;
}

function resolveVaultPath(path: string, vault: Vault): string | null {
  // Try exact match
  let file = vault.getAbstractFileByPath(path);
  if (file instanceof TFile) return file.path;

  // Try with .md extension
  file = vault.getAbstractFileByPath(path + '.md');
  if (file instanceof TFile) return file.path;

  // Try finding by basename
  const files = vault.getMarkdownFiles();
  const found = files.find(f => f.basename === path);
  if (found) return found.path;

  return null;
}
