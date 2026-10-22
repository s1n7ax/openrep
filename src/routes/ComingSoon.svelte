<!--
  Placeholder for a section that is not built yet.
-->
<script lang="ts">
  import EmptyState from '../components/EmptyState.svelte';
  import type { IconName } from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';

  let {
    title,
    icon,
    back = false,
  }: { title: string; icon: IconName; back?: boolean | string } = $props();
</script>

<PageHeader {title} large={!back} {back} />

<div class="page">
  <EmptyState {icon} title="Coming soon" text="This section is on its way." testid="coming-soon" />
</div>
