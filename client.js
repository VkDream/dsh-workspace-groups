/**
 * 侧栏工作区「分区」视图（v0.8）。
 *
 * 只做分组：把工作区按自建分区折叠展示，其余操作尽量交回 DSH 自己：
 *  - 会话右键 / ⋯ 打开原生会话菜单（置顶、改名、分叉、复制 ID、归档）；
 *  - 单击会话打开、工作区行 ＋ 新建会话都走 uiWorkspace 服务；
 *  - 分区与归置只写 localStorage，不碰 Host 工作区注册表。
 * 菜单按 Codex 的形态做：图标、分隔线、悬停展开的「分区 ▸」二级菜单。
 * Electron 不支持 window.prompt，所有输入都是行内完成。
 */
window.__ModuleLoader__.load({
  id: '@local/ws-groups',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React;

    const STORE_KEY = 'dsh.ws-groups.v1';
    const UNGROUPED = '__ungrouped__';
    const SEARCH_DEBOUNCE_MS = 250;

    const C = {
      primary: 'var(--dsw-alias-label-primary, inherit)',
      secondary: 'var(--dsw-alias-label-secondary, rgba(150,150,160,.95))',
      tertiary: 'var(--dsw-alias-label-tertiary, rgba(150,150,160,.95))',
      caption: 'var(--dsw-alias-label-caption, rgba(150,150,160,.85))',
      hover: 'var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14))',
      radius: 'var(--dsw-radius-sm, 6px)',
      radiusMd: 'var(--dsw-radius-md, 8px)',
      border: 'color-mix(in srgb, currentColor 18%, transparent)',
      divider: 'color-mix(in srgb, currentColor 12%, transparent)',
      error: 'var(--dsw-alias-state-error-primary, #d0645f)',
      rowPadding: 'var(--dsh-sidebar-row-padding, 12px)',
      labelGap: 'var(--dsh-sidebar-label-gap, 6px)',
      toolbarHeight: 'var(--workspace-toolbar-height, 32px)',
      toolbarGap: 'var(--workspace-toolbar-gap, 8px)',
    };

    let ctxRef;
    let workspacesSvc;
    let sessionsSvc;

    /* ---------------------------------------------------------------- icons */

    const svg = (children, size) => h('svg', {
      viewBox: '0 0 16 16', width: size || 15, height: size || 15, 'aria-hidden': true,
      style: { flex: 'none', display: 'block' },
    }, children);

    const Icon = {
      chat: () => svg(h('path', {
        d: 'M2.5 4.2c0-.7.6-1.2 1.2-1.2h8.6c.7 0 1.2.6 1.2 1.2v5.2c0 .7-.6 1.2-1.2 1.2H7l-3.2 2.2v-2.2h-.1c-.7 0-1.2-.6-1.2-1.2z',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round',
      })),
      tag: () => svg([
        h('path', { key: 'a', d: 'M3 2.6h4.1L13 8.5 8.5 13 2.6 7.1V3.1z', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round' }),
        h('circle', { key: 'b', cx: 5.1, cy: 5.1, r: 0.9, fill: 'currentColor' }),
      ]),
      folder: () => svg([
        h('path', {
          key: 'a',
          d: 'M1.9 4.3c0-.66.54-1.2 1.2-1.2h2.3c.4 0 .78.2 1 .53l.55.82h5.75c.66 0 1.2.54 1.2 1.2v5.55c0 .66-.54 1.2-1.2 1.2H3.1c-.66 0-1.2-.54-1.2-1.2z',
          fill: 'currentColor', opacity: 0.5,
        }),
        h('path', {
          key: 'b',
          d: 'M1.9 6.5h12.2',
          stroke: 'currentColor', strokeWidth: 0.9, opacity: 0.3,
        }),
      ]),
      folderOut: () => svg([
        h('path', { key: 'a', d: 'M1.9 4.6c0-.72.58-1.3 1.3-1.3h2.5c.44 0 .85.22 1.09.59l.5.78h5.5c.72 0 1.3.58 1.3 1.3v5.9c0 .72-.58 1.3-1.3 1.3H3.2c-.72 0-1.3-.58-1.3-1.3z', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2 }),
        h('path', { key: 'b', d: 'M6.2 8h4.2M8.6 6.2 10.4 8l-1.8 1.8', fill: 'none', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      ]),
      pencil: () => svg(h('path', {
        d: 'M10.4 2.9 13.1 5.6 5.6 13.1 2.6 13.4l.3-3z', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round',
      })),
      plus: () => svg(h('path', { d: 'M8 3.2v9.6M3.2 8h9.6', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' })),
      close: () => svg(h('path', { d: 'M4 4l8 8M12 4l-8 8', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' })),
      trash: () => svg([
        h('path', { key: 'a', d: 'M3.2 4.4h9.6M6.3 4.4V3.2h3.4v1.2M4.6 4.4l.6 8.1h5.6l.6-8.1', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      ]),
      up: () => svg(h('path', { d: 'M8 12.5V4M4.2 7.6 8 3.8l3.8 3.8', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' })),
      down: () => svg(h('path', { d: 'M8 3.5V12M4.2 8.4 8 12.2l3.8-3.8', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' })),
      chevron: () => svg(h('path', { d: 'M6 3.5 10.5 8 6 12.5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }), 12),
      chevronRight: () => svg(h('path', { d: 'M6.2 3.8 10.2 8l-4 4.2', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }), 12),
      search: () => svg([
        h('circle', { key: 'a', cx: 7, cy: 7, r: 4.2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }),
        h('path', { key: 'b', d: 'M10.2 10.2 13.4 13.4', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
      ]),
      more: () => svg([
        h('circle', { key: 'a', cx: 8, cy: 3.4, r: 1.15, fill: 'currentColor' }),
        h('circle', { key: 'b', cx: 8, cy: 8, r: 1.15, fill: 'currentColor' }),
        h('circle', { key: 'c', cx: 8, cy: 12.6, r: 1.15, fill: 'currentColor' }),
      ]),
      check: () => svg(h('path', { d: 'M3.4 8.4 6.3 11.2 12.6 4.9', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' })),
      copy: () => svg([
        h('rect', { key: 'a', x: 2.4, y: 2.4, width: 8, height: 8, rx: 1.8, fill: 'none', stroke: 'currentColor', strokeWidth: 1.2 }),
        h('rect', { key: 'b', x: 5.6, y: 5.6, width: 8, height: 8, rx: 1.8, fill: 'none', stroke: 'currentColor', strokeWidth: 1.2 }),
      ]),
      pin: () => svg(h('path', {
        d: 'M9.4 2.2 13.8 6.6l-1.6.5-2.6 2.6.3 2.6-1.2 1.2-5-5 1.2-1.2 2.6.3 2.6-2.6z', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round',
      })),
    };

    /* ---------------------------------------------------------------- store */

    function readStore() {
      const seeded = {
        version: 2,
        categories: [{ id: 'c_pinned', name: '置顶', pinned: true }],
        assignment: {},
        folded: {},
        icons: {},
      };
      /** 老数据没有「置顶」分区时补一个，保留用户已有的分区顺序在后。 */
      const migrate = data => {
        if (!data) return data;
        if (!data.categories.some(item => item.pinned)) {
          data.categories = [{ id: 'c_pinned', name: '置顶', pinned: true }, ...data.categories];
        }
        data.version = 2;
        return data;
      };
      const parse = raw => {
        if (!raw) return null;
        try {
          const parsed = JSON.parse(raw);
          return {
            version: 2,
            categories: Array.isArray(parsed.categories)
              ? parsed.categories
                .filter(item => item && typeof item.id === 'string' && typeof item.name === 'string')
                .map(item => ({ id: item.id, name: item.name, pinned: Boolean(item.pinned) }))
              : [],
            assignment: parsed.assignment && typeof parsed.assignment === 'object' ? parsed.assignment : {},
            folded: parsed.folded && typeof parsed.folded === 'object' ? parsed.folded : {},
            icons: parsed.icons && typeof parsed.icons === 'object' ? parsed.icons : {},
          };
        } catch {
          return null;
        }
      };
      try {
        const main = migrate(parse(window.localStorage.getItem(STORE_KEY)));
        if (main) return main;
        const backup = migrate(parse(window.localStorage.getItem(STORE_KEY + '.bak')));
        return backup || seeded;
      } catch {
        return seeded;
      }
    }

    /** 写主键；分区非空时同步备份，避免一次误写把配置清空。 */
    function writeStore(state) {
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
        if (state.categories.length > 0) window.localStorage.setItem(STORE_KEY + '.bak', JSON.stringify(state));
      } catch {
        // 存储不可用时保持内存态。
      }
    }

    function useObservable(source) {
      const subscribe = useCallback(listener => source.subscribe(listener), [source]);
      const snapshot = useCallback(() => source.getSnapshot(), [source]);
      return useSyncExternalStore(subscribe, snapshot, snapshot);
    }

    /** 复制文本：优先异步剪贴板，回退到临时 textarea。 */
    function copyText(text) {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(text);
      }
      return new Promise((resolve, reject) => {
        try {
          const area = document.createElement('textarea');
          area.value = text;
          area.style.position = 'fixed';
          area.style.opacity = '0';
          document.body.appendChild(area);
          area.select();
          const ok = document.execCommand('copy');
          document.body.removeChild(area);
          if (ok) resolve();
          else reject(new Error('clipboard unavailable'));
        } catch (reason) {
          reject(reason);
        }
      });
    }

    function workspaceTitle(item) {
      const title = typeof item.title === 'string' && item.title.trim() ? item.title.trim() : '';
      if (title) return title;
      const path = typeof item.path === 'string' ? item.path : '';
      const parts = path.split(/[\\/]/).filter(Boolean);
      return parts.length ? parts[parts.length - 1] : path;
    }

    function sessionTitle(summary) {
      const direct = summary && typeof summary.title === 'string' ? summary.title.trim() : '';
      if (direct) return direct;
      const projected = summary && summary.projectionValues && typeof summary.projectionValues.title === 'string'
        ? summary.projectionValues.title.trim()
        : '';
      return projected || '未命名';
    }

    /* ----------------------------------------------------------------- menu */

    const MENU_ROW_HEIGHT = 32;

    /** Codex 形态的小菜单：图标、分隔线、悬停展开的二级菜单、二级里的新建输入。 */
    function Menu({ anchor, items, onClose }) {
      const ref = useRef(null);
      const [subIndex, setSubIndex] = useState(null);
      const [subTop, setSubTop] = useState(4);
      const [draft, setDraft] = useState('');

      useEffect(() => {
        const onDown = event => { if (ref.current && !ref.current.contains(event.target)) onClose(); };
        const onKey = event => { if (event.key === 'Escape') onClose(); };
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey, true);
        return () => {
          document.removeEventListener('mousedown', onDown, true);
          document.removeEventListener('keydown', onKey, true);
        };
      }, [onClose]);

      useEffect(() => { setSubIndex(null); setDraft(''); }, [items]);

      const rowStyle = (item, active) => ({
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', height: MENU_ROW_HEIGHT,
        padding: '0 9px', border: 'none', borderRadius: 7,
        background: active ? C.hover : 'transparent',
        color: item && item.danger ? C.error : 'inherit',
        cursor: item && item.disabled ? 'default' : 'pointer',
        opacity: item && item.disabled ? 0.42 : 1,
        font: 'inherit', fontSize: 13, textAlign: 'left', transition: 'background-color 100ms ease',
      });

      const iconBox = item => h('span', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, color: 'inherit', opacity: 0.8 },
      }, item.icon ? h(item.icon) : null);

      const renderRow = (item, index) => {
        const hasSub = typeof item.submenu === 'function';
        return h('button', {
          key: item.key || index,
          type: 'button',
          role: 'menuitem',
          disabled: item.disabled,
          style: rowStyle(item, subIndex === index),
          onMouseEnter: event => {
            if (hasSub) {
              setSubIndex(index);
              setSubTop(event.currentTarget.offsetTop);
            } else if (subIndex !== null) {
              setSubIndex(null);
            }
          },
          onClick: () => {
            if (item.disabled) return;
            if (hasSub) { setSubIndex(index); return; }
            onClose();
            item.run();
          },
        },
        iconBox(item),
        h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, item.label),
        item.hint ? h('span', { style: { fontSize: 11.5, opacity: 0.45, letterSpacing: '.02em' } }, item.hint) : null,
        hasSub ? h('span', { style: { opacity: 0.55, display: 'flex' } }, h(Icon.chevronRight)) : null);
      };

      const renderSeparator = index => h('div', {
        key: 'sep-' + index,
        style: { height: 1, margin: '4px 6px', background: C.divider },
      });

      const subItems = subIndex !== null && items[subIndex] && typeof items[subIndex].submenu === 'function'
        ? items[subIndex].submenu()
        : null;

      const rows = [];
      items.forEach((item, index) => {
        if (item.separatorBefore && rows.length) rows.push(renderSeparator('m' + index));
        rows.push(typeof item.kind === 'string' && item.kind === 'input' ? null : renderRow(item, index));
      });

      const subRows = [];
      if (subItems) {
        subItems.forEach((item, index) => {          if (item.separatorBefore && subRows.length) subRows.push(renderSeparator('s' + index));
          if (item.kind === 'input') {
            subRows.push(h('div', { key: 'input-' + index, style: { padding: '4px 6px 6px', width: 190 } },
              h('input', {
                autoFocus: true,
                value: draft,
                placeholder: item.placeholder || '名称，回车确认',
                className: 'wsg-input',
                onChange: event => setDraft(event.target.value),
                onKeyDown: event => {
                  if (event.key === 'Enter') {
                    const value = draft.trim();
                    if (!value) return;
                    setDraft('');
                    onClose();
                    item.submit(value);
                  } else if (event.key === 'Escape') {
                    onClose();
                  }
                },
                style: {
                  width: '100%', height: 26, padding: '0 8px', borderRadius: 6, font: 'inherit', fontSize: 12.5,
                  border: '1px solid ' + C.border, background: 'transparent', color: 'inherit',
                },
              })));
          } else {
            subRows.push(h('button', {
              key: item.key || index,
              type: 'button',
              style: rowStyle(item, false),
              onMouseEnter: event => { event.currentTarget.style.background = C.hover; },
              onMouseLeave: event => { event.currentTarget.style.background = 'transparent'; },
              onClick: () => { onClose(); item.run(); },
            },
            iconBox(item),
            h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, item.label),
            item.hint ? h('span', { style: { fontSize: 11.5, opacity: 0.45 } }, item.hint) : null));
          }
        });
      }

      /** 二级菜单不越过视口底部。 */
      const subPanelTop = (() => {
        if (!subRows.length) return 4;
        const height = subRows.length * MENU_ROW_HEIGHT + 14;
        const room = window.innerHeight - anchor.top - 12;
        return Math.max(4, Math.min(subTop, room - height));
      })();

      return h('div', {
        ref,
        role: 'menu',        className: 'wsg-menu',
        style: {
          position: 'fixed',
          left: Math.round(Math.min(anchor.left, window.innerWidth - 240)),
          top: Math.round(Math.min(anchor.top, Math.max(8, window.innerHeight - 12 - items.length * MENU_ROW_HEIGHT))),
          minWidth: 224, zIndex: 60, padding: 6, borderRadius: 10,
          background: 'var(--dsw-alias-bg-elevated, Canvas)', color: 'inherit',
          border: '1px solid ' + C.border,
          boxShadow: '0 12px 32px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.08)',
          fontSize: 12.5,
        },
      },
      rows,
      subRows.length
        ? h('div', {
          className: 'wsg-submenu',
          style: {
            position: 'absolute', left: 'calc(100% + 4px)', top: subPanelTop, minWidth: 186, padding: 5,
            borderRadius: 10, background: 'var(--dsw-alias-bg-elevated, Canvas)',
            border: '1px solid ' + C.border,
            boxShadow: '0 12px 32px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.08)',
          },
        }, subRows)
        : null);
    }

    /* ---------------------------------------------------------- icon picker */

    const EMOJIS = [
      '📌', '🧩', '📁', '💼', '🏭', '📊', '📈', '🌐',
      '✏️', '🔧', '🛠️', '🎯', '📚', '📝', '🗂️', '🧪',
      '🔬', '💡', '🚀', '🔍', '🧠', '💬', '⭐', '🎨',
      '🎵', '📦', '🗃️', '🖥️', '⚙️', '🧭', '🌱', '🔥',
      '💎', '🎓', '🏷️', '🧱', '🗺️', '☕', '🧾', '🏗️',
      '📷', '🎮', '🧰', '🐛', '📅', '✅', '❤️', '🔒',
    ];

    /** 分区/工作区图标：表情符号网格 + 任意字符输入 + 清除。 */
    function IconPicker({ anchor, value, onPick, onClear, onClose }) {
      const ref = useRef(null);
      useEffect(() => {
        const onDown = event => { if (ref.current && !ref.current.contains(event.target)) onClose(); };
        const onKey = event => { if (event.key === 'Escape') onClose(); };
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey, true);
        return () => {
          document.removeEventListener('mousedown', onDown, true);
          document.removeEventListener('keydown', onKey, true);
        };
      }, [onClose]);

      return h('div', {
        ref,
        className: 'wsg-menu',
        style: {
          position: 'fixed',
          left: Math.round(Math.min(anchor.left, window.innerWidth - 280)),
          top: Math.round(Math.min(anchor.top, Math.max(8, window.innerHeight - 260))),
          width: 268, zIndex: 61, padding: 8, borderRadius: 10,
          background: 'var(--dsw-alias-bg-elevated, Canvas)', color: 'inherit',
          border: '1px solid ' + C.border,
          boxShadow: '0 12px 32px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.08)',
        },
      },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px 6px' } },
        h('span', { style: { fontSize: 11.5, color: C.caption } }, '选择图标'),
        h('button', {
          type: 'button',
          onClick: () => { onClose(); onClear(); },
          style: { border: 'none', background: 'transparent', color: C.tertiary, cursor: 'pointer', fontSize: 11.5, padding: '2px 4px', borderRadius: 5 },
        }, '清除')),
      h('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(8, 30px)', gap: 1, justifyItems: 'center' },
      }, EMOJIS.map(emoji => h('button', {
        key: emoji,
        type: 'button',
        title: emoji,
        onClick: () => { onClose(); onPick(emoji); },
        style: {
          width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', borderRadius: 6, background: value === emoji ? C.hover : 'transparent',
          fontSize: 16, lineHeight: 1, cursor: 'pointer', color: 'inherit',
          transition: 'background-color 100ms ease',
        },
        onMouseEnter: event => { event.currentTarget.style.background = C.hover; },
        onMouseLeave: event => { event.currentTarget.style.background = value === emoji ? C.hover : 'transparent'; },
      }, emoji))),
      h('div', { style: { padding: '8px 2px 0' } },
        h('input', {
          placeholder: '或输入任意字符，回车确认',
          maxLength: 4,
          className: 'wsg-input',
          onKeyDown: event => {
            if (event.key !== 'Enter') return;
            const text = event.currentTarget.value.trim();
            if (!text) return;
            onClose();
            onPick(text);
          },
          style: { width: '100%', height: 26, padding: '0 8px', borderRadius: 6, font: 'inherit', fontSize: 12.5, border: '1px solid ' + C.border, background: 'transparent', color: 'inherit' },
        })));
    }

    /* ---------------------------------------------------------------- rows */

    const iconButtonStyle = {
      display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22,
      padding: 0, border: 'none', borderRadius: 5, background: 'transparent',
      color: 'inherit', cursor: 'pointer', opacity: 0.72,
    };

    const emojiStyle = {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: 16, fontSize: 13.5, lineHeight: 1, flex: 'none',
    };

    const inputStyle = {
      flex: 1, minWidth: 0, height: 22, padding: '0 6px', borderRadius: 5, font: 'inherit',      border: '1px solid ' + C.border, background: 'transparent', color: 'inherit',
    };

    function Styles() {
      return h('style', null, `
        .wsg-row { position: relative; border-radius: 7px; transition: background-color 120ms ease; }
        .wsg-row:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
        .wsg-row:active { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.2)); }
        .wsg-row:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, #4a8ee0); outline-offset: -1px; }
        .wsg-row .wsg-actions { opacity: 0; transition: opacity 120ms ease; }
        .wsg-row:hover .wsg-actions, .wsg-row:focus-within .wsg-actions { opacity: 1; }
        .wsg-icon { opacity: .55; transition: opacity 130ms ease, transform 130ms ease; }
        .wsg-row:hover .wsg-icon { opacity: .95; }
        .wsg-row:active .wsg-icon { transform: scale(.94); }
        .wsg-chev { transition: transform 140ms ease, opacity 120ms ease; opacity: .55; }
        .wsg-row:hover .wsg-chev { opacity: .85; }
        .wsg-btn, .wsg-icon-btn { transition: background-color 110ms ease, opacity 110ms ease; }
        .wsg-actions .wsg-btn:hover, .wsg-icon-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.2)); }
        .wsg-input { transition: border-color 120ms ease, background-color 120ms ease; }
        .wsg-input:focus { outline: 1px solid var(--dsw-alias-state-business-primary, #4a8ee0); outline-offset: -1px; }
        .wsg-cat { height: 30px; font-size: 12px; font-weight: 500; letter-spacing: .01em; color: var(--dsw-alias-label-tertiary, rgba(150,150,160,.95)); }
        .wsg-cat .wsg-count { opacity: 0; transition: opacity 120ms ease; }
        .wsg-cat:hover .wsg-count { opacity: .5; }
        .wsg-cat[data-collapsed="false"] .wsg-chev { opacity: .55; }
        .wsg-cat[data-collapsed="true"] .wsg-chev { opacity: .5; }
        .wsg-menu { animation: wsg-in 100ms ease-out both; }
        .wsg-submenu { animation: wsg-in 100ms ease-out both; }
        @keyframes wsg-in { from { opacity: 0; transform: translateY(-3px) scale(.995); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) {
          .wsg-row, .wsg-icon, .wsg-chev, .wsg-actions, .wsg-btn, .wsg-icon-btn, .wsg-menu, .wsg-submenu { transition: none !important; animation: none !important; }
        }
      `);
    }


    function GroupSection(props) {
      const {
        group, store, byId, archived, lowered, showArchived, editing,
        onCommitEdit, onCancelEdit, onToggle, onMenu, onOpenSession, onStartSession,
        onBeginRename, onRenameInline, onSessionMenu, onDropWorkspace, extraRows,
      } = props;

      const folded = Boolean(store.folded[group.id]);
      const children = [];
      const editingThis = editing && editing.kind === 'category' && editing.id === group.id;

      const headerLabel = editingThis
        ? h('input', {
          autoFocus: true,
          value: editing.value,
          className: 'wsg-input',
          onChange: event => onRenameInline(event.target.value),
          onKeyDown: event => {
            if (event.key === 'Enter') onCommitEdit();
            else if (event.key === 'Escape') onCancelEdit();
          },
          onBlur: onCommitEdit,
          style: inputStyle,
        })
        : h('span', {
          style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
        }, group.name);

      children.push(h('div', {
        key: 'header',
        role: 'button',
        tabIndex: 0,
        className: 'wsg-row wsg-cat',
        'data-collapsed': folded ? 'true' : 'false',
        onClick: () => { if (!editingThis) onToggle(group.id); },
        onContextMenu: event => { event.preventDefault(); onMenu(event, group); },
        onDragOver: event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; },
        onDrop: event => {
          event.preventDefault();
          onDropWorkspace(event.dataTransfer.getData('text/plain'), null, group.system ? null : group.id);
        },
        onKeyDown: event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle(group.id); }
        },
        style: { display: 'flex', alignItems: 'center', gap: C.labelGap, padding: '0 ' + C.rowPadding, cursor: 'pointer', userSelect: 'none' },
      },
      h('span', { className: 'wsg-chev', style: { display: 'flex', width: 12, transform: folded ? 'none' : 'rotate(90deg)' } }, h(Icon.chevron)),
      store.icons && store.icons['cat:' + group.id]
        ? h('span', { style: emojiStyle }, store.icons['cat:' + group.id])
        : null,
      headerLabel,
      h('div', { className: 'wsg-actions', style: { display: 'flex', alignItems: 'center', gap: 2, flex: 'none' } },
        h('span', { className: 'wsg-count', style: { fontSize: 11, marginRight: 2 } }, String(group.items.length)),
        group.system ? null : h('button', {
          type: 'button', title: '重命名分区', className: 'wsg-btn',
          onClick: event => { event.stopPropagation(); onBeginRename('category', group.id, group.name); },
          style: { ...iconButtonStyle, opacity: 0.7 },
        }, h(Icon.pencil)),
        h('button', {
          type: 'button', title: '分区操作', className: 'wsg-btn',
          onClick: event => { event.stopPropagation(); onMenu(event, group); },
          style: iconButtonStyle,
        }, h(Icon.more)))));

      if (!folded) {
        for (const item of group.items) {
          const foldKey = 'w:' + item.workspaceId;
          const workspaceFolded = Boolean(store.folded[foldKey]);
          const editingWorkspace = editing && editing.kind === 'workspace' && editing.id === item.workspaceId;
          const label = editingWorkspace
            ? h('input', {
              autoFocus: true,
              value: editing.value,
              className: 'wsg-input',
              onChange: event => onRenameInline(event.target.value),
              onKeyDown: event => {
                if (event.key === 'Enter') onCommitEdit();
                else if (event.key === 'Escape') onCancelEdit();
              },
              onBlur: onCommitEdit,
              style: inputStyle,
            })
            : h('span', {
              style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
              onDoubleClick: () => onBeginRename('workspace', item.workspaceId, workspaceTitle(item)),
            }, workspaceTitle(item));

          const sessionRows = [];
          if (!workspaceFolded) {
            for (const id of Array.isArray(item.sessionIds) ? item.sessionIds : []) {
              const isArchived = archived.has(id);
              if (isArchived && !showArchived) continue;
              const title = sessionTitle(byId[id]);
              if (lowered && !title.toLowerCase().includes(lowered)) continue;
              sessionRows.push(h('div', {
                key: 's-' + id,
                className: 'wsg-row',
                style: { display: 'flex', alignItems: 'center', height: 28 },
                onContextMenu: event => { event.preventDefault(); onSessionMenu(id, title, event); },
              },
              h('button', {
                type: 'button',
                title,
                onClick: () => onOpenSession(id),
                style: {
                  flex: 1, minWidth: 0, height: 28, textAlign: 'left', border: 'none', background: 'transparent',
                  padding: '0 ' + C.rowPadding + ' 0 calc(' + C.rowPadding + ' + 34px)',
                  color: isArchived ? C.caption : C.tertiary, fontSize: 12, cursor: 'pointer', font: 'inherit',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  opacity: isArchived ? 0.6 : 1,
                },
              }, title),
              h('div', { className: 'wsg-actions', style: { display: 'flex', alignItems: 'center', gap: 2, flex: 'none', paddingRight: 4 } },
                h('button', {
                  type: 'button', title: '会话操作', className: 'wsg-btn', style: iconButtonStyle,
                  onClick: event => { event.stopPropagation(); onSessionMenu(id, title, event); },
                }, h(Icon.more)))));
            }
          }

          children.push(h('div', { key: 'w-' + item.workspaceId, style: { display: 'flex', flexDirection: 'column' } },
            h('div', {
              role: 'button',
              tabIndex: 0,
              className: 'wsg-row',
              onClick: () => { if (!editingWorkspace) onToggle(foldKey); },
              onContextMenu: event => { event.preventDefault(); onMenu(event, item); },
              draggable: !editingWorkspace,
              onDragStart: event => {
                event.dataTransfer.setData('text/plain', item.workspaceId);
                event.dataTransfer.effectAllowed = 'move';
              },
              onDragOver: event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; },
              onDrop: event => {
                event.preventDefault();
                onDropWorkspace(event.dataTransfer.getData('text/plain'), item.workspaceId, group.system ? null : group.id);
              },
              onKeyDown: event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle(foldKey); }
              },
              style: {
                display: 'flex', alignItems: 'center', gap: C.labelGap, height: 32,
                padding: '0 ' + C.rowPadding + ' 0 calc(' + C.rowPadding + ' + 14px)',
                color: C.primary, fontSize: 13, cursor: 'pointer', userSelect: 'none',
              },
            },
            store.icons && store.icons[item.workspaceId]
              ? h('span', { style: emojiStyle }, store.icons[item.workspaceId])
              : h('span', { className: 'wsg-icon', style: { display: 'flex', color: C.tertiary } }, h(Icon.folder)),
            label,
            h('div', { className: 'wsg-actions', style: { display: 'flex', alignItems: 'center', gap: 2, flex: 'none' } },
              h('button', {
                type: 'button', title: '在此工作区新建会话', className: 'wsg-btn',
                onClick: event => { event.stopPropagation(); onStartSession(item.workspaceId); },
                style: iconButtonStyle,
              }, h(Icon.plus)),
              h('button', {
                type: 'button', title: '工作区操作', className: 'wsg-btn',
                onClick: event => { event.stopPropagation(); onMenu(event, item); },
                style: iconButtonStyle,
              }, h(Icon.more)))),
            sessionRows.length ? h('div', { style: { display: 'flex', flexDirection: 'column' } }, sessionRows) : null));
        }
      }
      return h('div', { style: { display: 'flex', flexDirection: 'column' } },
        children,
        !folded && group.pinned && group.items.length === 0 && !(Array.isArray(extraRows) && extraRows.length)
          ? h('div', {
            key: 'empty-hint',
            style: {
              padding: '1px ' + C.rowPadding + ' 5px calc(' + C.rowPadding + ' + 18px)',
              fontSize: 11.5, color: C.caption, opacity: 0.85,
            },
          }, '把工作区拖到这里，或点工作区 ⋯ → 移动到分区')
          : null,
        !folded && Array.isArray(extraRows) && extraRows.length
          ? h('div', { style: { display: 'flex', flexDirection: 'column' } }, extraRows)
          : null);
    }

    /* ------------------------------------------------------------- browser */

    function GroupsBrowser(props) {
      const wide = props && props.wide !== false;
      const [store, setStore] = useState(readStore);
      const [query, setQuery] = useState('');
      const [searchOpen, setSearchOpen] = useState(false);
      const [menu, setMenu] = useState(null);
      const [editing, setEditing] = useState(null);
      const [notice, setNotice] = useState(null);
      const [showArchived, setShowArchived] = useState(false);
      const [contentHits, setContentHits] = useState(null);
      const [picker, setPicker] = useState(null);
      const editLock = useRef(false);

      const wsSnap = useObservable(workspacesSvc.list);
      const sessSnap = useObservable(sessionsSvc.list);

      useEffect(() => { editLock.current = false; }, [editing]);

      const commit = useCallback(next => {
        setStore(next);
        writeStore(next);
      }, []);

      const items = wsSnap && wsSnap.phase === 'ready' && Array.isArray(wsSnap.items) ? wsSnap.items : [];
      const archived = useMemo(
        () => new Set(wsSnap && Array.isArray(wsSnap.archivedSessionIds) ? wsSnap.archivedSessionIds : []),
        [wsSnap],
      );
      const byId = sessSnap && sessSnap.byId && typeof sessSnap.byId === 'object' ? sessSnap.byId : {};
      const pinnedIds = Array.isArray(wsSnap && wsSnap.pinnedSessionIds) ? wsSnap.pinnedSessionIds : [];

      const groups = useMemo(() => {
        const byCategory = new Map();
        const ungrouped = [];
        for (const item of items) {
          const target = store.assignment[item.workspaceId];
          if (target && store.categories.some(category => category.id === target)) {
            if (!byCategory.has(target)) byCategory.set(target, []);
            byCategory.get(target).push(item);
          } else ungrouped.push(item);
        }
        const rows = store.categories.map(category => ({
          id: category.id,
          name: category.name,
          pinned: Boolean(category.pinned),
          items: byCategory.get(category.id) || [],
        }));
        if (ungrouped.length || store.categories.length === 0) {
          rows.push({ id: UNGROUPED, name: '未分类', items: ungrouped, system: true });
        }
        return rows;
      }, [items, store]);

      const lowered = query.trim().toLowerCase();
      const matches = useCallback(item => {
        if (!lowered) return true;
        if (workspaceTitle(item).toLowerCase().includes(lowered)) return true;
        const ids = Array.isArray(item.sessionIds) ? item.sessionIds : [];
        return ids.some(id => sessionTitle(byId[id]).toLowerCase().includes(lowered));
      }, [lowered, byId]);

      useEffect(() => {
        if (!lowered || lowered.length < 2 || !sessionsSvc || typeof sessionsSvc.search !== 'function') {
          setContentHits(null);
          return undefined;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => {
          Promise.resolve(sessionsSvc.search(lowered, controller.signal))
            .then(result => {
              if (controller.signal.aborted) return;
              if (result && result.ok && result.value && Array.isArray(result.value.items)) setContentHits(result.value);
            })
            .catch(() => {});
        }, SEARCH_DEBOUNCE_MS);
        return () => { clearTimeout(timer); controller.abort(); };
      }, [lowered]);

      const fail = useCallback((reason, fallback) => {
        const message = reason && reason.message ? reason.message : String(reason || '');
        setNotice({ text: (fallback || '操作失败') + (message ? '：' + message : ''), tone: 'error' });
      }, []);

      useEffect(() => {
        if (!notice) return undefined;
        const timer = setTimeout(() => setNotice(null), 4000);
        return () => clearTimeout(timer);
      }, [notice]);

      const openSession = useCallback(sessionId => {
        const ui = ctxRef.get('uiWorkspace');
        if (ui && typeof ui.openSession === 'function') ui.openSession(sessionId);
      }, []);

      const startSession = useCallback(workspaceId => {
        const ui = ctxRef.get('uiWorkspace');
        if (ui && typeof ui.startSession === 'function') ui.startSession(workspaceId);
      }, []);

      const openSessionMenu = useCallback((sessionId, title, event) => {
        const menus = ctxRef.get('contextMenus');
        if (!menus || typeof menus.open !== 'function') return;
        const rect = event && event.currentTarget ? event.currentTarget.getBoundingClientRect() : null;
        const x = rect ? rect.right : (event && event.clientX) || 0;
        const y = rect ? rect.bottom : (event && event.clientY) || 0;
        try {
          menus.open({ kind: 'session', value: { sessionId, displayTitle: title } }, { x, y });
        } catch (reason) {
          fail(reason, '打开会话菜单失败');
        }
      }, [fail]);

      const toggleFold = useCallback(key => {
        commit({ ...store, folded: { ...store.folded, [key]: !store.folded[key] } });
      }, [store, commit]);

      const assign = useCallback((workspaceId, categoryId) => {
        const assignment = { ...store.assignment };
        if (categoryId) assignment[workspaceId] = categoryId;
        else delete assignment[workspaceId];
        // 归入后展开目标分区，避免看起来「消失了」。
        const folded = categoryId ? { ...store.folded, [categoryId]: false } : store.folded;
        commit({ ...store, assignment, folded });
      }, [store, commit]);

      const createCategory = useCallback((name, assignWorkspaceId) => {
        const id = 'c' + Date.now().toString(36);
        const assignment = { ...store.assignment };
        if (assignWorkspaceId) assignment[assignWorkspaceId] = id;
        const folded = assignWorkspaceId ? { ...store.folded, [id]: false } : store.folded;
        commit({ ...store, assignment, folded, categories: [...store.categories, { id, name }] });
        return id;
      }, [store, commit]);

      const setIcon = useCallback((key, value) => {
        const icons = { ...(store.icons || {}) };
        if (value) icons[key] = value;
        else delete icons[key];
        commit({ ...store, icons });
      }, [store, commit]);

      const dropWorkspace = useCallback((draggedId, beforeId, categoryId) => {
        if (!draggedId || draggedId === beforeId) return;
        if (!items.some(item => item.workspaceId === draggedId)) return;
        assign(draggedId, categoryId);
        if (beforeId && typeof workspacesSvc.insertBefore === 'function') {
          Promise.resolve(workspacesSvc.insertBefore(draggedId, beforeId)).catch(reason => fail(reason, '排序失败'));
        }
      }, [items, assign, fail]);

      const moveCategory = useCallback((categoryId, delta) => {
        const index = store.categories.findIndex(item => item.id === categoryId);
        const next = index + delta;
        if (index < 0 || next < 0 || next >= store.categories.length) return;
        const categories = [...store.categories];
        const moved = categories.splice(index, 1)[0];
        categories.splice(next, 0, moved);
        commit({ ...store, categories });
      }, [store, commit]);

      const anchorFrom = useCallback(event => {
        const rect = event.currentTarget.getBoundingClientRect();
        return { left: rect.left, top: rect.bottom + 4 };
      }, []);

      const confirmMenu = useCallback((anchor, title, confirmLabel, run) => {
        setMenu({
          anchor,
          items: [
            { key: 'ask', label: title, disabled: true, icon: Icon.chevron, run: () => {} },
            { key: 'yes', label: confirmLabel, danger: true, icon: Icon.check, separatorBefore: true, run },
            { key: 'no', label: '取消', icon: Icon.close, run: () => {} },
          ],
        });
      }, []);

      const categoryMenu = useCallback((event, group) => {
        const anchor = anchorFrom(event);
        const index = store.categories.findIndex(item => item.id === group.id);
        setMenu({
          anchor,
          items: [
            { key: 'rename', label: '重命名分区', icon: Icon.pencil, disabled: Boolean(group.system), run: () => setEditing({ kind: 'category', id: group.id, value: group.name }) },
            { key: 'icon', label: '更改图标', icon: Icon.tag, run: () => setPicker({ anchor, kind: 'category', id: group.id }) },
            { key: 'fold', label: store.folded[group.id] ? '展开' : '折叠', icon: Icon.chevron, run: () => toggleFold(group.id) },
            { key: 'up', label: '上移分区', icon: Icon.up, disabled: Boolean(group.system) || index <= 0, run: () => moveCategory(group.id, -1) },
            { key: 'down', label: '下移分区', icon: Icon.down, disabled: Boolean(group.system) || index < 0 || index >= store.categories.length - 1, run: () => moveCategory(group.id, 1) },
            { key: 'new', label: '新建分区', icon: Icon.plus, separatorBefore: true, run: () => setEditing({ kind: 'newCategory', value: '' }) },
            {
              key: 'delete',
              label: '删除分区',
              icon: Icon.trash,
              danger: true,
              disabled: Boolean(group.system || group.pinned),
              separatorBefore: true,
              run: () => confirmMenu(anchor, '删除「' + group.name + '」？', '删除分区', () => {
                const assignment = { ...store.assignment };
                for (const [workspaceId, categoryId] of Object.entries(assignment)) {
                  if (categoryId === group.id) delete assignment[workspaceId];
                }
                commit({ ...store, assignment, categories: store.categories.filter(item => item.id !== group.id) });
                if (store.categories.length <= 1) {
                  try { window.localStorage.removeItem(STORE_KEY + '.bak'); } catch { /* ignore */ }
                }
              }),
            },
          ],
        });
      }, [anchorFrom, store, toggleFold, commit, confirmMenu, moveCategory]);

      const workspaceMenu = useCallback((event, item) => {
        const anchor = anchorFrom(event);
        setMenu({
          anchor,
          items: [
            { key: 'new', label: '新建会话', icon: Icon.chat, run: () => startSession(item.workspaceId) },
            {
              key: 'group',
              label: '移动到分区',
              icon: Icon.tag,
              submenu: () => {
                const rows = store.categories.map(category => ({
                  key: 'pick-' + category.id,
                  label: category.name,
                  icon: Icon.folder,
                  run: () => assign(item.workspaceId, category.id),
                }));
                if (!rows.length) {
                  rows.push({ key: 'empty', label: '还没有分区，先在下面新建', icon: Icon.tag, disabled: true, run: () => {} });
                }
                if (store.assignment[item.workspaceId]) {
                  rows.push({ key: 'none', label: '移出分区', icon: Icon.folderOut, separatorBefore: true, run: () => assign(item.workspaceId, null) });
                }
                rows.push({
                  key: 'create',
                  kind: 'input',
                  placeholder: '新建分区名称',
                  separatorBefore: true,
                  submit: name => createCategory(name, item.workspaceId),
                });
                return rows;
              },
            },
            { key: 'rename', label: '重命名', icon: Icon.pencil, separatorBefore: true, run: () => setEditing({ kind: 'workspace', id: item.workspaceId, value: workspaceTitle(item) }) },
            { key: 'icon', label: '更改图标', icon: Icon.tag, run: () => setPicker({ anchor, kind: 'workspace', id: item.workspaceId }) },
            {
              key: 'copy',
              label: '复制路径',
              icon: Icon.copy,
              run: () => {
                const path = typeof item.path === 'string' ? item.path : '';
                if (!path) return;
                Promise.resolve(copyText(path)).catch(reason => fail(reason, '复制路径失败'));
              },
            },
            {
              key: 'delete',
              label: '移除工作区',
              icon: Icon.close,
              danger: true,
              separatorBefore: true,
              run: () => confirmMenu(anchor, '移除「' + workspaceTitle(item) + '」？', '只删注册，保留目录', () => {
                Promise.resolve(workspacesSvc.delete(item.workspaceId)).catch(reason => fail(reason, '移除失败'));
              }),
            },
          ],
        });
      }, [anchorFrom, startSession, store.categories, assign, createCategory, confirmMenu, fail]);

      const commitEdit = useCallback(() => {
        if (!editing || editLock.current) return;
        editLock.current = true;
        const value = (editing.value || '').trim();
        if (editing.kind === 'newCategory') {
          setEditing(null);
          if (!value) return;
          createCategory(value, editing.assign);
          return;
        }
        if (editing.kind === 'category') {
          setEditing(null);
          if (!value) return;
          commit({ ...store, categories: store.categories.map(item => (item.id === editing.id ? { ...item, name: value } : item)) });
          return;
        }
        if (editing.kind === 'workspace') {
          setEditing(null);
          if (!value) return;
          Promise.resolve(workspacesSvc.rename(editing.id, value)).catch(reason => fail(reason, '重命名失败'));
          return;
        }
        if (editing.kind === 'addWorkspace') {
          setEditing(null);
          if (!value) return;
          Promise.resolve(workspacesSvc.create({ path: value })).catch(reason => fail(reason, '添加工作区失败'));
        }
      }, [editing, store, commit, fail, createCategory]);

      const cancelEdit = useCallback(() => setEditing(null), []);

      if (!wide) {
        return h('button', {
          type: 'button',
          title: '工作区分区',
          onClick: () => { if (typeof props.expandSidebar === 'function') props.expandSidebar(); },
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36,
            margin: '0 auto', border: 'none', borderRadius: 8, background: 'transparent',
            color: 'inherit', cursor: 'pointer',
          },
        }, h(Icon.folder));
      }

      /** 「置顶」分区里附带的原生置顶会话行。 */
      const pinnedRows = pinnedIds
        .filter(id => byId[id])
        .filter(id => showArchived || !archived.has(id))
        .filter(id => !lowered || sessionTitle(byId[id]).toLowerCase().includes(lowered))
        .map(id => {
          const title = sessionTitle(byId[id]);
          return h('div', {
            key: 'ps-' + id,
            className: 'wsg-row',
            style: { display: 'flex', alignItems: 'center', height: 28 },
            onContextMenu: event => { event.preventDefault(); openSessionMenu(id, title, event); },
          },
          h('button', {
            type: 'button',
            title,
            onClick: () => openSession(id),
            style: {
              flex: 1, minWidth: 0, height: 28, textAlign: 'left', border: 'none', background: 'transparent',
              padding: '0 ' + C.rowPadding + ' 0 calc(' + C.rowPadding + ' + 18px)',
              color: C.tertiary, fontSize: 12, cursor: 'pointer', font: 'inherit',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            },
          }, title),
          h('div', { className: 'wsg-actions', style: { display: 'flex', alignItems: 'center', gap: 2, flex: 'none', paddingRight: 4 } },
            h('button', {
              type: 'button', title: '会话操作', className: 'wsg-btn', style: iconButtonStyle,
              onClick: event => { event.stopPropagation(); openSessionMenu(id, title, event); },
            }, h(Icon.more))));
        });

      const visibleGroups = groups
        .map(group => ({ ...group, items: group.items.filter(matches) }))
        .filter(group => {
          // 搜索时只留下有命中的分区；「置顶」默认常驻，不随内容消失。
          if (!lowered) return true;
          return group.items.length > 0 || (group.pinned && pinnedRows.length > 0);
        });

      const sectionMenu = useCallback(event => {
        const anchor = anchorFrom(event);
        setMenu({
          anchor,
          items: [
            { key: 'new', label: '新建分区', icon: Icon.plus, run: () => setEditing({ kind: 'newCategory', value: '' }) },
            { key: 'add', label: '添加工作区…', icon: Icon.folderOut, run: () => setEditing({ kind: 'addWorkspace', value: '' }) },
            {
              key: 'archived',
              label: showArchived ? '隐藏已归档会话' : '显示已归档会话',
              icon: Icon.check,
              separatorBefore: true,
              run: () => setShowArchived(!showArchived),
            },
          ],
        });
      }, [anchorFrom, showArchived]);

      const editingRow = editing && (editing.kind === 'addWorkspace' || (editing.kind === 'newCategory' && !editing.assign))
        ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 ' + C.labelGap } },
          h('span', { className: 'wsg-icon', style: { display: 'flex', color: C.tertiary } }, editing.kind === 'newCategory' ? h(Icon.tag) : h(Icon.folderOut)),
          h('input', {
            autoFocus: true,
            value: editing.value,
            placeholder: editing.kind === 'newCategory' ? '分区名称，回车确认' : '工作区目录绝对路径，回车确认',
            className: 'wsg-input',
            onChange: event => setEditing({ ...editing, value: event.target.value }),
            onKeyDown: event => {
              if (event.key === 'Enter') commitEdit();
              else if (event.key === 'Escape') cancelEdit();
            },
            onBlur: commitEdit,
            style: inputStyle,
          }))
        : null;

      return h('div', { style: { padding: '0 var(--dsh-sidebar-inline-padding, 8px) 4px', display: 'flex', flexDirection: 'column' } },
        h(Styles),
        h('div', {
          style: { display: 'flex', alignItems: 'center', gap: 4, height: C.toolbarHeight, marginBottom: C.toolbarGap, paddingLeft: C.labelGap, color: C.tertiary },
        },
        h('span', { style: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, letterSpacing: '.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, '工作区'),
        h('button', {
          type: 'button', title: '搜索工作区与会话', className: 'wsg-icon-btn',
          onClick: () => { setSearchOpen(!searchOpen); if (searchOpen) setQuery(''); },
          style: { ...iconButtonStyle, opacity: searchOpen ? 1 : 0.7 },
        }, h(Icon.search)),
        h('button', {
          type: 'button', title: '新建分区', className: 'wsg-icon-btn',
          onClick: () => setEditing({ kind: 'newCategory', value: '' }),
          style: iconButtonStyle,
        }, h(Icon.plus)),
        h('button', {
          type: 'button', title: '更多', className: 'wsg-icon-btn',
          onClick: sectionMenu,
          style: iconButtonStyle,
        }, h(Icon.more))),
        searchOpen
          ? h('input', {
            autoFocus: true,
            value: query,
            placeholder: '搜索工作区、会话标题或内容…',
            className: 'wsg-input',
            onChange: event => setQuery(event.target.value),
            onKeyDown: event => { if (event.key === 'Escape') { setSearchOpen(false); setQuery(''); } },
            style: { ...inputStyle, height: 26, marginBottom: 6 },
          })
          : null,
        editingRow,
        notice
          ? h('div', {
            style: {
              margin: '2px 4px 6px', padding: '6px 8px', borderRadius: C.radius, fontSize: 12,
              color: notice.tone === 'error' ? C.error : C.secondary,
              background: 'color-mix(in srgb, currentColor 8%, transparent)',
            },
          }, notice.text)
          : null,
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
          visibleGroups.map(group => h(GroupSection, {
            key: group.id,
            group,
            store,
            byId,
            archived,
            lowered,
            showArchived,
            editing,
            extraRows: group.pinned ? pinnedRows : null,
            onCommitEdit: commitEdit,
            onCancelEdit: cancelEdit,
            onToggle: toggleFold,
            onMenu: (event, target) => {
              if (target && 'workspaceId' in target) workspaceMenu(event, target);
              else categoryMenu(event, target);
            },
            onOpenSession: openSession,
            onStartSession: startSession,
            onSessionMenu: openSessionMenu,
            onDropWorkspace: dropWorkspace,
            onBeginRename: (kind, id, value) => setEditing({ kind, id, value }),
            onRenameInline: value => setEditing(previous => (previous ? { ...previous, value } : previous)),
          }))),
        contentHits && contentHits.items.length
          ? h('div', { style: { marginTop: 8, display: 'flex', flexDirection: 'column' } },
            h('div', { style: { padding: '4px 6px', fontSize: 11, color: C.caption } }, '对话内容匹配'),
            contentHits.items.slice(0, 20).map((hit, index) => {
              const id = hit.sessionId || hit.id;
              const title = hit.title || hit.sessionTitle || hit.snippet || '（无标题）';
              if (!id) return null;
              return h('button', {
                key: 'hit-' + id + '-' + index,
                type: 'button',
                title: typeof hit.snippet === 'string' ? hit.snippet : title,
                onClick: () => openSession(id),
                style: {
                  display: 'block', width: '100%', height: 28, textAlign: 'left', border: 'none',
                  borderRadius: C.radius, background: 'transparent', color: C.tertiary,
                  padding: '0 ' + C.rowPadding, fontSize: 12, cursor: 'pointer', font: 'inherit',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                },
              }, title);
            }))
          : null,
        wsSnap && wsSnap.phase === 'ready' && items.length === 0
          ? h('div', { style: { padding: '10px 12px', fontSize: 12, color: C.tertiary } }, '还没有工作区。')
          : null,
        menu ? h(Menu, { anchor: menu.anchor, items: menu.items, onClose: () => setMenu(null) }) : null,
        picker
          ? h(IconPicker, {
            anchor: picker.anchor,
            value: picker.kind === 'category'
              ? (store.icons || {})['cat:' + picker.id]
              : (store.icons || {})[picker.id],
            onPick: emoji => setIcon(picker.kind === 'category' ? 'cat:' + picker.id : picker.id, emoji),
            onClear: () => setIcon(picker.kind === 'category' ? 'cat:' + picker.id : picker.id, null),
            onClose: () => setPicker(null),
          })
          : null);
    }

    function FallbackView() {
      return h('div', {
        style: {
          margin: '8px 10px', padding: '8px 10px', borderRadius: 6, fontSize: 12, lineHeight: 1.5,
          background: 'color-mix(in srgb, currentColor 8%, transparent)', color: C.secondary,
        },
      }, '工作区分区视图渲染失败。可在左侧「插件」里停用「工作区分区」恢复内置列表。');
    }

    class Boundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failed: false };
      }

      static getDerivedStateFromError() {
        return { failed: true };
      }

      componentDidCatch(reason) {
        console.warn('[ws-groups] sidebar workspace view failed:', reason);
      }

      render() {
        return this.state.failed ? h(FallbackView) : this.props.children;
      }
    }

    function Occupant(props) {
      return h(Boundary, null, h(GroupsBrowser, props));
    }

    return {
      inject: ['slots', 'workspaces', 'sessions'],
      apply(ctx) {
        ctxRef = ctx;
        const workspaces = ctx.get('workspaces');
        const sessions = ctx.get('sessions');
        if (!workspaces || !workspaces.list || !sessions || !sessions.list) {
          console.warn('[ws-groups] workspaces/sessions services unavailable; built-in browser kept');
          return;
        }
        workspacesSvc = workspaces;
        sessionsSvc = sessions;
        ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register({
          name: 'sidebar.workspaces',
        }, Occupant));
      },
    };
  },
});


