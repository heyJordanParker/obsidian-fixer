import { TextFileView, TFile, WorkspaceLeaf } from 'obsidian';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Markdown } from 'tiptap-markdown';
import { WikiLink } from './extensions/WikiLink';
import { FileMention } from './extensions/FileMention';
import { PasteHandler } from './extensions/PasteHandler';
import { CodeBlockExtension } from './extensions/CodeBlock';
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
      extensions: [
        StarterKit.configure({
          // Disable default code block, we'll use custom
          codeBlock: false,
        }),
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
        this.requestSave();
      },
    });

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
    if (!this.editor) return;

    const content = await this.app.vault.read(file);

    // Parse front matter
    const { data, content: markdownContent } = matter(content);
    this.frontMatter = data;

    // Update properties panel
    if (this.propertiesPanel) {
      this.propertiesPanel.update(this.frontMatter);
    }

    // Load content into editor
    this.editor.commands.setContent(markdownContent);
  }

  async onUnloadFile(file: TFile): Promise<void> {
    // Save before unloading
    if (this.editor && file) {
      await this.save();
    }
  }

  getViewData(): string {
    if (!this.editor) return '';

    // Get markdown from editor
    const markdown = this.editor.storage.markdown.getMarkdown();

    // Combine front matter with content
    if (Object.keys(this.frontMatter).length > 0) {
      return matter.stringify(markdown, this.frontMatter);
    }

    return markdown;
  }

  setViewData(data: string, clear: boolean): void {
    if (!this.editor) return;

    if (clear) {
      const { data: frontMatterData, content } = matter(data);
      this.frontMatter = frontMatterData;
      if (this.propertiesPanel) {
        this.propertiesPanel.update(this.frontMatter);
      }
      this.editor.commands.setContent(content);
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

  async onClose() {
    if (this.editor) {
      this.editor.destroy();
      this.editor = null;
    }
  }
}
