import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, RouteReuseStrategy, withInMemoryScrolling } from '@angular/router';
import { KeepAliveRouteReuseStrategy } from './app/core/keep-alive-route-reuse.strategy';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(),
    { provide: RouteReuseStrategy, useExisting: KeepAliveRouteReuseStrategy },
    provideRouter(
      routes,
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'top' }),
    ),
  ],
}).catch(console.error);
