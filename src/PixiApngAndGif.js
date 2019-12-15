import * as PIXI from "pixi.js";
import $getExeName from "./lib/_getExeName";
import omggif from "./lib/_omggif";
import upngjs from "./lib/_upng";

class Image {
  constructor(src) {
    this.src = src;

    this.init();
  }
  init() {
    this.temp = {
      events: {}
    };

    this.__attr = {
      autoPlay: true,
      loop: 0
    };

    this.__method = {
      play: this.play
    };

    this.__state = {
      status: "init",
      frame: 0,
      loops: 0,
      time: 0
    };

    this.ticker = new PIXI.Ticker();
    this.ticker.stop();

    this.loader = new PIXI.Loader();
    const loadOption = {
      loadType: PIXI.LoaderResource.LOAD_TYPE.XHR,
      xhrType: PIXI.LoaderResource.XHR_RESPONSE_TYPE.BUFFER,
      crossOrigin: ""
    };

    this.loader.add(this.src, loadOption);
    this.loader.load((loader, resources) => {
      const resource = resources[this.src];
      this.loaded(resource);
    });

    this.sprite = this.createInitialSprite(this.src);
  }

  play(loop, callback) {
    if (!this.textures.length) {
      throw new Error("No textures available");
    }

    if (this.textures.length === 1) {
      return;
    }

    let state = this.__state;
    let attr = this.__attr;
    let time = 0;

    if (state.status === "stop") {
      state.loops = 0;
    }

    loop = typeof loop === "number" ? loop : attr.loop;
    this.temp.loop = loop;
    attr.loop = loop;

    if (!this.temp.tickerIsAdd) {
      this.ticker.add(deltaTime => {
        let elapsed = PIXI.Ticker.shared.elapsedMS;
        time += elapsed;

        if (time > this.framesDelay[state.frame]) {
          state.frame++;

          state.status = "playing";

          if (state.frame > this.textures.length - 1) {
            state.frame = 0;
            state.loops++;

            if (this.temp.loop > 0 && status.loops >= this.temp.loop) {
              if (typeof callback === "function") {
                callback(state);
              }
              state.status = "played";
              this.runEvent("played", state);
              this.stop();
            }
          }

          this.sprite.texture = this.textures[state.frame];
          time = 0;

          this.runEvent("playing", state);
        }
      });
      this.temp.tickerIsAdd = true;
    }

    this.ticker.start();
  }

  pause() {
    let state = this.__state;
    this.ticker.stop();
    state.status = "pause";
    this.runEvent("pause", state);
  }

  stop() {
    let state = this.__state;
    this.ticker.stop();
    state.status = "stop";
    this.runEvent("stop", state);
  }

  jumpToFrame(frameIndex) {
    let textures = this.textures;

    if (!textures.length) {
      throw new Error("No textues available");
    }

    let state = this.__state;

    frameIndex =
      frameIndex < 0
        ? 0
        : frameIndex > textures.length - 1
        ? textures.length - 1
        : frameIndex;

    if (typeof frameIndex === "number") {
      this.sprite.texture = textures[frameIndex];
      state.frame = frameIndex;
    }
  }

  getDuration() {
    let framesDelay = this.framesDelay;

    if (!framesDelay.length) {
      throw new Error("Duration not found");
    }

    let time = 0;

    for (let i = 0, len = framesDelay.length; i < len; i++) {
      time += framesDelay[i];
    }
    return time;
  }

  getFramesLength() {
    if (!this.textures.length) {
      throw new Error("No textures available");
    }
    return this.textures.length;
  }

  on(type, fun) {
    switch (type) {
      case "playing":
      case "played":
      case "pause":
      case "stop":
        this.temp.events[type] = fun;
        break;
      default:
        throw new Error("Invalid event");
        break;
    }
  }

  runEvent(type, state) {
    let temp = this.temp;
    if (typeof temp.events[type] === "function") {
      temp.events[type](state);
    }
  }

