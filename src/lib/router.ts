/**
 * The app's hash router: `#/path?query` routes, typed route parameters, path
 * builders, in-app history with direction (for scroll restoration) and the
 * back behaviour shared by the header back button and Android's back button.
 */
import { MUSCLES, type Muscle } from './schema/common.ts';
import type { ViewPreset } from './three/viewer.ts';

/**
 * The developer route `#/dev/pose/<exerciseId>?t=<0..1>`: shows an exercise's
 * 3D view full screen, frozen at loop time t (playing when t is omitted).
 * Optional review parameters: `view=<default|front|side|back|top>`,
 * `zoom=<factor>`, `focus=<x,y,z>` (world point to look at) and
 * `primary=<muscles>` / `secondary=<muscles>` (comma-separated muscle groups
 * shown instead of the exercise's own). Used to review animations and the
 * muscle glow, and by screenshot tooling.
 */
export interface DevPoseRoute {
  exerciseId: string;
  /** Loop time to freeze at, or null to play. */
  time: number | null;
  view: ViewPreset;
  /** Camera zoom factor (> 1 is closer). */
  zoom: number;
  /** World point to look at instead of the framed figure, or null. */
  focus: [number, number, number] | null;
  /** Muscle groups to light instead of the exercise's own, or null. */
  glow: { primary: Muscle[]; secondary: Muscle[] } | null;
}

export type Route =
  | { name: 'plans' }
  | { name: 'plan'; planId: string }
  | { name: 'plan-edit'; planId: string }
  /** The exercise picker adding to a plan day. */
  | { name: 'plan-add-exercise'; planId: string; dayId: string }
  | { name: 'exercises' }
  | { name: 'exercise'; exerciseId: string }
  /** New custom exercise; when `planId`/`dayId` are set it is added to that day on save. */
  | { name: 'custom-new'; initialName: string; planId: string | null; dayId: string | null }
  | { name: 'custom'; customId: string }
  | { name: 'custom-edit'; customId: string }
  | { name: 'schedules' }
  | { name: 'schedule'; scheduleId: string }
  | { name: 'workout'; sessionId: string }
  | { name: 'history' }
  | { name: 'history-session'; sessionId: string }
  | { name: 'settings' }
  | { name: 'dev-pose'; pose: DevPoseRoute }
  | { name: 'not-found'; path: string };

export type RouteName = Route['name'];

export const TABS = ['plans', 'exercises', 'schedules', 'history', 'settings'] as const;
export type Tab = (typeof TABS)[number];

const enc = encodeURIComponent;

/** Path builders (without the leading `#`). */
export const paths = {
  plans: () => '/',
  plan: (planId: string) => `/plans/${enc(planId)}`,
  planEdit: (planId: string) => `/plans/${enc(planId)}/edit`,
  planAddExercise: (planId: string, dayId: string) =>
    `/plans/${enc(planId)}/days/${enc(dayId)}/add`,
  exercises: () => '/exercises',
  exercise: (exerciseId: string) => `/exercises/${enc(exerciseId)}`,
  customNew: (options: { name?: string; planId?: string; dayId?: string } = {}) => {
    const query = new URLSearchParams();
    if (options.name) query.set('name', options.name);
    if (options.planId && options.dayId) {
      query.set('plan', options.planId);
      query.set('day', options.dayId);
    }
    const text = query.toString();
    return `/custom/new${text ? `?${text}` : ''}`;
  },
  custom: (customId: string) => `/custom/${enc(customId)}`,
  customEdit: (customId: string) => `/custom/${enc(customId)}/edit`,
  schedules: () => '/schedules',
  schedule: (scheduleId: string) => `/schedules/${enc(scheduleId)}`,
  workout: (sessionId: string) => `/workout/${enc(sessionId)}`,
  history: () => '/history',
  historySession: (sessionId: string) => `/history/${enc(sessionId)}`,
  settings: () => '/settings',
} as const;

/** `#/plans/x` for a path from `paths`, for `href` attributes. */
export function href(path: string): string {
  return `#${path}`;
}

