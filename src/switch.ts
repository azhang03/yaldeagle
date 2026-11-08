// The view switch: the toggle at the top, the address (/ or /yaldaq), the elevator lift between
// Nick's room and the YALDAQ firm, and the lazy load of the firm's code.
//
// Each view has its own container and canvas. A view that is not shown stops its frame loop.
// During the lift both views show, and the two containers and the floor slab between them move
// with CSS transforms (liftFrame in views.ts).
import { startNick } from './room/nick';
import { LIFT, liftFrame, pathFor, slabHeight, viewFromPath, type ViewName } from './views';

interface View {
  setActive(active: boolean): void;
  inVisit(): boolean;
}

const LABEL: Readonly<Record<ViewName, string>> = { nick: 'Nick', yaldaq: 'YALDAQ' };
const FIRM_TITLE = 'YALDAQ';

function element(selector: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`The page has no ${selector} element.`);
  return el;
}

const isView = (v: string | null | undefined): v is ViewName => v === 'nick' || v === 'yaldaq';

export function startSwitch(): void {
  const containers: Readonly<Record<ViewName, HTMLElement>> = {
    nick: element('#nick'),
    yaldaq: element('#yaldaq'),
  };
  const toggle = element('#view-toggle');
  const nickTitle = document.title;
  const views: Partial<Record<ViewName, View>> = {};
  let firmLoad: Promise<View> | null = null;
  let shown: ViewName = viewFromPath(location.pathname);
  let lifting = false;

  const slab = document.createElement('div');
  slab.id = 'lift-slab';
  slab.hidden = true;
  slab.setAttribute('aria-hidden', 'true');
  document.body.append(slab);

  /** The toggle steps aside while the shown view has a visit. */
  const onVisitChange =
    (view: ViewName) =>
    (visiting: boolean): void => {
      if (view === shown && !lifting) document.body.classList.toggle('visiting-view', visiting);
    };

  function create(view: ViewName): Promise<View> {
    const have = views[view];
    if (have) return Promise.resolve(have);
    if (view === 'nick') {
      const nick = startNick({ onVisitChange: onVisitChange('nick') });
      views.nick = nick;
      return Promise.resolve(nick);
    }
    firmLoad ??= import('./yaldaq/entry').then(
      (m) => {
        const firm = m.mountFirm(containers.yaldaq, { onVisitChange: onVisitChange('yaldaq') });
        views.yaldaq = firm;
        return firm;
      },
      (err: unknown) => {
        // A later click asks again. Some browsers keep a failed module until the page reloads.
        firmLoad = null;
        throw err;
      },
    );
    return firmLoad;
  }

  function setPressed(view: ViewName): void {
    for (const b of toggle.querySelectorAll<HTMLButtonElement>('button[data-view]')) {
      b.setAttribute('aria-pressed', String(b.dataset.view === view));
    }
  }

  function place(from: HTMLElement, to: HTMLElement, f: ReturnType<typeof liftFrame>): void {
    from.style.transform = `translate3d(0, ${f.from}px, 0)`;
    slab.style.transform = `translate3d(0, ${f.slab}px, 0)`;
    to.style.transform = `translate3d(0, ${f.to}px, 0)`;
  }

  /** Plays the lift with the animation frames of the page. */
  function lift(from: HTMLElement, to: HTMLElement, dir: 'down' | 'up'): Promise<void> {
    return new Promise((resolve) => {
      let t0: number | null = null;
      const frame = (now: number): void => {
        t0 ??= now;
        const s = (now - t0) / 1000;
        place(from, to, liftFrame(s / LIFT.durationS, dir, innerHeight));
        if (s >= LIFT.durationS + LIFT.settleS) resolve();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  async function go(view: ViewName, push: boolean): Promise<void> {
    if (lifting || view === shown) return;
    lifting = true;
    const from = shown;
    if (!views[view]) toggle.setAttribute('aria-busy', 'true');
    let target: View;
    try {
      target = await create(view);
    } catch (err) {
      // The firm's code did not load (for example, the network dropped). Stay on this view. The
      // back button changed the address already: put it back.
      console.warn('The view did not load.', err);
      toggle.removeAttribute('aria-busy');
      if (!push) history.replaceState(null, '', pathFor(from));
      lifting = false;
      return;
    }
    toggle.removeAttribute('aria-busy');
    if (push) history.pushState(null, '', pathFor(view));
    document.title = view === 'yaldaq' ? FIRM_TITLE : nickTitle;
    setPressed(view);
    document.body.classList.remove('visiting-view');

    const outEl = containers[from];
    const inEl = containers[view];
    const dir = view === 'yaldaq' ? 'down' : 'up';
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!still) {
      // The first frame of the lift, before the new view shows, so it never covers the old one.
      slab.textContent = LABEL[view];
      slab.style.height = `${slabHeight(innerHeight)}px`;
      place(outEl, inEl, liftFrame(0, dir, innerHeight));
      slab.hidden = false;
    }
    document.body.classList.add('lifting');
    target.setActive(true);
    if (!still) await lift(outEl, inEl, dir);

    outEl.style.transform = '';
    inEl.style.transform = '';
    slab.style.transform = '';
    slab.hidden = true;
    views[from]?.setActive(false);
    document.body.classList.remove('lifting');
    shown = view;
    document.body.classList.toggle('visiting-view', target.inVisit());
    lifting = false;
    // The back button can change the address during a lift. Follow it now.
    const want = viewFromPath(location.pathname);
    if (want !== shown) void go(want, false);
  }

  toggle.addEventListener('click', (ev) => {
    const button = ev.target instanceof Element ? ev.target.closest('button[data-view]') : null;
    const view = button?.getAttribute('data-view');
    if (isView(view)) void go(view, true);
  });

  addEventListener('popstate', () => {
    const want = viewFromPath(location.pathname);
    if (want !== shown && !lifting) void go(want, false);
  });

  setPressed(shown);
  if (shown === 'yaldaq') {
    // A link to /yaldaq: the firm first. Nick's room starts at the first switch to it.
    containers.nick.dataset.active = 'false';
    document.title = FIRM_TITLE;
    create('yaldaq').then(
      (firm) => {
        // A click on "Nick" can come before the firm's code loads. Then the firm stays off.
        if (shown === 'yaldaq' && !lifting) firm.setActive(true);
      },
      (err: unknown) => {
        console.warn('The YALDAQ view did not load.', err);
        if (shown !== 'yaldaq' || lifting) return;
        // Show Nick's room, so the page is not blank.
        shown = 'nick';
        history.replaceState(null, '', pathFor('nick'));
        document.title = nickTitle;
        setPressed('nick');
        void create('nick').then((nick) => nick.setActive(true));
      },
    );
    return;
  }
  void create('nick');
  // Load the firm's code in the background after the page loads, so a switch is quick.
  const preload = (): void => {
    const idle = (): void => {
      // Only a cache warm-up: a failure here is not an error. A click loads it again.
      import('./yaldaq/entry').catch(() => {});
    };
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if ('requestIdleCallback' in window) requestIdleCallback(idle);
        else setTimeout(idle, 2000);
      }),
    );
  };
  if (document.readyState === 'complete') preload();
  else addEventListener('load', preload, { once: true });
}
