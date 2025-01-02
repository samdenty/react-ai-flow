import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Ranges } from "../Ranges.js";
import { ElementOptions } from "../../element/index.js";
import { Stagger } from "../../stagger/Stagger.js";

interface CreateRangesOptions {
  stagger?: Stagger;
  elementOptions?: ElementOptions;
  container?: HTMLElement;
}

function createTestRanges(
  textRanges: string[],
  options: CreateRangesOptions = {}
) {
  const {
    stagger = new Stagger(true),
    elementOptions = {},
    container = document.body,
  } = options;

  // Create a container div for our text nodes
  const div = document.createElement("div");
  container.appendChild(div);

  // Create text nodes and ranges
  const ranges = textRanges.map((text) => {
    const textNode = document.createTextNode(text);
    div.appendChild(textNode);

    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, text.length);
    return range;
  });

  // Create a relative element for positioning
  const relativeElement = document.createElement("div");
  container.appendChild(relativeElement);
  const relativeRect = new DOMRect(0, 0, 100, 100);

  return new Ranges(
    stagger,
    ranges,
    { element: relativeElement, rect: relativeRect },
    elementOptions
  );
}

describe("Ranges", () => {
  let container: HTMLElement;

  beforeEach(() => {
    // Setup container for each test
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Cleanup after each test
    container.remove();
  });

  it("should create ranges from text content", () => {
    const ranges = createTestRanges(["Hello", " ", "World"]);
    expect(ranges.textContent).toBe("Hello World");
  });

  it("should compute correct bounding rect", () => {
    const ranges = createTestRanges(["Test", "Range"]);
    const boundingRect = ranges.boundingRect;

    expect(boundingRect).toBeInstanceOf(DOMRect);
    expect(boundingRect.width).toBeGreaterThan(0);
    expect(boundingRect.height).toBeGreaterThan(0);
  });

  it("should merge adjacent rects with same height and top position", () => {
    const ranges = createTestRanges(["First", "Second"]);

    // Force layout recalculation to get accurate rects
    container.style.display = "block";
    container.style.width = "200px";

    const originalRectCount = ranges.ranges.length;
    ranges.scanRects();

    expect(ranges.rects.length).toBeLessThanOrEqual(originalRectCount);
  });

  it("should handle trimming computed ranges", () => {
    const ranges = createTestRanges(["Hello World"]);
    const trimmedRanges = ranges.trimComputedRanges(0, 5, "Hello");

    expect(trimmedRanges).toHaveLength(1);
    const firstRange = trimmedRanges[0];
    expect(firstRange.toString()).toBe("Hello");
  });

  it("should find common ancestor container", () => {
    const ranges = createTestRanges(["First", "Second"]);
    const ancestor = ranges.commonAncestorContainer;

    expect(ancestor).toBeTruthy();
    expect(ancestor instanceof Node).toBe(true);
  });

  it("should compute content offsets correctly", () => {
    const ranges = createTestRanges(["Hello", " ", "World"]);
    const offsets = ranges.computedContentOffsets;

    expect(offsets).toHaveLength(3);
    expect(offsets[0].start).toBe(0);
    expect(offsets[0].end).toBe(5); // 'Hello'
    expect(offsets[1].start).toBe(5);
    expect(offsets[1].end).toBe(6); // ' '
    expect(offsets[2].start).toBe(6);
    expect(offsets[2].end).toBe(11); // 'World'
  });
});