const VIEWS: readonly ViewPreset[] = ['default', 'front', 'side', 'back', 'top'];

function parseDevPose(exerciseId: string, params: URLSearchParams): DevPoseRoute {
  const t = params.get('t');
  const parsed = t === null || t.trim() === '' ? NaN : Number(t);
  const view = params.get('view');
  const zoom = Number(params.get('zoom') ?? 1);
  const focus = (params.get('focus') ?? '').split(',').map(Number);
  const muscles = (name: string) =>
    (params.get(name) ?? '')
      .split(',')
      .map((muscle) => muscle.trim())
      .filter((muscle): muscle is Muscle => (MUSCLES as readonly string[]).includes(muscle));
  const overridden = params.has('primary') || params.has('secondary');
  return {
    exerciseId,
    time: Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : null,
    view: VIEWS.find((preset) => preset === view) ?? 'default',
    zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 1,
    focus:
      focus.length === 3 && focus.every((n) => Number.isFinite(n))
        ? [focus[0] ?? 0, focus[1] ?? 0, focus[2] ?? 0]
        : null,
    glow: overridden ? { primary: muscles('primary'), secondary: muscles('secondary') } : null,
  };
}

function decode(segment: string): string | null {
  try {
    const value = decodeURIComponent(segment);
    return value === '' ? null : value;
  } catch {
    return null;
  }
}

/** Route patterns: segments starting with `:` capture a parameter. */
const PATTERNS: {
  pattern: string;
  build: (p: Record<string, string>, q: URLSearchParams) => Route | null;
}[] = [
  { pattern: '', build: () => ({ name: 'plans' }) },
  { pattern: 'plans/:planId', build: (p) => ({ name: 'plan', planId: p.planId! }) },
  { pattern: 'plans/:planId/edit', build: (p) => ({ name: 'plan-edit', planId: p.planId! }) },
  {
    pattern: 'plans/:planId/days/:dayId/add',
    build: (p) => ({ name: 'plan-add-exercise', planId: p.planId!, dayId: p.dayId! }),
  },
  { pattern: 'exercises', build: () => ({ name: 'exercises' }) },
  {
    pattern: 'exercises/:exerciseId',
    build: (p) => ({ name: 'exercise', exerciseId: p.exerciseId! }),
  },
  {
    pattern: 'custom/new',
    build: (_p, q) => {
      const planId = q.get('plan') || null;
      const dayId = q.get('day') || null;
      return {
        name: 'custom-new',
        initialName: q.get('name') ?? '',
        planId: planId && dayId ? planId : null,
        dayId: planId && dayId ? dayId : null,
      };
    },
  },
  { pattern: 'custom/:customId', build: (p) => ({ name: 'custom', customId: p.customId! }) },
  {
    pattern: 'custom/:customId/edit',
    build: (p) => ({ name: 'custom-edit', customId: p.customId! }),
  },
  { pattern: 'schedules', build: () => ({ name: 'schedules' }) },
  {
    pattern: 'schedules/:scheduleId',
    build: (p) => ({ name: 'schedule', scheduleId: p.scheduleId! }),
  },
  { pattern: 'workout/:sessionId', build: (p) => ({ name: 'workout', sessionId: p.sessionId! }) },
  { pattern: 'history', build: () => ({ name: 'history' }) },
  {
    pattern: 'history/:sessionId',
    build: (p) => ({ name: 'history-session', sessionId: p.sessionId! }),
  },
  { pattern: 'settings', build: () => ({ name: 'settings' }) },
  {
    pattern: 'dev/pose/:exerciseId',
    build: (p, q) =>
      /^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.exerciseId!)
        ? { name: 'dev-pose', pose: parseDevPose(p.exerciseId!, q) }
        : null,
  },
];

