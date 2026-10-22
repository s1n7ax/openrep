<!--
  App shell: loads user data and the catalog, routes the location hash to a
  screen, shows the bottom tab bar and app-wide notices, restores scroll
  positions on back, and saves when the app goes to the background.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Icon from './components/Icon.svelte';
  import TabBar from './components/TabBar.svelte';
  import { setupLifecycle } from './lib/native.ts';
  import { href, paths, router, tabOf, type Route } from './lib/router.ts';
  import { catalog } from './lib/stores/catalog.svelte.ts';
  import { userData } from './lib/stores/userData.svelte.ts';
  import CustomExerciseDetail from './routes/CustomExerciseDetail.svelte';
  import CustomExerciseForm from './routes/CustomExerciseForm.svelte';
  import DevPose from './routes/DevPose.svelte';
  import ExerciseDetail from './routes/ExerciseDetail.svelte';
  import ExercisePicker from './routes/ExercisePicker.svelte';
  import HistoryList from './routes/HistoryList.svelte';
  import HistorySession from './routes/HistorySession.svelte';
  import Exercises from './routes/Exercises.svelte';
  import NotFound from './routes/NotFound.svelte';
  import PlanDetail from './routes/PlanDetail.svelte';
  import PlanEditor from './routes/PlanEditor.svelte';
  import PlansList from './routes/PlansList.svelte';
  import ScheduleDetail from './routes/ScheduleDetail.svelte';
  import SchedulesList from './routes/SchedulesList.svelte';
  import Settings from './routes/Settings.svelte';
  import Workout from './routes/Workout.svelte';

  router.start();

  const route: Route = $derived($router.route);
  const ready = $derived(userData.status === 'ready' && catalog.status === 'ready');
  /** Remount the screen when the location changes (not for the dev route, which updates in place). */
  const screenKey = $derived(route.name === 'dev-pose' ? 'dev-pose' : JSON.stringify(route));

  onMount(() => {
    const stopLifecycle = setupLifecycle({ onPause: () => void userData.flush() });
    // The dev server serves the catalog built from `data/`: never replace it
    // with the published one, nor on the dev pose route used by tooling.
    const checkForUpdates = !import.meta.env.DEV && route.name !== 'dev-pose';
    Promise.all([userData.load(), catalog.load()])
      .then(() => (checkForUpdates ? catalog.checkOnLaunch() : null))
      .catch((error: unknown) => console.error('Start-up failed:', error));
    return stopLifecycle;
  });

  // Back restores the previous scroll position; new screens start at the top.
  $effect(() => {
    const { direction, index } = $router;
    if (direction === 'initial') return;
    void tick().then(() => {
      const top = direction === 'pop' ? (router.scrollPosition(index) ?? 0) : 0;
      window.scrollTo({ top, behavior: 'instant' });
    });
  });
</script>

