'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var PIXI = require('pixi.js');
var pako = _interopDefault(require('pako'));

var $getExeName = (filePath)=>{
    let aList = filePath.split('.');
    return aList[aList.length - 1];
};

// (c) Dean McNamee <dean@gmail.com>, 2013.

function GifReader(buf) {
  var p = 0;

  // - Header (GIF87a or GIF89a).
  if (buf[p++] !== 0x47 || buf[p++] !== 0x49 || buf[p++] !== 0x46 ||
    buf[p++] !== 0x38 || (buf[p++] + 1 & 0xfd) !== 0x38 || buf[p++] !== 0x61) {
    throw new Error("Invalid GIF 87a/89a header.");
  }

  // - Logical Screen Descriptor.
  var width = buf[p++] | buf[p++] << 8;
  var height = buf[p++] | buf[p++] << 8;
  var pf0 = buf[p++]; // <Packed Fields>.
  var global_palette_flag = pf0 >> 7;
  var num_global_colors_pow2 = pf0 & 0x7;
  var num_global_colors = 1 << (num_global_colors_pow2 + 1);
  var background = buf[p++];
  buf[p++]; // Pixel aspect ratio (unused?).

  var global_palette_offset = null;
  var global_palette_size = null;

  if (global_palette_flag) {
    global_palette_offset = p;
    global_palette_size = num_global_colors;
    p += num_global_colors * 3; // Seek past palette.
  }

  var no_eof = true;

  var frames = [];

  var delay = 0;
  var transparent_index = null;
  var disposal = 0; // 0 - No disposal specified.
  var loop_count = null;

  this.width = width;
  this.height = height;

  while (no_eof && p < buf.length) {
    switch (buf[p++]) {
      case 0x21: // Graphics Control Extension Block
        switch (buf[p++]) {
          case 0xff: // Application specific block
            // Try if it's a Netscape block (with animation loop counter).
            if (buf[p] !== 0x0b || // 21 FF already read, check block size.
              // NETSCAPE2.0
              buf[p + 1] == 0x4e && buf[p + 2] == 0x45 && buf[p + 3] == 0x54 &&
              buf[p + 4] == 0x53 && buf[p + 5] == 0x43 && buf[p + 6] == 0x41 &&
              buf[p + 7] == 0x50 && buf[p + 8] == 0x45 && buf[p + 9] == 0x32 &&
              buf[p + 10] == 0x2e && buf[p + 11] == 0x30 &&
              // Sub-block
              buf[p + 12] == 0x03 && buf[p + 13] == 0x01 && buf[p + 16] == 0) {
              p += 14;
              loop_count = buf[p++] | buf[p++] << 8;
              p++; // Skip terminator.
            } else { // We don't know what it is, just try to get past it.
              p += 12;
              while (true) { // Seek through subblocks.
                var block_size = buf[p++];
                // Bad block size (ex: undefined from an out of bounds read).
                if (!(block_size >= 0)) throw Error("Invalid block size");
                if (block_size === 0) break; // 0 size is terminator
                p += block_size;
              }
            }
            break;

          case 0xf9: // Graphics Control Extension
            if (buf[p++] !== 0x4 || buf[p + 4] !== 0)
              throw new Error("Invalid graphics extension block.");
            var pf1 = buf[p++];
            delay = buf[p++] | buf[p++] << 8;
            transparent_index = buf[p++];
            if ((pf1 & 1) === 0) transparent_index = null;
            disposal = pf1 >> 2 & 0x7;
            p++; // Skip terminator.
            break;

          case 0xfe: // Comment Extension.
            while (true) { // Seek through subblocks.
              var block_size = buf[p++];
              // Bad block size (ex: undefined from an out of bounds read).
              if (!(block_size >= 0)) throw Error("Invalid block size");
              if (block_size === 0) break; // 0 size is terminator
              // console.log(buf.slice(p, p+block_size).toString('ascii'));
              p += block_size;
            }
            break;

          default:
            throw new Error(
              "Unknown graphic control label: 0x" + buf[p - 1].toString(16));
        }
        break;

      case 0x2c: // Image Descriptor.
        var x = buf[p++] | buf[p++] << 8;
        var y = buf[p++] | buf[p++] << 8;
        var w = buf[p++] | buf[p++] << 8;
        var h = buf[p++] | buf[p++] << 8;
        var pf2 = buf[p++];
        var local_palette_flag = pf2 >> 7;
        var interlace_flag = pf2 >> 6 & 1;
        var num_local_colors_pow2 = pf2 & 0x7;
        var num_local_colors = 1 << (num_local_colors_pow2 + 1);
        var palette_offset = global_palette_offset;
        var palette_size = global_palette_size;
        var has_local_palette = false;
        if (local_palette_flag) {
          var has_local_palette = true;
          palette_offset = p; // Override with local palette.
          palette_size = num_local_colors;
          p += num_local_colors * 3; // Seek past palette.
        }

        var data_offset = p;

        p++; // codesize
        while (true) {
          var block_size = buf[p++];
          // Bad block size (ex: undefined from an out of bounds read).
          if (!(block_size >= 0)) throw Error("Invalid block size");
          if (block_size === 0) break; // 0 size is terminator
          p += block_size;
        }

        frames.push({
          x: x,
          y: y,
          width: w,
          height: h,
          has_local_palette: has_local_palette,
          palette_offset: palette_offset,
          palette_size: palette_size,
          data_offset: data_offset,
          data_length: p - data_offset,
          transparent_index: transparent_index,
          interlaced: !!interlace_flag,
          delay: delay,
          disposal: disposal
        });
        break;

      case 0x3b: // Trailer Marker (end of file).
        no_eof = false;
        break;

      default:
        throw new Error("Unknown gif block: 0x" + buf[p - 1].toString(16));
    }
  }

  this.numFrames = function () {
    return frames.length;
  };

  this.loopCount = function () {
    return loop_count;
  };

  this.frameInfo = function (frame_num) {
    if (frame_num < 0 || frame_num >= frames.length)
      throw new Error("Frame index out of range.");
    return frames[frame_num];
  };

  this.decodeAndBlitFrameBGRA = function (frame_num, pixels) {
    var frame = this.frameInfo(frame_num);
    var num_pixels = frame.width * frame.height;
    var index_stream = new Uint8Array(num_pixels); // At most 8-bit indices.
    GifReaderLZWOutputIndexStream(
      buf, frame.data_offset, index_stream, num_pixels);
    var palette_offset = frame.palette_offset;

    // NOTE(deanm): It seems to be much faster to compare index to 256 than
    // to === null.  Not sure why, but CompareStub_EQ_STRICT shows up high in
    // the profile, not sure if it's related to using a Uint8Array.
    var trans = frame.transparent_index;
    if (trans === null) trans = 256;

    // We are possibly just blitting to a portion of the entire frame.
    // That is a subrect within the framerect, so the additional pixels
    // must be skipped over after we finished a scanline.
    var framewidth = frame.width;
    var framestride = width - framewidth;
    var xleft = framewidth; // Number of subrect pixels left in scanline.

    // Output indicies of the top left and bottom right corners of the subrect.
    var opbeg = ((frame.y * width) + frame.x) * 4;
    var opend = ((frame.y + frame.height) * width + frame.x) * 4;
    var op = opbeg;

    var scanstride = framestride * 4;

    // Use scanstride to skip past the rows when interlacing.  This is skipping
    // 7 rows for the first two passes, then 3 then 1.
    if (frame.interlaced === true) {
      scanstride += width * 4 * 7; // Pass 1.
    }

    var interlaceskip = 8; // Tracking the row interval in the current pass.

    for (var i = 0, il = index_stream.length; i < il; ++i) {
      var index = index_stream[i];

      if (xleft === 0) { // Beginning of new scan line
        op += scanstride;
        xleft = framewidth;
        if (op >= opend) { // Catch the wrap to switch passes when interlacing.
          scanstride = framestride * 4 + width * 4 * (interlaceskip - 1);
          // interlaceskip / 2 * 4 is interlaceskip << 1.
          op = opbeg + (framewidth + framestride) * (interlaceskip << 1);
          interlaceskip >>= 1;
        }
      }

      if (index === trans) {
        op += 4;
      } else {
        var r = buf[palette_offset + index * 3];
        var g = buf[palette_offset + index * 3 + 1];
        var b = buf[palette_offset + index * 3 + 2];
        pixels[op++] = b;
        pixels[op++] = g;
        pixels[op++] = r;
        pixels[op++] = 255;
      }
      --xleft;
    }
  };

  // I will go to copy and paste hell one day...
  this.decodeAndBlitFrameRGBA = function (frame_num, pixels) {
    var frame = this.frameInfo(frame_num);
    var num_pixels = frame.width * frame.height;
    var index_stream = new Uint8Array(num_pixels); // At most 8-bit indices.
    GifReaderLZWOutputIndexStream(
      buf, frame.data_offset, index_stream, num_pixels);
    var palette_offset = frame.palette_offset;

    // NOTE(deanm): It seems to be much faster to compare index to 256 than
    // to === null.  Not sure why, but CompareStub_EQ_STRICT shows up high in
    // the profile, not sure if it's related to using a Uint8Array.
    var trans = frame.transparent_index;
    if (trans === null) trans = 256;

    // We are possibly just blitting to a portion of the entire frame.
    // That is a subrect within the framerect, so the additional pixels
    // must be skipped over after we finished a scanline.
    var framewidth = frame.width;
    var framestride = width - framewidth;
    var xleft = framewidth; // Number of subrect pixels left in scanline.

    // Output indicies of the top left and bottom right corners of the subrect.
    var opbeg = ((frame.y * width) + frame.x) * 4;
    var opend = ((frame.y + frame.height) * width + frame.x) * 4;
    var op = opbeg;

    var scanstride = framestride * 4;

    // Use scanstride to skip past the rows when interlacing.  This is skipping
    // 7 rows for the first two passes, then 3 then 1.
    if (frame.interlaced === true) {
      scanstride += width * 4 * 7; // Pass 1.
    }

    var interlaceskip = 8; // Tracking the row interval in the current pass.

    for (var i = 0, il = index_stream.length; i < il; ++i) {
      var index = index_stream[i];

      if (xleft === 0) { // Beginning of new scan line
        op += scanstride;
        xleft = framewidth;
        if (op >= opend) { // Catch the wrap to switch passes when interlacing.
          scanstride = framestride * 4 + width * 4 * (interlaceskip - 1);
          // interlaceskip / 2 * 4 is interlaceskip << 1.
          op = opbeg + (framewidth + framestride) * (interlaceskip << 1);
          interlaceskip >>= 1;
        }
      }

      if (index === trans) {
        op += 4;
      } else {
        var r = buf[palette_offset + index * 3];
        var g = buf[palette_offset + index * 3 + 1];
        var b = buf[palette_offset + index * 3 + 2];
        pixels[op++] = r;
        pixels[op++] = g;
        pixels[op++] = b;
        pixels[op++] = 255;
      }
      --xleft;
    }
  };
}

