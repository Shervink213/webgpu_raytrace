import { Render } from "../view/render";
import { ComputeScene } from "../model/scene";

export class App {
    canvas: HTMLCanvasElement;
    render: Render;
    scene: ComputeScene;
    running: boolean = false;

    constructor(canvas: HTMLCanvasElement) {
        const sphereCount = document.getElementById(
            "count"
        ) as HTMLInputElement;
        const bounceCount = document.getElementById(
            "bounces"
        ) as HTMLInputElement;
        const canvasWidth = document.getElementById(
            "canvas_width"
        ) as HTMLInputElement;
        const canvasHeight = document.getElementById(
            "canvas_height"
        ) as HTMLInputElement;

        this.canvas = canvas;
        this.canvas.width = this.getValue(canvasWidth, 512);
        this.canvas.height = this.getValue(canvasHeight, 512);
        this.scene = new ComputeScene(
            this.getValue(sphereCount, 12),
            this.getValue(bounceCount, 4)
        );
        this.render = new Render(canvas, this.scene);

        sphereCount.addEventListener("change", async () => {
            const newSphereCount = this.getValue(sphereCount, 12);
            if (
                sphereCount.valueAsNumber < 1 ||
                isNaN(sphereCount.valueAsNumber)
            ) {
                // check if already has an error element
                if (document.getElementById("sphere_error")) {
                    return;
                }

                // Create an error element and put it under the input
                const error = document.createElement("div");
                error.id = "sphere_error";
                error.className = "text-lg text-red-500";
                error.textContent =
                    "Please enter a valid number for sphere count";
                sphereCount.parentElement!.appendChild(error);
                return;
            } else {
                // Remove the error element if it exists
                const error = document.getElementById("sphere_error");
                if (error) {
                    error.remove();
                }
            }

            // Update the number of spheres in the scene
            this.scene = new ComputeScene(
                newSphereCount,
                this.getValue(bounceCount, 4)
            );
            this.render = new Render(canvas, this.scene);

            // Reinitialize the render with the new scene
            this.running = false;
            await this.render.init().then(() => (this.running = true));
        });

        bounceCount.addEventListener("change", async () => {
            const newBounceCount = this.getValue(bounceCount, 4);

            if (
                bounceCount.valueAsNumber < 0 ||
                isNaN(bounceCount.valueAsNumber)
            ) {
                // check if already has an error element
                if (document.getElementById("bounce_error")) {
                    return;
                }

                // Create an error element and put it under the input
                const error = document.createElement("div");
                error.id = "bounce_error";
                error.className = "text-lg text-red-500";
                error.textContent = "Please enter a valid number for bounce";
                sphereCount.parentElement!.appendChild(error);
                return;
            } else {
                // Remove the error element if it exists
                const error = document.getElementById("bounce_error");
                if (error) {
                    error.remove();
                }
            }
            // Update the number of spheres in the scene
            this.scene = new ComputeScene(
                this.getValue(sphereCount, 32),
                newBounceCount
            );
            this.render = new Render(canvas, this.scene);

            // Reinitialize the render with the new scene
            this.running = false;
            await this.render.init().then(() => (this.running = true));
        });

        canvasWidth.addEventListener("change", async () => {
            if (
                canvasWidth.valueAsNumber < 0 ||
                isNaN(canvasWidth.valueAsNumber)
            ) {
                // check if already has an error element
                if (document.getElementById("width_error")) {
                    return;
                }

                // Create an error element and put it under the input
                const error = document.createElement("div");
                error.id = "width_error";
                error.className = "text-lg text-red-500";
                error.textContent = "Please enter a valid number for width";
                sphereCount.parentElement!.appendChild(error);
                return;
            } else {
                // Remove the error element if it exists
                const error = document.getElementById("width_error");
                if (error) {
                    error.remove();
                }
            }
            this.canvas.width = this.getValue(canvasWidth, 512);

            this.render = new Render(this.canvas, this.scene);

            // Reinitialize the render with the new scene
            this.running = false;
            await this.render.init().then(() => (this.running = true));
        });

        canvasHeight.addEventListener("change", async () => {
            if (
                canvasHeight.valueAsNumber < 0 ||
                isNaN(canvasHeight.valueAsNumber)
            ) {
                // check if already has an error element
                if (document.getElementById("height_error")) {
                    return;
                }

                // Create an error element and put it under the input
                const error = document.createElement("div");
                error.id = "height_error";
                error.className = "text-lg text-red-500";
                error.textContent = "Please enter a valid number for height";
                sphereCount.parentElement!.appendChild(error);
                return;
            } else {
                // Remove the error element if it exists
                const error = document.getElementById("height_error");
                if (error) {
                    error.remove();
                }
            }
            this.canvas.height = this.getValue(canvasHeight, 512);

            this.render = new Render(this.canvas, this.scene);

            // Reinitialize the render with the new scene
            this.running = false;
            await this.render.init().then(() => (this.running = true));
        });
    }

    checkIfNumberIsValid = (value: number) => {
        return !isNaN(value) && value > -1 && value < 1000000;
    };

    getValue = (element: HTMLInputElement, defaultValue: number) => {
        const value = element.valueAsNumber;
        return this.checkIfNumberIsValid(value) ? value : defaultValue;
    };

    async init() {
        await this.render.init().then(() => (this.running = true));
    }

    run = async () => {
        const render_time = document.getElementById("render_time")!;
        const fps = document.getElementById("fps")!;

        if (this.running) {
            this.render.computeRender(render_time, fps);
        }
        requestAnimationFrame(this.run);
    };
}
