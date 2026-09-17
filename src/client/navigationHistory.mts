export class Navstack {

  private $list!: HTMLElement;
  // Cached live reference to the children of $list
  private $stack!: HTMLCollection;
  private $clear!: HTMLElement;
  private index!: number;

  public constructor(
    private $navstack: HTMLElement,
    private $back_b: HTMLElement,
    private $forw_b: HTMLElement,
    private jump: (index: number, options: { pushNavigation: boolean }) => any
  ) {
    this.reset = this.reset.bind(this);
    this.back = this.back.bind(this);
    this.forward = this.forward.bind(this);
    this.clickHandler = this.clickHandler.bind(this);
    this.reset();
  }

  public reset() {
    this.index = -1;

    this.$back_b.removeEventListener('click', this.back);
    this.$back_b.addEventListener('click', this.back);
    this.$forw_b.removeEventListener('click', this.forward);
    this.$forw_b.addEventListener('click', this.forward);
    this.$back_b.classList.add('inactive');
    this.$forw_b.classList.add('inactive');

    this.$navstack.innerHTML = '<p>Navigation history:</p>';

    this.$list = document.createElement('ul');
    this.$stack = this.$list.children;
    this.$navstack.appendChild(this.$list);

    const clr = document.createElement('span');
    clr.id = 'nav_clear';
    clr.classList.add('mdi', 'mdi-close-circle-outline', 'is-hidden');
    clr.style.display = 'block';
    clr.style.fontSize = '18px';
    clr.style.float = 'right';
    clr.style.marginRight = '10px';
    clr.addEventListener('click', this.reset)

    this.$clear = clr;
    this.$navstack.appendChild(this.$clear)
  }

  targetOf(item: Element | undefined): number {
    const target = (item as HTMLElement | undefined)?.dataset['targetIndex'];
    if (typeof target === 'undefined') {
      return -1;
    }
    return parseInt(target);
  }

  public push(index: number, label: string) {
    if (index === this.targetOf(this.$stack[this.index])) {
      return;
    }
    // Truncate the stack
    while (this.$stack.length > this.index + 1) {
      this.$list.removeChild(this.$list.lastChild!);
    }

    this.$stack[this.index]?.classList.remove('active');
    const item = document.createElement('li');

    item.classList.add('active');
    item.innerHTML = `<a><span class="mdi mdi-card-bulleted"></span>${label}</a>`
    item.dataset['targetIndex'] = index.toString();
    item.dataset['index'] = (this.index + 1).toString();
    item.addEventListener('click', this.clickHandler);
    this.$list.appendChild(item);

    this.markActive(this.index + 1);

    this.$clear.classList.remove('is-hidden')
  }

  markActive(newIndex: number): HTMLElement | null {
    if (newIndex < 0 || newIndex >= this.$stack.length) {
      return null;
    }

    this.$stack[this.index]?.classList.remove('active');
    this.index = newIndex;

    this.$back_b.classList.toggle(
      'inactive',
      this.$stack.length <= 1 || this.index === 0
    );
    this.$forw_b.classList.toggle(
      'inactive',
      this.index >= this.$stack.length - 1
    );

    const next = this.$stack[this.index]!;
    next.classList.add('active');
    next.scrollIntoView()

    return next as HTMLElement;
  }

  activate(newIndex: number) {
    const next = this.markActive(newIndex);
    if (next === null) {
      return;
    }

    this.jump(this.targetOf(next), { pushNavigation: false })
  }

  clickHandler(ev: PointerEvent) {
    const index = parseInt((ev.currentTarget as HTMLElement).dataset['index']!);
    this.activate(index)
  }

  public back() {
    this.activate(this.index - 1)
  }

  public forward() {
    this.activate(this.index + 1)
  }
}
