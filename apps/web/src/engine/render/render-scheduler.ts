export type AnimationFrameScheduler = Readonly<{
  request: (callback: FrameRequestCallback) => number;
  cancel: (handle: number) => void;
}>;

const browserAnimationFrameScheduler = (): AnimationFrameScheduler => ({
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle)
});

export class RenderScheduler {
  private frame: number | null = null;

  constructor(
    private readonly render: () => void,
    private readonly scheduler: AnimationFrameScheduler = browserAnimationFrameScheduler()
  ) {}

  request(): void {
    if (this.frame !== null) return;
    this.frame = this.scheduler.request(() => {
      this.frame = null;
      this.render();
    });
  }

  cancel(): void {
    if (this.frame === null) return;
    this.scheduler.cancel(this.frame);
    this.frame = null;
  }

  hasPendingFrame(): boolean {
    return this.frame !== null;
  }
}
