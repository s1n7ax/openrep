<!--
  A short celebration over the workout screen when an exercise (or a
  superset) is done: a check pops up and confetti bursts from it, then it
  fades away. It never takes a tap (pointer-events: none); with reduced
  motion only the check fades in and out. Calls `onend` when it is over.
-->
<script lang="ts">
  import Icon from './Icon.svelte';

  let { label, onend }: { label: string; onend: () => void } = $props();

  const COLORS = ['var(--accent)', '#f5b83d', '#ff7a6b', '#5b8def'];
  const pieces = Array.from({ length: 16 }, (_, index) => ({
    angle: index * 22.5 + (index % 2 === 0 ? 6 : -6),
    distance: 96 + (index % 3) * 26,
    color: COLORS[index % COLORS.length],
    delay: (index % 4) * 25,
    round: index % 3 === 0,
  }));

  function onAnimationEnd(event: AnimationEvent & { currentTarget: HTMLElement }) {
    // The pieces' and the check's animations end earlier and bubble up.
    if (event.target === event.currentTarget) onend();
  }
</script>

<div class="celebration" data-testid="celebration" onanimationend={onAnimationEnd}>
  <div class="burst" aria-hidden="true">
    {#each pieces as piece, index (index)}
      <span
        class="piece"
        class:round={piece.round}
        style:--angle={`${piece.angle}deg`}
        style:--distance={`${piece.distance}px`}
        style:--color={piece.color}
        style:--delay={`${piece.delay}ms`}
      ></span>
    {/each}
    <span class="check"><Icon name="check" size={44} /></span>
  </div>
  <p class="label" role="status">{label}</p>
</div>

<style>
  .celebration {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    pointer-events: none;
    animation: fade 1300ms ease-in forwards;
  }

  .burst {
    position: relative;
    display: grid;
    place-items: center;
    width: 96px;
    height: 96px;
  }

  .check {
    display: grid;
    place-items: center;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
    box-shadow: var(--shadow-md);
    animation: pop 500ms cubic-bezier(0.2, 1.4, 0.4, 1) both;
  }

  .piece {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 8px;
    height: 14px;
    margin: -7px 0 0 -4px;
    border-radius: 2px;
    background: var(--color);
    opacity: 0;
    animation: fly 900ms cubic-bezier(0.1, 0.7, 0.3, 1) var(--delay) forwards;
  }

  .piece.round {
    width: 10px;
    height: 10px;
    margin: -5px 0 0 -5px;
    border-radius: 50%;
  }

  .label {
    padding: var(--space-1) var(--space-4);
    border-radius: var(--radius-pill);
    background: var(--surface-raised);
    box-shadow: var(--shadow-md);
    font-weight: 800;
    animation: pop 500ms cubic-bezier(0.2, 1.4, 0.4, 1) 80ms both;
  }

  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.4);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes fly {
    0% {
      opacity: 1;
      transform: rotate(var(--angle)) translateY(0) rotate(0);
    }
    70% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: rotate(var(--angle)) translateY(calc(-1 * var(--distance))) rotate(220deg);
    }
  }

  @keyframes fade {
    0%,
    70% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  @keyframes appear {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .celebration {
      animation-duration: 1000ms;
    }

    .piece {
      display: none;
    }

    .check,
    .label {
      animation: appear 200ms ease-out both;
    }
  }
</style>
