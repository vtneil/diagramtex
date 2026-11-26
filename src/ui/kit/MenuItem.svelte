<script lang="ts">
  // One row of a menu. A row with a submenu opens it on hover, or with → from the keyboard. Heading for the open
  // submenu across other rows keeps it open (menu-aim.ts).
  import Icon from './Icon.svelte';
  import Kbd from './Kbd.svelte';
  import Menu from './Menu.svelte';
  import type { MenuItemSpec } from './menu';
  import { positionMenu } from '../menu-position';
  import { aimAt, aimingPast } from './menu-aim';
  let { item, onpick }: { item: MenuItemSpec; onpick: (act: string) => void } = $props();
  let row: HTMLElement | undefined = $state();
  let sub: HTMLElement | undefined = $state();
  // a submenu is placed beside its row, 4px clear, flipping left when there is no room (positionMenu)
  export function openSub(focus = false) {
    if (!row || !sub || item.disabled) return;
    row.classList.add('open');
    const r = row.getBoundingClientRect();
    positionMenu(sub, r.right, r.top - 5, r);
    if (focus) sub.querySelector<HTMLElement>('.ctx-item:not([disabled])')?.focus();
  }
  export function closeSub() { if (sub) { row?.classList.remove('open'); sub.style.display = ''; } }
  const TICK = '<path d="M4.5 10.5l3.5 3.5 7.5-8"/>';
</script>
{#snippet lead()}{#if item.icon}<Icon name={item.icon} />{:else if item.svg?.trimStart().startsWith('<svg')}{@html item.svg}{:else if item.svg}<svg viewBox="0 0 20 20" class="qe-ic" aria-hidden="true">{@html item.svg}</svg>{:else}<span class="ic"></span>{/if}<span class="lb">{item.label}</span>{/snippet}
{#if item.sub}
  <div bind:this={row} class={['ctx-item has-sub', item.disabled && 'dis'].filter(Boolean).join(' ')} role="menuitem" tabindex="-1" aria-haspopup="menu" aria-disabled={item.disabled || undefined} title={item.title}
    onpointerenter={() => { if (!aimingPast(row!, () => openSub())) openSub(); }}
    onpointerleave={(e) => { if (e.relatedTarget instanceof Node && row?.contains(e.relatedTarget)) return; if (!(row?.classList.contains('open') && aimAt(row, sub!, e.clientX, e.clientY, closeSub))) closeSub(); }}
    >{@render lead()}<span class="arr" aria-hidden="true">›</span><div bind:this={sub} class="ctx sub"><Menu items={item.sub} {onpick} nested /></div></div>
{:else}
  <button type="button" class={['ctx-item', item.danger && 'danger'].filter(Boolean).join(' ')} role={item.checked == null ? 'menuitem' : 'menuitemradio'} aria-checked={item.checked == null ? undefined : item.checked}
    tabindex="-1" disabled={item.disabled} title={item.title} data-act={item.act} onclick={() => onpick(item.act)}
    >{@render lead()}{#if item.key}<Kbd key={item.key} />{/if}{#if item.checked != null}{#if item.checked}<svg class="ck" viewBox="0 0 20 20" aria-hidden="true">{@html TICK}</svg>{:else}<span class="ck"></span>{/if}{/if}</button>
{/if}