{#if route.name === 'dev-pose'}
  <DevPose route={route.pose} />
{:else}
  <div class="app" data-testid="app" data-save-state={userData.saveState}>
    {#if catalog.status === 'error'}
      <main class="center" data-testid="catalog-error">
        <Icon name="alert" size={40} />
        <h1>The exercise catalog could not be loaded</h1>
        <p>Restart the app. If this keeps happening, reinstall it.</p>
        <button type="button" class="btn btn-primary" onclick={() => location.reload()}>
          Try again
        </button>
      </main>
    {:else if !ready}
      <main class="center splash" aria-busy="true" data-testid="loading">
        <span class="mark"><Icon name="dumbbell" size={40} /></span>
        <p class="wordmark">OpenRep</p>
      </main>
    {:else}
      <main class="screen">
        {#key screenKey}
          {#if route.name === 'plans'}
            <PlansList />
          {:else if route.name === 'plan'}
            <PlanDetail planId={route.planId} />
          {:else if route.name === 'plan-edit'}
            <PlanEditor planId={route.planId} />
          {:else if route.name === 'plan-add-exercise'}
            <ExercisePicker planId={route.planId} dayId={route.dayId} />
          {:else if route.name === 'exercises'}
            <Exercises />
          {:else if route.name === 'exercise'}
            <ExerciseDetail exerciseId={route.exerciseId} />
          {:else if route.name === 'custom-new'}
            <CustomExerciseForm
              mode="new"
              initialName={route.initialName}
              planId={route.planId}
              dayId={route.dayId}
            />
          {:else if route.name === 'custom'}
            <CustomExerciseDetail customId={route.customId} />
          {:else if route.name === 'custom-edit'}
            <CustomExerciseForm mode="edit" customId={route.customId} />
          {:else if route.name === 'workout'}
            <Workout sessionId={route.sessionId} />
          {:else if route.name === 'schedules'}
            <SchedulesList />
          {:else if route.name === 'schedule'}
            <ScheduleDetail scheduleId={route.scheduleId} />
          {:else if route.name === 'history'}
            <HistoryList />
          {:else if route.name === 'history-session'}
            <HistorySession sessionId={route.sessionId} />
          {:else if route.name === 'settings'}
            <Settings />
          {:else}
            <NotFound />
          {/if}
        {/key}
      </main>

      {#if userData.corruptFile || userData.persistence === 'disabled'}
        <div class="notice" role="alert" data-testid="corrupt-banner">
          <Icon name="alert" size={22} />
          <div class="notice-text">
            {#if userData.persistence === 'disabled'}
              <strong>Your saved data could not be read.</strong>
              Changes made now will not be saved. Restart the app or restore a backup in Settings.
            {:else}
              <strong>Some saved data could not be read.</strong>
              It was kept as “{userData.corruptFile}”. Restore a backup in
              <a href={href(paths.settings())}>Settings</a> if something is missing.
            {/if}
          </div>
          {#if userData.persistence !== 'disabled'}
            <button
              type="button"
              class="icon-btn"
              aria-label="Dismiss"
              data-testid="corrupt-banner-dismiss"
              onclick={() => userData.dismissCorruptNotice()}
            >
              <Icon name="close" size={20} />
            </button>
          {/if}
        </div>
      {/if}

      <TabBar active={tabOf(route)} />
    {/if}
  </div>
{/if}

<style>
  .app {
    min-height: 100dvh;
  }

  .screen {
    padding-bottom: calc(var(--tabbar-height) + var(--safe-bottom));
  }

  .center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    min-height: 100dvh;
    padding: calc(var(--safe-top) + var(--space-6)) var(--space-6)
      calc(var(--safe-bottom) + var(--space-6));
    text-align: center;
  }

  .center h1 {
    font-size: var(--text-xl);
  }

  .center p {
    color: var(--text-2);
  }

  .mark {
    display: grid;
    place-items: center;
    width: 84px;
    height: 84px;
    border-radius: 26px;
    background: var(--accent);
    color: var(--on-accent);
  }

  .wordmark {
    font-size: var(--text-xl);
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .notice {
    position: fixed;
    right: calc(var(--space-3) + var(--safe-right));
    bottom: calc(var(--tabbar-height) + var(--safe-bottom) + var(--space-3));
    left: calc(var(--space-3) + var(--safe-left));
    z-index: 40;
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    max-width: calc(var(--page-max) - 2 * var(--space-3));
    margin: 0 auto;
    padding: var(--space-3) var(--space-2) var(--space-3) var(--space-4);
    border: 1px solid var(--warning-border);
    border-radius: var(--radius-md);
    background: var(--warning-soft);
    color: var(--warning-text);
    box-shadow: var(--shadow-md);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .notice-text {
    flex: 1;
    padding-top: 1px;
    font-size: var(--text-sm);
  }

  .notice a {
    color: inherit;
    font-weight: 700;
  }

  .notice :global(.icon-btn) {
    color: inherit;
  }
</style>
