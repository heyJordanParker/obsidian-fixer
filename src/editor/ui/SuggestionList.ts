import tippy, { Instance as TippyInstance } from 'tippy.js';
import type { SuggestionProps } from '@tiptap/suggestion';

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
      .map((item: any, index: number) => {
        // Support both file mentions (with label) and commands (with title)
        const label = item.label || item.title || 'Unknown';
        const icon = item.icon || '📄';

        return `
          <div class="suggestion-item ${index === this.selectedIndex ? 'selected' : ''}"
               data-index="${index}">
            <span class="suggestion-icon">${icon}</span>
            <span class="suggestion-label">${label}</span>
          </div>
        `;
      })
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
