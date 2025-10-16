# Obsidian WYSIWYG Plugin Implementation Specification

## Project Overview

Build an Obsidian plugin that completely replaces the default markdown editor with a Notion-like WYSIWYG editor using TipTap. The plugin must handle all .md files, support wikilinks, @ mentions, slash commands, image handling, code blocks, and front matter as properties.

## Dependencies

```json
{
  "dependencies": {
    "@tiptap/core": "^2.1.13",
    "@tiptap/pm": "^2.1.13",
    "@tiptap/starter-kit": "^2.1.13",
    "@tiptap/extension-link": "^2.1.13",
    "@tiptap/extension-image": "^2.1.13",
    "@tiptap/extension-placeholder": "^2.1.13",
    "@tiptap/suggestion": "^2.1.13",
    "tiptap-markdown": "^0.8.2",
    "tippy.js": "^6.3.7",
    "gray-matter": "^4.0.3",
    "obsidian": "latest"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "typescript": "^5.3.3",
    "esbuild": "^0.19.9"
  }
}
```

## File Structure

```
obsidian-wysiwyg/
├── main.ts                          # Plugin entry point
├── manifest.json
├── styles.css                       # Global plugin styles
├── src/
│   ├── editor/
│   │   ├── WYSIWYGView.ts          # Main editor view
│   │   ├── WYSIWYGModal.ts         # Popup editor modal
│   │   ├── extensions/
│   │   │   ├── WikiLink.ts         # Wikilink node extension
│   │   │   ├── FileMention.ts      # @ mention extension
│   │   │   ├── FrontMatter.ts      # Properties panel component
│   │   │   ├── CodeBlock.ts        # Code block extension
│   │   │   └── PasteHandler.ts     # Smart paste plugin
│   │   └── ui/
│   │       ├── SuggestionList.ts   # Dropdown for @ mentions
│   │       ├── SlashMenu.ts        # Slash command menu
│   │       └── PropertiesPanel.ts  # Front matter UI
│   └── utils/
│       ├── markdown.ts             # Markdown conversion helpers
│       └── vault.ts                # Vault file operations
└── esbuild.config.mjs
```

## 1. Plugin Entry Point (main.ts)

```typescript
import { Plugin } from 'obsidian';
import { WYSIWYGView, WYSIWYG_VIEW_TYPE } from './src/editor/WYSIWYGView';
import { WYSIWYGModal } from './src/editor/WYSIWYGModal';

export default class WYSIWYGPlugin extends Plugin {
  async onload() {
    console.log('Loading WYSIWYG Plugin');

    // Register the custom view
    this.registerView(
      WYSIWYG_VIEW_TYPE,
      (leaf) => new WYSIWYGView(leaf, this)
    );

    // Override .md files to open in WYSIWYG view
    this.registerExtensions(['md'], WYSIWYG_VIEW_TYPE);

    // Add command to open popup editor
    this.addCommand({
      id: 'open-wysiwyg-popup',
      name: 'Open WYSIWYG editor in popup',
      callback: () => {
        new WYSIWYGModal(this.app, this).open();
      },
    });

    // Add ribbon icon
    this.addRibbonIcon('edit', 'WYSIWYG Popup', () => {
      new WYSIWYGModal(this.app, this).open();
    });
  }

  onunload() {
    console.log('Unloading WYSIWYG Plugin');
  }
}
```

## 2. Main Editor View (WYSIWYGView.ts)

