import { mount } from 'svelte';
import '../theme.css';
import { initTheme } from '../../adapter/browser';
import App from './App.svelte';

initTheme();

export default mount(App, { target: document.getElementById('app')! });
