import type { Message } from '../i18n';
export interface BlochPanelModel {
  src: string;
  radius: number;
  tilt: number;
  rotation: number;
  ball: string;
  colours: { key: string; name: Message; value: string; label: string; swatch: string }[];
  states: { name: string; label: string; theta: string; phi: string }[];
  warnings: string[];
}
export interface PanelHandle { update(shape: { src: string }): void; destroy(): void }
export interface PanelView { mount(target: HTMLElement, shape: { src: string }): PanelHandle }

export interface SourcePanelModel {
  kind: 'source';
  title: string | Message;
  summary: string | Message;
  src: string;
  rows: number;
  warnings: (string | Message)[];
  helpBefore: string | Message;
  package: string;
  helpAfter: string | Message;
  actions: { class: string; action: string; label: string | Message }[];
}
