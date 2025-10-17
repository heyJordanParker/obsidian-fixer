import { Plugin, WorkspaceLeaf, ViewState } from 'obsidian';
import { around } from 'monkey-around';
import { WYSIWYGView, WYSIWYG_VIEW_TYPE } from './src/editor/WYSIWYGView';

export default class WYSIWYGPlugin extends Plugin {
  private _loaded: boolean = false;

  async onload() {
    console.log('Loading WYSIWYG Plugin');

    // Register the custom view
    this.registerView(
      WYSIWYG_VIEW_TYPE,
      (leaf) => new WYSIWYGView(leaf, this)
    );

    // Register keyboard shortcuts as commands
    this.registerCommands();

    // Monkey patch WorkspaceLeaf.setViewState to intercept markdown view creation
    this.registerMonkeyPatches();

    this._loaded = true;
  }

  private registerCommands() {
    // Bold
    this.addCommand({
      id: 'toggle-bold',
      name: 'Toggle bold',
      hotkeys: [{ modifiers: ['Mod'], key: 'b' }],
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(WYSIWYGView);
        if (view?.editor) {
          if (!checking) {
            view.editor.commands.toggleBold();
          }
          return true;
        }
        return false;
      },
    });

    // Italic
    this.addCommand({
      id: 'toggle-italic',
      name: 'Toggle italic',
      hotkeys: [{ modifiers: ['Mod'], key: 'i' }],
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(WYSIWYGView);
        if (view?.editor) {
          if (!checking) {
            view.editor.commands.toggleItalic();
          }
          return true;
        }
        return false;
      },
    });

    // Strikethrough
    this.addCommand({
      id: 'toggle-strikethrough',
      name: 'Toggle strikethrough',
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'x' }],
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(WYSIWYGView);
        if (view?.editor) {
          if (!checking) {
            view.editor.commands.toggleStrike();
          }
          return true;
        }
        return false;
      },
    });

    // Toggle task list - [] shortcut
    this.addCommand({
      id: 'toggle-task-list',
      name: 'Toggle task list',
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: '[' }],
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(WYSIWYGView);
        if (view?.editor) {
          if (!checking) {
            view.editor.commands.toggleTaskList();
          }
          return true;
        }
        return false;
      },
    });

    // Underline
    this.addCommand({
      id: 'toggle-underline',
      name: 'Toggle underline',
      hotkeys: [{ modifiers: ['Mod'], key: 'u' }],
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(WYSIWYGView);
        if (view?.editor) {
          if (!checking) {
            view.editor.commands.toggleUnderline();
          }
          return true;
        }
        return false;
      },
    });

    // Insert/edit link
    this.addCommand({
      id: 'insert-link',
      name: 'Insert link',
      hotkeys: [{ modifiers: ['Mod'], key: 'k' }],
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(WYSIWYGView);
        if (view?.editor) {
          if (!checking) {
            const { from, to } = view.editor.state.selection;
            const text = view.editor.state.doc.textBetween(from, to);

            // Get existing link if cursor is in one
            const link = view.editor.getAttributes('link');
            const currentUrl = link.href || '';

            // Prompt for URL
            const url = prompt('Enter URL:', currentUrl);
            if (url !== null) {
              if (url === '') {
                // Remove link if URL is empty
                view.editor.commands.unsetLink();
              } else {
                // Set link
                view.editor.commands.setLink({ href: url });
              }
            }
          }
          return true;
        }
        return false;
      },
    });
  }

  private registerMonkeyPatches() {
    const self = this;

    // Monkey patch WorkspaceLeaf.prototype.setViewState
    this.register(
      around(WorkspaceLeaf.prototype, {
        setViewState(next) {
          return function (state: ViewState, ...rest: unknown[]) {
            // Intercept when Obsidian tries to open a markdown view
            if (
              self._loaded &&
              state.type === 'markdown' &&
              state.state?.file
            ) {
              // Replace the view type with our custom WYSIWYG view
              const newState = {
                ...state,
                type: WYSIWYG_VIEW_TYPE
              };

              // Call the original method with modified state
              return next.apply(this, [newState, ...rest]);
            }

            // For all other cases, call the original method unchanged
            return next.apply(this, [state, ...rest]);
          };
        }
      })
    );
  }

  onunload() {
    console.log('Unloading WYSIWYG Plugin');
    // The this.register() call ensures the monkey patch is automatically removed
  }
}
