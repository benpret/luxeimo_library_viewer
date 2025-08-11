// VirtualGrid v2: true windowed / recycled rendering for large collections.
// Absolute positioning inside a tall container; only visible + overscan rows are in the DOM.
// API: new VirtualGrid({ container, scrollParent, renderItem, itemMinWidth, itemHeight, gap, overscanRows })
// Methods: setItems(items), refreshLayout() (on external resize), destroy()

export class VirtualGrid {
  constructor({
    container,
    scrollParent = container.parentElement,
    renderItem,
    itemMinWidth = 200,
    itemHeight = 240,
  gap = 6,
  overscanRows = 2,
  square = false
  }) {
    this.container = container;
    this.scrollParent = scrollParent;
    this.renderItem = renderItem;
    this.itemMinWidth = itemMinWidth;
    this.itemHeight = itemHeight;
    this.gap = gap;
    this.overscanRows = overscanRows;
  this.items = [];
    this.columns = 1;
    this.totalRows = 0;
    this.firstRow = 0;
    this.lastRow = 0;
    this.renderedRange = { start: 0, end: -1 };
    this.nodePool = new Map(); // id -> element
    this.recycled = [];
  this.square = square;
  this._resizeObserver = new ResizeObserver(() => this.refreshLayout());
    this._resizeObserver.observe(this.scrollParent);
    this.handleScroll = this.handleScroll.bind(this);
    this.scrollParent.addEventListener('scroll', this.handleScroll, { passive: true });
  }

  setItems(items) {
    this.items = items || [];
    this.computeGeometry();
    this.renderVisible();
  }

  computeGeometry() {
    const width = this.scrollParent.clientWidth;
    const columns = Math.max(1, Math.floor((width + this.gap) / (this.itemMinWidth + this.gap)));
    this.columns = columns;
    this.cardWidth = Math.floor((width - (this.gap * (columns - 1))) / columns);
    if (this.square) {
      this.itemHeight = this.cardWidth; // force square
    }
    this.totalRows = Math.ceil(this.items.length / columns);
    const totalHeight = this.totalRows * (this.itemHeight + this.gap) - this.gap;
    this.container.style.height = totalHeight + 'px';
  }

  handleScroll() { this.renderVisible(); }

  refreshLayout() {
    const prevCols = this.columns;
    this.computeGeometry();
    if (prevCols !== this.columns) {
      // columns changed: reposition everything by forcing rerender
      this.renderedRange = { start: 0, end: -1 };
    }
    this.renderVisible();
  }

  calcVisibleRowWindow() {
    const scrollTop = this.scrollParent.scrollTop;
    const vh = this.scrollParent.clientHeight;
    const rowHeight = this.itemHeight + this.gap;
    let firstRow = Math.floor(scrollTop / rowHeight) - this.overscanRows;
    let lastRow = Math.ceil((scrollTop + vh) / rowHeight) + this.overscanRows;
    firstRow = Math.max(0, firstRow);
    lastRow = Math.min(this.totalRows - 1, lastRow);
    return { firstRow, lastRow };
  }

  renderVisible() {
    if (!this.items.length) { this.container.innerHTML = ''; return; }
    const { firstRow, lastRow } = this.calcVisibleRowWindow();
    this.firstRow = firstRow; this.lastRow = lastRow;
    const startIndex = firstRow * this.columns;
    const endIndex = Math.min(this.items.length - 1, (lastRow + 1) * this.columns - 1);
    if (startIndex === this.renderedRange.start && endIndex === this.renderedRange.end) return; // no change
    this.renderedRange = { start: startIndex, end: endIndex };

    // Mark currently used nodes
    const inUse = new Set();
    for (let i = startIndex; i <= endIndex; i++) {
      const item = this.items[i];
      if (!item) continue;
      const id = item.id || item.shortId || i;
      let el = this.nodePool.get(id);
      if (!el) {
        el = this.renderItem(item);
        el.classList.add('vg-item');
        this.nodePool.set(id, el);
        this.container.appendChild(el);
      }
      this.positionElement(el, i - startIndex + startIndex); // position by absolute index i
      // Tag with index for later reuse
      el.dataset.vgIndex = i;
      inUse.add(id);
    }

    // Recycle nodes not in range
    for (const [id, el] of this.nodePool.entries()) {
      if (!inUse.has(id)) {
        // Remove from DOM to keep focus ring logic simple (could pool hidden)
        el.remove();
        this.nodePool.delete(id);
      }
    }
  }

  positionElement(el, absoluteIndex) {
    const row = Math.floor(absoluteIndex / this.columns);
    const col = absoluteIndex % this.columns;
    const x = col * (this.cardWidth + this.gap);
    const y = row * (this.itemHeight + this.gap);
    el.style.position = 'absolute';
    el.style.width = this.cardWidth + 'px';
    el.style.height = this.itemHeight + 'px';
    el.style.transform = `translate(${x}px, ${y}px)`;
  }

  destroy() {
    this.scrollParent.removeEventListener('scroll', this.handleScroll);
    this._resizeObserver.disconnect();
    this.nodePool.clear();
  }
}
