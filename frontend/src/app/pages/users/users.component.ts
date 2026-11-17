import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/auth.service';
import { UserAccountsService } from '../../core/user-accounts.service';
import { Result } from '../../domain/result';
import { Role, ROLE_LABELS } from '../../domain/roles';
import { UserAccount } from '../../domain/user-accounts';

type AssignableRole = Exclude<Role, 'accounting-head'>;

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule],
  templateUrl: './users.component.html',
})
export class UsersComponent {
  private readonly accounts = inject(UserAccountsService);
  private readonly auth = inject(AuthService);
  readonly users = this.accounts.users;
  readonly head = this.accounts.accountingHead;
  readonly currentUserId = computed(() => this.auth.currentUser()?.id ?? null);
  readonly roleLabels = ROLE_LABELS;
  readonly assignableRoles: { value: AssignableRole; label: string }[] = [
    { value: 'admin', label: ROLE_LABELS.admin },
    { value: 'product-team', label: ROLE_LABELS['product-team'] },
  ];
  readonly candidates = computed(() =>
    this.users().filter((u) => u.active && u.role !== 'accounting-head'),
  );
  readonly notice = signal('');
  readonly error = signal('');

  readonly transferForm = new FormGroup({
    newHolderId: new FormControl('', { nonNullable: true }),
    previousRole: new FormControl<AssignableRole>('product-team', { nonNullable: true }),
  });
  readonly addForm = new FormGroup({
    username: new FormControl('', { nonNullable: true }),
    displayName: new FormControl('', { nonNullable: true }),
    password: new FormControl('', { nonNullable: true }),
    role: new FormControl<AssignableRole>('product-team', { nonNullable: true }),
  });

  transfer() {
    const { newHolderId, previousRole } = this.transferForm.getRawValue();
    if (!newHolderId) return this.showError('Choose the new Accounting Head.');
    const previous = this.head();
    const next = this.users().find((u) => u.id === newHolderId);
    const result = this.run((actor) =>
      this.accounts.transferAccountingHead(actor, newHolderId, previousRole),
    );
    if (result?.ok && next) {
      this.transferForm.reset({ newHolderId: '', previousRole: 'product-team' });
      this.showNotice(
        `${next.displayName} is now the Accounting Head.` +
          (previous ? ` ${previous.displayName} is now ${ROLE_LABELS[previousRole]}.` : ''),
      );
    }
  }

  changeRole(user: UserAccount, event: Event) {
    const select = event.target as HTMLSelectElement;
    const result = this.run((actor) =>
      this.accounts.changeRole(actor, user.id, select.value as Role),
    );
    if (result?.ok) this.showNotice(`Role updated for ${user.username}.`);
    else select.value = user.role;
  }

  toggleActive(user: UserAccount) {
    const active = !user.active;
    const result = this.run((actor) => this.accounts.setActive(actor, user.id, active));
    if (result?.ok) this.showNotice(`${user.username} ${active ? 'activated' : 'deactivated'}.`);
  }

  add() {
    const draft = this.addForm.getRawValue();
    const result = this.run((actor) => this.accounts.add(actor, draft));
    if (result?.ok) {
      this.addForm.reset({ username: '', displayName: '', password: '', role: 'product-team' });
      this.showNotice(`Account ${draft.username.trim()} added.`);
    }
  }

  private run(action: (actor: UserAccount) => Result<UserAccount[]>) {
    const actor = this.auth.currentUser();
    if (!actor) return this.showError('Sign in again to manage accounts.');
    const result = action(actor);
    if (!result.ok) this.showError(result.error);
    return result;
  }

  private showNotice(message: string) {
    this.error.set('');
    this.notice.set(message);
  }

  private showError(message: string): undefined {
    this.notice.set('');
    this.error.set(message);
    return undefined;
  }
}