```typescript
import { TextFileView, TFile, WorkspaceLeaf } from 'obsidian';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import matter from 'gray-matter';
import WYSIWYGPlugin from '../../main';
import { WikiLink } from './extensions/WikiLink';
import { FileMention } from './extensions/FileMention';
import { PasteHandler } from './extensions/PasteHandler';
import { CodeBlockExtension } from './extensions/CodeBlock';
import { PropertiesPanel } from './ui/PropertiesPanel';

export const WYSIWYG_VIEW_TYPE = 'wysiwyg-view';

export class WYSIWYGView extends TextFileView {
  editor: Editor;
  plugin: WYSIWYGPlugin;
  propertiesPanel: PropertiesPanel;
  frontMatter: Record<string, any> = {};
  editorContainer: HTMLElement;

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
    const container = this.containerEl.children[1];
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
        Placeholder.configure({
          placeholder: "Type '/' for commands or '@' to link...",
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

    // Handle link clicks
    this.editorContainer.addEventListener('click', this.handleLinkClick.bind(this));
  }

  async onLoadFile(file: TFile): Promise<void> {
    if (!this.editor) return;

    const content = await this.app.vault.read(file);
    
    // Parse front matter
    const { data, content: markdownContent } = matter(content);
    this.frontMatter = data;
    
    // Update properties panel
    this.propertiesPanel.update(this.frontMatter);

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
      this.propertiesPanel.update(this.frontMatter);
      this.editor.commands.setContent(content);
    }
  }

  clear(): void {
    if (this.editor) {
      this.editor.commands.clearContent();
      this.frontMatter = {};
      this.propertiesPanel.update({});
    }
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

  async onClose() {
    if (this.editor) {
      this.editor.destroy();
    }
  }
}
```

## 3. WikiLink Extension (WikiLink.ts)

```typescript
import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Vault, Workspace, TFile } from 'obsidian';

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

  addProseMirrorPlugins() {
    const vault = this.options.vault;
    
    return [
      new Plugin({
        key: new PluginKey('wikilink-parser'),
        props: {
          // Parse [[wikilinks]] when loading existing content
          transformPasted: (slice) => {
            // This handles pasted content with [[links]]
            // The actual parsing is done in PasteHandler extension
            return slice;
          },
        },
      }),
    ];
  },
});
```

## 4. File Mention Extension (FileMention.ts)

```typescript
import { Node, mergeAttributes } from '@tiptap/core';
import { Suggestion, SuggestionOptions } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { Vault, Workspace, TFile } from 'obsidian';
import { SuggestionList } from '../ui/SuggestionList';

export interface FileMentionOptions {
  vault: Vault;
  workspace: Workspace;
  suggestion: Partial<SuggestionOptions>;
}

export const FileMention = Node.create<FileMentionOptions>({
  name: 'mention',

  group: 'inline',

  inline: true,

  atom: true,

  addOptions() {
    return {
      vault: null as any,
      workspace: null as any,
      suggestion: {
        char: '@',
        pluginKey: new PluginKey('mention'),
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: this.name,
                attrs: props,
              },
              {
                type: 'text',
                text: ' ',
              },
            ])
            .run();
        },
        allow: ({ state, range }) => {
          return true;
        },
      },
    };
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-mention'),
      },
      label: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-mention]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-mention': node.attrs.id,
        class: 'mention',
      }),
      `@${node.attrs.label}`,
    ];
  },

  addProseMirrorPlugins() {
    const vault = this.options.vault;

    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        
        items: async ({ query }) => {
          const files = vault.getMarkdownFiles();
          
          return files
            .filter(file => 
              file.basename.toLowerCase().includes(query.toLowerCase())
            )
            .slice(0, 10)
            .map(file => ({
              id: file.path,
              label: file.basename,
            }));
        },

        render: () => {
          let component: SuggestionList;

          return {
            onStart: props => {
              component = new SuggestionList(props);
            },

            onUpdate(props) {
              component.updateProps(props);
            },

            onKeyDown(props) {
              if (!component) return false;
              return component.onKeyDown(props);
            },

            onExit() {
              if (component) {
                component.destroy();
              }
            },
          };
        },
      }),
    ];
  },
});
```

## 5. Suggestion List UI (SuggestionList.ts)