/** The route of a location hash such as `#/plans/abc?x=1`. Unknown paths give `not-found`. */
export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const queryStart = raw.indexOf('?');
  const path = queryStart === -1 ? raw : raw.slice(0, queryStart);
  const query = new URLSearchParams(queryStart === -1 ? '' : raw.slice(queryStart + 1));
  const segments = path.split('/').filter((segment) => segment !== '');

  for (const { pattern, build } of PATTERNS) {
    const parts = pattern === '' ? [] : pattern.split('/');
    if (parts.length !== segments.length) continue;
    const params: Record<string, string> = {};
    const matches = parts.every((part, index) => {
      const segment = segments[index] ?? '';
      if (!part.startsWith(':')) return part === segment;
      const value = decode(segment);
      if (value === null) return false;
      params[part.slice(1)] = value;
      return true;
    });
    if (!matches) continue;
    const route = build(params, query);
    if (route) return route;
  }
  return { name: 'not-found', path: path || '/' };
}

/** Parses a location hash; null when it is not the dev pose route. */
export function parseDevPoseRoute(hash: string): DevPoseRoute | null {
  const route = parseRoute(hash);
  return route.name === 'dev-pose' ? route.pose : null;
}

/** The bottom tab a route belongs to (highlighted in the tab bar). */
export function tabOf(route: Route): Tab | null {
  switch (route.name) {
    case 'plans':
    case 'plan':
    case 'plan-edit':
    case 'plan-add-exercise':
    case 'workout':
      return 'plans';
    case 'exercises':
    case 'exercise':
    case 'custom-new':
    case 'custom':
    case 'custom-edit':
      return 'exercises';
    case 'schedules':
    case 'schedule':
      return 'schedules';
    case 'history':
    case 'history-session':
      return 'history';
    case 'settings':
      return 'settings';
    case 'dev-pose':
    case 'not-found':
      return null;
  }
}

/** Path of each tab's root screen. */
export const TAB_PATHS: Record<Tab, string> = {
  plans: paths.plans(),
  exercises: paths.exercises(),
  schedules: paths.schedules(),
  history: paths.history(),
  settings: paths.settings(),
};

/** Whether the route is the root screen of a tab (Android back exits the app there). */
export function isTabRoot(route: Route): boolean {
  return (
    route.name === 'plans' ||
    route.name === 'exercises' ||
    route.name === 'schedules' ||
    route.name === 'history' ||
    route.name === 'settings'
  );
}

/** Where "back" goes when there is no in-app history (opened by a deep link or reload). */
export function parentPath(route: Route): string {
  switch (route.name) {
    case 'plan':
    case 'workout':
    case 'not-found':
    case 'dev-pose':
    case 'plans':
      return paths.plans();
    case 'plan-edit':
      return paths.plan(route.planId);
    case 'plan-add-exercise':
      return paths.planEdit(route.planId);
    case 'custom-new':
      return route.planId && route.dayId
        ? paths.planAddExercise(route.planId, route.dayId)
        : paths.exercises();
    case 'custom-edit':
      return paths.custom(route.customId);
    case 'exercise':
    case 'custom':
    case 'exercises':
      return paths.exercises();
    case 'schedule':
    case 'schedules':
      return paths.schedules();
    case 'history-session':
    case 'history':
      return paths.history();
    case 'settings':
      return paths.settings();
  }
}

/** How the current route was reached. `pop` = back (or forward) through history. */
export type NavigationDirection = 'initial' | 'push' | 'replace' | 'pop';

export interface RouterState {
  route: Route;
  /** Position in the in-app history: 0 is the first screen of this app session. */
  index: number;
  direction: NavigationDirection;
}

interface HistoryState {
  openrepIndex?: number;
}

function historyIndex(state: unknown): number | null {
  const index = (state as HistoryState | null)?.openrepIndex;
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 ? index : null;
}

/**
 * The browser side of the router. Call `start()` once; components subscribe
 * with the Svelte store contract (`$router`) or read `router.state`.
 */
class HashRouter {
  #state: RouterState = { route: { name: 'plans' }, index: 0, direction: 'initial' };
  #listeners = new Set<(state: RouterState) => void>();
  #backHandlers: (() => void)[] = [];
  #scroll = new Map<number, number>();
  /** Path of each history entry seen this session, by index. */
  #paths = new Map<number, string>();
  #started = false;

  get state(): RouterState {
    return this.#state;
  }

