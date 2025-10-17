import { TextFileView, TFile, WorkspaceLeaf } from 'obsidian';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { WikiLink } from './extensions/WikiLink';
import { FileMention } from './extensions/FileMention';
import { PasteHandler } from './extensions/PasteHandler';
import { CodeBlockExtension } from './extensions/CodeBlock';
import { SlashCommands } from './extensions/SlashCommands';
import { CustomStrike } from './extensions/CustomStrike';
import { PropertiesPanel } from './ui/PropertiesPanel';
import type WYSIWYGPlugin from '../../main';

// gray-matter needs to be required for CommonJS compatibility
const matter = require('gray-matter');

export const WYSIWYG_VIEW_TYPE = 'wysiwyg-view';

export class WYSIWYGView extends TextFileView {
  editor: Editor | null = null;
  plugin: WYSIWYGPlugin;
  editorContainer: HTMLElement | null = null;
  propertiesPanel: PropertiesPanel | null = null;
  frontMatter: Record<string, any> = {};
  private saveTimeout: NodeJS.Timeout | null = null;
  private saveDebounceMs: number = 2000;

  constructor(leaf: WorkspaceLeaf, plugin: WYSIWYGPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return WYSIWYG_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file?.basename || 'WYSIWYG Editor';
  }

  async onOpen() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('wysiwyg-container');

    // Create properties panel
    const propertiesContainer = container.createDiv('properties-container');
    this.propertiesPanel = new PropertiesPanel(
      propertiesContainer,
      this.frontMatter,
      (newMatter) => {
        this.frontMatter = newMatter;
        this.requestSave();
      }
    );

    // Create editor container
    this.editorContainer = container.createDiv('editor-container');

