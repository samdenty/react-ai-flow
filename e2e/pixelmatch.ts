type PixelData = Uint8Array | Uint8ClampedArray;

interface PixelMatchOptions {
    threshold?: number;
    includeAA?: boolean;
    alpha?: number;
    aaColor?: [number, number, number];
    diffColor?: [number, number, number];
    diffColorAlt?: [number, number, number];
    diffMask?: boolean;
}

export default function pixelmatch(
    img1: PixelData,
    img2: PixelData,
    output: PixelData | null,
    width: number,
    height: number,
    options: PixelMatchOptions = {}
): number[] {
    const {
        threshold = 0.1,
        alpha = 0.1,
        aaColor = [255, 255, 0],
        diffColor = [255, 0, 0],
        includeAA,
        diffColorAlt,
        diffMask
    } = options;

    if (img1.length !== img2.length || (output && output.length !== img1.length))
        throw new Error('Image sizes do not match.');

    if (img1.length !== width * height * 4) throw new Error('Image data size does not match width/height.');

    // check if images are identical
    const len = width * height;
    const a32 = new Uint32Array(img1.buffer, img1.byteOffset, len);
    const b32 = new Uint32Array(img2.buffer, img2.byteOffset, len);
    let identical = true;

    for (let i = 0; i < len; i++) {
        if (a32[i] !== b32[i]) { identical = false; break; }
    }
    if (identical) { // fast path if identical
        if (output && !diffMask) {
            for (let i = 0; i < len; i++) drawGrayPixel(img1, 4 * i, alpha, output);
        }
        return [];
    }

    // maximum acceptable square distance between two colors;
    // 35215 is the maximum possible value for the YIQ difference metric
    const maxDelta = 35215 * threshold * threshold;
    const [aaR, aaG, aaB] = aaColor;
    const [diffR, diffG, diffB] = diffColor;
    const [altR, altG, altB] = diffColorAlt || diffColor;
    const diff: number[] = [];

    // compare each pixel of one image against the other one
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {

            const i = y * width + x;
            const pos = i * 4;

            // squared YUV distance between colors at this pixel position, negative if the img2 pixel is darker
            const delta = a32[i] === b32[i] ? 0 : colorDelta(img1, img2, pos, pos, false);
            const deltaPercentage = Math.abs(delta) / 35215;

            // the color difference is above the threshold
            if (Math.abs(delta) > maxDelta) {
                // check it's a real rendering difference or just anti-aliasing
                const isAA = antialiased(img1, x, y, width, height, a32, b32) || antialiased(img2, x, y, width, height, b32, a32);
                if (!includeAA && isAA) {
                    // one of the pixels is anti-aliasing; draw as yellow and do not count as difference
                    // note that we do not include such pixels in a mask
                    if (output && !diffMask) drawPixel(output, pos, aaR, aaG, aaB, 255 * deltaPercentage);

                } else {
                    // found substantial difference not caused by anti-aliasing; draw it as such
                    if (output) {
                        if (delta < 0) {
                            drawPixel(output, pos, altR, altG, altB,255 * deltaPercentage);
                        } else {
                            drawPixel(output, pos, diffR, diffG, diffB,255 * deltaPercentage);
                        }
                    }
                    diff.push(deltaPercentage);
                }

            } else if (output && !diffMask) {
                // pixels are similar; draw background as grayscale image blended with white
                drawGrayPixel(img1, pos, alpha, output);
            }
        }
    }

    // return the number of different pixels
    return diff;
}

