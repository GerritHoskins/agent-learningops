import './styles.css'
import App from './app/App.svelte'
import { mount } from 'svelte'

const target = document.getElementById('app')

if (!target) {
    throw new Error('Renderer mount target #app was not found.')
}

mount(App, { target })