```typescript
import tippy, { Instance as TippyInstance } from 'tippy.js';
import { SuggestionProps } from '@tiptap/suggestion';

export class SuggestionList {
  private element: HTMLElement;
  private popup: TippyInstance[];
  private selectedIndex: number = 0;
  private props: SuggestionProps;

  constructor(props: SuggestionProps) {
    this.props = props;
    this.element = document.createElement('div');
    this.element.className = 'suggestion-list';
    
    this.render();
    
    this.popup = tippy('body', {
      getReferenceClientRect: props.clientRect as any,
      appendTo: () => document.body,
      content: this.element,
      showOnCreate: true,
      interactive: true,
      trigger: 'manual',
      placement: 'bottom-start',
      maxWidth: 300,
    });
  }

  render() {
    const items = this.props.items;
    
    if (items.length === 0) {
      this.element.innerHTML = '<div class="suggestion-item empty">No results</div>';
      return;
    }

    this.element.innerHTML = items
      .map((item: any, index: number) => `
        <div class="suggestion-item ${index === this.selectedIndex ? 'selected' : ''}"
             data-index="${index}">
          <span class="suggestion-icon">📄</span>
          <span class="suggestion-label">${item.label}</span>
        </div>
      `)
      .join('');

    // Add click handlers
    this.element.querySelectorAll('.suggestion-item').forEach((el, index) => {
      el.addEventListener('click', () => {
        this.selectItem(index);
      });
    });
  }

  updateProps(props: SuggestionProps) {
    this.props = props;
    this.selectedIndex = 0;
    this.render();

    if (this.popup?.[0]) {
      this.popup[0].setProps({
        getReferenceClientRect: props.clientRect as any,
      });
    }
  }

  onKeyDown({ event }: { event: KeyboardEvent }): boolean {
    if (event.key === 'ArrowUp') {
      this.upHandler();
      return true;
    }

    if (event.key === 'ArrowDown') {
      this.downHandler();
      return true;
    }

    if (event.key === 'Enter') {
      this.enterHandler();
      return true;
    }

    return false;
  }

  upHandler() {
    this.selectedIndex = Math.max(0, this.selectedIndex - 1);
    this.render();
  }

  downHandler() {
    this.selectedIndex = Math.min(
      this.props.items.length - 1,
      this.selectedIndex + 1
    );
    this.render();
  }

  enterHandler() {
    this.selectItem(this.selectedIndex);
  }

  selectItem(index: number) {
    const item = this.props.items[index];
    if (item) {
      this.props.command(item);
    }
  }

  destroy() {
    if (this.popup?.[0]) {
      this.popup[0].destroy();
    }
    this.element.remove();
  }
}
```

## 6. Paste Handler Extension (PasteHandler.ts)

```typescript
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Slice } from '@tiptap/pm/model';
import { Vault, TFile } from 'obsidian';
import { WYSIWYGView } from '../WYSIWYGView';

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
              for (const item of items) {
                if (item.type.startsWith('image/')) {
                  const file = item.getAsFile();
                  if (file) {
                    handleImagePaste(file, editorView, vault, view);
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
              // Check if pasted text is a link
              const parsedLink = parseLinkFromPaste(text, vault);
              
              // Wikilink: create wikilink node
              if (text.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/)) {
                const match = text.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
                const href = match![1];
                const alias = match![2] || href;
                
                const node = editorView.state.schema.nodes.wikilink.create({
                  href,
                  alias,
                });
                
                const tr = editorView.state.tr.replaceSelectionWith(node);
                editorView.dispatch(tr);
                return true;
              }

              // Regular URL: create link
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
  vault: Vault,
  wysiwygView: WYSIWYGView
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
  const wikiMatch = text.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
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
```

## 7. Code Block Extension (CodeBlock.ts)

```typescript
import { Node, mergeAttributes, textblockTypeInputRule } from '@tiptap/core';

export const CodeBlockExtension = Node.create({
  name: 'codeBlock',

  content: 'text*',

  marks: '',

  group: 'block',

  code: true,

  defining: true,

  addAttributes() {
    return {
      language: {
        default: null,
        parseHTML: element => {
          const { languageClassPrefix } = this.options;
          const classNames = [...(element.firstElementChild?.classList || [])];
          const languages = classNames
            .filter(className => className.startsWith(languageClassPrefix))
            .map(className => className.replace(languageClassPrefix, ''));
          const language = languages[0];

          if (!language) {
            return null;
          }

          return language;
        },
        rendered: false,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'pre',
        preserveWhitespace: 'full',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'pre',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      [
        'code',
        {
          class: node.attrs.language
            ? `language-${node.attrs.language}`
            : null,
        },
        0,
      ],
    ];
  },

  addCommands() {
    return {
      setCodeBlock: attributes => ({ commands }) => {
        return commands.setNode(this.name, attributes);
      },
      toggleCodeBlock: attributes => ({ commands }) => {
        return commands.toggleNode(this.name, 'paragraph', attributes);
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-c': () => this.editor.commands.toggleCodeBlock(),
      Backspace: () => {
        const { empty, $anchor } = this.editor.state.selection;
        const isAtStart = $anchor.pos === 1;

        if (!empty || $anchor.parent.type.name !== this.name) {
          return false;
        }

        if (isAtStart) {
          return this.editor.commands.clearNodes();
        }

        return false;
      },
    };
  },

  addInputRules() {
    return [
      textblockTypeInputRule({
        find: /^```([a-z]+)?[\s\n]$/,
        type: this.type,
        getAttributes: match => ({
          language: match[1],
        }),
      }),
    ];
  },
});
```

## 8. Properties Panel (PropertiesPanel.ts)

```typescript
export class PropertiesPanel {
  private container: HTMLElement;
  private properties: Record<string, any>;
  private onChange: (properties: Record<string, any>) => void;
  private isExpanded: boolean = false;
  private contentEl: HTMLElement;

