export const EXPENSE_CATEGORIES = ["Food", "Decoration", "Venue", "Sound & lights", "Puja", "Travel", "Gifts", "Other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
