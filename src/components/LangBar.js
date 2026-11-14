import { defineComponent } from '../vendor/vue.esm-browser.prod.js'

export default defineComponent({
  name: 'LangBar',
  props: {
    source: { type: String, default: 'auto' },
    target: { type: String, default: 'zh-CN' },
    langs: { type: Array, default: () => [] }
  },
  emits: ['update:source', 'update:target', 'swap'],
  setup(props, { emit }) {
    return { emit }
  },
  template: `
  <div class="langbar">
    <div class="lang-select">
      <select :value="source" @change="emit('update:source', $event.target.value)">
        <option v-for="l in langs" :key="l.code" :value="l.code">{{ l.label }}</option>
      </select>
    </div>

    <button class="swap-btn" title="交换语言" @click="emit('swap')">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2.5 5.5h9m0 0L9.5 3.5m2 2l-2 2" />
        <path d="M13.5 10.5h-9m0 0l2 2m-2-2l2-2" />
      </svg>
    </button>

    <div class="lang-select">
      <select :value="target" @change="emit('update:target', $event.target.value)">
        <option v-for="l in langs.filter((x) => x.code !== 'auto')" :key="l.code" :value="l.code">
          {{ l.label }}
        </option>
      </select>
    </div>

    <div class="langbar-divider"></div>
    <slot></slot>
  </div>`
})