  constructor(
    container: HTMLElement,
    properties: Record<string, any>,
    onChange: (properties: Record<string, any>) => void
  ) {
    this.container = container;
    this.properties = properties;
    this.onChange = onChange;
    this.render();
  }

  render() {
    this.container.empty();
    
    // Create toggle header
    const header = this.container.createDiv('properties-header');
    
    const toggle = header.createSpan('properties-toggle');
    toggle.setText(this.isExpanded ? '▼' : '▶');
    toggle.addEventListener('click', () => {
      this.isExpanded = !this.isExpanded;
      this.render();
    });

    const title = header.createSpan('properties-title');
    const count = Object.keys(this.properties).length;
    title.setText(`Properties ${count > 0 ? `(${count})` : ''}`);

    // Create add button
    const addBtn = header.createSpan('properties-add-btn');
    addBtn.setText('+');
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.addProperty();
    });

    // Create content area
    if (this.isExpanded || count > 0) {
      this.contentEl = this.container.createDiv('properties-content');
      
      if (this.isExpanded) {
        this.renderProperties();
      }
    }
  }

  renderProperties() {
    if (!this.contentEl) return;

    this.contentEl.empty();

    for (const [key, value] of Object.entries(this.properties)) {
      const row = this.contentEl.createDiv('property-row');

      // Key input
      const keyInput = row.createEl('input', {
        type: 'text',
        value: key,
        cls: 'property-key',
      });

      keyInput.addEventListener('change', () => {
        const newKey = keyInput.value;
        if (newKey !== key && newKey) {
          const newProps = { ...this.properties };
          delete newProps[key];
          newProps[newKey] = value;
          this.properties = newProps;
          this.onChange(this.properties);
          this.renderProperties();
        }
      });

      // Value input
      const valueInput = row.createEl('input', {
        type: 'text',
        value: String(value),
        cls: 'property-value',
      });

      valueInput.addEventListener('change', () => {
        this.properties[key] = valueInput.value;
        this.onChange(this.properties);
      });

      // Delete button
      const deleteBtn = row.createSpan('property-delete');
      deleteBtn.setText('×');
      deleteBtn.addEventListener('click', () => {
        const newProps = { ...this.properties };
        delete newProps[key];
        this.properties = newProps;
        this.onChange(this.properties);
        this.renderProperties();
      });
    }

    if (Object.keys(this.properties).length === 0) {
      const empty = this.contentEl.createDiv('properties-empty');
      empty.setText('No properties. Click + to add.');
    }
  }

  addProperty() {
    this.isExpanded = true;
    const newKey = `property${Object.keys(this.properties).length + 1}`;
    this.properties[newKey] = '';
    this.onChange(this.properties);
    this.render();
  }

  update(properties: Record<string, any>) {
    this.properties = properties;
    this.render();
  }
}
```

## 9. Popup Modal Editor (WYSIWYGModal.ts)

```typescript
import { Modal, App, TFile } from 'obsidian';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import WYSIWYGPlugin from '../../main';
import { WikiLink } from './extensions/WikiLink';
import { FileMention } from './extensions/FileMention';
import { PasteHandler } from './extensions/PasteHandler';
import { CodeBlockExtension } from './extensions/CodeBlock';

