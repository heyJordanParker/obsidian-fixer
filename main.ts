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

    // Monkey patch WorkspaceLeaf.setViewState to intercept markdown view creation
    this.registerMonkeyPatches();

    this._loaded = true;
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
