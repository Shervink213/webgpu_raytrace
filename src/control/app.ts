import { Render } from "../view/render";
import { Scene, ComputeScene } from "../model/scene";

export class App {
    canvas: HTMLCanvasElement;
    render: Render;
    scene: Scene | ComputeScene;

    keyLabel: HTMLElement;
    mouseXLabel: HTMLElement;
    mouseYLabel: HTMLElement;

    forwardsAmount: number = 0;
    rightAmount: number = 0;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.render = new Render(canvas);
        // this.scene = new Scene();
        this.scene = new ComputeScene();

        this.keyLabel = document.getElementById("key-label")!;
        document.addEventListener("keydown", this.handleKeyDown);
        document.addEventListener("keyup", this.handleKeyUp);
        this.mouseXLabel = document.getElementById("mouse-x-label")!;
        this.mouseYLabel = document.getElementById("mouse-y-label")!;
        document.addEventListener("mousemove", this.handleMouseMove);

        this.canvas.onclick = () => {
            this.canvas.requestPointerLock();
        };
        this.canvas.onmousemove = (event) => {
            this.handleMouseMove(event);
        };
    }

    async init() {
        await this.render.init();
    }

    run = () => {
        let running = true;

        // this.scene.update();
        // this.scene.move_player(this.forwardsAmount, this.rightAmount);

        // this.render.render(this.scene.get_renderables());
        this.render.computeRender();

        if (running) {
            requestAnimationFrame(this.run);
        }
    };

    handleKeyDown = (event: KeyboardEvent) => {
        this.keyLabel.innerText = event.key;

        switch (event.key) {
            case "w":
                this.forwardsAmount = 0.2;
                break;
            case "s":
                this.forwardsAmount = -0.2;
                break;
            case "a":
                this.rightAmount = -0.2;
                break;
            case "d":
                this.rightAmount = 0.2;
                break;
            default:
                break;
        }
    };

    handleKeyUp = (event: KeyboardEvent) => {
        switch (event.key) {
            case "w":
            case "s":
                this.forwardsAmount = 0;
                break;
            case "a":
            case "d":
                this.rightAmount = 0;
                break;
            default:
                break;
        }
    };

    handleMouseMove = (event: MouseEvent) => {
        this.mouseXLabel.innerText = event.clientX.toString();
        this.mouseYLabel.innerText = event.clientY.toString();

        // if (document.pointerLockElement === this.canvas)
        //     this.scene.spin_player(event.movementX / 5, event.movementY / 5);
    };
}