export class WYSIWYGModal extends Modal {
  editor: Editor;
  plugin: WYSIWYGPlugin;
  currentFile: TFile | null = null;

  constructor(app: App, plugin: WYSIWYGPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass('wysiwyg-modal');

    // Create header with file selector
    const header = contentEl.createDiv('modal-header');
    
    const fileBtn = header.createEl('button', {
      text: 'Select File',
    });
    
    fileBtn.addEventListener('click', async () => {
      // Open file suggester
      const file = await this.selectFile();
      if (file) {
        this.loadFile(file);
      }
    });

    const saveBtn = header.createEl('button', {
      text: 'Save',
    });
    
    saveBtn.addEventListener('click', () => {
      this.saveFile();
    });

    // Create editor container
    const editorContainer = contentEl.createDiv('modal-editor-container');

    // Initialize editor (same config as main view)
    this.editor = new Editor({
      element: editorContainer,
      extensions: [
        StarterKit.configure({
          codeBlock: false,
        }),
        Link.configure({
          openOnClick: false,
        }),
        Image.configure({
          inline: true,
          allowBase64: true,
        }),
        Placeholder.configure({
          placeholder: "Type '/' for commands or '@' to link...",
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
          view: null, // No view context in modal
        }),
      ],
      editorProps: {
        attributes: {
          class: 'wysiwyg-editor modal-editor',
        },
      },
    });
  }

  async selectFile(): Promise<TFile | null> {
    // Simple implementation - show all markdown files
    // Could be enhanced with proper file suggester
    const files = this.app.vault.getMarkdownFiles();
    
    // For now, just return first file (implement proper selector later)
    return files[0] || null;
  }

  async loadFile(file: TFile) {
    this.currentFile = file;
    const content = await this.app.vault.read(file);
    this.editor.commands.setContent(content);
  }

  async saveFile() {
    if (!this.currentFile) return;
    
    const markdown = this.editor.storage.markdown.getMarkdown();
    await this.app.vault.modify(this.currentFile, markdown);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    
    if (this.editor) {
      this.editor.destroy();
    }
  }
}
```

## 10. Styles (styles.css)

```css
/* Main Container */
.wysiwyg-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 20px;
  overflow-y: auto;
}

/* Properties Panel */
.properties-container {
  margin-bottom: 20px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  background: var(--background-secondary);
}

.properties-header {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
}

.properties-toggle {
  margin-right: 8px;
  font-size: 12px;
}

.properties-title {
  flex: 1;
  font-weight: 600;
  font-size: 13px;
}

.properties-add-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
}

.properties-add-btn:hover {
  background: var(--background-modifier-hover);
}

.properties-content {
  padding: 8px 12px;
  border-top: 1px solid var(--background-modifier-border);
}

.property-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
}

.property-key,
.property-value {
  padding: 4px 8px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  background: var(--background-primary);
  font-size: 13px;
}

.property-key {
  flex: 0 0 150px;
  font-weight: 500;
}

.property-value {
  flex: 1;
}

.property-delete {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 4px;
  font-size: 18px;
  color: var(--text-muted);
}

.property-delete:hover {
  background: var(--background-modifier-error);
  color: var(--text-error);
}

.properties-empty {
  padding: 12px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

/* Editor */
.editor-container {
  flex: 1;
  overflow-y: auto;
}

.wysiwyg-editor {
  min-height: 500px;
  outline: none;
  font-size: 16px;
  line-height: 1.6;
}

.wysiwyg-editor .ProseMirror {
  outline: none;
  padding: 12px;
}

.wysiwyg-editor .ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: var(--text-muted);
  pointer-events: none;
  height: 0;
}

/* Wikilinks */
.internal-link {
  color: var(--link-color);
  text-decoration: none;
  cursor: pointer;
  border-bottom: 1px solid var(--link-color);
}

.internal-link:hover {
  color: var(--link-color-hover);
  border-bottom-color: var(--link-color-hover);
}

