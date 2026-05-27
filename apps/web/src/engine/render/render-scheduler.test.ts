import { describe, expect, it } from "vitest";
import { RenderScheduler, type AnimationFrameScheduler } from "./render-scheduler";

const createManualScheduler = () => {
  let nextHandle = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const scheduler: AnimationFrameScheduler = {
    request: (callback) => {
      const handle = nextHandle;
      nextHandle += 1;
      callbacks.set(handle, callback);
      return handle;
    },
    cancel: (handle) => {
      callbacks.delete(handle);
    }
  };

  return {
    scheduler,
    flush: () => {
      const pending = [...callbacks.entries()];
      callbacks.clear();
      for (const [handle, callback] of pending) {
        callback(handle);
      }
    },
    pendingCount: () => callbacks.size
  };
};

describe("render scheduler", () => {
  it("coalesces multiple render requests into one frame", () => {
    const manual = createManualScheduler();
    let renderCount = 0;
    const scheduler = new RenderScheduler(() => {
      renderCount += 1;
    }, manual.scheduler);

    scheduler.request();
    scheduler.request();

    expect(manual.pendingCount()).toBe(1);
    manual.flush();
    expect(renderCount).toBe(1);
  });

  it("cancels a pending frame", () => {
    const manual = createManualScheduler();
    let renderCount = 0;
    const scheduler = new RenderScheduler(() => {
      renderCount += 1;
    }, manual.scheduler);

    scheduler.request();
    scheduler.cancel();
    manual.flush();

    expect(renderCount).toBe(0);
    expect(scheduler.hasPendingFrame()).toBe(false);
  });
});
