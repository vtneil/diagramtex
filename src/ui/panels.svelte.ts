import { runtime } from '../runtime';
import { panelView } from './mount-panel.svelte';
import BlochPanel from './BlochPanel.svelte';
import SourcePanel from './SourcePanel.svelte';
import type { SourcePanelModel } from './contracts';

runtime.panelViews = { bloch: panelView(BlochPanel, shape => runtime.panels.bloch.model(shape)) };
for (const type of ['qc', 'forest', 'zx', 'cd', 'xy', 'feynman', 'timing', 'kmap', 'bytefield', 'automata', 'uml', 'umlsd', 'chemfig', 'table']) {
  runtime.panelViews[type] = panelView(SourcePanel, shape => runtime.panels[type].model(shape) as SourcePanelModel);
}

import FormPanel from './FormPanel.svelte';
import type { FormPanelModel } from './forms';
for (const type of ['solid', 'prim3d', 'revolve', 'geo2d', 'geo3d', 'plot', 'pie']) runtime.panelViews[type] = panelView(FormPanel, shape => runtime.panels[type].model(shape) as FormPanelModel);

import CircuitPanel, { type Model as CircuitModel } from './CircuitPanel.svelte';
import PointPanel from './PointPanel.svelte';
import ImagePanel from './ImagePanel.svelte';
runtime.panelViews.cz = panelView(CircuitPanel, shape => runtime.panels.cz.model(shape) as CircuitModel);
runtime.panelViews.coord = panelView(PointPanel, shape => runtime.panels.coord.model(shape) as { name: string });
runtime.panelViews.image = panelView(ImagePanel, shape => runtime.panels.image.model(shape) as { file: string });

import PhysicsPanel, { type Model as PhysicsModel } from './PhysicsPanel.svelte';
import RawPanel, { type Model as RawModel } from './RawPanel.svelte';
runtime.panelViews.physics = panelView(PhysicsPanel, shape => runtime.panels.physics.model(shape) as PhysicsModel);
runtime.panelViews.tikz = panelView(RawPanel, shape => runtime.panels.tikz.model(shape) as RawModel);
