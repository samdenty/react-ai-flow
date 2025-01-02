declare global {
  interface PaintRenderingContext2D
    extends CanvasState,
      CanvasTransform,
      CanvasCompositing,
      CanvasImageSmoothing,
      CanvasFillStrokeStyles,
      CanvasShadowStyles,
      CanvasRect,
      CanvasDrawPath,
      CanvasDrawImage,
      CanvasPathDrawingStyles,
      CanvasPath {}

  declare class PaintRenderingContext2D implements PaintRenderingContext2D {}

  interface PaintSize {
    readonly width: number;
    readonly height: number;
  }

  type PaintStylePropertyMapReadOnly<T extends string = string> = Override<
    StylePropertyMapReadOnly,
    {
      get(property: T): CSSUnparsedValue;
    }
  >;

  interface PaintWorklet<T extends string = string> {
    paint(
      context: PaintRenderingContext2D,
      geometry: PaintSize,
      properties: PaintStylePropertyMapReadOnly<T>
    ): void;
  }

  interface PaintWorkletConstructor<T extends string> {
    inputProperties: readonly T[];
    contextOptions?: { alpha: boolean };
    new (): PaintWorklet<T>;
  }

  declare function registerPaint<T extends string>(
    name: string,
    worklet: PaintWorkletConstructor<T>
  ): void;

  declare namespace CSS {
    declare const paintWorklet: Worklet | undefined;
  }

  interface Document {
    mozSetImageElement?: (
      imageElementId: string,
      imageElement: HTMLCanvasElement
    ) => void;

    getCSSCanvasContext?: (
      contextId: string,
      name: string,
      width: number,
      height: number
    ) => CanvasRenderingContext2D;
  }
}

export {};
