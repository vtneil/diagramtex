import { runtime as TD } from '../runtime';
const NODE_TYPES = new Set(['text', 'rect', 'ellipse']);
export const NODE_ANCHORS = ['center','north','north east','east','south east','south','south west','west','north west'];
const UV: Record<string, [number, number]> = { center:[.5,.5], north:[.5,0], 'north east':[1,0], east:[1,.5], 'south east':[1,1], south:[.5,1], 'south west':[0,1], west:[0,.5], 'north west':[0,0] };
function anchorUV(name: string, type?: string): [number,number] {
  const uv = Object.prototype.hasOwnProperty.call(UV,name) ? UV[name] : UV.center;
  return type === 'ellipse' && uv[0] !== .5 && uv[1] !== .5 ? [.5+(uv[0]-.5)/Math.SQRT2,.5+(uv[1]-.5)/Math.SQRT2] : uv;
}
const placements: Record<string, [number, number]> = { above:[0,-1], 'above right':[1,-1], right:[1,0], 'below right':[1,1], below:[0,1], 'below left':[-1,1], left:[-1,0], 'above left':[-1,-1] };
const plain = (s: any) => ({ ...s, nodeLabel:'', nodePin:'' });
const bodyBox = (s: any) => TD.bbox(s.nodeLabel || s.nodePin ? plain(s) : s);
const validName = (name: unknown): name is string => typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_-]*$/.test(name);
const linked = (s: any, X: any) => {
  if (!X.nodeTargets) X.nodeTargets = new Set((X.scene || []).flatMap((q: any) => [q.link1?.id, q.link2?.id].filter(Boolean)));
  return X.nodeTargets.has(s.id);
};
// a name as code wrote it (an import's): what TikZ takes in ( ) as a node's name: 234, in 1, chain-2 (not a coordinate,
// an anchor's dot or a polar colon, nor TeX's own characters)
const texName = (name: unknown): name is string => typeof name === 'string' && /^[A-Za-z0-9_](?:[^.,;:()[\]{}$\\%#=\n]*[^.,;:()[\]{}$\\%#=\s])?$/.test(name);
function nameOf(s: any) { return validName(s.nodeName) ? s.nodeName : texName(s.nodeName) && s.tex ? s.nodeName : texName(s.tex?.nm?.[0]) ? s.tex.nm[0] : 'tdnode' + Array.from(String(s.id), c=>c.codePointAt(0)!.toString(16)).join('x'); }
const pinDistance = (s: any) => Number.isFinite(Number(s.nodePinDistance ?? 24)) ? Math.max(0,Number(s.nodePinDistance ?? 24)) : 24;
function annotations(s: any) {
  if (!s.nodeLabel && !s.nodePin) return [];
  const b = bodyBox(s), st = { size: s.size || 'normalsize', font: s.font || 'default', bold: !!s.bold, italic: !!s.italic, align:'center' };
  return ['Label','Pin'].filter(kind=>s['node'+kind]).map(kind=>{
    const text = String(s['node'+kind]), place = s['node'+kind+'Position'] || (kind==='Pin'?'right':'above');
    const [dx,dy] = Object.prototype.hasOwnProperty.call(placements,place) ? placements[place] : placements.above, distance = kind === 'Pin' ? pinDistance(s) : 6;
    const textBox = TD.textBox(text, st), x = b.x+b.w/2 + dx*(b.w/2 + distance + textBox.w/2), y = b.y+b.h/2 + dy*(b.h/2 + distance + textBox.h/2);
    return { kind, text, st, x, y, w:textBox.w, h:textBox.h, ax:b.x+b.w/2+dx*b.w/2, ay:b.y+b.h/2+dy*b.h/2, dx,dy };
  });
}
TD.nodeFeatures = { types:NODE_TYPES, anchors:NODE_ANCHORS, placements:Object.keys(placements), bodyBox, nameOf, validName,
  anchorName(u: number,v: number,type?: string) { return NODE_ANCHORS.find(k => { const uv=anchorUV(k,type); return Math.abs(uv[0]-u)<1e-6 && Math.abs(uv[1]-v)<1e-6; }); },
  anchorUV,
};
// Preserve all legacy output unless native node features or attached node anchors are used.
for (const type of NODE_TYPES) {
  const T = TD.TYPES[type], original = { samples:T.samples, svg:T.svg, tikz:T.tikz };
  T.samples = function(s: any) {
    const points = original.samples.call(this,s);
    if (!s.nodeLabel && !s.nodePin) return points;
    return [...points, ...annotations(s).flatMap(a=>[{x:a.x-a.w/2,y:a.y-a.h/2},{x:a.x+a.w/2,y:a.y+a.h/2}])];
  };
  T.svg = function(s: any, ctx: any) {
    const extra = annotations(s).map(a =>
      (a.kind==='Pin' ? `<path d="M${a.ax},${a.ay}L${a.x-a.dx*a.w/2},${a.y-a.dy*a.h/2}" fill="none" stroke="${TD.util.esc(s.color || s.stroke || '#000000')}" stroke-width="${s.width || 1}"/>` : '') +
      TD.textSvg(a.text,a.st,s.color || '#000000',a.x,a.y,ctx)).join('');
    const body = type !== 'text' && s.nodeText ? TD.textSvg(String(s.nodeText),s,s.color || '#000000',bodyBox(s).x+bodyBox(s).w/2,bodyBox(s).y+bodyBox(s).h/2,ctx,s.opacity < 1 ? ` opacity="${s.opacity}"` : '') : '';
    return original.svg.call(this,s,ctx) + body + (s.opacity < 1 && extra ? `<g opacity="${s.opacity}">${extra}</g>` : extra);
  };
  T.tikz = function(s: any, X: any) {
    if (!(s.nodeName || s.nodeText || s.nodeLabel || s.nodePin || linked(s,X))) return original.tikz.call(this,s,X);
    const b = bodyBox(s), name = nameOf(s), extra: string[] = ['outer sep=0pt'];
    for (const kind of ['Label','Pin']) if (s['node'+kind]) {
      const where = Object.prototype.hasOwnProperty.call(placements,s['node'+kind+'Position']) ? s['node'+kind+'Position'] : kind==='Pin'?'right':'above';
      const distance = kind==='Pin' ? `pin distance=${X.len(pinDistance(s))}cm` : `label distance=${X.len(6)}cm`;
      extra.push(`${kind.toLowerCase()}={[${distance}]${where}:{${TD.tikzText(String(s['node'+kind]))}}}`);
    }
    if (type==='text') {
      const code = original.tikz.call(this,s,X), start = code.lastIndexOf('\\node');
      if (start<0) return code;
      const at = code.indexOf(' at ',start);
      if(at<0) return code;
      const prefix = code.slice(start+5,at).trim(), options = prefix.startsWith('[') ? prefix.slice(1,-1) : '';
      return code.slice(0,start) + `\\node[${[options,...extra].filter(Boolean).join(', ')}] (${name})` + code.slice(at);
    }
    const options = TD.styleOpts(s,X,{fill:true});
    if(s.stroke && !options.some((o:string)=>/^draw=/.test(o))) options.unshift('draw');
    if(!s.stroke) options.unshift('draw=none');
    if(type==='ellipse') X.libs.add('shapes.geometric');
    options.push(...TD.textOpts(s,X));
    options.push(type==='rect'?'rectangle':'ellipse','inner sep=0pt',`minimum width=${X.len(type==='rect'?s.w:2*s.rx)}cm`,`minimum height=${X.len(type==='rect'?s.h:2*s.ry)}cm`,...extra);
    if(s.angle) options.push(`rotate=${s.angle}`);
    if(s.radius && type==='rect') options.push(`rounded corners=${X.pt(s.radius)}`);
    return `\\node[${options.join(', ')}] (${name}) at ${X.c(b.x+b.w/2,b.y+b.h/2)} {${s.nodeText ? TD.tikzText(String(s.nodeText)) : ''}};`;
  };
}
// Endpoints use the actual named node anchors. Forward references are declared
// before edges at export time; screen attachments continue to use the same frame.
for (const type of ['line','curve','spring']) {
  const T=TD.TYPES[type], original=T.tikz;
  T.tikz=function(s:any,X:any) {
    const refs=new Map(X.refs || []), base=X.c;
    if (!X.nodeById) X.nodeById = new Map((X.scene || []).map((q:any)=>[q.id,q]));
    for(const [key,x,y] of [['link1','x1','y1'],['link2','x2','y2']]) {
      const link=s[key], target=link && X.nodeById.get(link.id);
      const anchor=link && TD.nodeFeatures.anchorName(link.u,link.v,target?.type);
      if(target && NODE_TYPES.has(target.type) && link.border) refs.set(base(s[x],s[y]),`(${nameOf(target)})`);
      else if(target && NODE_TYPES.has(target.type) && anchor) refs.set(base(s[x],s[y]),`(${nameOf(target)}.${anchor})`);
    }
    if(!refs.size) return original.call(this,s,X);
    return original.call(this,s,{...X,c:(x:number,y:number)=>refs.get(base(x,y)) || base(x,y)});
  };
}
