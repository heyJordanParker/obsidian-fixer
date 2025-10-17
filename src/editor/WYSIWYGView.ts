import { TextFileView, TFile, WorkspaceLeaf } from 'obsidian';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { Markdown } from 'tiptap-markdown';
import { WikiLink } from './extensions/WikiLink';
import { FileMention } from './extensions/FileMention';
import { PasteHandler } from './extensions/PasteHandler';
import { CodeBlockExtension } from './extensions/CodeBlock';
import { SlashCommands } from './extensions/SlashCommands';
import { CustomStrike } from './extensions/CustomStrike';
import { CustomBulletList } from './extensions/CustomBulletList';
import { CustomTaskList } from './extensions/CustomTaskList';
import { CustomTaskItem } from './extensions/CustomTaskItem';
import { CustomBlockquote } from './extensions/CustomBlockquote';
import { CustomHardBreak } from './extensions/CustomHardBreak';
import { PropertiesPanel } from './ui/PropertiesPanel';
import type WYSIWYGPlugin from '../../main';
import * as Diff from 'diff';

// gray-matter needs to be required for CommonJS compatibility
const matter = require('gray-matter');

export const WYSIWYG_VIEW_TYPE = 'wysiwyg-view';

export class WYSIWYGView extends TextFileView {
  editor: Editor | null = null;
  plugin: WYSIWYGPlugin;
  editorContainer!: HTMLElement;
  propertiesPanel: PropertiesPanel | null = null;
  frontMatter: Record<string, any> = {};
  private saveTimeout: NodeJS.Timeout | null = null;
  private saveDebounceMs: number = 2000;
  private loadedContent: string = '';
  private hasUserEdited: boolean = false;

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

    // Initialize TipTap editor
    this.editor = this.createEditor();

    // Log editor state for debugging
    console.log('Editor initialized, extensions:', this.editor.extensionManager.extensions.map(e => e.name));
    console.log('Editor storage:', Object.keys(this.editor.storage));

