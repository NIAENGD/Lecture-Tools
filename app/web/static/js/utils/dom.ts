export function qs<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Unable to find element for selector: ${selector}`);
  }
  return element;
}

export function qsa<T extends Element>(root: ParentNode, selector: string): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

export function toggle(element: Element | null | undefined, show: boolean): void {
  if (!element) {
    return;
  }
  element.toggleAttribute('hidden', !show);
}

export function setBusy(element: HTMLElement | null | undefined, busy: boolean): void {
  if (!element) {
    return;
  }
  if (busy) {
    element.setAttribute('aria-busy', 'true');
  } else {
    element.removeAttribute('aria-busy');
  }
}

export function renderList<T>(
  container: HTMLElement,
  items: T[],
  renderItem: (item: T, index: number) => HTMLElement,
): void {
  const fragment = document.createDocumentFragment();
  items.forEach((item, index) => {
    fragment.appendChild(renderItem(item, index));
  });
  container.replaceChildren(fragment);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) {
    return '—';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch (error) {
    console.warn('Failed to format date', error);
    return value;
  }
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return `${Math.round(value)}%`;
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: { className?: string; text?: string } = {},
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (options.className) {
    element.className = options.className;
  }
  if (options.text !== undefined) {
    element.textContent = options.text;
  }
  return element;
}

export function setActiveTab(buttons: HTMLButtonElement[], active: string): void {
  buttons.forEach((button) => {
    const isActive = button.dataset.view === active;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

export function switchView(views: HTMLElement[], active: string): void {
  views.forEach((view) => {
    const isActive = view.dataset.view === active;
    view.classList.toggle('active', isActive);
    view.toggleAttribute('hidden', !isActive);
  });
}
