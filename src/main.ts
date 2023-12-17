import { App } from "./control/app";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;

const app = new App(canvas);
app.init().then(() => {
    app.run();
});
