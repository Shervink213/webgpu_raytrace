import { Render } from "../view/render";
import { ComputeScene } from "../model/scene";

export class App {
  canvas: HTMLCanvasElement;
  render: Render;
  scene: ComputeScene;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.render = new Render(canvas);

    this.scene = new ComputeScene();
  }

  async init() {
    await this.render.init();
  }

  run = () => {
    this.render.computeRender();
  };
}
