import './lib/zodSetup.ts';
import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

/** index.html lacks the element the app mounts into. */
class MountTargetNotFoundError extends Error {
  override name = 'MountTargetNotFoundError';
}

const target = document.getElementById('app');
if (!target) {
  console.error('OpenRep cannot start: index.html has no #app element.');
  throw new MountTargetNotFoundError('Missing #app mount element in index.html');
}

export default mount(App, { target });