    // Handle link and mention clicks
    this.editorContainer.addEventListener('click', this.handleLinkClick.bind(this));
  }

  private createEditor(content: string = ''): Editor {
    return new Editor({
      element: this.editorContainer,
      editable: true,
      extensions: [
        StarterKit.configure({
          codeBlock: false,
          strike: false,
          bulletList: false,
          blockquote: false,
          hardBreak: false,
          bold: {},
          italic: {},
        }),
        CustomStrike,
        Underline,
        CustomHardBreak,
        CustomBlockquote,
        CustomTaskList,
        CustomTaskItem.configure({
          nested: true,
        }),
        CustomBulletList,
        // WikiLink BEFORE Link to ensure wikilinks are parsed first
        WikiLink.configure({
          vault: this.app.vault,
          workspace: this.app.workspace,
        }),
        FileMention.configure({
          vault: this.app.vault,
          workspace: this.app.workspace,
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
        Placeholder.configure({
          placeholder: "Type '/' for commands or start writing...",
        }),
        Markdown.configure({
          html: true,
          transformPastedText: true,
          transformCopiedText: true,
          breaks: true,
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
      onUpdate: ({ editor }) => {
        if (!this.hasUserEdited && this.loadedContent) {
          const currentContent = editor.storage.markdown?.getMarkdown?.() || '';
          if (currentContent !== this.loadedContent) {
            console.warn(`⚠️ Serialization issues:`);

            const diff = Diff.diffLines(this.loadedContent, currentContent);
            let oldLine = 1;
            let newLine = 1;

            diff.forEach(part => {
              const lines = part.value.split('\n');
              // Remove last empty line from split (if value ends with \n)
              if (lines[lines.length - 1] === '') {
                lines.pop();
              }

              if (part.removed) {
                lines.forEach(line => {
                  console.log(`${oldLine} %c- ${line}`, 'color: #f87171');
                  oldLine++;
                });
              } else if (part.added) {
                lines.forEach(line => {
                  console.log(`${newLine} %c+ ${line}`, 'color: #4ade80');
                  newLine++;
                });
              } else {
                oldLine += lines.length;
                newLine += lines.length;
              }
            });
          }
        }
        this.hasUserEdited = true;
        this.debouncedSave();
      },
      content,
    });
  }

  handleLinkClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    console.log('Click event on:', target, 'tagName:', target.tagName, 'dataset:', target.dataset);

    // Handle wikilink clicks
    const wikilinkEl = target.closest('[data-wikilink]') as HTMLElement;
    if (wikilinkEl) {
      event.preventDefault();
      const filePath = wikilinkEl.getAttribute('data-wikilink');
      console.log('Wikilink click, path:', filePath);

      if (filePath) {
        const file = this.app.metadataCache.getFirstLinkpathDest(filePath, this.file?.path || '');
        if (file) {
          this.openFile(file, event.metaKey || event.ctrlKey, event.shiftKey);
        }
      }
      return;
    }

    // Handle @ mention clicks
    const mentionEl = target.closest('[data-mention]') as HTMLElement;
    if (mentionEl) {
      event.preventDefault();
      const filePath = mentionEl.getAttribute('data-mention');
      console.log('Mention click, path:', filePath);

      if (filePath) {
        const file = this.app.metadataCache.getFirstLinkpathDest(filePath, this.file?.path || '');
        if (file) {
          this.openFile(file, event.metaKey || event.ctrlKey, event.shiftKey);
        }
      }
      return;
    }

    // Handle standard link clicks (for the Link extension)
    const linkEl = target.closest('a');
    if (linkEl) {
      const href = linkEl.getAttribute('href');
      console.log('Standard link click, href:', href);

      // Handle external links
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        event.preventDefault();
        if (event.shiftKey) {
          require('electron').shell.openExternal(href);
        } else {
          window.open(href, 'obsidian-external', 'popup,width=1200,height=800');
        }
        return;
      }

      // Handle internal links
      if (linkEl.classList.contains('internal-link') && href && href.startsWith('#')) {
        event.preventDefault();
        // Extract the link text which should be the file name
        const linkText = linkEl.textContent || '';
        console.log('Opening link:', linkText);

        // Try to find the file in the vault
        const file = this.app.metadataCache.getFirstLinkpathDest(linkText, this.file?.path || '');
        console.log('Resolved file:', file);

        if (file) {
          this.openFile(file, event.metaKey || event.ctrlKey, event.shiftKey);
        }
      }
    }
  }

  private openFile(file: TFile, newTab: boolean, popup: boolean = false) {
    if (popup) {
      this.app.workspace.trigger('hover-link', {
        event: null,
        source: WYSIWYG_VIEW_TYPE,
        hoverParent: this,
        targetEl: this.editorContainer,
        linktext: file.path,
      });
    } else if (newTab) {
      const leaf = this.app.workspace.getLeaf('tab');
      leaf.openFile(file);
    } else {
      const leaf = this.app.workspace.getLeaf(false);
      leaf.openFile(file);
    }
  }

  async onLoadFile(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);
    console.log('onLoadFile: read file, length =', content.length);

    // Parse front matter
    const { data, content: markdownContent } = matter(content);
    this.frontMatter = data;
    console.log('onLoadFile: parsed frontmatter, keys =', Object.keys(data));
    console.log('onLoadFile: markdown content length =', markdownContent.length);
    console.log('onLoadFile: markdown preview =', markdownContent.substring(0, 200));

    // Update properties panel
    if (this.propertiesPanel) {
      this.propertiesPanel.update(this.frontMatter);
    }

    // Store loaded content for comparison and reset edit flag
    this.loadedContent = markdownContent;
    this.hasUserEdited = false;

    // Destroy and recreate editor to clear history
    if (this.editor) {
      this.editor.destroy();
    }

    this.editor = this.createEditor(markdownContent);
    console.log('onLoadFile: editor recreated with new content');

    setTimeout(() => {
      const serialized = this.editor?.storage.markdown?.getMarkdown?.() || '';
      if (serialized !== markdownContent) {
        console.warn(`⚠️ Serialization issues on load:`);

        const diff = Diff.diffLines(markdownContent, serialized);
        let oldLine = 1;
        let newLine = 1;

        diff.forEach(part => {
          const lines = part.value.split('\n');
          if (lines[lines.length - 1] === '') {
            lines.pop();
          }

          if (part.removed) {
            lines.forEach(line => {
              console.log(`${oldLine} %c- ${line}`, 'color: #f87171');
              oldLine++;
            });
          } else if (part.added) {
            lines.forEach(line => {
              console.log(`${newLine} %c+ ${line}`, 'color: #4ade80');
              newLine++;
            });
          } else {
            oldLine += lines.length;
            newLine += lines.length;
          }
        });
      }
    }, 100);
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

    // Check if file still exists before saving (prevents recreating deleted files)
    const fileExists = this.app.vault.getAbstractFileByPath(this.file.path);
    if (!fileExists) {
      console.log('saveToFile: file was deleted, skipping save');
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
