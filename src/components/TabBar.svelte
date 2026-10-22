<!--
  Bottom navigation between the five sections. Tapping a tab opens its root
  screen. Clears the gesture bar / home indicator safe area.
-->
<script lang="ts">
  import { href, router, TAB_PATHS, type Tab } from '../lib/router.ts';
  import Icon, { type IconName } from './Icon.svelte';

  let { active }: { active: Tab | null } = $props();

  const TAB_ITEMS: { tab: Tab; label: string; icon: IconName }[] = [
    { tab: 'plans', label: 'Plans', icon: 'plans' },
    { tab: 'exercises', label: 'Exercises', icon: 'dumbbell' },
    { tab: 'schedules', label: 'Schedules', icon: 'calendar' },
    { tab: 'history', label: 'History', icon: 'history' },
    { tab: 'settings', label: 'Settings', icon: 'settings' },
  ];

  function open(event: MouseEvent, tab: Tab) {
    event.preventDefault();
    router.navigate(TAB_PATHS[tab]);
  }
</script>

<nav class="tabbar" aria-label="Sections">
  <ul>
    {#each TAB_ITEMS as item (item.tab)}
      <li>
        <a
          href={href(TAB_PATHS[item.tab])}
          class="tab"
          aria-current={active === item.tab ? 'page' : undefined}
          data-testid={`tab-${item.tab}`}
          onclick={(event) => open(event, item.tab)}
        >
          <span class="pill"><Icon name={item.icon} size={22} /></span>
          <span class="label">{item.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>

<style>
  .tabbar {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 30;
    padding: 0 var(--safe-right) var(--safe-bottom) var(--safe-left);
    background: var(--tabbar-bg);
    backdrop-filter: saturate(1.6) blur(14px);
    -webkit-backdrop-filter: saturate(1.6) blur(14px);
    border-top: 1px solid var(--border);
  }

  ul {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    max-width: var(--page-max);
    height: var(--tabbar-height);
    margin: 0 auto;
    padding: 0;
    list-style: none;
  }

  .tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    height: 100%;
    color: var(--text-3);
    font-size: 0.6875rem;
    font-weight: 600;
    text-decoration: none;
  }

  .pill {
    display: grid;
    place-items: center;
    width: 56px;
    height: 30px;
    border-radius: var(--radius-pill);
    transition: background-color 150ms ease;
  }

  .tab[aria-current='page'] {
    color: var(--accent-text);
  }

  .tab[aria-current='page'] .pill {
    background: var(--accent-soft);
  }

  .label {
    line-height: 1.1;
  }
</style>
