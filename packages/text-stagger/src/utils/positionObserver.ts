/**
 * Based on https://github.com/thednp/position-observer
 */

export type PositionObserverCallback = (
  entries: PositionObserverEntry[],
  observer: PositionObserver
) => void;

export type PositionObserverEntry = {
  target: Element;
  boundingClientRect: DOMRect;
  clientHeight: number;
  clientWidth: number;
};

export type PositionObserverOptions = {
  root: HTMLElement;
};

/**
 * The PositionObserver class is a utility class that observes the position
 * of DOM elements and triggers a callback when their position changes.
 */
export default class PositionObserver {
  public entries: Map<Element, PositionObserverEntry>;
  private _tick: number;
  private _root: Element;
  private _callback: PositionObserverCallback;

  /**
   * The constructor takes two arguments, a `callback`, which is called
   * whenever the position of an observed element changes and an `options` object.
   * The callback function should take an array of `PositionObserverEntry` objects
   * as its only argument, but it's not required.
   *
   * @param callback the callback that applies to all targets of this observer
   * @param options the options of this observer
   */
  constructor(
    callback: PositionObserverCallback,
    options?: Partial<PositionObserverOptions>
  ) {
    this.entries = new Map();
    this._callback = callback;
    this._root = options?.root ? options.root : document?.documentElement;
    this._tick = 0;
  }

  /**
   * Start observing the position of the specified element.
   * If the element is not currently attached to the DOM,
   * it will NOT be added to the entries.
   *
   * @param target an `Element` target
   */
  public observe = (target: Element) => {
    if (!this._root.contains(target)) return;

    // define a new entry
    // push the entry into the queue
    this._new(target).then(({ boundingClientRect }) => {
      if (boundingClientRect && !this.getEntry(target)) {
        const { clientWidth, clientHeight } = this._root;

        this.entries.set(target, {
          target,
          boundingClientRect,
          clientWidth,
          clientHeight,
        });
      }

      if (!this._tick) this._tick = requestAnimationFrame(this._runCallback);
    });
  };

  /**
   * Stop observing the position of the specified element.
   *
   * @param target an `Element` target
   */
  public unobserve = (target: Element) => {
    if (this.entries.has(target)) this.entries.delete(target);
  };

  /**
   * Private method responsible for all the heavy duty,
   * the observer's runtime.
   */
  private _runCallback = () => {
    if (!this.entries.size) return;
    const { clientWidth, clientHeight } = this._root;

    const queue = new Promise<PositionObserverEntry[]>((resolve) => {
      const updates: PositionObserverEntry[] = [];
      this.entries.forEach(
        ({
          target,
          boundingClientRect: oldBoundingBox,
          clientWidth: oldWidth,
          clientHeight: oldHeight,
        }) => {
          if (!this._root.contains(target)) return;

          this._new(target).then(({ boundingClientRect, isIntersecting }) => {
            if (!isIntersecting) return;
            const { left, top } = boundingClientRect;

            if (
              oldBoundingBox.top !== top ||
              oldBoundingBox.left !== left ||
              oldWidth !== clientWidth ||
              oldHeight !== clientHeight
            ) {
              const newEntry = {
                target,
                boundingClientRect,
                clientHeight,
                clientWidth,
              };
              this.entries.set(target, newEntry);
              updates.push(newEntry);
            }
          });
        }
      );

      resolve(updates);
    });

    this._tick = requestAnimationFrame(async () => {
      // execute the queue
      const updates = await queue;

      // only execute the callback if position actually changed
      if (updates.length) this._callback(updates, this);

      this._runCallback();
    });
  };

  /**
   * Check intersection status and resolve it
   * right away.
   *
   * @param target an `Element` target
   */
  private _new = (target: Element) => {
    return new Promise<IntersectionObserverEntry>((resolve) => {
      const intersectionObserver = new IntersectionObserver(([entry], ob) => {
        ob.disconnect();

        resolve(entry!);
      });

      intersectionObserver.observe(target);
    });
  };

  /**
   * Find the entry for a given target.
   *
   * @param target an `HTMLElement` target
   */
  public getEntry = (target: Element) => this.entries.get(target);

  /**
   * Immediately stop observing all elements.
   */
  public disconnect = () => {
    cancelAnimationFrame(this._tick);
    this.entries.clear();
    this._tick = 0;
  };
}