  /** Starts listening to the location; idempotent. */
  start(): void {
    if (this.#started) return;
    this.#started = true;
    history.scrollRestoration = 'manual';
    const index = historyIndex(history.state) ?? 0;
    history.replaceState({ ...(history.state as object | null), openrepIndex: index }, '');
    this.#set({ route: parseRoute(location.hash), index, direction: 'initial' });
    window.addEventListener('hashchange', () => this.#onHashChange());
  }

  /** Svelte store contract. */
  subscribe(listener: (state: RouterState) => void): () => void {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  #set(state: RouterState): void {
    this.#state = state;
    this.#paths.set(state.index, location.hash.replace(/^#/, '') || '/');
    for (const listener of this.#listeners) listener(state);
  }

  #rememberScroll(): void {
    this.#scroll.set(this.#state.index, window.scrollY);
  }

  /** Saved scroll position of a history entry, for restoring it on back. */
  scrollPosition(index: number): number | undefined {
    return this.#scroll.get(index);
  }

  #onHashChange(): void {
    this.#rememberScroll();
    const known = historyIndex(history.state);
    const route = parseRoute(location.hash);
    if (known === null) {
      // A link (`<a href="#/…">`) created this entry: number it.
      const index = this.#state.index + 1;
      history.replaceState({ ...(history.state as object | null), openrepIndex: index }, '');
      this.#forgetFrom(index);
      this.#set({ route, index, direction: 'push' });
    } else {
      this.#set({ route, index: known, direction: known > this.#state.index ? 'push' : 'pop' });
    }
  }

  #forgetFrom(index: number): void {
    for (const key of this.#scroll.keys()) if (key >= index) this.#scroll.delete(key);
    for (const key of this.#paths.keys()) if (key >= index) this.#paths.delete(key);
  }

  /** Goes to `path` (from `paths`), adding a history entry unless `replace`. */
  navigate(path: string, options: { replace?: boolean } = {}): void {
    if (`#${path}` === location.hash && !options.replace) return;
    this.#rememberScroll();
    const route = parseRoute(path);
    if (options.replace) {
      history.replaceState({ openrepIndex: this.#state.index }, '', `#${path}`);
      this.#set({ route, index: this.#state.index, direction: 'replace' });
    } else {
      const index = this.#state.index + 1;
      history.pushState({ openrepIndex: index }, '', `#${path}`);
      this.#forgetFrom(index);
      this.#set({ route, index, direction: 'push' });
    }
  }

  /** Whether `steps` screens can be popped from the in-app history. */
  canGoBack(steps = 1): boolean {
    return this.#state.index >= steps;
  }

  /**
   * Goes back `steps` screens. Without enough in-app history (deep link,
   * reload at index 0) it replaces the current screen with `fallback`,
   * defaulting to the route's parent.
   */
  back(fallback: string = parentPath(this.#state.route), steps = 1): void {
    if (this.canGoBack(steps)) history.go(-steps);
    else this.navigate(fallback, { replace: true });
  }

  /**
   * Returns to `path`: back through history when it is the previous screen,
   * otherwise by replacing the current screen with it (so finishing an editor
   * opened from elsewhere does not leave the editor in the history).
   */
  backTo(path: string): void {
    if (this.canGoBack() && this.#paths.get(this.#state.index - 1) === path) history.back();
    else this.navigate(path, { replace: true });
  }

  /**
   * Lets an overlay (dialog, sheet) handle the next back press instead of
   * navigating. Returns a function removing the handler.
   */
  pushBackHandler(handler: () => void): () => void {
    this.#backHandlers.push(handler);
    return () => {
      const index = this.#backHandlers.lastIndexOf(handler);
      if (index !== -1) this.#backHandlers.splice(index, 1);
    };
  }

  /**
   * Android's back button: closes the top overlay, else exits at a tab root
   * (via `exit`), else goes back.
   */
  handleBackButton(exit: () => void): void {
    const handler = this.#backHandlers.at(-1);
    if (handler) handler();
    else if (isTabRoot(this.#state.route)) exit();
    else this.back();
  }
}

export const router = new HashRouter();
