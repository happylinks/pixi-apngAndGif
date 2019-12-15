# Pixi-apngAndGif

Let Pixi.js support apng, gif images. And allow control of its operation.

Forked from: https://github.com/sbfkcel/pixi-apngAndGif

Fork includes the Loader code in the class so you don't have to do that yourself.

## DEMO

- Global [**Pixi-apngAndGif.js Use the demo**](http://jsbin.com/nodeto/edit?html,js,output)
- 中国大陆 [**Pixi-apngAndGif.js Use the demo**](https://jsrun.net/yXhKp)

# USE

```bash
npm install pixi-apngandgif
```

```javascript
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
```

### Browser

```html
<script src="https://cdn.staticfile.org/pixi.js/4.8.2/pixi.min.js"></script>
<script src="https://cdn.rawgit.com/sbfkcel/pixi-apngAndGif/master/dist/PixiApngAndGif.js"></script>
```

## API

### `.play(bout,callback)`

Play animation
`bout`Used to specify the number of plays
`callback`Callback executed after the specified number of plays has been completed

### `.pause()`

Pause animation

### `.stop()`

Stop animation

### `.jumpToFrame(frame)`

Jump to the specified frame

### `.getDuration()`

Get the total duration of an animation single play

### `.getFramesLength()`

Get the number of animation frames

### `.on(status,callback)`

Used to invoke the specified method in the specified phase of the animation
`status`Four states(`playing`、`played`、`pause`、`stop`)
`callback`Callback, there is a parameter. The status of the current animation is recorded.
