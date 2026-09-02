export type ActionState<T = unknown> = {
  success: boolean;
  message?: string;
  errors?: Record<string, string[]>; // Erreurs par champ (ex: errors.name = ["Trop court"])
  data?: T;
};

