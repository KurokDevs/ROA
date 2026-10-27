export class AppError extends Error {
  constructor(message: string, public code: string = 'app_error') {
    super(message);
    this.name = 'AppError';
  }
}

export class DuplicateBudgetError extends AppError {
  constructor(public weekKey: string, public existingId: string) {
    super('Ya existe un presupuesto confirmado para esta semana. Edítalo en lugar de crear otro.', 'duplicate_budget');
    this.name = 'DuplicateBudgetError';
  }
}
