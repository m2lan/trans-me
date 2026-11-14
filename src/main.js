import { createApp } from './vendor/vue.esm-browser.prod.js'
import App from './components/App.js'

if (window.api && window.api.platform === 'darwin') document.body.classList.add('is-mac')

createApp(App).mount('#app')