  /**
   * Create sprite from image source.
   * @param  {array:string}} imgSrc Path to image.
   * @return {object} sprite
   */
  updateSprite(src, resource) {
    let Sprite = PIXI.Sprite,
      imgSrc = src,
      exeName = $getExeName(imgSrc.toLocaleLowerCase());

    exeName = exeName === "gif" || exeName === "png" ? exeName : "other";

    let funs = {
      gif: () => {
        let gifDecodeData = this.gifResourceToTextures(resource);
        this.textures = gifDecodeData.textures;
        this.framesDelay = gifDecodeData.delayTimes;
        this.play();

        // Set the texture to the first frame.
        this.sprite.texture = this.textures[0];
      },
      png: () => {
        let pngDecodeData = this.apngResourceToTextures(resource);
        this.textures = pngDecodeData.textures;
        this.framesDelay = pngDecodeData.delayTimes;
        this.play();

        // Set the texture to the first frame.
        this.sprite.texture = this.textures[0];
      },
      other: () => {}
    };
    return funs[exeName]();
  }

  createInitialSprite() {
    return new PIXI.Sprite();
  }

  /**
   * Convert apng to texture
   * @param  {object} resource
   * @return {object} Returns an object with the duration of each frame of the apng and the decoded image
   */
  apngResourceToTextures(resource) {
    let obj = {
        delayTimes: [],
        textures: []
      },
      buf = new Uint8Array(resource.data),
      upng = upngjs.decode(buf),
      rgba = upngjs.toRGBA8(upng),
      pngWidth = upng.width,
      pngHeight = upng.height,
      pngFramesLen = upng.frames.length,
      spriteSheet,
      canvas,
      ctx,
      imageData;

    // Save the time of each frame
    upng.frames.forEach((item, index) => {
      obj.delayTimes.push(item.delay);
    });

    for (let i = 0, len = rgba.length; i < len; i++) {
      let item = rgba[i],
        data = new Uint8ClampedArray(item);

      canvas = document.createElement("canvas");
      canvas.width = pngWidth;
      canvas.height = pngHeight;
      ctx = canvas.getContext("2d");
      spriteSheet = new PIXI.BaseTexture.from(canvas);

      imageData = ctx.createImageData(pngWidth, pngHeight);
      imageData.data.set(data);
      ctx.putImageData(imageData, 0, 0);

      obj.textures.push(
        new PIXI.Texture(
          spriteSheet,
          new PIXI.Rectangle(0, 0, pngWidth, pngHeight)
        )
      );
    }

    return obj;
  }

  /**
   * Convert gif to texture
   * @param  {object} resource
   * @return {object} Returns an object with the duration of each frame of the gif and the decoded image
   */
  gifResourceToTextures(resource) {
    let obj = {
        delayTimes: [],
        textures: []
      },
      buf = new Uint8Array(resource.data),
      gif = new omggif(buf),
      gifWidth = gif.width,
      gifHeight = gif.height,
      gifFramesLen = gif.numFrames(),
      gifFrameInfo,
      spriteSheet,
      canvas,
      ctx,
      imageData;

    for (let i = 0; i < gifFramesLen; i++) {
      // Get the info of each frame and save the delay info.
      gifFrameInfo = gif.frameInfo(i);
      obj.delayTimes.push(gifFrameInfo.delay * 10);

      canvas = document.createElement("canvas");
      canvas.width = gifWidth;
      canvas.height = gifHeight;
      ctx = canvas.getContext("2d");

      imageData = ctx.createImageData(gifWidth, gifHeight);

      gif.decodeAndBlitFrameRGBA(i, imageData.data);

      ctx.putImageData(imageData, 0, 0);

      spriteSheet = new PIXI.BaseTexture.from(canvas);
      obj.textures.push(
        new PIXI.Texture(
          spriteSheet,
          new PIXI.Rectangle(0, 0, gifWidth, gifHeight)
        )
      );
    }

    return obj;
  }

  loaded(resource) {
    this.updateSprite(this.src, resource);
  }
}

export default Image;
