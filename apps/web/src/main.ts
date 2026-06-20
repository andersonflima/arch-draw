import { provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app/app.component";

// The editor drives change detection itself: the root view is detached after init
// and re-rendered through a coalesced requestAnimationFrame scheduler. Zone.js had
// nothing left to do for rendering (a detached root is never checked by the zone),
// so it was pure async-patching overhead. Running zoneless removes it while the
// manual scheduler keeps owning every repaint.
bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection()]
}).catch((cause: unknown) => {
  console.error(cause);
});
