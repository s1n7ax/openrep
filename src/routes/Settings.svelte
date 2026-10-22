<!--
  Settings (`#/settings`): weight unit; catalog status and "Update catalog";
  backup export and import; how to contribute; about and licences.
-->
<script lang="ts">
  import noticesMarkdown from '../../THIRD_PARTY_NOTICES.md?raw';
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import {
    describeBackupProblem,
    describeBackupSummary,
    InvalidBackupError,
    summarizeBackup,
  } from '../lib/backup.ts';
  import { exportBackup, readBackupFile } from '../lib/backupFile.ts';
  import { describeUpdateResult } from '../lib/catalog/update.ts';
  import { REPOSITORY_URL } from '../lib/contribute.ts';
  import { openExternal } from '../lib/external.ts';
  import { parseNotices } from '../lib/notices.ts';
  import type { Backup } from '../lib/schema/backup.ts';
  import type { Unit } from '../lib/schema/userData.ts';
  import { catalog } from '../lib/stores/catalog.svelte.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import { setUnit } from '../lib/userData/settings.ts';
  import { formatDateTime } from '../lib/userData/workoutText.ts';

  const VERSION = __APP_VERSION__;
  const notices = parseNotices(noticesMarkdown);

  const unit = $derived(userData.data.settings.unit);
  const lastCheckedAt = $derived(userData.data.catalogMeta.lastCheckedAt);

  let fileInput: HTMLInputElement | undefined = $state();
  let exporting = $state(false);
  /** A confirmed backup is being written to disk. */
  let restoring = $state(false);
  /** A valid backup waiting for the user to confirm replacing everything. */
  let pendingImport = $state.raw<Backup | null>(null);
  let backupMessage = $state<string | null>(null);
  let backupError = $state<string | null>(null);
  let linkError = $state<string | null>(null);

  function chooseUnit(next: Unit) {
    userData.update((data) => setUnit(data, next));
  }

  function clearBackupMessages() {
    backupMessage = null;
    backupError = null;
  }

  async function exportNow() {
    clearBackupMessages();
    exporting = true;
    try {
      const outcome = await exportBackup(userData.data);
      if (outcome === 'downloaded') backupMessage = 'Backup saved to your downloads.';
      else if (outcome === 'shared') backupMessage = 'Backup ready. Keep it somewhere safe.';
    } catch (error) {
      console.error('Exporting the backup failed:', error);
      backupError = 'The backup could not be created. Try again.';
    } finally {
      exporting = false;
    }
  }

  async function onFileChosen(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Let the same file be chosen again after a failed attempt.
    input.value = '';
    if (!file) return;
    clearBackupMessages();
    try {
      pendingImport = await readBackupFile(file);
    } catch (error) {
      if (error instanceof InvalidBackupError) {
        console.info('Backup file rejected:', error);
        backupError = describeBackupProblem(error.problem);
      } else {
        console.error('Reading the backup file failed:', error);
        backupError = 'The file could not be read.';
      }
    }
  }

  async function confirmImport() {
    const backup = pendingImport;
    pendingImport = null;
    if (!backup) return;
    clearBackupMessages();
    restoring = true;
    try {
      await userData.replaceAll(backup.data);
      backupMessage = `Backup restored: ${describeBackupSummary(summarizeBackup(backup.data))}.`;
    } catch (error) {
      console.error('Saving the restored backup failed:', error);
      backupError =
        'The backup was loaded but could not be saved, so it may be lost when the app closes. ' +
        'Try importing it again.';
    } finally {
      restoring = false;
    }
    catalog.recordRevision();
  }

  async function openRepository() {
    linkError = null;
    try {
      await openExternal(REPOSITORY_URL);
    } catch (error) {
      console.error('Opening the repository failed:', error);
      linkError = 'The browser could not be opened.';
    }
  }
</script>

<PageHeader title="Settings" large />