function antialiased(
    img: PixelData,
    x1: number,
    y1: number,
    width: number,
    height: number,
    a32: Uint32Array,
    b32: Uint32Array
): boolean {
    const x0 = Math.max(x1 - 1, 0);
    const y0 = Math.max(y1 - 1, 0);
    const x2 = Math.min(x1 + 1, width - 1);
    const y2 = Math.min(y1 + 1, height - 1);
    const pos = y1 * width + x1;
    let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;
    let min = 0;
    let max = 0;
    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;

    // go through 8 adjacent pixels
    for (let x = x0; x <= x2; x++) {
        for (let y = y0; y <= y2; y++) {
            if (x === x1 && y === y1) continue;

            // brightness delta between the center pixel and adjacent one
            const delta = colorDelta(img, img, pos * 4, (y * width + x) * 4, true);

            // count the number of equal, darker and brighter adjacent pixels
            if (delta === 0) {
                zeroes++;
                // if found more than 2 equal siblings, it's definitely not anti-aliasing
                if (zeroes > 2) return false;

            // remember the darkest pixel
            } else if (delta < min) {
                min = delta;
                minX = x;
                minY = y;

            // remember the brightest pixel
            } else if (delta > max) {
                max = delta;
                maxX = x;
                maxY = y;
            }
        }
    }

    // if there are no both darker and brighter pixels among siblings, it's not anti-aliasing
    if (min === 0 || max === 0) return false;

    // if either the darkest or the brightest pixel has 3+ equal siblings in both images
    // (definitely not anti-aliased), this pixel is anti-aliased
    return (hasManySiblings(a32, minX, minY, width, height) && hasManySiblings(b32, minX, minY, width, height)) ||
           (hasManySiblings(a32, maxX, maxY, width, height) && hasManySiblings(b32, maxX, maxY, width, height));
}

function hasManySiblings(
    img: Uint32Array,
    x1: number,
    y1: number,
    width: number,
    height: number
): boolean {
    const x0 = Math.max(x1 - 1, 0);
    const y0 = Math.max(y1 - 1, 0);
    const x2 = Math.min(x1 + 1, width - 1);
    const y2 = Math.min(y1 + 1, height - 1);
    const val = img[y1 * width + x1];
    let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;

    // go through 8 adjacent pixels
    for (let x = x0; x <= x2; x++) {
        for (let y = y0; y <= y2; y++) {
            if (x === x1 && y === y1) continue;
            zeroes += +(val === img[y * width + x]);
            if (zeroes > 2) return true;
        }
    }
    return false;
}

function colorDelta(
    img1: PixelData,
    img2: PixelData,
    k: number,
    m: number,
    yOnly: boolean
): number {
    const r1 = img1[k];
    const g1 = img1[k + 1];
    const b1 = img1[k + 2];
    const a1 = img1[k + 3];
    const r2 = img2[m];
    const g2 = img2[m + 1];
    const b2 = img2[m + 2];
    const a2 = img2[m + 3];

    let dr = r1 - r2;
    let dg = g1 - g2;
    let db = b1 - b2;
    const da = a1 - a2;

    if (!dr && !dg && !db && !da) return 0;

    if (a1 < 255 || a2 < 255) { // blend pixels with background
        const rb = 48 + 159 * (k % 2);
        const gb = 48 + 159 * ((k / 1.618033988749895 | 0) % 2);
        const bb = 48 + 159 * ((k / 2.618033988749895 | 0) % 2);
        dr = (r1 * a1 - r2 * a2 - rb * da) / 255;
        dg = (g1 * a1 - g2 * a2 - gb * da) / 255;
        db = (b1 * a1 - b2 * a2 - bb * da) / 255;
    }

    const y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;

    if (yOnly) return y; // brightness difference only

    const i = dr * 0.59597799 - dg * 0.27417610 - db * 0.32180189;
    const q = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694;

    const delta = 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;

    // encode whether the pixel lightens or darkens in the sign
    return y > 0 ? -delta : delta;
}

function drawPixel(
    output: PixelData,
    pos: number,
    r: number,
    g: number,
    b: number,
    a: number
): void {

    output[pos + 0] = r;
    output[pos + 1] = g;
    output[pos + 2] = b;
    output[pos + 3] = a;
}

function drawGrayPixel(
    img: PixelData,
    i: number,
    alpha: number,
    output: PixelData
): void {
    const val = 255 + (img[i] * 0.29889531 + img[i + 1] * 0.58662247 + img[i + 2] * 0.11448223 - 255) * alpha * img[i + 3] / 255;
    drawPixel(output, i, val, val, val,255);
}
