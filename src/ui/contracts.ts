export interface BlochPanelModel {
  src: string;
  radius: number;
  tilt: number;
  rotation: number;
  ball: string;
  colours: { key: string; name: string; value: string; label: string; swatch: string }[];
  states: { name: string; label: string; theta: string; phi: string }[];
  warnings: string[];
}
export interface PanelHandle { update(shape: { src: string }): void; destroy(): void }
export interface PanelView { mount(target: HTMLElement, shape: { src: string }): PanelHandle }

export interface SourcePanelModel {
  kind: 'source';
  title: string;
  summary: string;
  src: string;
  rows: number;
  warnings: string[];
  helpBefore: string;
  package: string;
  helpAfter: string;
  actions: { class: string; action: string; label: string }[];
}