/* Mentions */
.mention {
  color: var(--link-color);
  background: var(--background-modifier-hover);
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.mention:hover {
  background: var(--background-modifier-border);
}

/* Suggestion List */
.suggestion-list {
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.suggestion-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.suggestion-item:hover,
.suggestion-item.selected {
  background: var(--background-modifier-hover);
}

.suggestion-icon {
  margin-right: 8px;
  font-size: 16px;
}

.suggestion-label {
  flex: 1;
}

.suggestion-item.empty {
  color: var(--text-muted);
  cursor: default;
}

.suggestion-item.empty:hover {
  background: transparent;
}

/* Code Blocks */
.wysiwyg-editor pre {
  background: var(--code-background);
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  padding: 12px;
  margin: 12px 0;
  overflow-x: auto;
}

.wysiwyg-editor code {
  font-family: var(--font-monospace);
  font-size: 14px;
  color: var(--code-normal);
}

/* Images */
.wysiwyg-editor img {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 12px 0;
}

/* Modal */
.wysiwyg-modal {
  width: 90vw;
  max-width: 1200px;
  height: 90vh;
}

.modal-header {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--background-modifier-border);
}

.modal-header button {
  padding: 6px 12px;
  border-radius: 4px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  cursor: pointer;
}

.modal-header button:hover {
  background: var(--background-modifier-hover);
}

.modal-editor-container {
  height: calc(100% - 60px);
  overflow-y: auto;
  padding: 20px;
}

.modal-editor {
  min-height: 100%;
}
```

## 11. Build Configuration (esbuild.config.mjs)

```javascript
import esbuild from 'esbuild';
import process from 'process';
import builtins from 'builtin-modules';

const banner = `/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
*/
`;

const prod = process.argv[2] === 'production';

esbuild
  .build({
    banner: {
      js: banner,
    },
    entryPoints: ['main.ts'],
    bundle: true,
    external: [
      'obsidian',
      'electron',
      '@codemirror/autocomplete',
      '@codemirror/collab',
      '@codemirror/commands',
      '@codemirror/language',
      '@codemirror/lint',
      '@codemirror/search',
      '@codemirror/state',
      '@codemirror/view',
      '@lezer/common',
      '@lezer/highlight',
      '@lezer/lr',
      ...builtins,
    ],
    format: 'cjs',
    watch: !prod,
    target: 'es2018',
    logLevel: 'info',
    sourcemap: prod ? false : 'inline',
    treeShaking: true,
    outfile: 'main.js',
  })
  .catch(() => process.exit(1));
```

## 12. Manifest (manifest.json)

```json
{
  "id": "wysiwyg-editor",
  "name": "WYSIWYG Editor",
  "version": "1.0.0",
  "minAppVersion": "0.15.0",
  "description": "Notion-like WYSIWYG editor for Obsidian",
  "author": "Your Name",
  "authorUrl": "https://yourwebsite.com",
  "isDesktopOnly": true
}
```

## 13. Implementation Checklist

### Phase 1: Basic Setup (Day 1-2)
- [ ] Initialize npm project with all dependencies
- [ ] Create file structure
- [ ] Set up build configuration
- [ ] Create basic plugin entry point
- [ ] Register WYSIWYG view type
- [ ] Override .md file extensions

### Phase 2: Core Editor (Day 3-4)
- [ ] Implement WYSIWYGView class
- [ ] Initialize TipTap with StarterKit
- [ ] Add Markdown extension for serialization
- [ ] Implement file load/save methods
- [ ] Test basic editing and persistence

### Phase 3: WikiLinks (Day 5)
- [ ] Create WikiLink extension
- [ ] Parse existing [[links]] on load
- [ ] Render wikilinks as clickable elements
- [ ] Handle wikilink clicks to open files

### Phase 4: @ Mentions (Day 6-7)
- [ ] Create FileMention extension
- [ ] Implement Suggestion plugin integration
- [ ] Build SuggestionList UI component
- [ ] Add keyboard navigation
- [ ] Test @ mention workflow

### Phase 5: Paste Handler (Day 8)
- [ ] Create PasteHandler extension
- [ ] Parse and convert [[wikilinks]]
- [ ] Parse and convert URLs
- [ ] Parse and convert markdown links
- [ ] Handle image paste
- [ ] Test all paste scenarios

### Phase 6: Code Blocks (Day 9)
- [ ] Create CodeBlock extension
- [ ] Add ``` input rule
- [ ] Style code blocks
- [ ] Test code block editing

### Phase 7: Front Matter / Properties (Day 10-11)
- [ ] Integrate gray-matter library
- [ ] Create PropertiesPanel component
- [ ] Parse YAML front matter on load
- [ ] Render properties UI
- [ ] Handle property add/edit/delete
- [ ] Save properties back to YAML

### Phase 8: Popup Modal (Day 12)
- [ ] Create WYSIWYGModal class
- [ ] Initialize editor in modal
- [ ] Add file selector
- [ ] Implement save functionality
- [ ] Test modal workflow

### Phase 9: Styling (Day 13)
- [ ] Apply Notion-inspired styles
- [ ] Style properties panel
- [ ] Style suggestion list
- [ ] Style code blocks
- [ ] Ensure dark/light theme compatibility

### Phase 10: Testing & Polish (Day 14)
- [ ] Test all features end-to-end
- [ ] Fix bugs
- [ ] Test with various markdown files
- [ ] Test paste scenarios
- [ ] Test image handling
- [ ] Verify file saving doesn't corrupt data

## 14. Critical Edge Cases

### File Loading
- Empty files
- Files with only front matter
- Files with complex nested markdown
- Very large files (handle gracefully, no optimization needed for MVP)

### Wikilinks
- Links to non-existent files
- Links with spaces
- Links with special characters
- Links to files in subfolders

### @ Mentions
- Typing @ at start of line
- Typing @ mid-sentence
- Files with identical names in different folders
- Escaping @ character

### Paste
- Pasting multiple lines
- Pasting with formatting
- Pasting HTML content
- Pasting binary data
- Pasting when nothing is selected vs text is selected

### Front Matter
- Empty front matter
- Invalid YAML
- Nested objects
- Arrays
- Special characters in keys/values

### Images
- Pasting images
- Dragging images
- Very large images
- Non-image files
- Missing attachments folder

### Saving
- Rapid edits (debounce may be needed)
- Concurrent file modifications
- Disk write failures
- Invalid markdown generation

## 15. Known Limitations (Acceptable for MVP)

- No performance optimization for large files
- No collaborative editing
- No mobile support
- No syntax highlighting in code blocks
- Basic table support (from StarterKit)
- No math/LaTeX
- No Mermaid diagrams
- No custom callouts (can be added later)
- Basic front matter handling (strings/numbers only)
- No advanced markdown extensions
- Popup editor has basic file selector (can be enhanced)

## 16. Testing Commands

Once implemented, test these scenarios:

```bash
# Basic editing
1. Open any .md file
2. Type text, format (bold, italic, lists)
3. Save (Cmd+S)
4. Close and reopen - verify changes persist

# Wikilinks
1. Paste [[My Note]]
2. Click it - should open My Note
3. Paste [[Folder/Note]]
4. Click it - should open correctly

# @ Mentions
1. Type @ and see dropdown
2. Arrow keys to navigate
3. Enter to select
4. Click mention to open file

# Images
1. Paste image from clipboard
2. Should upload to attachments/
3. Should display inline
4. Verify markdown has correct path

# Code blocks
1. Type ```
2. Should create code block
3. Type code
4. Exit with arrow keys

# Properties
1. Open file with front matter
2. Properties panel shows at top
3. Click + to add property
4. Edit property
5. Delete property
6. Save and reopen - verify persistence

# Popup editor
1. Click ribbon icon
2. Editor opens in modal
3. Can edit and save

# Paste scenarios
1. Paste https://example.com
2. Paste [[wikilink]]
3. Select text, paste URL - text becomes link
4. Paste image
```

## 17. Success Criteria

The MVP is complete when:
- All .md files open in WYSIWYG editor (not default markdown editor)
- Can create and edit notes with formatting
- Wikilinks work (click to navigate)
- @ mentions work (autocomplete and navigate)
- Images paste and display
- Code blocks work
- Front matter displays as properties
- Popup editor works
- Files save correctly as markdown
- Round-trip editing doesn't corrupt files

## 18. Post-MVP Enhancements (Not in Scope)

- Slash commands menu
- Drag handles for blocks
- Block selection
- Improved code syntax highlighting
- Tables UI
- Custom callouts
- Nested properties
- Better file selector in modal
- Keyboard shortcuts customization
- Settings panel
- Export options
- Performance optimization
- Mobile support