function GifReaderLZWOutputIndexStream(code_stream, p, output, output_length) {
  var min_code_size = code_stream[p++];

  var clear_code = 1 << min_code_size;
  var eoi_code = clear_code + 1;
  var next_code = eoi_code + 1;

  var cur_code_size = min_code_size + 1; // Number of bits per code.
  // NOTE: This shares the same name as the encoder, but has a different
  // meaning here.  Here this masks each code coming from the code stream.
  var code_mask = (1 << cur_code_size) - 1;
  var cur_shift = 0;
  var cur = 0;

  var op = 0; // Output pointer.

  var subblock_size = code_stream[p++];

  // TODO(deanm): Would using a TypedArray be any faster?  At least it would
  // solve the fast mode / backing store uncertainty.
  // var code_table = Array(4096);
  var code_table = new Int32Array(4096); // Can be signed, we only use 20 bits.

  var prev_code = null; // Track code-1.

  while (true) {
    // Read up to two bytes, making sure we always 12-bits for max sized code.
    while (cur_shift < 16) {
      if (subblock_size === 0) break; // No more data to be read.

      cur |= code_stream[p++] << cur_shift;
      cur_shift += 8;

      if (subblock_size === 1) { // Never let it get to 0 to hold logic above.
        subblock_size = code_stream[p++]; // Next subblock.
      } else {
        --subblock_size;
      }
    }

    // TODO(deanm): We should never really get here, we should have received
    // and EOI.
    if (cur_shift < cur_code_size)
      break;

    var code = cur & code_mask;
    cur >>= cur_code_size;
    cur_shift -= cur_code_size;

    // TODO(deanm): Maybe should check that the first code was a clear code,
    // at least this is what you're supposed to do.  But actually our encoder
    // now doesn't emit a clear code first anyway.
    if (code === clear_code) {
      // We don't actually have to clear the table.  This could be a good idea
      // for greater error checking, but we don't really do any anyway.  We
      // will just track it with next_code and overwrite old entries.

      next_code = eoi_code + 1;
      cur_code_size = min_code_size + 1;
      code_mask = (1 << cur_code_size) - 1;

      // Don't update prev_code ?
      prev_code = null;
      continue;
    } else if (code === eoi_code) {
      break;
    }

    // We have a similar situation as the decoder, where we want to store
    // variable length entries (code table entries), but we want to do in a
    // faster manner than an array of arrays.  The code below stores sort of a
    // linked list within the code table, and then "chases" through it to
    // construct the dictionary entries.  When a new entry is created, just the
    // last byte is stored, and the rest (prefix) of the entry is only
    // referenced by its table entry.  Then the code chases through the
    // prefixes until it reaches a single byte code.  We have to chase twice,
    // first to compute the length, and then to actually copy the data to the
    // output (backwards, since we know the length).  The alternative would be
    // storing something in an intermediate stack, but that doesn't make any
    // more sense.  I implemented an approach where it also stored the length
    // in the code table, although it's a bit tricky because you run out of
    // bits (12 + 12 + 8), but I didn't measure much improvements (the table
    // entries are generally not the long).  Even when I created benchmarks for
    // very long table entries the complexity did not seem worth it.
    // The code table stores the prefix entry in 12 bits and then the suffix
    // byte in 8 bits, so each entry is 20 bits.

    var chase_code = code < next_code ? code : prev_code;

    // Chase what we will output, either {CODE} or {CODE-1}.
    var chase_length = 0;
    var chase = chase_code;
    while (chase > clear_code) {
      chase = code_table[chase] >> 8;
      ++chase_length;
    }

    var k = chase;

    var op_end = op + chase_length + (chase_code !== code ? 1 : 0);
    if (op_end > output_length) {
      console.log("Warning, gif stream longer than expected.");
      return;
    }

    // Already have the first byte from the chase, might as well write it fast.
    output[op++] = k;

    op += chase_length;
    var b = op; // Track pointer, writing backwards.

    if (chase_code !== code) // The case of emitting {CODE-1} + k.
      output[op++] = k;

    chase = chase_code;
    while (chase_length--) {
      chase = code_table[chase];
      output[--b] = chase & 0xff; // Write backwards.
      chase >>= 8; // Pull down to the prefix code.
    }

    if (prev_code !== null && next_code < 4096) {
      code_table[next_code++] = prev_code << 8 | k;
      // TODO(deanm): Figure out this clearing vs code growth logic better.  I
      // have an feeling that it should just happen somewhere else, for now it
      // is awkward between when we grow past the max and then hit a clear code.
      // For now just check if we hit the max 12-bits (then a clear code should
      // follow, also of course encoded in 12-bits).
      if (next_code >= code_mask + 1 && cur_code_size < 12) {
        ++cur_code_size;
        code_mask = code_mask << 1 | 1;
      }
    }

    prev_code = code;
  }

  if (op !== output_length) {
    console.log("Warning, gif stream shorter than expected.");
  }

  return output;
}

var UPNG = {};