    // Initialize TipTap editor with all extensions
    this.editor = new Editor({
      element: this.editorContainer,
      editable: true,
      extensions: [
        StarterKit.configure({
          // Disable default code block and strike - we'll use custom versions
          codeBlock: false,
          strike: false,
          // Explicitly ensure bold and italic are enabled
          bold: {},
          italic: {},
        }),
        CustomStrike,
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: 'internal-link',
          },
        }),
        Image.configure({
          inline: true,
          allowBase64: true,
        }),
        Placeholder.configure({
          placeholder: "Type '/' for commands or start writing...",
        }),
        Markdown.configure({
          html: true,
          transformPastedText: true,
          transformCopiedText: true,
        }),
        WikiLink.configure({
          vault: this.app.vault,
          workspace: this.app.workspace,
        }),
        FileMention.configure({
          vault: this.app.vault,
          workspace: this.app.workspace,
        }),
        CodeBlockExtension,
        SlashCommands,
        PasteHandler.configure({
          vault: this.app.vault,
          view: this,
        }),
      ],
      editorProps: {
        attributes: {
          class: 'wysiwyg-editor',
          spellcheck: 'true',
        },
      },
      onUpdate: () => {
        this.debouncedSave();
      },
    });

    // Log editor state for debugging
    console.log('Editor initialized, extensions:', this.editor.extensionManager.extensions.map(e => e.name));
    console.log('Editor storage:', Object.keys(this.editor.storage));

    // Handle link and mention clicks
    this.editorContainer.addEventListener('click', this.handleLinkClick.bind(this));
  }

  handleLinkClick(event: MouseEvent) {
    const target = event.target as HTMLElement;

    // Handle wikilink clicks
    if (target.dataset.wikilink || target.closest('[data-wikilink]')) {
      event.preventDefault();
      const linkEl = target.dataset.wikilink ? target : target.closest('[data-wikilink]');
      const filePath = linkEl?.getAttribute('data-wikilink');

      if (filePath) {
        this.app.workspace.openLinkText(filePath, this.file?.path || '', false);
      }
    }

    // Handle @ mention clicks
    if (target.dataset.mention || target.closest('[data-mention]')) {
      event.preventDefault();
      const mentionEl = target.dataset.mention ? target : target.closest('[data-mention]');
      const filePath = mentionEl?.getAttribute('data-mention');

      if (filePath) {
        this.app.workspace.openLinkText(filePath, this.file?.path || '', false);
      }
    }
  }

  async onLoadFile(file: TFile): Promise<void> {
    if (!this.editor) {
      console.log('onLoadFile: no editor');
      return;
    }

    const content = await this.app.vault.read(file);
    console.log('onLoadFile: read file, length =', content.length);

    // Parse front matter
    const { data, content: markdownContent } = matter(content);
    this.frontMatter = data;
    console.log('onLoadFile: parsed frontmatter, keys =', Object.keys(data));
    console.log('onLoadFile: markdown content length =', markdownContent.length, ', preview =', markdownContent.substring(0, 100));

    // Update properties panel
    if (this.propertiesPanel) {
      this.propertiesPanel.update(this.frontMatter);
    }

    // Load content into editor without adding to history
    // This prevents undo from clearing the entire document
    this.editor.commands.setContent(markdownContent, false);
    console.log('onLoadFile: content loaded into editor');
  }

  async onUnloadFile(file: TFile): Promise<void> {
    // Save before unloading (switching files)
    console.log('onUnloadFile: saving before unload');
    await this.saveToFile();
  }

  getViewData(): string {
    if (!this.editor) {
      console.log('getViewData: no editor');
      return '';
    }

    // Get markdown from editor using the storage API
    let markdown = '';
    try {
      // Access the markdown serializer through storage
      const markdownStorage = this.editor.storage.markdown;
      if (markdownStorage && typeof markdownStorage.getMarkdown === 'function') {
        markdown = markdownStorage.getMarkdown();
        console.log('getViewData: got markdown, length =', markdown.length, ', preview =', markdown.substring(0, 100));
      } else {
        console.error('getViewData: markdown storage not found or getMarkdown not available');
        console.log('getViewData: storage keys =', Object.keys(this.editor.storage));
        return '';
      }
    } catch (e) {
      console.error('getViewData: error getting markdown', e);
      return '';
    }

    // Combine front matter with content
    if (Object.keys(this.frontMatter).length > 0) {
      const result = matter.stringify(markdown, this.frontMatter);
      console.log('getViewData: with frontmatter, total length', result.length);
      return result;
    }

    return markdown;
  }

  setViewData(data: string, clear: boolean): void {
    if (!this.editor) {
      console.log('setViewData: no editor');
      return;
    }

    console.log('setViewData: called with clear =', clear, ', data length =', data.length);

    if (clear) {
      const { data: frontMatterData, content } = matter(data);
      this.frontMatter = frontMatterData;
      console.log('setViewData: parsed frontmatter, keys =', Object.keys(frontMatterData));
      console.log('setViewData: content length =', content.length);

      if (this.propertiesPanel) {
        this.propertiesPanel.update(this.frontMatter);
      }
      this.editor.commands.setContent(content, false);
      console.log('setViewData: content set');
    }
  }

  clear(): void {
    if (this.editor) {
      this.editor.commands.clearContent();
      this.frontMatter = {};
      if (this.propertiesPanel) {
        this.propertiesPanel.update({});
      }
    }
  }

  private async saveToFile() {
    if (!this.file || !this.editor) {
      console.log('saveToFile: no file or editor', { file: !!this.file, editor: !!this.editor });
      return;
    }

    try {
      // Get markdown from editor
      const markdownStorage = this.editor.storage.markdown;
      if (!markdownStorage || typeof markdownStorage.getMarkdown !== 'function') {
        console.error('saveToFile: markdown storage not available');
        console.log('saveToFile: storage keys =', Object.keys(this.editor.storage));
        return;
      }

      const markdown = markdownStorage.getMarkdown();
      console.log('saveToFile: got markdown, length =', markdown?.length, ', preview =', markdown?.substring(0, 100));

      // Combine with front matter
      let content = markdown;
      if (Object.keys(this.frontMatter).length > 0) {
        content = matter.stringify(markdown, this.frontMatter);
        console.log('saveToFile: added frontmatter');
      }

      // Write directly to vault
      await this.app.vault.modify(this.file, content);
      console.log('saveToFile: file written successfully');
    } catch (error) {
      console.error('saveToFile: error saving', error);
    }
  }

  private debouncedSave() {
    // Clear existing timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Set new timeout for save
    this.saveTimeout = setTimeout(async () => {
      console.log('debouncedSave: triggered');
      await this.saveToFile();
    }, this.saveDebounceMs);
  }

  async onClose() {
    // Clear any pending save timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Save immediately on close
    await this.saveToFile();

    if (this.editor) {
      this.editor.destroy();
      this.editor = null;
    }
  }
}
