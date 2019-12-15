import * as PIXI from "pixi.js";
import PixiApngAndGif from "../src/index.js";

const app = new PIXI.Application();

const imgs = {
  gif: "http://isparta.github.io/compare/image/dongtai/gif/1.gif",
  apng: "http://isparta.github.io/compare/image/dongtai/apng/1.png"
};

let gif = new PixiApngAndGif(imgs.gif);
window.gif = gif;
gif.sprite.x = 0;
gif.sprite.y = 0;
app.stage.addChild(gif.sprite);

let apng = new PixiApngAndGif(imgs.apng);
window.apng = apng;
apng.sprite.x = 200;
apng.sprite.y = 0;
app.stage.addChild(apng.sprite);

document.body.appendChild(app.view);