if (Uint8Array && !Uint8Array.prototype.slice) {
    Uint8Array.prototype.slice = function (...arg) {
        return new Uint8Array(this).subarray(...arg);
    };
}(function (UPNG, pako) {
    UPNG.toRGBA8 = function (out) {
        var w = out.width,
            h = out.height;
        if (out.tabs.acTL == null) return [UPNG.toRGBA8.decodeImage(out.data, w, h, out).buffer];

        var frms = [];
        if (out.frames[0].data == null) out.frames[0].data = out.data;

        var img, empty = new Uint8Array(w * h * 4);
        for (var i = 0; i < out.frames.length; i++) {
            var frm = out.frames[i];
            var fx = frm.rect.x,
                fy = frm.rect.y,
                fw = frm.rect.width,
                fh = frm.rect.height;
            var fdata = UPNG.toRGBA8.decodeImage(frm.data, fw, fh, out);

            if (i == 0) img = fdata;
            else if (frm.blend == 0) UPNG._copyTile(fdata, fw, fh, img, w, h, fx, fy, 0);
            else if (frm.blend == 1) UPNG._copyTile(fdata, fw, fh, img, w, h, fx, fy, 1);

            frms.push(img.buffer);
            img = img.slice(0);

            if (frm.dispose == 0) ; else if (frm.dispose == 1) UPNG._copyTile(empty, fw, fh, img, w, h, fx, fy, 0);
            else if (frm.dispose == 2) {
                var pi = i - 1;
                while (out.frames[pi].dispose == 2) pi--;
                img = new Uint8Array(frms[pi]).slice(0);
            }
        }
        return frms;
    };
    UPNG.toRGBA8.decodeImage = function (data, w, h, out) {
        var area = w * h,
            bpp = UPNG.decode._getBPP(out);
        var bpl = Math.ceil(w * bpp / 8); // bytes per line
        var bf = new Uint8Array(area * 4),
            bf32 = new Uint32Array(bf.buffer);
        var ctype = out.ctype,
            depth = out.depth;
        var rs = UPNG._bin.readUshort;

        //console.log(ctype, depth);
        if (ctype == 6) { // RGB + alpha
            var qarea = area << 2;
            if (depth == 8)
                for (var i = 0; i < qarea; i++) {
                    bf[i] = data[i];
                    /*if((i&3)==3 && data[i]!=0) bf[i]=255;*/
                }
            if (depth == 16)
                for (var i = 0; i < qarea; i++) {
                    bf[i] = data[i << 1];
                }
        } else if (ctype == 2) { // RGB
            var ts = out.tabs["tRNS"],
                tr = -1,
                tg = -1,
                tb = -1;
            if (ts) {
                tr = ts[0];
                tg = ts[1];
                tb = ts[2];
            }
            if (depth == 8)
                for (var i = 0; i < area; i++) {
                    var qi = i << 2,
                        ti = i * 3;
                    bf[qi] = data[ti];
                    bf[qi + 1] = data[ti + 1];
                    bf[qi + 2] = data[ti + 2];
                    bf[qi + 3] = 255;
                    if (tr != -1 && data[ti] == tr && data[ti + 1] == tg && data[ti + 2] == tb) bf[qi + 3] = 0;
                }
            if (depth == 16)
                for (var i = 0; i < area; i++) {
                    var qi = i << 2,
                        ti = i * 6;
                    bf[qi] = data[ti];
                    bf[qi + 1] = data[ti + 2];
                    bf[qi + 2] = data[ti + 4];
                    bf[qi + 3] = 255;
                    if (tr != -1 && rs(data, ti) == tr && rs(data, ti + 2) == tg && rs(data, ti + 4) == tb) bf[qi + 3] = 0;
                }
        } else if (ctype == 3) { // palette
            var p = out.tabs["PLTE"],
                ap = out.tabs["tRNS"],
                tl = ap ? ap.length : 0;
            //console.log(p, ap);
            if (depth == 1)
                for (var y = 0; y < h; y++) {
                    var s0 = y * bpl,
                        t0 = y * w;
                    for (var i = 0; i < w; i++) {
                        var qi = (t0 + i) << 2,
                            j = ((data[s0 + (i >> 3)] >> (7 - ((i & 7) << 0))) & 1),
                            cj = 3 * j;
                        bf[qi] = p[cj];
                        bf[qi + 1] = p[cj + 1];
                        bf[qi + 2] = p[cj + 2];
                        bf[qi + 3] = (j < tl) ? ap[j] : 255;
                    }
                }
            if (depth == 2)
                for (var y = 0; y < h; y++) {
                    var s0 = y * bpl,
                        t0 = y * w;
                    for (var i = 0; i < w; i++) {
                        var qi = (t0 + i) << 2,
                            j = ((data[s0 + (i >> 2)] >> (6 - ((i & 3) << 1))) & 3),
                            cj = 3 * j;
                        bf[qi] = p[cj];
                        bf[qi + 1] = p[cj + 1];
                        bf[qi + 2] = p[cj + 2];
                        bf[qi + 3] = (j < tl) ? ap[j] : 255;
                    }
                }
            if (depth == 4)
                for (var y = 0; y < h; y++) {
                    var s0 = y * bpl,
                        t0 = y * w;
                    for (var i = 0; i < w; i++) {
                        var qi = (t0 + i) << 2,
                            j = ((data[s0 + (i >> 1)] >> (4 - ((i & 1) << 2))) & 15),
                            cj = 3 * j;
                        bf[qi] = p[cj];
                        bf[qi + 1] = p[cj + 1];
                        bf[qi + 2] = p[cj + 2];
                        bf[qi + 3] = (j < tl) ? ap[j] : 255;
                    }
                }
            if (depth == 8)
                for (var i = 0; i < area; i++) {
                    var qi = i << 2,
                        j = data[i],
                        cj = 3 * j;
                    bf[qi] = p[cj];
                    bf[qi + 1] = p[cj + 1];
                    bf[qi + 2] = p[cj + 2];
                    bf[qi + 3] = (j < tl) ? ap[j] : 255;
                }
        } else if (ctype == 4) { // gray + alpha
            if (depth == 8)
                for (var i = 0; i < area; i++) {
                    var qi = i << 2,
                        di = i << 1,
                        gr = data[di];
                    bf[qi] = gr;
                    bf[qi + 1] = gr;
                    bf[qi + 2] = gr;
                    bf[qi + 3] = data[di + 1];
                }
            if (depth == 16)
                for (var i = 0; i < area; i++) {
                    var qi = i << 2,
                        di = i << 2,
                        gr = data[di];
                    bf[qi] = gr;
                    bf[qi + 1] = gr;
                    bf[qi + 2] = gr;
                    bf[qi + 3] = data[di + 2];
                }
        } else if (ctype == 0) { // gray
            var tr = out.tabs["tRNS"] ? out.tabs["tRNS"] : -1;
            if (depth == 1)
                for (var i = 0; i < area; i++) {
                    var gr = 255 * ((data[i >> 3] >> (7 - ((i & 7)))) & 1),
                        al = (gr == tr * 255) ? 0 : 255;
                    bf32[i] = (al << 24) | (gr << 16) | (gr << 8) | gr;
                }
            if (depth == 2)
                for (var i = 0; i < area; i++) {
                    var gr = 85 * ((data[i >> 2] >> (6 - ((i & 3) << 1))) & 3),
                        al = (gr == tr * 85) ? 0 : 255;
                    bf32[i] = (al << 24) | (gr << 16) | (gr << 8) | gr;
                }
            if (depth == 4)
                for (var i = 0; i < area; i++) {
                    var gr = 17 * ((data[i >> 1] >> (4 - ((i & 1) << 2))) & 15),
                        al = (gr == tr * 17) ? 0 : 255;
                    bf32[i] = (al << 24) | (gr << 16) | (gr << 8) | gr;
                }
            if (depth == 8)
                for (var i = 0; i < area; i++) {
                    var gr = data[i],
                        al = (gr == tr) ? 0 : 255;
                    bf32[i] = (al << 24) | (gr << 16) | (gr << 8) | gr;
                }
            if (depth == 16)
                for (var i = 0; i < area; i++) {
                    var gr = data[i << 1],
                        al = (rs(data, i << 1) == tr) ? 0 : 255;
                    bf32[i] = (al << 24) | (gr << 16) | (gr << 8) | gr;
                }
        }
        return bf;
    };

    UPNG.decode = function (buff) {
        var data = new Uint8Array(buff),
            offset = 8,
            bin = UPNG._bin,
            rUs = bin.readUshort,
            rUi = bin.readUint;
        var out = {
            tabs: {},
            frames: []
        };
        var dd = new Uint8Array(data.length),
            doff = 0; // put all IDAT data into it
        var fd, foff = 0; // frames
        var mgck = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        for (var i = 0; i < 8; i++)
            if (data[i] != mgck[i]) throw "The input is not a PNG file!";

        while (offset < data.length) {
            var len = bin.readUint(data, offset);
            offset += 4;
            var type = bin.readASCII(data, offset, 4);
            offset += 4;
            //console.log(type,len);
            if (type == "IHDR") {
                UPNG.decode._IHDR(data, offset, out);
            } else if (type == "IDAT") {
                for (var i = 0; i < len; i++) dd[doff + i] = data[offset + i];
                doff += len;
            } else if (type == "acTL") {
                out.tabs[type] = {
                    num_frames: rUi(data, offset),
                    num_plays: rUi(data, offset + 4)
                };
                fd = new Uint8Array(data.length);
            } else if (type == "fcTL") {
                if (foff != 0) {
                    var fr = out.frames[out.frames.length - 1];
                    fr.data = UPNG.decode._decompress(out, fd.slice(0, foff), fr.rect.width, fr.rect.height);
                    foff = 0;
                }
                var rct = {
                    x: rUi(data, offset + 12),
                    y: rUi(data, offset + 16),
                    width: rUi(data, offset + 4),
                    height: rUi(data, offset + 8)
                };
                var del = rUs(data, offset + 22);
                del = rUs(data, offset + 20) / (del == 0 ? 100 : del);
                var frm = {
                    rect: rct,
                    delay: Math.round(del * 1000),
                    dispose: data[offset + 24],
                    blend: data[offset + 25]
                };
                //console.log(frm);
                out.frames.push(frm);
            } else if (type == "fdAT") {
                for (var i = 0; i < len - 4; i++) fd[foff + i] = data[offset + i + 4];
                foff += len - 4;
            } else if (type == "pHYs") {
                out.tabs[type] = [bin.readUint(data, offset), bin.readUint(data, offset + 4), data[offset + 8]];
            } else if (type == "cHRM") {
                out.tabs[type] = [];
                for (var i = 0; i < 8; i++) out.tabs[type].push(bin.readUint(data, offset + i * 4));
            } else if (type == "tEXt") {
                if (out.tabs[type] == null) out.tabs[type] = {};
                var nz = bin.nextZero(data, offset);
                var keyw = bin.readASCII(data, offset, nz - offset);
                var text = bin.readASCII(data, nz + 1, offset + len - nz - 1);
                out.tabs[type][keyw] = text;
            } else if (type == "iTXt") {
                if (out.tabs[type] == null) out.tabs[type] = {};
                var nz = 0,
                    off = offset;
                nz = bin.nextZero(data, off);
                var keyw = bin.readASCII(data, off, nz - off);
                off = nz + 1;
                off += 2;
                nz = bin.nextZero(data, off);
                var ltag = bin.readASCII(data, off, nz - off);
                off = nz + 1;
                nz = bin.nextZero(data, off);
                var tkeyw = bin.readUTF8(data, off, nz - off);
                off = nz + 1;
                var text = bin.readUTF8(data, off, len - (off - offset));
                out.tabs[type][keyw] = text;
            } else if (type == "PLTE") {
                out.tabs[type] = bin.readBytes(data, offset, len);
            } else if (type == "hIST") {
                var pl = out.tabs["PLTE"].length / 3;
                out.tabs[type] = [];
                for (var i = 0; i < pl; i++) out.tabs[type].push(rUs(data, offset + i * 2));
            } else if (type == "tRNS") {
                if (out.ctype == 3) out.tabs[type] = bin.readBytes(data, offset, len);
                else if (out.ctype == 0) out.tabs[type] = rUs(data, offset);
                else if (out.ctype == 2) out.tabs[type] = [rUs(data, offset), rUs(data, offset + 2), rUs(data, offset + 4)];
                //else console.log("tRNS for unsupported color type",out.ctype, len);
            } else if (type == "gAMA") out.tabs[type] = bin.readUint(data, offset) / 100000;
            else if (type == "sRGB") out.tabs[type] = data[offset];
            else if (type == "bKGD") {
                if (out.ctype == 0 || out.ctype == 4) out.tabs[type] = [rUs(data, offset)];
                else if (out.ctype == 2 || out.ctype == 6) out.tabs[type] = [rUs(data, offset), rUs(data, offset + 2), rUs(data, offset + 4)];
                else if (out.ctype == 3) out.tabs[type] = data[offset];
            } else if (type == "IEND") {
                break;
            }
            offset += len;
            var crc = bin.readUint(data, offset);
            offset += 4;
        }
        if (foff != 0) {
            var fr = out.frames[out.frames.length - 1];
            fr.data = UPNG.decode._decompress(out, fd.slice(0, foff), fr.rect.width, fr.rect.height);
            foff = 0;
        }
        out.data = UPNG.decode._decompress(out, dd, out.width, out.height);

        delete out.compress;
        delete out.interlace;
        delete out.filter;
        return out;
    };

    UPNG.decode._decompress = function (out, dd, w, h) {
        if (out.compress == 0) dd = UPNG.decode._inflate(dd);

        if (out.interlace == 0) dd = UPNG.decode._filterZero(dd, out, 0, w, h);
        else if (out.interlace == 1) dd = UPNG.decode._readInterlace(dd, out);
        return dd;
    };

    UPNG.decode._inflate = function (data) {
        return pako["inflate"](data);
    };

    UPNG.decode._readInterlace = function (data, out) {
        var w = out.width,
            h = out.height;
        var bpp = UPNG.decode._getBPP(out),
            cbpp = bpp >> 3,
            bpl = Math.ceil(w * bpp / 8);
        var img = new Uint8Array(h * bpl);
        var di = 0;

        var starting_row = [0, 0, 4, 0, 2, 0, 1];
        var starting_col = [0, 4, 0, 2, 0, 1, 0];
        var row_increment = [8, 8, 8, 4, 4, 2, 2];
        var col_increment = [8, 8, 4, 4, 2, 2, 1];

        var pass = 0;
        while (pass < 7) {
            var ri = row_increment[pass],
                ci = col_increment[pass];
            var sw = 0,
                sh = 0;
            var cr = starting_row[pass];
            while (cr < h) {
                cr += ri;
                sh++;
            }
            var cc = starting_col[pass];
            while (cc < w) {
                cc += ci;
                sw++;
            }
            var bpll = Math.ceil(sw * bpp / 8);
            UPNG.decode._filterZero(data, out, di, sw, sh);

            var y = 0,
                row = starting_row[pass];
            while (row < h) {
                var col = starting_col[pass];
                var cdi = (di + y * bpll) << 3;

                while (col < w) {
                    if (bpp == 1) {
                        var val = data[cdi >> 3];
                        val = (val >> (7 - (cdi & 7))) & 1;
                        img[row * bpl + (col >> 3)] |= (val << (7 - ((col & 3) << 0)));
                    }
                    if (bpp == 2) {
                        var val = data[cdi >> 3];
                        val = (val >> (6 - (cdi & 7))) & 3;
                        img[row * bpl + (col >> 2)] |= (val << (6 - ((col & 3) << 1)));
                    }
                    if (bpp == 4) {
                        var val = data[cdi >> 3];
                        val = (val >> (4 - (cdi & 7))) & 15;
                        img[row * bpl + (col >> 1)] |= (val << (4 - ((col & 1) << 2)));
                    }
                    if (bpp >= 8) {
                        var ii = row * bpl + col * cbpp;
                        for (var j = 0; j < cbpp; j++) img[ii + j] = data[(cdi >> 3) + j];
                    }
                    cdi += bpp;
                    col += ci;
                }
                y++;
                row += ri;
            }
            if (sw * sh != 0) di += sh * (1 + bpll);
            pass = pass + 1;
        }
        return img;
    };

    UPNG.decode._getBPP = function (out) {
        var noc = [1, null, 3, 1, 2, null, 4][out.ctype];
        return noc * out.depth;
    };

    UPNG.decode._filterZero = function (data, out, off, w, h) {
        var bpp = UPNG.decode._getBPP(out),
            bpl = Math.ceil(w * bpp / 8),
            paeth = UPNG.decode._paeth;
        bpp = Math.ceil(bpp / 8);

        for (var y = 0; y < h; y++) {
            var i = off + y * bpl,
                di = i + y + 1;
            var type = data[di - 1];

            if (type == 0)
                for (var x = 0; x < bpl; x++) data[i + x] = data[di + x];
            else if (type == 1) {
                for (var x = 0; x < bpp; x++) data[i + x] = data[di + x];
                for (var x = bpp; x < bpl; x++) data[i + x] = (data[di + x] + data[i + x - bpp]) & 255;
            } else if (y == 0) {
                for (var x = 0; x < bpp; x++) data[i + x] = data[di + x];
                if (type == 2)
                    for (var x = bpp; x < bpl; x++) data[i + x] = (data[di + x]) & 255;
                if (type == 3)
                    for (var x = bpp; x < bpl; x++) data[i + x] = (data[di + x] + (data[i + x - bpp] >> 1)) & 255;
                if (type == 4)
                    for (var x = bpp; x < bpl; x++) data[i + x] = (data[di + x] + paeth(data[i + x - bpp], 0, 0)) & 255;
            } else {
                if (type == 2) {
                    for (var x = 0; x < bpl; x++) data[i + x] = (data[di + x] + data[i + x - bpl]) & 255;
                }

                if (type == 3) {
                    for (var x = 0; x < bpp; x++) data[i + x] = (data[di + x] + (data[i + x - bpl] >> 1)) & 255;
                    for (var x = bpp; x < bpl; x++) data[i + x] = (data[di + x] + ((data[i + x - bpl] + data[i + x - bpp]) >> 1)) & 255;
                }

                if (type == 4) {
                    for (var x = 0; x < bpp; x++) data[i + x] = (data[di + x] + paeth(0, data[i + x - bpl], 0)) & 255;
                    for (var x = bpp; x < bpl; x++) data[i + x] = (data[di + x] + paeth(data[i + x - bpp], data[i + x - bpl], data[i + x - bpp - bpl])) & 255;
                }
            }
        }
        return data;
    };

    UPNG.decode._paeth = function (a, b, c) {
        var p = a + b - c,
            pa = Math.abs(p - a),
            pb = Math.abs(p - b),
            pc = Math.abs(p - c);
        if (pa <= pb && pa <= pc) return a;
        else if (pb <= pc) return b;
        return c;
    };

    UPNG.decode._IHDR = function (data, offset, out) {
        var bin = UPNG._bin;
        out.width = bin.readUint(data, offset);
        offset += 4;
        out.height = bin.readUint(data, offset);
        offset += 4;
        out.depth = data[offset];
        offset++;
        out.ctype = data[offset];
        offset++;
        out.compress = data[offset];
        offset++;
        out.filter = data[offset];
        offset++;
        out.interlace = data[offset];
        offset++;
    };

    UPNG._bin = {
        nextZero: function (data, p) {
            while (data[p] != 0) p++;
            return p;
        },
        readUshort: function (buff, p) {
            return (buff[p] << 8) | buff[p + 1];
        },
        writeUshort: function (buff, p, n) {
            buff[p] = (n >> 8) & 255;
            buff[p + 1] = n & 255;
        },
        readUint: function (buff, p) {
            return (buff[p] * (256 * 256 * 256)) + ((buff[p + 1] << 16) | (buff[p + 2] << 8) | buff[p + 3]);
        },
        writeUint: function (buff, p, n) {
            buff[p] = (n >> 24) & 255;
            buff[p + 1] = (n >> 16) & 255;
            buff[p + 2] = (n >> 8) & 255;
            buff[p + 3] = n & 255;
        },
        readASCII: function (buff, p, l) {
            var s = "";
            for (var i = 0; i < l; i++) s += String.fromCharCode(buff[p + i]);
            return s;
        },
        writeASCII: function (data, p, s) {
            for (var i = 0; i < s.length; i++) data[p + i] = s.charCodeAt(i);
        },
        readBytes: function (buff, p, l) {
            var arr = [];
            for (var i = 0; i < l; i++) arr.push(buff[p + i]);
            return arr;
        },
        pad: function (n) {
            return n.length < 2 ? "0" + n : n;
        },
        readUTF8: function (buff, p, l) {
            var s = "",
                ns;
            for (var i = 0; i < l; i++) s += "%" + UPNG._bin.pad(buff[p + i].toString(16));
            try {
                ns = decodeURIComponent(s);
            } catch (e) {
                return UPNG._bin.readASCII(buff, p, l);
            }
            return ns;
        }
    };
    UPNG._copyTile = function (sb, sw, sh, tb, tw, th, xoff, yoff, mode) {
        var w = Math.min(sw, tw),
            h = Math.min(sh, th);
        var si = 0,
            ti = 0;
        for (var y = 0; y < h; y++)
            for (var x = 0; x < w; x++) {
                if (xoff >= 0 && yoff >= 0) {
                    si = (y * sw + x) << 2;
                    ti = ((yoff + y) * tw + xoff + x) << 2;
                } else {
                    si = ((-yoff + y) * sw - xoff + x) << 2;
                    ti = (y * tw + x) << 2;
                }

                if (mode == 0) {
                    tb[ti] = sb[si];
                    tb[ti + 1] = sb[si + 1];
                    tb[ti + 2] = sb[si + 2];
                    tb[ti + 3] = sb[si + 3];
                } else if (mode == 1) {
                    var fa = sb[si + 3] * (1 / 255),
                        fr = sb[si] * fa,
                        fg = sb[si + 1] * fa,
                        fb = sb[si + 2] * fa;
                    var ba = tb[ti + 3] * (1 / 255),
                        br = tb[ti] * ba,
                        bg = tb[ti + 1] * ba,
                        bb = tb[ti + 2] * ba;

                    var ifa = 1 - fa,
                        oa = fa + ba * ifa,
                        ioa = (oa == 0 ? 0 : 1 / oa);
                    tb[ti + 3] = 255 * oa;
                    tb[ti + 0] = (fr + br * ifa) * ioa;
                    tb[ti + 1] = (fg + bg * ifa) * ioa;
                    tb[ti + 2] = (fb + bb * ifa) * ioa;
                } else if (mode == 2) { // copy only differences, otherwise zero
                    var fa = sb[si + 3],
                        fr = sb[si],
                        fg = sb[si + 1],
                        fb = sb[si + 2];
                    var ba = tb[ti + 3],
                        br = tb[ti],
                        bg = tb[ti + 1],
                        bb = tb[ti + 2];
                    if (fa == ba && fr == br && fg == bg && fb == bb) {
                        tb[ti] = 0;
                        tb[ti + 1] = 0;
                        tb[ti + 2] = 0;
                        tb[ti + 3] = 0;
                    } else {
                        tb[ti] = fr;
                        tb[ti + 1] = fg;
                        tb[ti + 2] = fb;
                        tb[ti + 3] = fa;
                    }
                } else if (mode == 3) { // check if can be blended
                    var fa = sb[si + 3],
                        fr = sb[si],
                        fg = sb[si + 1],
                        fb = sb[si + 2];
                    var ba = tb[ti + 3],
                        br = tb[ti],
                        bg = tb[ti + 1],
                        bb = tb[ti + 2];
                    if (fa == ba && fr == br && fg == bg && fb == bb) continue;
                    //if(fa!=255 && ba!=0) return false;
                    if (fa < 220 && ba > 20) return false;
                }
            }
        return true;
    };

    UPNG.encode = function (bufs, w, h, ps, dels, forbidPlte) {
        if (ps == null) ps = 0;
        if (forbidPlte == null) forbidPlte = false;

        var nimg = UPNG.encode.compress(bufs, w, h, ps, false, forbidPlte);
        UPNG.encode.compressPNG(nimg, -1);

        return UPNG.encode._main(nimg, w, h, dels);
    };

    UPNG.encodeLL = function (bufs, w, h, cc, ac, depth, dels) {
        var nimg = {
            ctype: 0 + (cc == 1 ? 0 : 2) + (ac == 0 ? 0 : 4),
            depth: depth,
            frames: []
        };

        var bipp = (cc + ac) * depth,
            bipl = bipp * w;
        for (var i = 0; i < bufs.length; i++) nimg.frames.push({
            rect: {
                x: 0,
                y: 0,
                width: w,
                height: h
            },
            img: new Uint8Array(bufs[i]),
            blend: 0,
            dispose: 1,
            bpp: Math.ceil(bipp / 8),
            bpl: Math.ceil(bipl / 8)
        });

        UPNG.encode.compressPNG(nimg, 4);

        return UPNG.encode._main(nimg, w, h, dels);
    };

    UPNG.encode._main = function (nimg, w, h, dels) {
        var crc = UPNG.crc.crc,
            wUi = UPNG._bin.writeUint,
            wUs = UPNG._bin.writeUshort,
            wAs = UPNG._bin.writeASCII;
        var offset = 8,
            anim = nimg.frames.length > 1,
            pltAlpha = false;

        var leng = 8 + (16 + 5 + 4) + (9 + 4) + (anim ? 20 : 0);
        if (nimg.ctype == 3) {
            var dl = nimg.plte.length;
            for (var i = 0; i < dl; i++)
                if ((nimg.plte[i] >>> 24) != 255) pltAlpha = true;
            leng += (8 + dl * 3 + 4) + (pltAlpha ? (8 + dl * 1 + 4) : 0);
        }
        for (var j = 0; j < nimg.frames.length; j++) {
            var fr = nimg.frames[j];
            if (anim) leng += 38;
            leng += fr.cimg.length + 12;
            if (j != 0) leng += 4;
        }
        leng += 12;

        var data = new Uint8Array(leng);
        var wr = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        for (var i = 0; i < 8; i++) data[i] = wr[i];

        wUi(data, offset, 13);
        offset += 4;
        wAs(data, offset, "IHDR");
        offset += 4;
        wUi(data, offset, w);
        offset += 4;
        wUi(data, offset, h);
        offset += 4;
        data[offset] = nimg.depth;
        offset++; // depth
        data[offset] = nimg.ctype;
        offset++; // ctype
        data[offset] = 0;
        offset++; // compress
        data[offset] = 0;
        offset++; // filter
        data[offset] = 0;
        offset++; // interlace
        wUi(data, offset, crc(data, offset - 17, 17));
        offset += 4; // crc
        // 9 bytes to say, that it is sRGB
        wUi(data, offset, 1);
        offset += 4;
        wAs(data, offset, "sRGB");
        offset += 4;
        data[offset] = 1;
        offset++;
        wUi(data, offset, crc(data, offset - 5, 5));
        offset += 4; // crc
        if (anim) {
            wUi(data, offset, 8);
            offset += 4;
            wAs(data, offset, "acTL");
            offset += 4;
            wUi(data, offset, nimg.frames.length);
            offset += 4;
            wUi(data, offset, 0);
            offset += 4;
            wUi(data, offset, crc(data, offset - 12, 12));
            offset += 4; // crc
        }

        if (nimg.ctype == 3) {
            var dl = nimg.plte.length;
            wUi(data, offset, dl * 3);
            offset += 4;
            wAs(data, offset, "PLTE");
            offset += 4;
            for (var i = 0; i < dl; i++) {
                var ti = i * 3,
                    c = nimg.plte[i],
                    r = (c) & 255,
                    g = (c >>> 8) & 255,
                    b = (c >>> 16) & 255;
                data[offset + ti + 0] = r;
                data[offset + ti + 1] = g;
                data[offset + ti + 2] = b;
            }
            offset += dl * 3;
            wUi(data, offset, crc(data, offset - dl * 3 - 4, dl * 3 + 4));
            offset += 4; // crc
            if (pltAlpha) {
                wUi(data, offset, dl);
                offset += 4;
                wAs(data, offset, "tRNS");
                offset += 4;
                for (var i = 0; i < dl; i++) data[offset + i] = (nimg.plte[i] >>> 24) & 255;
                offset += dl;
                wUi(data, offset, crc(data, offset - dl - 4, dl + 4));
                offset += 4; // crc
            }
        }

        var fi = 0;
        for (var j = 0; j < nimg.frames.length; j++) {
            var fr = nimg.frames[j];
            if (anim) {
                wUi(data, offset, 26);
                offset += 4;
                wAs(data, offset, "fcTL");
                offset += 4;
                wUi(data, offset, fi++);
                offset += 4;
                wUi(data, offset, fr.rect.width);
                offset += 4;
                wUi(data, offset, fr.rect.height);
                offset += 4;
                wUi(data, offset, fr.rect.x);
                offset += 4;
                wUi(data, offset, fr.rect.y);
                offset += 4;
                wUs(data, offset, dels[j]);
                offset += 2;
                wUs(data, offset, 1000);
                offset += 2;
                data[offset] = fr.dispose;
                offset++; // dispose
                data[offset] = fr.blend;
                offset++; // blend
                wUi(data, offset, crc(data, offset - 30, 30));
                offset += 4; // crc
            }

            var imgd = fr.cimg,
                dl = imgd.length;
            wUi(data, offset, dl + (j == 0 ? 0 : 4));
            offset += 4;
            var ioff = offset;
            wAs(data, offset, (j == 0) ? "IDAT" : "fdAT");
            offset += 4;
            if (j != 0) {
                wUi(data, offset, fi++);
                offset += 4;
            }
            for (var i = 0; i < dl; i++) data[offset + i] = imgd[i];
            offset += dl;
            wUi(data, offset, crc(data, ioff, offset - ioff));
            offset += 4; // crc
        }

        wUi(data, offset, 0);
        offset += 4;
        wAs(data, offset, "IEND");
        offset += 4;
        wUi(data, offset, crc(data, offset - 4, 4));
        offset += 4; // crc
        return data.buffer;
    };

    UPNG.encode.compressPNG = function (out, filter) {
        for (var i = 0; i < out.frames.length; i++) {
            var frm = out.frames[i],
                nw = frm.rect.width,
                nh = frm.rect.height;
            var fdata = new Uint8Array(nh * frm.bpl + nh);
            frm.cimg = UPNG.encode._filterZero(frm.img, nh, frm.bpp, frm.bpl, fdata, filter);
        }
    };

    UPNG.encode.compress = function (bufs, w, h, ps, forGIF, forbidPlte) {
        //var time = Date.now();
        if (forbidPlte == null) forbidPlte = false;

        var ctype = 6,
            depth = 8,
            alphaAnd = 255;

        for (var j = 0; j < bufs.length; j++) { // when not quantized, other frames can contain colors, that are not in an initial frame
            var img = new Uint8Array(bufs[j]),
                ilen = img.length;
            for (var i = 0; i < ilen; i += 4) alphaAnd &= img[i + 3];
        }
        var gotAlpha = (alphaAnd != 255);

        //console.log("alpha check", Date.now()-time);  time = Date.now();
        var brute = gotAlpha && forGIF; // brute : frames can only be copied, not "blended"
        var frms = UPNG.encode.framize(bufs, w, h, forGIF, brute);
        //console.log("framize", Date.now()-time);  time = Date.now();
        var cmap = {},
            plte = [],
            inds = [];

        if (ps != 0) {
            var nbufs = [];
            for (var i = 0; i < frms.length; i++) nbufs.push(frms[i].img.buffer);

            var abuf = UPNG.encode.concatRGBA(nbufs, forGIF),
                qres = UPNG.quantize(abuf, ps);
            var cof = 0,
                bb = new Uint8Array(qres.abuf);
            for (var i = 0; i < frms.length; i++) {
                var ti = frms[i].img,
                    bln = ti.length;
                inds.push(new Uint8Array(qres.inds.buffer, cof >> 2, bln >> 2));
                for (var j = 0; j < bln; j += 4) {
                    ti[j] = bb[cof + j];
                    ti[j + 1] = bb[cof + j + 1];
                    ti[j + 2] = bb[cof + j + 2];
                    ti[j + 3] = bb[cof + j + 3];
                }
                cof += bln;
            }

            for (var i = 0; i < qres.plte.length; i++) plte.push(qres.plte[i].est.rgba);
            //console.log("quantize", Date.now()-time);  time = Date.now();
        } else {
            // what if ps==0, but there are <=256 colors?  we still need to detect, if the palette could be used
            for (var j = 0; j < frms.length; j++) { // when not quantized, other frames can contain colors, that are not in an initial frame
                var frm = frms[j],
                    img32 = new Uint32Array(frm.img.buffer),
                    nw = frm.rect.width,
                    ilen = img32.length;
                var ind = new Uint8Array(ilen);
                inds.push(ind);
                for (var i = 0; i < ilen; i++) {
                    var c = img32[i];
                    if (i != 0 && c == img32[i - 1]) ind[i] = ind[i - 1];
                    else if (i > nw && c == img32[i - nw]) ind[i] = ind[i - nw];
                    else {
                        var cmc = cmap[c];
                        if (cmc == null) {
                            cmap[c] = cmc = plte.length;
                            plte.push(c);
                            if (plte.length >= 300) break;
                        }
                        ind[i] = cmc;
                    }
                }
            }
            //console.log("make palette", Date.now()-time);  time = Date.now();
        }

        var cc = plte.length; //console.log("colors:",cc);
        if (cc <= 256 && forbidPlte == false) {
            if (cc <= 2) depth = 1;
            else if (cc <= 4) depth = 2;
            else if (cc <= 16) depth = 4;
            else depth = 8;
            if (forGIF) depth = 8;
        }

        for (var j = 0; j < frms.length; j++) {
            var frm = frms[j],
                nx = frm.rect.x,
                ny = frm.rect.y,
                nw = frm.rect.width,
                nh = frm.rect.height;
            var cimg = frm.img,
                cimg32 = new Uint32Array(cimg.buffer);
            var bpl = 4 * nw,
                bpp = 4;
            if (cc <= 256 && forbidPlte == false) {
                bpl = Math.ceil(depth * nw / 8);
                var nimg = new Uint8Array(bpl * nh);
                var inj = inds[j];
                for (var y = 0; y < nh; y++) {
                    var i = y * bpl,
                        ii = y * nw;
                    if (depth == 8)
                        for (var x = 0; x < nw; x++) nimg[i + (x)] = (inj[ii + x]);
                    else if (depth == 4)
                        for (var x = 0; x < nw; x++) nimg[i + (x >> 1)] |= (inj[ii + x] << (4 - (x & 1) * 4));
                    else if (depth == 2)
                        for (var x = 0; x < nw; x++) nimg[i + (x >> 2)] |= (inj[ii + x] << (6 - (x & 3) * 2));
                    else if (depth == 1)
                        for (var x = 0; x < nw; x++) nimg[i + (x >> 3)] |= (inj[ii + x] << (7 - (x & 7) * 1));
                }
                cimg = nimg;
                ctype = 3;
                bpp = 1;
            } else if (gotAlpha == false && frms.length == 1) { // some next "reduced" frames may contain alpha for blending
                var nimg = new Uint8Array(nw * nh * 3),
                    area = nw * nh;
                for (var i = 0; i < area; i++) {
                    var ti = i * 3,
                        qi = i * 4;
                    nimg[ti] = cimg[qi];
                    nimg[ti + 1] = cimg[qi + 1];
                    nimg[ti + 2] = cimg[qi + 2];
                }
                cimg = nimg;
                ctype = 2;
                bpp = 3;
                bpl = 3 * nw;
            }
            frm.img = cimg;
            frm.bpl = bpl;
            frm.bpp = bpp;
        }
        //console.log("colors => palette indices", Date.now()-time);  time = Date.now();
        return {
            ctype: ctype,
            depth: depth,
            plte: plte,
            frames: frms
        };
    };
    UPNG.encode.framize = function (bufs, w, h, forGIF, brute) {
        var frms = [];
        for (var j = 0; j < bufs.length; j++) {
            var cimg = new Uint8Array(bufs[j]),
                cimg32 = new Uint32Array(cimg.buffer);

            var nx = 0,
                ny = 0,
                nw = w,
                nh = h,
                blend = 0;
            if (j != 0 && !brute) {
                var tlim = (forGIF || j == 1 || frms[frms.length - 2].dispose == 2) ? 1 : 2,
                    tstp = 0,
                    tarea = 1e9;
                for (var it = 0; it < tlim; it++) {
                    var pimg = new Uint8Array(bufs[j - 1 - it]),
                        p32 = new Uint32Array(bufs[j - 1 - it]);
                    var mix = w,
                        miy = h,
                        max = -1,
                        may = -1;
                    for (var y = 0; y < h; y++)
                        for (var x = 0; x < w; x++) {
                            var i = y * w + x;
                            if (cimg32[i] != p32[i]) {
                                if (x < mix) mix = x;
                                if (x > max) max = x;
                                if (y < miy) miy = y;
                                if (y > may) may = y;
                            }
                        }
                    var sarea = (max == -1) ? 1 : (max - mix + 1) * (may - miy + 1);
                    if (sarea < tarea) {
                        tarea = sarea;
                        tstp = it;
                        if (max == -1) {
                            nx = ny = 0;
                            nw = nh = 1;
                        } else {
                            nx = mix;
                            ny = miy;
                            nw = max - mix + 1;
                            nh = may - miy + 1;
                        }
                    }
                }

                var pimg = new Uint8Array(bufs[j - 1 - tstp]);
                if (tstp == 1) frms[frms.length - 1].dispose = 2;

                var nimg = new Uint8Array(nw * nh * 4),
                    nimg32 = new Uint32Array(nimg.buffer);
                UPNG._copyTile(pimg, w, h, nimg, nw, nh, -nx, -ny, 0);
                if (UPNG._copyTile(cimg, w, h, nimg, nw, nh, -nx, -ny, 3)) {
                    UPNG._copyTile(cimg, w, h, nimg, nw, nh, -nx, -ny, 2);
                    blend = 1;
                } else {
                    UPNG._copyTile(cimg, w, h, nimg, nw, nh, -nx, -ny, 0);
                    blend = 0;
                }
                cimg = nimg;
            } else cimg = cimg.slice(0); // img may be rewrited further ... don't rewrite input
            frms.push({
                rect: {
                    x: nx,
                    y: ny,
                    width: nw,
                    height: nh
                },
                img: cimg,
                blend: blend,
                dispose: brute ? 1 : 0
            });
        }
        return frms;
    };

    UPNG.encode._filterZero = function (img, h, bpp, bpl, data, filter) {
        if (filter != -1) {
            for (var y = 0; y < h; y++) UPNG.encode._filterLine(data, img, y, bpl, bpp, filter);
            return pako["deflate"](data);
        }
        var fls = [];
        for (var t = 0; t < 5; t++) {
            if (h * bpl > 500000 && (t == 2 || t == 3 || t == 4)) continue;
            for (var y = 0; y < h; y++) UPNG.encode._filterLine(data, img, y, bpl, bpp, t);
            fls.push(pako["deflate"](data));
            if (bpp == 1) break;
        }
        var ti, tsize = 1e9;
        for (var i = 0; i < fls.length; i++)
            if (fls[i].length < tsize) {
                ti = i;
                tsize = fls[i].length;
            }
        return fls[ti];
    };
    UPNG.encode._filterLine = function (data, img, y, bpl, bpp, type) {
        var i = y * bpl,
            di = i + y,
            paeth = UPNG.decode._paeth;
        data[di] = type;
        di++;

        if (type == 0)
            for (var x = 0; x < bpl; x++) data[di + x] = img[i + x];
        else if (type == 1) {
            for (var x = 0; x < bpp; x++) data[di + x] = img[i + x];
            for (var x = bpp; x < bpl; x++) data[di + x] = (img[i + x] - img[i + x - bpp] + 256) & 255;
        } else if (y == 0) {
            for (var x = 0; x < bpp; x++) data[di + x] = img[i + x];

            if (type == 2)
                for (var x = bpp; x < bpl; x++) data[di + x] = img[i + x];
            if (type == 3)
                for (var x = bpp; x < bpl; x++) data[di + x] = (img[i + x] - (img[i + x - bpp] >> 1) + 256) & 255;
            if (type == 4)
                for (var x = bpp; x < bpl; x++) data[di + x] = (img[i + x] - paeth(img[i + x - bpp], 0, 0) + 256) & 255;
        } else {
            if (type == 2) {
                for (var x = 0; x < bpl; x++) data[di + x] = (img[i + x] + 256 - img[i + x - bpl]) & 255;
            }
            if (type == 3) {
                for (var x = 0; x < bpp; x++) data[di + x] = (img[i + x] + 256 - (img[i + x - bpl] >> 1)) & 255;
                for (var x = bpp; x < bpl; x++) data[di + x] = (img[i + x] + 256 - ((img[i + x - bpl] + img[i + x - bpp]) >> 1)) & 255;
            }
            if (type == 4) {
                for (var x = 0; x < bpp; x++) data[di + x] = (img[i + x] + 256 - paeth(0, img[i + x - bpl], 0)) & 255;
                for (var x = bpp; x < bpl; x++) data[di + x] = (img[i + x] + 256 - paeth(img[i + x - bpp], img[i + x - bpl], img[i + x - bpp - bpl])) & 255;
            }
        }
    };

    UPNG.crc = {
        table: (function () {
            var tab = new Uint32Array(256);
            for (var n = 0; n < 256; n++) {
                var c = n;
                for (var k = 0; k < 8; k++) {
                    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
                    else c = c >>> 1;
                }
                tab[n] = c;
            }
            return tab;
        })(),
        update: function (c, buf, off, len) {
            for (var i = 0; i < len; i++) c = UPNG.crc.table[(c ^ buf[off + i]) & 0xff] ^ (c >>> 8);
            return c;
        },
        crc: function (b, o, l) {
            return UPNG.crc.update(0xffffffff, b, o, l) ^ 0xffffffff;
        }
    };

    UPNG.quantize = function (abuf, ps) {
        var oimg = new Uint8Array(abuf),
            nimg = oimg.slice(0),
            nimg32 = new Uint32Array(nimg.buffer);

        var KD = UPNG.quantize.getKDtree(nimg, ps);
        var root = KD[0],
            leafs = KD[1];

        var planeDst = UPNG.quantize.planeDst;
        var sb = oimg,
            tb = nimg32,
            len = sb.length;

        var inds = new Uint8Array(oimg.length >> 2);
        for (var i = 0; i < len; i += 4) {
            var r = sb[i] * (1 / 255),
                g = sb[i + 1] * (1 / 255),
                b = sb[i + 2] * (1 / 255),
                a = sb[i + 3] * (1 / 255);

            //  exact, but too slow :(
            var nd = UPNG.quantize.getNearest(root, r, g, b, a);
            //var nd = root;
            //while(nd.left) nd = (planeDst(nd.est,r,g,b,a)<=0) ? nd.left : nd.right;
            inds[i >> 2] = nd.ind;
            tb[i >> 2] = nd.est.rgba;
        }
        return {
            abuf: nimg.buffer,
            inds: inds,
            plte: leafs
        };
    };

    UPNG.quantize.getKDtree = function (nimg, ps, err) {
        if (err == null) err = 0.0001;
        var nimg32 = new Uint32Array(nimg.buffer);

        var root = {
            i0: 0,
            i1: nimg.length,
            bst: null,
            est: null,
            tdst: 0,
            left: null,
            right: null
        }; // basic statistic, extra statistic
        root.bst = UPNG.quantize.stats(nimg, root.i0, root.i1);
        root.est = UPNG.quantize.estats(root.bst);
        var leafs = [root];

        while (leafs.length < ps) {
            var maxL = 0,
                mi = 0;
            for (var i = 0; i < leafs.length; i++)
                if (leafs[i].est.L > maxL) {
                    maxL = leafs[i].est.L;
                    mi = i;
                }
            if (maxL < err) break;
            var node = leafs[mi];

            var s0 = UPNG.quantize.splitPixels(nimg, nimg32, node.i0, node.i1, node.est.e, node.est.eMq255);
            var s0wrong = (node.i0 >= s0 || node.i1 <= s0);
            //console.log(maxL, leafs.length, mi);
            if (s0wrong) {
                node.est.L = 0;
                continue;
            }

            var ln = {
                i0: node.i0,
                i1: s0,
                bst: null,
                est: null,
                tdst: 0,
                left: null,
                right: null
            };
            ln.bst = UPNG.quantize.stats(nimg, ln.i0, ln.i1);
            ln.est = UPNG.quantize.estats(ln.bst);
            var rn = {
                i0: s0,
                i1: node.i1,
                bst: null,
                est: null,
                tdst: 0,
                left: null,
                right: null
            };
            rn.bst = {
                R: [],
                m: [],
                N: node.bst.N - ln.bst.N
            };
            for (var i = 0; i < 16; i++) rn.bst.R[i] = node.bst.R[i] - ln.bst.R[i];
            for (var i = 0; i < 4; i++) rn.bst.m[i] = node.bst.m[i] - ln.bst.m[i];
            rn.est = UPNG.quantize.estats(rn.bst);

            node.left = ln;
            node.right = rn;
            leafs[mi] = ln;
            leafs.push(rn);
        }
        leafs.sort(function (a, b) {
            return b.bst.N - a.bst.N;
        });
        for (var i = 0; i < leafs.length; i++) leafs[i].ind = i;
        return [root, leafs];
    };

    UPNG.quantize.getNearest = function (nd, r, g, b, a) {
        if (nd.left == null) {
            nd.tdst = UPNG.quantize.dist(nd.est.q, r, g, b, a);
            return nd;
        }
        var planeDst = UPNG.quantize.planeDst(nd.est, r, g, b, a);

        var node0 = nd.left,
            node1 = nd.right;
        if (planeDst > 0) {
            node0 = nd.right;
            node1 = nd.left;
        }

        var ln = UPNG.quantize.getNearest(node0, r, g, b, a);
        if (ln.tdst <= planeDst * planeDst) return ln;
        var rn = UPNG.quantize.getNearest(node1, r, g, b, a);
        return rn.tdst < ln.tdst ? rn : ln;
    };
    UPNG.quantize.planeDst = function (est, r, g, b, a) {
        var e = est.e;
        return e[0] * r + e[1] * g + e[2] * b + e[3] * a - est.eMq;
    };
    UPNG.quantize.dist = function (q, r, g, b, a) {
        var d0 = r - q[0],
            d1 = g - q[1],
            d2 = b - q[2],
            d3 = a - q[3];
        return d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3;
    };

    UPNG.quantize.splitPixels = function (nimg, nimg32, i0, i1, e, eMq) {
        var vecDot = UPNG.quantize.vecDot;
        i1 -= 4;
        while (i0 < i1) {
            while (vecDot(nimg, i0, e) <= eMq) i0 += 4;
            while (vecDot(nimg, i1, e) > eMq) i1 -= 4;
            if (i0 >= i1) break;

            var t = nimg32[i0 >> 2];
            nimg32[i0 >> 2] = nimg32[i1 >> 2];
            nimg32[i1 >> 2] = t;

            i0 += 4;
            i1 -= 4;
        }
        while (vecDot(nimg, i0, e) > eMq) i0 -= 4;
        return i0 + 4;
    };
    UPNG.quantize.vecDot = function (nimg, i, e) {
        return nimg[i] * e[0] + nimg[i + 1] * e[1] + nimg[i + 2] * e[2] + nimg[i + 3] * e[3];
    };
    UPNG.quantize.stats = function (nimg, i0, i1) {
        var R = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        var m = [0, 0, 0, 0];
        var N = (i1 - i0) >> 2;
        for (var i = i0; i < i1; i += 4) {
            var r = nimg[i] * (1 / 255),
                g = nimg[i + 1] * (1 / 255),
                b = nimg[i + 2] * (1 / 255),
                a = nimg[i + 3] * (1 / 255);
            //var r = nimg[i], g = nimg[i+1], b = nimg[i+2], a = nimg[i+3];
            m[0] += r;
            m[1] += g;
            m[2] += b;
            m[3] += a;

            R[0] += r * r;
            R[1] += r * g;
            R[2] += r * b;
            R[3] += r * a;
            R[5] += g * g;
            R[6] += g * b;
            R[7] += g * a;
            R[10] += b * b;
            R[11] += b * a;
            R[15] += a * a;
        }
        R[4] = R[1];
        R[8] = R[2];
        R[9] = R[6];
        R[12] = R[3];
        R[13] = R[7];
        R[14] = R[11];

        return {
            R: R,
            m: m,
            N: N
        };
    };
    UPNG.quantize.estats = function (stats) {
        var R = stats.R,
            m = stats.m,
            N = stats.N;

        // when all samples are equal, but N is large (millions), the Rj can be non-zero ( 0.0003.... - precission error)
        var m0 = m[0],
            m1 = m[1],
            m2 = m[2],
            m3 = m[3],
            iN = (N == 0 ? 0 : 1 / N);
        var Rj = [R[0] - m0 * m0 * iN, R[1] - m0 * m1 * iN, R[2] - m0 * m2 * iN, R[3] - m0 * m3 * iN, R[4] - m1 * m0 * iN, R[5] - m1 * m1 * iN, R[6] - m1 * m2 * iN, R[7] - m1 * m3 * iN, R[8] - m2 * m0 * iN, R[9] - m2 * m1 * iN, R[10] - m2 * m2 * iN, R[11] - m2 * m3 * iN, R[12] - m3 * m0 * iN, R[13] - m3 * m1 * iN, R[14] - m3 * m2 * iN, R[15] - m3 * m3 * iN];

        var A = Rj,
            M = UPNG.M4;
        var b = [0.5, 0.5, 0.5, 0.5],
            mi = 0,
            tmi = 0;

        if (N != 0)
            for (var i = 0; i < 10; i++) {
                b = M.multVec(A, b);
                tmi = Math.sqrt(M.dot(b, b));
                b = M.sml(1 / tmi, b);
                if (Math.abs(tmi - mi) < 1e-9) break;
                mi = tmi;
            }
        //b = [0,0,1,0];  mi=N;
        var q = [m0 * iN, m1 * iN, m2 * iN, m3 * iN];
        var eMq255 = M.dot(M.sml(255, q), b);

        return {
            Cov: Rj,
            q: q,
            e: b,
            L: mi,
            eMq255: eMq255,
            eMq: M.dot(b, q),
            rgba: (((Math.round(255 * q[3]) << 24) | (Math.round(255 * q[2]) << 16) | (Math.round(255 * q[1]) << 8) | (Math.round(255 * q[0]) << 0)) >>> 0)
        };
    };
    UPNG.M4 = {
        multVec: function (m, v) {
            return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3] * v[3], m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7] * v[3], m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11] * v[3], m[12] * v[0] + m[13] * v[1] + m[14] * v[2] + m[15] * v[3]];
        },
        dot: function (x, y) {
            return x[0] * y[0] + x[1] * y[1] + x[2] * y[2] + x[3] * y[3];
        },
        sml: function (a, y) {
            return [a * y[0], a * y[1], a * y[2], a * y[3]];
        }
    };

    UPNG.encode.concatRGBA = function (bufs, roundAlpha) {
        var tlen = 0;
        for (var i = 0; i < bufs.length; i++) tlen += bufs[i].byteLength;
        var nimg = new Uint8Array(tlen),
            noff = 0;
        for (var i = 0; i < bufs.length; i++) {
            var img = new Uint8Array(bufs[i]),
                il = img.length;
            for (var j = 0; j < il; j += 4) {
                var r = img[j],
                    g = img[j + 1],
                    b = img[j + 2],
                    a = img[j + 3];
                if (roundAlpha) a = (a & 128) == 0 ? 0 : 255;
                if (a == 0) r = g = b = 0;
                nimg[noff + j] = r;
                nimg[noff + j + 1] = g;
                nimg[noff + j + 2] = b;
                nimg[noff + j + 3] = a;
            }
            noff += il;
        }
        return nimg.buffer;
    };

})(UPNG, pako);

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
    let imgSrc = src,
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
      upng = UPNG.decode(buf),
      rgba = UPNG.toRGBA8(upng),
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
      gif = new GifReader(buf),
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

module.exports = Image;
