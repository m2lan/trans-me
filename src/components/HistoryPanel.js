import { defineComponent, ref, computed } from '../vendor/vue.esm-browser.prod.js'

export default defineComponent({
  name: 'HistoryPanel',
  props: {
    items: { type: Array, default: () => [] },
    favorites: { type: Array, default: () => [] }
  },
  emits: ['select', 'star', 'copy'],
  setup(props, { emit }) {
    const view = ref('all')
    const query = ref('')

    const favIds = computed(() => new Set(props.favorites.map((f) => f.id)))

    const list = computed(() => {
      const base = view.value === 'fav' ? props.favorites : props.items
      const q = query.value.trim().toLowerCase()
      if (!q) return base
      return base.filter(
        (i) =>
          (i.original || '').toLowerCase().includes(q) ||
          (i.translated || '').toLowerCase().includes(q)
      )
    })

    function timeLabel(ts) {
      const d = new Date(ts)
      const diff = Date.now() - ts
      if (diff < 60 * 1000) return '刚刚'
      if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' 分钟前'
      const today = new Date()
      const sameDay = d.toDateString() === today.toDateString()
      const hm =
        String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
      if (sameDay) return '今天 ' + hm
      return d.getMonth() + 1 + '月' + d.getDate() + '日 ' + hm
    }

    const typeLabel = (s) => (s === 'screenshot' ? '截图' : '文本')

    return { view, query, favIds, list, timeLabel, typeLabel, emit }
  },
  template: `
  <div class="history-view">
    <div class="history-toolbar">
      <div class="tabs" style="margin-left: 0">
        <button class="tab" :class="{ active: view === 'all' }" @click="view = 'all'">
          全部 {{ items.length }}
        </button>
        <button class="tab" :class="{ active: view === 'fav' }" @click="view = 'fav'">
          收藏 {{ favorites.length }}
        </button>
      </div>
      <div class="search-box">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <circle cx="7" cy="7" r="4.6" />
          <path d="M10.4 10.4L13.5 13.5" />
        </svg>
        <input v-model="query" placeholder="搜索历史记录" spellcheck="false" />
      </div>
    </div>

    <div class="history-list">
      <div v-for="item in list" :key="item.id" class="history-item" @click="emit('select', item)">
        <div class="history-main">
          <div class="history-src">{{ item.original }}</div>
          <div class="history-dst">{{ item.translated }}</div>
          <div class="history-meta">
            <span>{{ typeLabel(item.source) }}</span>
            <span>·</span>
            <span>{{ timeLabel(item.createdAt) }}</span>
            <span v-if="item.provider">· {{ item.provider }}</span>
          </div>
        </div>
        <div class="history-actions" @click.stop>
          <button
            class="icon-btn"
            :class="{ star: favIds.has(item.id) }"
            :title="favIds.has(item.id) ? '取消收藏' : '收藏'"
            @click="emit('star', item.id)"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" :fill="favIds.has(item.id) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">
              <path d="M8 2.2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.4l-3.6 1.9.7-4L2.2 6.5l4-.6z" />
            </svg>
          </button>
          <button class="icon-btn" title="复制译文" @click="emit('copy', item.translated)">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">
              <rect x="5.5" y="5.5" width="8" height="8.5" rx="1.5" />
              <path d="M10.5 5.5V3.9a1.4 1.4 0 00-1.4-1.4H3.9A1.4 1.4 0 002.5 3.9v5.2a1.4 1.4 0 001.4 1.4h1.6" />
            </svg>
          </button>
        </div>
      </div>

      <div v-if="!list.length" class="empty-state">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.6V12l3 1.8" />
        </svg>
        <div>{{ query ? '没有匹配的记录' : view === 'fav' ? '还没有收藏' : '翻译记录会保存在这里' }}</div>
      </div>
    </div>
  </div>`
})
