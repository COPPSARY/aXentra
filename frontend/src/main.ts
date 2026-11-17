import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

if (typeof window !== 'undefined') {
  window.addEventListener(
    'wheel',
    (event) => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLInputElement &&
        activeElement.type === 'number'
      ) {
        event.preventDefault();
      }
    },
    { passive: false },
  );
}

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
