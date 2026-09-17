import { type Step as StepV2 } from '../shared/elaborator/trace_v2.mjs';
// import { elide } from '../shared/string.mjs';
// import Unreachable from '../shared/unreachable.mjs';

type InboxCard = {
  id: number,
  rt: number,
  rt_sub: number[],
  kind: StepV2['kind'],
  goal_id: number,
  goal_text: string,
  goal_text_elided: string,
  goal_text_highlighted: string,
  goal_text_highlighted_elided: string,
  goal_predicate: string,
  status_label: [number, number, number][],
  card_class: string,
  card_index: number,
  footer: string,
};


export class MessageFeed {
  public constructor(
    private $feed: HTMLElement,
    private showMessage: (index: number) => void,
    private jump: (index: number) => void,
    private toggleRuntimes: (runtimes: number[]) => void,
  ) {
    this.cardClickHandler = this.cardClickHandler.bind(this);
    this.nextAttempClickHandler = this.nextAttempClickHandler.bind(this);
    this.toggleRuntimesClickHandler = this.toggleRuntimesClickHandler.bind(this);
  }

  public reset() {
    this.$feed.replaceChildren();
  }

  cardClickHandler(ev: PointerEvent) {
    const index = parseInt((ev.currentTarget as HTMLElement).dataset['inboxId']!);
    this.showMessage(index)
  }

  nextAttempClickHandler(ev: PointerEvent) {
    // The next attempt link is a child of the card, need to prevent triggering
    // the card click handler.
    ev.stopPropagation();
    const index = parseInt((ev.currentTarget as HTMLElement).dataset['inboxId']!);
    this.jump(index)
  }

  toggleRuntimesClickHandler(ev: PointerEvent) {
    // Don't trigger the card click handler
    ev.stopPropagation();
    const runtimeIds =
      ((ev.currentTarget as HTMLElement).dataset['rtSub']?.split(',') ?? [])
        .map(id => parseInt(id));
    if (runtimeIds.length === 0) {
      return;
    }

    this.toggleRuntimes(runtimeIds);
  }

  mountToggleButton(snippetContent: Node, rtsubs: number[]) {
    const toggle = document.createElement('button');
    toggle.classList.add('button', 'is-small');
    toggle.style.width = '100%';
    toggle.addEventListener('click', this.toggleRuntimesClickHandler);
    toggle.dataset['rtSub'] = rtsubs.join(',')
    toggle.textContent = 'Toggle';
    snippetContent.appendChild(toggle);
  }

  public show(cards: InboxCard[]) {
    this.$feed.classList.remove('is-hidden');
    const inbox = document.createElement('div');
    inbox.id = 'inbox-messages';
    inbox.classList.add('inbox-messages');

    cards.forEach((data, idx) => {
      const card = document.createElement('div');
      card.id = `msg-card-${idx}`;
      card.classList.add(data.card_class)
      card.dataset['inboxId'] = idx.toString();
      card.addEventListener('click', this.cardClickHandler)

      const content = document.createElement('div');
      content.classList.add('card-content')

      const header = document.createElement('div');
      header.classList.add('msg-header');
      const goalText = document.createElement('span');
      goalText.innerHTML = data.goal_text_highlighted_elided;
      header.appendChild(goalText);
      header.insertAdjacentHTML(
        'beforeend',
        `<span class="msg-attachment tag"><small>${data.goal_id} - (${data.rt}|${data.id})</small></span>`
      )
      content.appendChild(header);

      const subject = document.createElement('div');
      subject.classList.add('msg-subject');
      subject.innerHTML = `<strong>Kind:</strong> ${data.kind}`;
      content.appendChild(subject);

      const snippet = document.createElement('div');
      snippet.classList.add('msg-snippet')
      const snippetContent = document.createElement('span');
      let hasSnippetContent = true;
      switch (data.kind) {
        case 'Inference':
          snippetContent.innerHTML = `<strong>Predicate:</strong> ${data.goal_predicate}`
          break;
        case 'Init':
          snippetContent.textContent = 'Entry point'
          break;
        case 'Findall': {
          snippetContent.innerHTML = '<br/>';
          this.mountToggleButton(snippetContent, data.rt_sub);
          break;
        }
        case 'CHR': {
          snippetContent.innerHTML = '<br/>';
          this.mountToggleButton(snippetContent, data.rt_sub);
          break;
        }
        default:
          hasSnippetContent = false;
      }
      if (hasSnippetContent) {
        snippet.appendChild(snippetContent);
      }
      content.appendChild(snippet);

      if (data.status_label.length > 0) {
        const footer = document.createElement('div');
        footer.classList.add('msg-footer');
        footer.innerHTML = '<strong>Next:</strong>';
        data.status_label.forEach(([step_id, _, inboxIndex]) => {
          const link = document.createElement('a');
          link.dataset['inboxId'] = inboxIndex.toString();
          link.textContent = step_id.toString();
          link.addEventListener('click', this.nextAttempClickHandler)
          footer.appendChild(link);
        });
        content.appendChild(footer);
      }

      card.appendChild(content);

      const cardFooter = document.createElement('div');
      cardFooter.classList.add(...data.footer.split(' '))
      card.appendChild(cardFooter);

      inbox.appendChild(card);
    });

    this.$feed.appendChild(inbox);
  }
}
