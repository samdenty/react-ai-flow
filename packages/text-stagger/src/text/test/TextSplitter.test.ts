import { expect, vi, describe, it } from "vitest";
import {
  getTextSplit,
  mergeTextSplitter,
  TextSplit,
  ElementAnimation,
  ElementOptions,
} from "../../index.js";

describe("getTextSplit", () => {
  it("character", () => {
    const { splitter, ...options } = getTextSplit(TextSplit.Character);

    expect(splitter("hello world", undefined!)).toMatchSnapshot("splits");
    expect(options).toMatchSnapshot("options");

    expect(options.animation).toEqual(ElementAnimation.FadeIn);
  });

  it("word", () => {
    const { splitter, ...options } = getTextSplit(TextSplit.Word);

    expect(
      splitter("hello world foo  bar\n new line", undefined!)
    ).toMatchSnapshot("splits");

    expect(options).toMatchSnapshot("options");
    expect(options.animation).toEqual(ElementAnimation.FadeIn);
  });

  it("line", () => {
    const { splitter, ...options } = getTextSplit(TextSplit.Line);

    expect(
      splitter(
        "hello world\nnew line\r\nnew line2\n\nnew paragraph",
        undefined!
      )
    ).toMatchSnapshot("splits");

    expect(options).toMatchSnapshot("options");
    expect(options.animation).toEqual(ElementAnimation.GradientReveal);
  });

  it("sentence", () => {
    const { splitter, ...options } = getTextSplit(TextSplit.Sentence);

    expect(
      splitter(
        "hello world\nnew line\r\nnew line2\n\nnew paragraph. foo bar.. foo",
        undefined!
      )
    ).toMatchSnapshot("splits");

    expect(options).toMatchSnapshot("options");
    expect(options.animation).toEqual(ElementAnimation.GradientReveal);
  });

  it("paragraph", () => {
    const { splitter, ...options } = getTextSplit(TextSplit.Paragraph);

    expect(
      splitter(
        "hello world\nnew line\r\nnew line2\n\nnew paragraph. foo bar.. foo",
        undefined!
      )
    ).toMatchSnapshot("splits");

    expect(options).toMatchSnapshot("options");
    expect(options.animation).toEqual(ElementAnimation.GradientReveal);
  });

  it("allows overriding with custom animation", () => {
    expect(getTextSplit(TextSplit.Word).animation).toEqual(
      ElementAnimation.FadeIn
    );

    expect(
      getTextSplit(TextSplit.Word, {
        animation: ElementAnimation.GradientReveal,
      }).animation
    ).toEqual(ElementAnimation.GradientReveal);
  });

  it("forwards all options", () => {
    const optionsToForward = {
      delay: 100,
      duration: 200,
      gradientWidth: 500,
      additionalProperty: 1,
    } as any;

    const { splitter, ...options } = getTextSplit(
      TextSplit.Word,
      optionsToForward
    );

    expect(options).toMatchObject(optionsToForward);
    expect(options).toMatchSnapshot("options");
  });

  it("throws on invalid text split", () => {
    expect(() =>
      getTextSplit("alsdkjsdf" as any)
    ).toThrowErrorMatchingSnapshot();
  });
});

describe("mergeTextSplitter", () => {
  describe("when handling function splitters", () => {
    it("should return function splitter with options when passed a function", () => {
      const mockSplitter = vi.fn();
      const options = { someOption: true } as ElementOptions;

      const result = mergeTextSplitter(
        { splitter: undefined, ...options },
        mockSplitter
      );

      expect(result).toEqual({ ...options, splitter: mockSplitter });
    });
  });

  describe("when handling object splitters", () => {
    it("should merge options from object splitter", () => {
      const initialOptions = { initial: true } as ElementOptions;
      const splitterOptions = { splitterOpt: true } as ElementOptions;
      const objectSplitter = {
        ...splitterOptions,
      };

      const result = mergeTextSplitter(initialOptions, objectSplitter);

      expect(result).toEqual(
        expect.objectContaining({
          initial: true,
          splitterOpt: true,
        })
      );
    });

    it("should handle nested splitters in object form", () => {
      const nestedSplitter = vi.fn();
      const objectSplitter = {
        splitter: nestedSplitter,
        option1: true,
      };

      const result = mergeTextSplitter({}, objectSplitter);

      expect(result.splitter).toBe(nestedSplitter);
      expect(result).toEqual(
        expect.objectContaining({
          option1: true,
        })
      );
    });
  });
});
