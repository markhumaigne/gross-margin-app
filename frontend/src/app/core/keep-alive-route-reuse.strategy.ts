import { ComponentRef, Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  BaseRouteReuseStrategy,
  DetachedRouteHandle,
} from '@angular/router';

const keyOf = (route: ActivatedRouteSnapshot) => route.routeConfig?.path ?? '';
const keepAlive = (route: ActivatedRouteSnapshot) => route.data['keepAlive'] === true;

/**
 * Keeps pages marked `data.keepAlive` (calculator, sales report) alive while the user visits other
 * pages, so uploads, edited rates and results are not silently lost. clear() discards them; it runs
 * on sign-in and sign-out so one user's work never carries over to the next session.
 */
@Injectable({ providedIn: 'root' })
export class KeepAliveRouteReuseStrategy extends BaseRouteReuseStrategy {
  private readonly handles = new Map<string, DetachedRouteHandle>();

  override shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return keepAlive(route);
  }

  override store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    if (handle) this.handles.set(keyOf(route), handle);
    else this.handles.delete(keyOf(route));
  }

  override shouldAttach(route: ActivatedRouteSnapshot): boolean {
    return keepAlive(route) && this.handles.has(keyOf(route));
  }

  override retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    return keepAlive(route) ? (this.handles.get(keyOf(route)) ?? null) : null;
  }

  clear(): void {
    for (const handle of this.handles.values())
      (handle as { componentRef?: ComponentRef<unknown> }).componentRef?.destroy();
    this.handles.clear();
  }
}
