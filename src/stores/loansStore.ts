import { defineStore } from 'pinia';
import { db } from '@/db/database';
import { isOverdue } from '@/services/filters';
import type { Loan, LoanDirection } from '@/types';

export interface LendInput {
  bookId: number;
  direction: LoanDirection;
  personName: string;
  /** Rückgabetermin als ISO-Datum, optional. */
  dueAt?: string | null;
  startedAt?: string;
}

export const useLoansStore = defineStore('loans', {
  state: () => ({
    loans: [] as Loan[],
    loaded: false,
  }),

  getters: {
    byId:
      (state) =>
      (id: number): Loan | undefined =>
        state.loans.find((l) => l.id === id),

    /**
     * Ein Buch ist ausgeliehen, solange es dazu eine Ausleihe ohne Rückgabedatum
     * gibt. Kein zusätzliches Flag am Buch — zwei Wahrheiten laufen auseinander.
     */
    openLoanOf:
      (state) =>
      (bookId: number): Loan | undefined =>
        state.loans.find((l) => l.bookId === bookId && !l.returnedAt),

    openLoans: (state): Loan[] => state.loans.filter((l) => !l.returnedAt),

    lentOut(): Loan[] {
      return this.openLoans.filter((l) => l.direction === 'out');
    },

    borrowed(): Loan[] {
      return this.openLoans.filter((l) => l.direction === 'in');
    },

    overdue() {
      return (now = new Date()): Loan[] => this.openLoans.filter((l) => isOverdue(l, now));
    },

    /** Abgeschlossene Vorgänge eines Buchs, jüngste zuerst. */
    historyOf:
      (state) =>
      (bookId: number): Loan[] =>
        state.loans
          .filter((l) => l.bookId === bookId && l.returnedAt)
          .sort((a, b) => (a.returnedAt! < b.returnedAt! ? 1 : -1)),
  },

  actions: {
    async load() {
      this.loans = await db.loans.toArray();
      this.loaded = true;
    },

    async lend(input: LendInput): Promise<Loan> {
      const personName = input.personName.trim();
      if (!personName) throw new Error('Ohne Namen wird das später niemand mehr zuordnen können.');
      if (this.openLoanOf(input.bookId)) {
        throw new Error('Dieses Buch ist schon ausgeliehen.');
      }

      const loan = {
        bookId: input.bookId,
        direction: input.direction,
        personName,
        startedAt: input.startedAt ?? new Date().toISOString(),
        dueAt: input.dueAt ?? null,
        returnedAt: null,
      };
      const id = await db.loans.add(loan);
      const created = { id, ...loan };
      this.loans.push(created);
      return created;
    },

    async giveBack(loanId: number, when = new Date()): Promise<void> {
      const loan = this.byId(loanId);
      if (!loan) throw new Error('Diesen Vorgang gibt es nicht.');
      if (loan.returnedAt) return;

      const returnedAt = when.toISOString();
      await db.loans.update(loanId, { returnedAt });
      loan.returnedAt = returnedAt;
    },

    async update(loanId: number, patch: Partial<Pick<Loan, 'personName' | 'dueAt'>>): Promise<void> {
      const loan = this.byId(loanId);
      if (!loan) throw new Error('Diesen Vorgang gibt es nicht.');

      const safe: Partial<Loan> = {};
      if (patch.personName !== undefined) {
        const trimmed = patch.personName.trim();
        if (!trimmed) throw new Error('Der Name darf nicht leer sein.');
        safe.personName = trimmed;
      }
      if (patch.dueAt !== undefined) safe.dueAt = patch.dueAt;
      if (Object.keys(safe).length === 0) return;

      await db.loans.update(loanId, safe);
      Object.assign(loan, safe);
    },

    async remove(loanId: number): Promise<void> {
      await db.loans.delete(loanId);
      this.loans = this.loans.filter((l) => l.id !== loanId);
    },

    /** Wird beim Löschen eines Buchs mitgerufen, samt Historie. */
    async removeForBook(bookId: number): Promise<void> {
      await db.loans.where('bookId').equals(bookId).delete();
      this.loans = this.loans.filter((l) => l.bookId !== bookId);
    },
  },
});
