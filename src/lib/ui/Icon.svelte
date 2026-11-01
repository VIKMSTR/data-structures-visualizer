<script lang="ts">
  const PATHS = {
    first: 'M6 5h2v14H6zM20 5v14L9 12z',
    prev: 'M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6z',
    play: 'M7 4v16l13-8z',
    pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
    next: 'M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z',
    last: 'M4 5v14l11-7zM16 5h2v14h-2z',
    fit: 'M4 9V4h5v2H6v3zM15 4h5v5h-2V6h-3zM20 15v5h-5v-2h3v-3zM9 20H4v-5h2v3h3z',
    plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
    minus: 'M5 11h14v2H5z',
  } as const;
  let { name }: { name: keyof typeof PATHS } = $props();
</script>

<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
  <path d={PATHS[name]} fill="currentColor" />
</svg>