<div class="page">
  <section class="group" aria-labelledby="settings-units">
    <h2 class="section-title" id="settings-units">Units</h2>
    <div class="card row">
      <div class="row-text">
        <span class="row-title" id="unit-label">Weight</span>
        <span class="row-sub">Switching keeps your logged weights exact.</span>
      </div>
      <div class="segmented" role="group" aria-labelledby="unit-label">
        <button
          type="button"
          aria-pressed={unit === 'kg'}
          data-testid="unit-kg"
          onclick={() => chooseUnit('kg')}>kg</button
        >
        <button
          type="button"
          aria-pressed={unit === 'lb'}
          data-testid="unit-lb"
          onclick={() => chooseUnit('lb')}>lb</button
        >
      </div>
    </div>
  </section>

  <section class="group" aria-labelledby="settings-catalog">
    <h2 class="section-title" id="settings-catalog">Exercise catalog</h2>
    <div class="card panel">
      <dl class="status" data-testid="catalog-status">
        <div>
          <dt>Exercises</dt>
          <dd data-testid="catalog-count">{catalog.exercises.length}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd data-testid="catalog-source">
            {catalog.source === 'saved' ? 'Downloaded update' : 'Built into the app'}
          </dd>
        </div>
        <div class="wide">
          <dt>Last checked</dt>
          <dd>{lastCheckedAt ? formatDateTime(lastCheckedAt) : 'Never'}</dd>
        </div>
      </dl>
      <p class="text">
        New exercises and schedules from the community are downloaded from GitHub. Everything keeps
        working offline.
      </p>
      <button
        type="button"
        class="btn btn-outline btn-block"
        disabled={catalog.checking}
        data-testid="catalog-update"
        onclick={() => void catalog.checkForUpdate()}
      >
        {#if catalog.checking}
          <span class="spinner" aria-hidden="true"></span> Checking…
        {:else}
          Update catalog
        {/if}
      </button>
      <p class="result" role="status" data-testid="catalog-update-result">
        {catalog.lastResult && !catalog.checking ? describeUpdateResult(catalog.lastResult) : ''}
      </p>
    </div>
  </section>

  <section class="group" aria-labelledby="settings-backup">
    <h2 class="section-title" id="settings-backup">Backup</h2>
    <div class="card panel">
      <p class="text">
        Save your plans, custom exercises, workout history and settings to one file. Restore it on
        this or another phone.
      </p>
      <div class="buttons">
        <button
          type="button"
          class="btn btn-primary"
          disabled={exporting}
          data-testid="backup-export"
          onclick={exportNow}
        >
          Export backup
        </button>
        <button
          type="button"
          class="btn btn-outline"
          disabled={restoring}
          data-testid="backup-import"
          onclick={() => fileInput?.click()}
        >
          Import backup
        </button>
      </div>
      <input
        bind:this={fileInput}
        class="visually-hidden"
        type="file"
        accept=".json,application/json"
        tabindex="-1"
        aria-hidden="true"
        data-testid="backup-file-input"
        onchange={onFileChosen}
      />
      {#if backupError}
        <p class="message error" role="alert" data-testid="backup-error">
          <Icon name="alert" size={18} />
          {backupError}
        </p>
      {:else if backupMessage}
        <p class="message ok" role="status" data-testid="backup-message">
          <Icon name="check" size={18} />
          {backupMessage}
        </p>
      {/if}
    </div>
  </section>

  <section class="group" aria-labelledby="settings-contribute">
    <h2 class="section-title" id="settings-contribute">Contribute</h2>
    <div class="card panel">
      <p class="text">
        OpenRep's exercises, animations and schedules are open data that anyone can improve. Use
        <strong>Submit</strong> on one of your plans or custom exercises to propose it as a pull request
        on GitHub, or read the contributing guide in the repository.
      </p>
      <button
        type="button"
        class="btn btn-outline btn-block"
        data-testid="repo-link"
        onclick={openRepository}
      >
        <Icon name="send" size={18} /> github.com/s1n7ax/openrep
      </button>
      {#if linkError}
        <p class="message error" role="alert">{linkError}</p>
      {/if}
    </div>
  </section>

  <section class="group" aria-labelledby="settings-about">
    <h2 class="section-title" id="settings-about">About</h2>
    <div class="card panel">
      <div class="about">
        <span class="mark" aria-hidden="true"><Icon name="dumbbell" size={26} /></span>
        <div>
          <p class="app-name">OpenRep</p>
          <p class="row-sub" data-testid="app-version">Version {VERSION}</p>
        </div>
      </div>
      <p class="text">
        Free and open source. No account, no ads, no tracking: your data stays on this device. The
        app only goes online to download catalog updates from GitHub and when you open GitHub
        yourself.
      </p>
      <dl class="licences">
        <div>
          <dt>App code</dt>
          <dd>GNU General Public License v3.0</dd>
        </div>
        <div>
          <dt>Exercises, animations and schedules</dt>
          <dd>CC0 1.0 (public domain)</dd>
        </div>
      </dl>
    </div>

    <h3 class="subhead">Third-party notices</h3>
    <div class="card notices" data-testid="third-party-notices">
      {#each notices as notice (notice.name)}
        <details class="notice">
          <summary>
            <span class="notice-name">{notice.name}</span>
            <span class="notice-licence">{notice.licence}</span>
            <span class="chevron"><Icon name="chevron-down" size={18} /></span>
          </summary>
          <div class="notice-body">
            <p class="row-sub">{notice.usedFor}</p>
            {#if notice.url}
              <p class="row-sub url">{notice.url}</p>
            {/if}
            {#if notice.text}
              <pre>{notice.text}</pre>
            {/if}
          </div>
        </details>
      {/each}
    </div>
  </section>
</div>

<ConfirmDialog
  open={pendingImport !== null}
  title="Replace all current data?"
  message={pendingImport
    ? `This backup from ${formatDateTime(pendingImport.exportedAt)} has ${describeBackupSummary(
        summarizeBackup(pendingImport.data),
      )}. It replaces your current plans, custom exercises, workout history and settings.`
    : ''}
  confirmLabel="Replace"
  danger
  onconfirm={confirmImport}
  oncancel={() => (pendingImport = null)}
/>

<style>
  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-6);
  }

  .section-title {
    padding-left: var(--space-1);
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
  }

  .row-text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .row-title {
    font-weight: 700;
  }

  .row-sub {
    color: var(--text-3);
    font-size: var(--text-sm);
  }

  .segmented {
    display: grid;
    flex: none;
    grid-template-columns: 1fr 1fr;
    width: 132px;
    height: var(--tap);
    padding: 3px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }

  .segmented button {
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-2);
    font-weight: 700;
    cursor: pointer;
  }

  .segmented button[aria-pressed='true'] {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-sm);
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
  }

  .text {
    color: var(--text-2);
  }

  .status,
  .licences {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
    margin: 0;
  }

  .status .wide,
  .licences div {
    grid-column: span 2;
  }

  dt {
    color: var(--text-3);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  dd {
    margin: 2px 0 0;
    font-weight: 650;
  }

  .result:empty {
    display: none;
  }

  .result {
    color: var(--text-2);
    font-size: var(--text-sm);
    font-weight: 600;
    text-align: center;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
  }

  .message {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .message :global(.icon) {
    margin-top: 1px;
  }

  .message.error {
    background: var(--danger-soft);
    color: var(--danger);
  }

  .message.ok {
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .about {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .mark {
    display: grid;
    flex: none;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 15px;
    background: var(--accent);
    color: var(--on-accent);
  }

  .app-name {
    font-size: var(--text-lg);
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  .subhead {
    margin-top: var(--space-3);
    padding-left: var(--space-1);
    color: var(--text-3);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .notices {
    overflow: hidden;
  }

  .notice + .notice {
    border-top: 1px solid var(--border);
  }

  summary {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--tap-lg);
    padding: 0 var(--space-3) 0 var(--space-4);
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  .notice-name {
    flex: 1;
    font-weight: 650;
  }

  .notice-licence {
    color: var(--text-3);
    font-size: var(--text-sm);
  }

  .chevron {
    color: var(--text-3);
    transition: transform 150ms ease;
  }

  details[open] .chevron {
    transform: rotate(180deg);
  }

  .notice-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: 0 var(--space-4) var(--space-4);
  }

  .url {
    overflow-wrap: anywhere;
  }

  pre {
    margin: 0;
    padding: var(--space-3);
    overflow-x: auto;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-2);
    font-size: 11px;
    line-height: 1.5;
    white-space: pre-wrap;
  }
</style>
