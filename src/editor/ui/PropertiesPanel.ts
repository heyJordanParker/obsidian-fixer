export class PropertiesPanel {
  private container: HTMLElement;
  private properties: Record<string, any>;
  private onChange: (properties: Record<string, any>) => void;
  private isExpanded: boolean = false;
  private contentEl: HTMLElement | null = null;

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
