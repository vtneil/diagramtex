// Shared in-page helpers prepended to each scene.
export const P = `
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
const ex=t=>{const B=TD.state.doc.blocks;const i=B.findIndex(b=>b.type==='text'&&b.text.startsWith('## ')&&b.text.split('\\n')[0].includes(t));if(i<0)throw Error('no example '+t);return i+1;};
const open=async t=>{TD.app.setActiveBlock(ex(t));TD.app.setMode('diagram');await frame();TD.app.zoomFit();await sleep(400);};
const shapes=()=>TD.state.doc.blocks[TD.state.doc.active ?? 0]?.shapes;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const hideSide=async()=>{if($('#files')?.offsetWidth>0)$('#btnSidebar').click();await frame();};
const edit=async type=>{const s=shapes().find(x=>x.type===type);if(!s)throw Error('no '+type+' in '+shapes().map(x=>x.type));TD[TD.blocks.get(type).editor.alias](s.id);await sleep(900);return s;};
const select=ids=>{TD.state.sel.clear();for(const id of ids)TD.state.sel.add(id);TD.app.render?.();TD.app.renderProps?.();};
const theme=t=>window.TDTheme&&TDTheme.set(t);
`;
export const Q = P;
