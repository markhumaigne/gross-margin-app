import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/auth.service';
import { UserAccountsService } from '../../core/user-accounts.service';
import { Result } from '../../../../../shared/domain/result';
import { AssignableRole, Role, ROLE_LABELS } from '../../../../../shared/domain/roles';
import { UserAccount } from '../../../../../shared/domain/user-accounts';

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
    this.users().filter(
      (u) => u.active && u.role !== 'accounting-head' && u.id !== this.currentUserId(),
    ),
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

  constructor() {
    void this.accounts.load().then((result) => {
      if (!result.ok) this.showError(result.error);
    });
  }

  async transfer() {
    const { newHolderId, previousRole } = this.transferForm.getRawValue();
    if (!newHolderId) return this.showError('Choose the new Accounting Head.');
    const previous = this.head();
    const next = this.users().find((u) => u.id === newHolderId);
    const result = await this.run(() =>
      this.accounts.transferAccountingHead(newHolderId, previousRole),
    );
    if (result?.ok && next) {
      this.transferForm.reset({ newHolderId: '', previousRole: 'product-team' });
      this.showNotice(
        `${next.displayName} is now the Accounting Head.` +
          (previous ? ` ${previous.displayName} is now ${ROLE_LABELS[previousRole]}.` : ''),
      );
    }
  }

  async changeRole(user: UserAccount, event: Event) {
    const select = event.target as HTMLSelectElement;
    const result = await this.run(() => this.accounts.changeRole(user.id, select.value as Role));
    if (result?.ok) this.showNotice(`Role updated for ${user.username}.`);
    else select.value = user.role;
  }

  async toggleActive(user: UserAccount) {
    const active = !user.active;
    const result = await this.run(() => this.accounts.setActive(user.id, active));
    if (result?.ok) this.showNotice(`${user.username} ${active ? 'activated' : 'deactivated'}.`);
  }

  async add() {
    const draft = this.addForm.getRawValue();
    const result = await this.run(() => this.accounts.add(draft));
    if (result?.ok) {
      this.addForm.reset({ username: '', displayName: '', password: '', role: 'product-team' });
      this.showNotice(`Account ${draft.username.trim()} added.`);
    }
  }

  private async run(action: () => Promise<Result<UserAccount[]>>) {
    const result = await action();
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
